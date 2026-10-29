/**
 * MailPilot AI lifecycle manager: start / stop / status for the local development stack
 * (Spark 2 SSH tunnel, FastAPI, worker, Vite). All operating-system access goes through the
 * injected `sys` object (see windows.mjs), so this module is unit-testable with fakes.
 *
 * Ownership rules (nothing else is ever terminated):
 *  - a process recorded in the registry, verified by PID *and* creation time (PID reuse safe);
 *  - an unregistered process whose command line contains this project's path *and* a MailPilot
 *    component signature (e.g. left over from scripts\dev.ps1 or an old terminal);
 *  - descendants of those processes created after their parent (uvicorn reload/spawn children,
 *    the ssh.exe started by the tunnel supervisor).
 */

export const COMPONENTS = ['tunnel', 'api', 'worker', 'frontend']
const STOP_ORDER = ['frontend', 'api', 'worker', 'tunnel']
export const STEP_COUNT = 8

export class LauncherError extends Error {
  constructor(message, hint) {
    super(message)
    this.hint = hint
  }
}
export class AbortedError extends LauncherError {
  constructor() { super('Interrupted (Ctrl+C)') }
}

const norm = (s) => (s ?? '').replaceAll('/', '\\').toLowerCase()

/** Which MailPilot component a process is, or null. Requires the project path in the command line. */
export function classify(proc, root) {
  const cmd = norm(proc?.cmd)
  if (!cmd || !cmd.includes(norm(root))) return null
  if (cmd.includes('scripts\\launcher\\tunnel.mjs')) return 'tunnel'
  if (cmd.includes('scripts\\launcher\\')) return null // the launcher itself
  if (cmd.includes('uvicorn') && cmd.includes('app.main:app')) return 'api'
  if (cmd.includes('-m app.jobs.worker')) return 'worker'
  if (cmd.includes('dgx-tunnel.ps1')) return 'tunnel'
  if (cmd.includes('\\frontend') && cmd.includes('vite\\bin\\vite.js') && !cmd.includes('storybook')) return 'frontend'
  return null
}

/** True when `proc` is still the exact process recorded in `rec` (same PID and creation time). */
export const sameProcess = (rec, proc) => Boolean(rec && proc && rec.pid === proc.pid && rec.created && rec.created === proc.created)

/** All processes descended from `roots`, guarding against reused parent PIDs. Includes multiprocessing
 * children whose parent already exited (their command line names the parent PID). */
export function descendants(procs, roots) {
  const byParent = new Map()
  for (const p of procs) {
    if (!byParent.has(p.ppid)) byParent.set(p.ppid, [])
    byParent.get(p.ppid).push(p)
  }
  const out = new Map()
  const queue = [...roots]
  while (queue.length) {
    const parent = queue.shift()
    const kids = [...(byParent.get(parent.pid) ?? []),
      ...procs.filter((p) => p.pid !== parent.pid && norm(p.cmd).includes(`spawn_main(parent_pid=${parent.pid},`))]
    for (const k of kids) {
      if (out.has(k.pid) || roots.some((r) => r.pid === k.pid)) continue
      if (parent.created && k.created && k.created < parent.created) continue // PID reuse: older than its "parent"
      out.set(k.pid, k)
      queue.push(k)
    }
  }
  return [...out.values()]
}

/** Every MailPilot-owned process tree currently alive, grouped by component. */
export function ownedProcesses(snapshot, registry, ctx) {
  const procs = snapshot.procs
  const protectedPids = new Set(ctx.protectedPids ?? [])
  const groups = Object.fromEntries(COMPONENTS.map((c) => [c, { managed: [], unmanaged: [] }]))
  const seen = new Set()
  for (const [name, rec] of Object.entries(registry?.components ?? {})) {
    const proc = procs.find((p) => p.pid === rec.pid)
    if (sameProcess(rec, proc) && !protectedPids.has(proc.pid) && groups[name]) {
      groups[name].managed.push(proc)
      seen.add(proc.pid)
    }
  }
  for (const p of procs) {
    if (seen.has(p.pid) || protectedPids.has(p.pid)) continue
    const name = classify(p, ctx.root)
    if (name) groups[name].unmanaged.push(p)
  }
  // Only keep tree roots: drop processes already covered as descendants of another owned process.
  for (const g of Object.values(groups)) {
    const all = [...g.managed, ...g.unmanaged]
    const covered = new Set(all.flatMap((r) => descendants(procs, [r]).map((d) => d.pid)))
    g.managed = g.managed.filter((p) => !covered.has(p.pid))
    g.unmanaged = g.unmanaged.filter((p) => !covered.has(p.pid))
    g.tree = [...g.managed, ...g.unmanaged, ...descendants(procs, [...g.managed, ...g.unmanaged])]
      .filter((p) => !protectedPids.has(p.pid))
  }
  return groups
}

export function formatMs(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

// --- shared helpers ------------------------------------------------------------------------

async function waitFor(sys, { what, timeoutMs, intervalMs = 500, check, alive }) {
  const deadline = sys.now() + timeoutMs
  let last
  while (sys.now() < deadline) {
    if (sys.aborted()) throw new AbortedError()
    try {
      last = await check()
      if (last?.ok) return last
    } catch (e) {
      last = { ok: false, detail: e.message }
    }
    if (alive && !(await alive())) return { ok: false, died: true, detail: last?.detail }
    await sys.sleep(intervalMs)
  }
  return { ok: false, timedOut: true, detail: last?.detail ?? `${what} did not respond` }
}

export async function probeModel(sys, ctx) {
  const url = `http://127.0.0.1:${ctx.dgx.localPort}/v1/models`
  try {
    const res = await sys.http(url, 5000)
    if (res.status !== 200) return { reachable: false, detail: `HTTP ${res.status} from ${url}` }
    const ids = (res.json?.data ?? []).map((m) => m.id)
    return { reachable: true, models: ids, modelServed: ids.includes(ctx.dgx.model) }
  } catch (e) {
    return { reachable: false, detail: `cannot reach ${url} (${e.message})` }
  }
}

async function httpOk(sys, url, timeoutMs = 3000) {
  const res = await sys.http(url, timeoutMs)
  return { ok: res.status >= 200 && res.status < 400, detail: `HTTP ${res.status}` }
}

const procById = async (sys, pid) => (await sys.snapshot()).procs.find((p) => p.pid === pid)

// --- stop ----------------------------------------------------------------------------------

/** Stop every owned process tree. Idempotent. Returns per-component results. */
export async function stopAll(sys, ctx, { only = null, quiet = false } = {}) {
  const started = sys.now()
  const registry = sys.readRegistry()
  let snapshot = await sys.snapshot()
  const groups = ownedProcesses(snapshot, registry, ctx)
  const results = []
  for (const name of STOP_ORDER) {
    if (only && !only.includes(name)) continue
    const g = groups[name]
    if (!g.tree.length) {
      results.push({ name, stopped: false, note: 'not running' })
      continue
    }
    const roots = [...g.managed, ...g.unmanaged]
    let windowless = false
    for (const r of roots) windowless = (await sys.kill(r.pid, false))?.forceRequired || windowless // polite: taskkill /T without /F
    // Windowless processes cannot get a close request; waiting would only delay. (Jobs are lease-based,
    // so a stopped worker's in-flight job is retried, and the API keeps no state in memory.)
    const graceEnd = sys.now() + (windowless ? 0 : ctx.timeouts.graceMs)
    let survivors = g.tree
    while (survivors.length && sys.now() < graceEnd) {
      await sys.sleep(300)
      snapshot = await sys.snapshot()
      survivors = g.tree.filter((p) => sameProcess(p, snapshot.procs.find((q) => q.pid === p.pid)))
    }
    // Escalate only for verified, still-identical processes: whole trees from surviving roots first,
    // then anything that is somehow still left (e.g. an orphaned child).
    const alive = () => g.tree.filter((p) => sameProcess(p, snapshot.procs.find((q) => q.pid === p.pid)))
    for (const pass of [(s) => s.filter((p) => roots.some((r) => r.pid === p.pid)), (s) => s]) {
      const targets = pass(survivors)
      if (!targets.length) continue
      for (const p of targets) await sys.kill(p.pid, true)
      await sys.sleep(200)
      snapshot = await sys.snapshot()
      survivors = alive()
      if (!survivors.length) break
    }
    results.push({
      name, stopped: survivors.length === 0, pids: g.tree.map((p) => p.pid), unmanaged: g.unmanaged.length > 0,
      note: survivors.length ? `still running: ${survivors.map((p) => p.pid).join(', ')}` : undefined,
    })
    if (!quiet) {
      const r = results.at(-1)
      sys.log(r.stopped ? `  ✓ ${name} stopped (${r.pids.length} process${r.pids.length === 1 ? '' : 'es'}${r.unmanaged ? ', incl. unmanaged MailPilot instance' : ''})`
        : `  ✗ ${name}: ${r.note}`)
    }
  }
  const remaining = only ? Object.fromEntries(Object.entries(registry?.components ?? {}).filter(([k]) => !only.includes(k))) : {}
  if (Object.keys(remaining).length) sys.writeRegistry({ ...registry, components: remaining })
  else sys.clearRegistry()
  return { results, elapsedMs: sys.now() - started }
}

// --- status --------------------------------------------------------------------------------

export async function collectStatus(sys, ctx) {
  const snapshot = await sys.snapshot()
  const registry = sys.readRegistry()
  const groups = ownedProcesses(snapshot, registry, ctx)
  const state = {}
  for (const name of COMPONENTS) {
    const g = groups[name]
    state[name] = { running: g.tree.length > 0, managed: g.managed.length > 0, pids: [...g.managed, ...g.unmanaged].map((p) => p.pid) }
  }
  const safe = async (fn) => { try { return await fn() } catch (e) { return { ok: false, detail: e.message } } }
  state.api.health = await safe(() => httpOk(sys, `${ctx.apiUrl}/health/ready`))
  state.frontend.health = await safe(() => httpOk(sys, ctx.frontendUrl))
  state.tunnel.dgx = ctx.dgx.configured ? await probeModel(sys, ctx) : { reachable: false, detail: 'DGX not configured' }
  const tunnelOwner = snapshot.listens.find((l) => l.port === ctx.dgx.localPort)
  state.tunnel.externalPid = !state.tunnel.running && tunnelOwner ? tunnelOwner.pid : null
  state.supabase = await safe(async () => ({ ok: (await sys.http(ctx.supabaseUrl + '/auth/v1/health', 3000)).status < 500 }))
  return state
}

export function describeInference(t, model) {
  const d = t.dgx
  if (!d) return 'unknown'
  if (d.reachable && d.modelServed) return `available: Spark 2 serves ${model}`
  if (d.reachable) return `model not served: Spark 2 is reachable but does not serve ${model} (serves: ${d.models.join(', ') || 'none'})`
  return `unavailable: ${d.detail} (analysis is rule-based)`
}

export function printStatus(sys, ctx, s) {
  const line = (label, ok, text) => sys.log(`  ${ok === true ? '✓' : ok === false ? '✗' : '•'} ${label.padEnd(10)} ${text}`)
  const proc = (c) => (c.running ? `running (PID ${c.pids.join(', ')}${c.managed ? '' : ', unmanaged'})` : 'stopped')
  line('Supabase', s.supabase.ok, s.supabase.ok ? `reachable at ${ctx.supabaseUrl}` : `not reachable at ${ctx.supabaseUrl}`)
  line('Tunnel', s.tunnel.running || Boolean(s.tunnel.externalPid), s.tunnel.running ? proc(s.tunnel)
    : s.tunnel.externalPid ? `port ${ctx.dgx.localPort} held by another process (PID ${s.tunnel.externalPid}), not managed` : 'stopped')
  line('Inference', s.tunnel.dgx.reachable && s.tunnel.dgx.modelServed, describeInference(s.tunnel, ctx.dgx.model))
  line('API', s.api.running && s.api.health.ok, `${proc(s.api)}; ${ctx.apiUrl}/health/ready ${s.api.health.ok ? 'ready' : `not ready (${s.api.health.detail})`}`)
  line('Worker', s.worker.running, proc(s.worker))
  line('Frontend', s.frontend.running && s.frontend.health.ok, `${proc(s.frontend)}; ${ctx.frontendUrl} ${s.frontend.health.ok ? 'responding' : `not responding (${s.frontend.health.detail})`}`)
}

// --- start ---------------------------------------------------------------------------------

function prerequisiteProblems(sys, ctx) {
  const p = (...parts) => sys.join(ctx.root, ...parts)
  const problems = []
  const need = (path, msg, fix) => { if (!sys.exists(path)) problems.push({ msg, fix }) }
  need(p('backend', 'app', 'main.py'), 'This does not look like the MailPilot project root', 'Run npm start from D:\\B.tect\\projects\\AI_Email_Assistant')
  need(ctx.python, 'Backend virtual environment is missing (backend\\.venv)',
    'cd backend; py -3.14 -m venv .venv; .venv\\Scripts\\python.exe -m pip install -r requirements-dev.txt')
  need(p('backend', '.env'), 'backend\\.env is missing', 'Copy backend\\.env.example to backend\\.env and fill it in (docs\\SETUP.md)')
  need(p('frontend', '.env.local'), 'frontend\\.env.local is missing', 'Copy frontend\\.env.example to frontend\\.env.local (docs\\SETUP.md)')
  need(ctx.viteScript, 'Frontend dependencies are not installed', 'cd frontend; npm ci')
  return problems
}

/** Start the whole stack. Returns { ok, degraded, elapsedMs, ... }; throws LauncherError on failure. */
export async function start(sys, ctx, opts = {}) {
  const t0 = sys.now()
  const started = []
  let step = 0
  const stepLog = (msg) => sys.log(`[${++step}/${STEP_COUNT}] ${msg}`)
  const done = (msg) => sys.log(`      ${msg} (${formatMs(sys.now() - t0)})`)
  const record = (name, proc, extra = {}) => {
    const reg = sys.readRegistry() ?? { version: 1, components: {} }
    reg.components[name] = { pid: proc.pid, created: proc.created, startedAt: new Date(sys.now()).toISOString(), ...extra }
    reg.launcher = { pid: ctx.selfPid }
    sys.writeRegistry(reg)
    started.push(name)
  }
  const launch = async (name, extra) => {
    const { pid } = await sys.spawn(name)
    const proc = await procById(sys, pid)
    if (!proc) throw new LauncherError(`${name} exited immediately`, `See ${sys.logPath(name)}`)
    record(name, proc, extra)
    return proc
  }
  const alive = (proc) => async () => sameProcess(proc, await procById(sys, proc.pid))
  const failWithLog = (name, what) => {
    const tail = sys.tailLog(name, 15)
    return new LauncherError(what, `Last log lines (${sys.logPath(name)}):\n${tail || '    (empty)'}`)
  }
  let inference = { ok: false, detail: 'not checked' }

  try {
    // 1. project + prerequisites
    stepLog('Checking project and prerequisites...')
    const problems = prerequisiteProblems(sys, ctx)
    if (problems.length) {
      throw new LauncherError(problems.map((x) => x.msg).join('; '), problems.map((x) => `Fix: ${x.fix}`).join('\n'))
    }
    const deps = await sys.run(ctx.python, ['-c', 'import fastapi, uvicorn, sqlalchemy, asyncpg, httpx, pydantic_settings, watchfiles'],
      { cwd: sys.join(ctx.root, 'backend'), timeoutMs: 60000 })
    if (deps.code !== 0) {
      throw new LauncherError('Backend Python packages are missing or broken',
        'Fix: cd backend; .venv\\Scripts\\python.exe -m pip install -r requirements-dev.txt')
    }
    done('project, virtual environment, .env files and frontend packages OK')

    // 2. previous instances + ports
    stepLog('Checking for previous MailPilot processes and port conflicts...')
    let snapshot = await sys.snapshot()
    const groups = ownedProcesses(snapshot, sys.readRegistry(), ctx)
    const healthy = ['api', 'worker', 'frontend'].every((c) => groups[c].managed.length === 1 && !groups[c].unmanaged.length)
      && (await httpOk(sys, `${ctx.apiUrl}/health/ready`).catch(() => ({ ok: false }))).ok
      && (await httpOk(sys, ctx.frontendUrl).catch(() => ({ ok: false }))).ok
    if (healthy && !opts.forceRestart) {
      const m = ctx.dgx.configured ? await probeModel(sys, ctx) : { reachable: false, detail: 'DGX not configured' }
      inference = m.reachable && m.modelServed ? { ok: true, detail: `${ctx.dgx.model} served` }
        : { ok: false, detail: m.reachable ? `Spark 2 does not serve ${ctx.dgx.model}` : m.detail }
      done('MailPilot is already running; nothing to start (use npm run restart for a fresh start)')
      if (!opts.noBrowser) await sys.openBrowser(ctx.frontendUrl)
      return { ok: true, alreadyRunning: true, degraded: !inference.ok, inference, elapsedMs: sys.now() - t0 }
    }
    const leftovers = COMPONENTS.filter((c) => groups[c].tree.length)
    if (leftovers.length) {
      sys.log(`      Stopping previous MailPilot processes (${leftovers.join(', ')}) so a fresh, consistent instance starts...`)
      await stopAll(sys, ctx, { quiet: true })
      snapshot = await sys.snapshot()
    }
    let externalTunnel = false
    for (const [port, label] of [[ctx.frontendPort, 'frontend'], [ctx.apiPort, 'API'], [ctx.dgx.localPort, 'Spark 2 tunnel']]) {
      const owner = snapshot.listens.find((l) => l.port === port)
      if (!owner) continue
      const proc = snapshot.procs.find((p) => p.pid === owner.pid)
      if (port === ctx.dgx.localPort && ctx.dgx.configured) {
        const probe = await probeModel(sys, ctx)
        if (probe.reachable) {
          externalTunnel = true
          sys.log(`      Port ${port} is already forwarded by another process (${proc?.name ?? 'unknown'} PID ${owner.pid}); using it, not managing it.`)
          continue
        }
      }
      throw new LauncherError(`Port ${port} (${label}) is in use by ${proc ? `${proc.name} (PID ${owner.pid})` : `PID ${owner.pid}`}, which is not a MailPilot process`,
        `MailPilot will not stop unrelated applications. Close that program, or check it with: Get-Process -Id ${owner.pid}`)
    }
    done('no conflicts')

    // 3. Supabase
    stepLog('Checking Supabase (database and auth)...')
    const supa = async () => ({ ok: (await sys.http(ctx.supabaseUrl + '/auth/v1/health', 3000)).status < 500 })
    if (!(await supa().catch(() => ({ ok: false }))).ok) {
      const docker = await sys.run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 20000 })
      if (docker.code !== 0) throw new LauncherError('Docker is not running, so local Supabase cannot start', 'Start Docker Desktop, wait until it says "Engine running", then run npm start again.')
      sys.log('      Local Supabase is not running; starting it (first start after a long break can take a few minutes)...')
      const res = await sys.run('npx', ['--yes', 'supabase@2.122.0', 'start', '-x', 'studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta'],
        { cwd: ctx.root, timeoutMs: ctx.timeouts.supabaseMs, inherit: true })
      if (res.code !== 0) throw new LauncherError('supabase start failed', 'Run: npx supabase@2.122.0 start   (and read its error)')
      const up = await waitFor(sys, { what: 'Supabase', timeoutMs: 60000, check: supa })
      if (!up.ok) throw new LauncherError(`Supabase is not reachable at ${ctx.supabaseUrl}`, 'Run: npx supabase@2.122.0 status')
    }
    done(`reachable at ${ctx.supabaseUrl}`)

    // 4. Spark 2 SSH
    stepLog('Checking DGX Spark 2 SSH access...')
    let sshOk = false
    if (!ctx.dgx.configured) {
      inference = { ok: false, detail: `DGX not configured in backend\\.env (${ctx.dgx.missing.join(', ')})` }
      sys.log(`      ⚠ ${inference.detail}`)
    } else if (externalTunnel) {
      sshOk = true
      done('skipped: an existing tunnel is in use')
    } else if (ctx.dgx.keyPath && !sys.exists(ctx.dgx.keyPath)) {
      inference = { ok: false, detail: `SSH key not found: ${ctx.dgx.keyPath}` }
      sys.log(`      ⚠ ${inference.detail}`)
    } else {
      const ssh = await sys.sshCheck(ctx.dgx)
      sshOk = ssh.ok
      if (ssh.ok) done(`key login to ${ctx.dgx.user}@${ctx.dgx.host} OK`)
      else {
        inference = { ok: false, detail: `SSH to ${ctx.dgx.host} failed: ${ssh.detail}` }
        sys.log(`      ⚠ ${inference.detail}`)
      }
    }

    // 5. tunnel + model
    stepLog(`Opening Spark 2 tunnel and checking model ${ctx.dgx.model || '(none)'}...`)
    if (sshOk) {
      let tunnel = null
      if (!externalTunnel) tunnel = await launch('tunnel', { port: ctx.dgx.localPort })
      const res = await waitFor(sys, {
        what: 'tunnel', timeoutMs: ctx.timeouts.tunnelMs, alive: tunnel ? alive(tunnel) : undefined,
        check: async () => { const m = await probeModel(sys, ctx); return { ok: m.reachable, model: m, detail: m.detail } },
      })
      if (!res.ok) inference = { ok: false, detail: `tunnel unreachable: ${res.detail}` }
      else if (!res.model.modelServed) inference = { ok: false, detail: `Spark 2 is reachable but does not serve ${ctx.dgx.model} (serves: ${res.model.models.join(', ') || 'none'})` }
      else inference = { ok: true, detail: `${ctx.dgx.model} served via 127.0.0.1:${ctx.dgx.localPort}` }
      if (inference.ok) done(inference.detail)
      else sys.log(`      ⚠ ${inference.detail}`)
    } else {
      sys.log('      ⚠ skipped (no SSH access); AI analysis will be rule-based')
    }
    if (!inference.ok && opts.requireDgx) throw new LauncherError(`Spark 2 inference is required but unavailable: ${inference.detail}`)

    // 6. API
    stepLog('Starting API (FastAPI)...')
    const api = await launch('api', { port: ctx.apiPort })
    const ready = await waitFor(sys, { what: 'API', timeoutMs: ctx.timeouts.apiMs, alive: alive(api), check: () => httpOk(sys, `${ctx.apiUrl}/health/ready`) })
    if (!ready.ok) throw failWithLog('api', ready.died ? 'The API process exited during startup' : `API not ready after ${formatMs(ctx.timeouts.apiMs)} (${ready.detail})`)
    done(`ready at ${ctx.apiUrl}`)

    // 7. worker
    stepLog('Starting background worker...')
    const worker = await launch('worker')
    const up = await waitFor(sys, { what: 'worker', timeoutMs: ctx.timeouts.workerMs, alive: alive(worker),
      check: async () => ({ ok: sys.tailLog('worker', 50).includes('worker_started') }) })
    if (!up.ok) throw failWithLog('worker', up.died ? 'The worker exited during startup' : 'The worker did not report worker_started')
    await sys.sleep(ctx.timeouts.workerSettleMs)
    if (!(await alive(worker)())) throw failWithLog('worker', 'The worker stopped right after starting')
    done('running')

    // 8. frontend
    stepLog('Starting frontend (Vite)...')
    const fe = await launch('frontend', { port: ctx.frontendPort })
    const feUp = await waitFor(sys, { what: 'frontend', timeoutMs: ctx.timeouts.frontendMs, alive: alive(fe), check: () => httpOk(sys, ctx.frontendUrl) })
    if (!feUp.ok) throw failWithLog('frontend', feUp.died ? 'The frontend exited during startup' : `Frontend not responding after ${formatMs(ctx.timeouts.frontendMs)}`)
    done(`ready at ${ctx.frontendUrl}`)

    if (!opts.noBrowser) {
      await sys.openBrowser(ctx.frontendUrl)
      const reg = sys.readRegistry()
      sys.writeRegistry({ ...reg, browserOpened: ctx.frontendUrl })
    }
    return { ok: true, degraded: !inference.ok, inference, elapsedMs: sys.now() - t0 }
  } catch (err) {
    if (started.length) {
      sys.log(`\nStartup failed; stopping what this run started (${started.join(', ')})...`)
      await stopAll(sys, ctx, { only: started, quiet: true })
    }
    throw err
  }
}

// --- single-launcher lock --------------------------------------------------------------------

/** Ensure only one start/stop runs at a time (atomic lock file). A lock left by a dead launcher is replaced. */
export async function acquireLock(sys, ctx) {
  const me = await procById(sys, ctx.selfPid)
  const mine = { pid: ctx.selfPid, created: me?.created ?? null, startedAt: new Date(sys.now()).toISOString() }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (sys.createLock(mine)) return
    const existing = sys.readLock()
    if (existing) {
      const holder = await procById(sys, existing.pid)
      if (sameProcess(existing, holder)) {
        throw new LauncherError(`Another MailPilot launcher is already running (PID ${existing.pid}, started ${existing.startedAt})`,
          'Wait for it to finish, or press Ctrl+C in that terminal.')
      }
    }
    sys.removeLock() // stale: its launcher is gone (closed terminal, reboot)
  }
  throw new LauncherError('Could not acquire the launcher lock (.mailpilot\launcher.lock)')
}

export function releaseLock(sys, ctx) {
  const lock = sys.readLock()
  if (lock?.pid === ctx.selfPid) sys.removeLock()
}
