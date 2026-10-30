#!/bin/sh
# Render free plan: run the job worker alongside the API in one container.
# The worker is restarted if it exits; uvicorn stays the main process.
(
  while true; do
    python -m app.jobs.worker
    echo "worker exited ($?); restarting in 5s" >&2
    sleep 5
  done
) &
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips "*"
