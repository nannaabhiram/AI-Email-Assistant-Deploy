#!/usr/bin/env node
/**
 * MailPilot AI launcher.  npm start | npm stop | npm run status | npm run restart
 *
 * Options (after `--`, e.g. `npm start -- --no-browser`):
 *   --no-browser    do not open the app in the browser
 *   --require-dgx   fail instead of starting in rule-based mode when Spark 2 inference is unavailable
 * Timeouts (seconds) via environment: MAILPILOT_API_TIMEOUT, MAILPILOT_WORKER_TIMEOUT, MAILPILOT_FRONTEND_TIMEOUT,
 *   MAILPILOT_TUNNEL_TIMEOUT, MAILPILOT_SUPABASE_TIMEOUT, MAILPILOT_STOP_GRACE.
 * State and logs: .mailpilot\processes.json, .mailpilot\logs\<component>.log
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireLock, AbortedError, collectStatus, describeInference, formatMs, LauncherError, printStatus, releaseLock, start, stopAll } from './core.mjs'
import { createSystem, loadContext } from './windows.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const [command = 'status', ...flags] = process.argv.slice(2)

if (process.platform !== 'win32') {
  console.error('The MailPilot launcher manages Windows processes; on other systems use docker compose (see docs/OPERATIONS.md).')
  process.exit(1)
}

const ctx = loadContext(root)
const sys = createSystem(ctx)
let interrupted = 0
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  process.on(sig, () => {
    if (++interrupted > 1) process.exit(130)
    console.log('\nInterrupt received: finishing the current step and cleaning up (press Ctrl+C again to exit immediately)...')
    sys.abort()
  })
}

async function cmdStart() {
  const opts = { noBrowser: flags.includes('--no-browser'), requireDgx: flags.includes('--require-dgx') }
  console.log(`MailPilot AI: starting from ${root}\n`)
  const res = await start(sys, ctx, opts)
  const inf = res.inference.ok ? `available (${ctx.dgx.model} on DGX Spark 2)` : `UNAVAILABLE: ${res.inference.detail}. Emails get labelled rule-based analysis.`
  const headline = res.alreadyRunning ? (res.degraded ? '⚠ MailPilot AI was already running, WITHOUT AI inference' : '✓ MailPilot AI was already running')
    : res.degraded ? '⚠ MailPilot AI started WITHOUT AI inference' : '✓ MailPilot AI is running'
  console.log(`\n${headline} (${res.alreadyRunning ? 'checked in' : 'startup took'} ${formatMs(res.elapsedMs)})`)
  console.log(`  App:        ${ctx.frontendUrl}${opts.noBrowser ? '' : '  (opened in your browser)'}`)
  console.log(`  API:        ${ctx.apiUrl}  (docs: ${ctx.apiUrl}/docs)`)
  console.log(`  Inference:  ${inf}`)
  console.log(`  Logs:       ${path.join(root, '.mailpilot', 'logs')}`)
  console.log('  Stop with:  npm stop      Status: npm run status')
}

async function cmdStop() {
  console.log('Stopping MailPilot AI...')
  const { results, elapsedMs } = await stopAll(sys, ctx)
  const stopped = results.filter((r) => r.stopped)
  const failed = results.filter((r) => !r.stopped && r.note !== 'not running')
  console.log(stopped.length ? `\n✓ Stopped ${stopped.map((r) => r.name).join(', ')} in ${formatMs(elapsedMs)}.` : `\nNothing was running (${formatMs(elapsedMs)}).`)
  console.log('  Left running on purpose: Supabase (Docker; stop with `npx supabase@2.122.0 stop`) and DGX Spark 2 itself (only the local tunnel is closed).')
  if (stopped.length) console.log('  Browser tabs are not closed: a browser tab cannot be identified and closed safely from outside the browser.')
  if (failed.length) {
    console.error(`✗ Could not stop: ${failed.map((r) => `${r.name} (${r.note})`).join(', ')}`)
    process.exitCode = 1
  }
}

async function cmdStatus() {
  const s = await collectStatus(sys, ctx)
  console.log('MailPilot AI status')
  printStatus(sys, ctx, s)
  const up = s.api.running && s.api.health.ok && s.worker.running && s.frontend.running && s.frontend.health.ok
  console.log(up ? `\nRunning. Open ${ctx.frontendUrl}` : '\nNot fully running. Start with: npm start')
  if (up && !(s.tunnel.dgx.reachable && s.tunnel.dgx.modelServed)) console.log(`AI inference ${describeInference(s.tunnel, ctx.dgx.model)}`)
}

const commands = {
  start: cmdStart,
  stop: cmdStop,
  status: cmdStatus,
  restart: async () => { await cmdStop(); console.log(''); await cmdStart() },
}

try {
  if (!commands[command]) throw new LauncherError(`Unknown command "${command}"`, 'Use: npm start | npm stop | npm run status | npm run restart')
  if (command !== 'status') await acquireLock(sys, ctx)
  try {
    await commands[command]()
  } finally {
    if (command !== 'status') releaseLock(sys, ctx)
  }
} catch (err) {
  if (err instanceof AbortedError) {
    console.error('\nStartup interrupted; processes started by this run were stopped.')
    process.exitCode = 130
  } else if (err instanceof LauncherError) {
    console.error(`\n✗ ${err.message}`)
    if (err.hint) console.error(err.hint)
    process.exitCode = 1
  } else {
    console.error('\n✗ Unexpected launcher error:', err)
    process.exitCode = 1
  }
}
