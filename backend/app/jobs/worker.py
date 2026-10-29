"""Background worker: claims jobs from Postgres and runs scheduled maintenance.

Run with:  python -m app.jobs.worker
Stops gracefully on SIGINT/SIGTERM (finishes in-flight jobs, releases nothing early:
unfinished leases simply expire and the jobs are picked up again).
"""

from __future__ import annotations

import asyncio
import os
import signal
import socket
import time
from datetime import UTC, datetime

from app.config import get_settings
from app.db.models import Job
from app.db.session import dispose_engine, system_session
from app.jobs.handlers import (
    HANDLERS,
    PermanentFailure,
    RetryAfter,
    RetryLater,
    schedule_periodic_jobs,
)
from app.jobs.queue import claim, complete, defer, fail
from app.logging import configure_logging, get_logger, request_id_var

log = get_logger("worker")


class Worker:
    def __init__(self, concurrency: int | None = None) -> None:
        self.settings = get_settings()
        self.worker_id = f"{socket.gethostname()}:{os.getpid()}"
        self.concurrency = concurrency or self.settings.worker_concurrency
        self._stop = asyncio.Event()
        self._inflight: set[asyncio.Task[None]] = set()
        self._last_schedule = 0.0

    def stop(self) -> None:
        log.info("worker_stopping")
        self._stop.set()

    async def run_job(self, job: Job) -> None:
        request_id_var.set(f"job-{job.id}")
        handler = HANDLERS.get(job.job_type)
        started = time.perf_counter()
        try:
            if handler is None:
                raise PermanentFailure(f"Unknown job type {job.job_type}")
            result = await handler(job.payload or {})
            async with system_session() as s:
                await complete(s, job.id, self.worker_id)
            log.info("job_succeeded", job_id=job.id, job_type=job.job_type, attempt=job.attempts,
                     duration_ms=int((time.perf_counter() - started) * 1000), result=result)
        except RetryLater as exc:
            async with system_session() as s:
                await defer(s, job, self.worker_id, exc.seconds, str(exc))
            log.info("job_deferred", job_id=job.id, job_type=job.job_type, reason=str(exc))
        except RetryAfter as exc:
            async with system_session() as s:
                status = await fail(s, job, self.worker_id, str(exc), min_delay=exc.seconds)
            log.warning("job_failed", job_id=job.id, job_type=job.job_type, attempt=job.attempts,
                        next_status=status.value, error=str(exc))
        except PermanentFailure as exc:
            async with system_session() as s:
                await fail(s, job, self.worker_id, str(exc), retryable=False)
            log.warning("job_failed_permanently", job_id=job.id, job_type=job.job_type, error=str(exc))
        except Exception as exc:
            async with system_session() as s:
                status = await fail(s, job, self.worker_id, f"{type(exc).__name__}: {exc}")
            log.warning("job_failed", job_id=job.id, job_type=job.job_type, attempt=job.attempts,
                        next_status=status.value, error_type=type(exc).__name__)

    async def _maybe_schedule(self) -> None:
        interval = 60 * max(1, self.settings.sync_interval_minutes)
        if time.monotonic() - self._last_schedule >= min(interval, 60):
            self._last_schedule = time.monotonic()
            try:
                await schedule_periodic_jobs()
            except Exception as exc:
                log.warning("schedule_failed", error_type=type(exc).__name__)

    async def run(self) -> None:
        log.info("worker_started", worker_id=self.worker_id, concurrency=self.concurrency)
        while not self._stop.is_set():
            await self._maybe_schedule()
            capacity = self.concurrency - len(self._inflight)
            jobs: list[Job] = []
            if capacity > 0:
                try:
                    async with system_session() as s:
                        jobs = await claim(s, self.worker_id, capacity, self.settings.worker_lease_seconds)
                except Exception as exc:  # database down: back off and retry
                    log.warning("claim_failed", error_type=type(exc).__name__)
                    await asyncio.sleep(min(30, self.settings.worker_poll_interval * 5))
                    continue
            for job in jobs:
                task = asyncio.create_task(self.run_job(job))
                self._inflight.add(task)
                task.add_done_callback(self._inflight.discard)
            if not jobs:
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self.settings.worker_poll_interval)
                except TimeoutError:
                    pass
        if self._inflight:
            log.info("worker_draining", inflight=len(self._inflight))
            await asyncio.wait(self._inflight, timeout=60)
        await dispose_engine()
        log.info("worker_stopped", at=datetime.now(UTC).isoformat())


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.environment == "production")
    worker = Worker()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, worker.stop)
        except (NotImplementedError, RuntimeError):  # Windows event loop
            signal.signal(sig, lambda *_: worker.stop())
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
