/** Launcher core tests with a simulated Windows process table (run: npm run test:launcher). */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  acquireLock, AbortedError, classify, collectStatus, descendants, LauncherError, ownedProcesses, releaseLock, sameProcess, start, stopAll,
} from './core.mjs'

const ROOT = 'D:\\proj\\AI_Email_Assistant'
const PY = `${ROOT}\\backend\\.venv\\Scripts\\python.exe`
const CMDS = {
  tunnel: `"C:\\node\\node.exe" ${ROOT}\\scripts\\launcher\\tunnel.mjs`,
  api: `"${PY}" -m uvicorn app.main:app --reload --port 8000`,
  worker: `"${PY}" -m app.jobs.worker`,
  frontend: `"C:\\node\\node.exe" ${ROOT}\\frontend\\node_modules\\vite\\bin\\vite.js --port 5173`,
}
const PORTS = { tunnel: 18000, api: 8000, frontend: 5173 }

function context(overrides = {}) {
  return {
    root: ROOT, selfPid: 1, protectedPids: [1], python: PY, viteScript: `${ROOT}\\frontend\\node_modules\\vite\\bin\\vite.js`,
    apiPort: 8000, frontendPort: 5173, apiUrl: 'http://127.0.0.1:8000', frontendUrl: 'http://localhost:5173',
    supabaseUrl: 'http://127.0.0.1:55321',
    dgx: { configured: true, missing: [], host: '100.80.191.86', user: 'klh', port: 22, keyPath: 'C:\\k\\id_ed25519', remotePort: 11434, localPort: 18000, model: 'qwen2.5vl:7b' },
    timeouts: { tunnelMs: 5000, apiMs: 5000, workerMs: 5000, frontendMs: 5000, supabaseMs: 5000, graceMs: 1000, workerSettleMs: 100 },
    ...overrides,
  }
}

/** Simulated OS. Processes: { pid, ppid, name, created, cmd }. */
class FakeSystem {
  constructor({ procs = [], models = ['qwen2.5vl:7b', 'gemma4:26b'], ssh = { ok: true }, apiReady = true, workerDies = false } = {}) {
    this.t = 1_000_000
    this.nextPid = 5000
    this.procs = [{ pid: 1, ppid: 0, name: 'node.exe', created: 't0', cmd: 'node scripts/launcher/index.mjs start' }, ...procs]
    this.listens = []
    this.models = models
    this.sshResult = ssh
    this.apiReady = apiReady
    this.workerDies = workerDies
    this.registry = null
    this.lock = null
    this.killed = []
    this.spawned = []
    this.stubborn = new Set()
    this.logs = []
    this.abortAfterSpawn = null
    this._aborted = false
    this.files = new Set([`${ROOT}\\backend\\app\\main.py`, PY, `${ROOT}\\backend\\.env`, `${ROOT}\\frontend\\.env.local`,
      `${ROOT}\\frontend\\node_modules\\vite\\bin\\vite.js`, 'C:\\k\\id_ed25519'])
  }
  // --- helpers for tests
  add(proc, port) {
    const p = { ppid: 9, name: 'python.exe', created: `c${this.nextPid}`, ...proc }
    this.procs.push(p)
    if (port) this.listens.push({ port, pid: p.pid })
    return p
  }
  alive(pid) { return this.procs.some((p) => p.pid === pid) }
  // --- sys interface
  log(m) { this.logs.push(m) }
  now() { return this.t }
  async sleep(ms) { this.t += ms }
  aborted() { return this._aborted }
  exists(p) { return this.files.has(p) }
  join(...parts) { return parts.join('\\') }
  logPath(n) { return `${ROOT}\\.mailpilot\\logs\\${n}.log` }
  async run(cmd) { return { code: 0, stdout: cmd === 'docker' ? '27.0' : '', stderr: '' } }
  async snapshot() { this.t += 50; return { procs: this.procs.map((p) => ({ ...p })), listens: this.listens.map((l) => ({ ...l })) } }
  async kill(pid, force) {
    this.killed.push({ pid, force })
    if (!force && this.windowless?.has(pid)) return { forceRequired: true }
    if (!force && this.stubborn.has(pid)) return { forceRequired: false }
    const tree = new Set([pid])
    let grew = true
    while (grew) {
      grew = false
      for (const p of this.procs) if (tree.has(p.ppid) && !tree.has(p.pid)) { tree.add(p.pid); grew = true }
    }
    this.procs = this.procs.filter((p) => !tree.has(p.pid))
    this.listens = this.listens.filter((l) => !tree.has(l.pid))
    return { forceRequired: false }
  }
  async spawn(name) {
    const pid = this.nextPid++
    const proc = { pid, ppid: 1, name: name === 'frontend' ? 'node.exe' : name === 'tunnel' ? 'powershell.exe' : 'python.exe', created: `c${pid}`, cmd: CMDS[name] }
    this.procs.push(proc)
    this.spawned.push(name)
    if (name === 'api') { // venv launcher -> real interpreter -> reload server child
      this.procs.push({ pid: pid + 1000, ppid: pid, name: 'python.exe', created: `c${pid}b`, cmd: CMDS.api })
      if (this.apiReady) this.listens.push({ port: 8000, pid: pid + 1000 })
    } else if (name === 'tunnel') {
      this.procs.push({ pid: pid + 1000, ppid: pid, name: 'ssh.exe', created: `c${pid}b`, cmd: 'ssh -N -L 127.0.0.1:18000:127.0.0.1:11434 klh@100.80.191.86' })
      this.listens.push({ port: 18000, pid: pid + 1000 })
    } else if (PORTS[name]) {
      this.listens.push({ port: PORTS[name], pid })
    }
    if (name === 'worker' && this.workerDies) this.procs = this.procs.filter((p) => p.pid !== pid)
    if (this.abortAfterSpawn === name) this._aborted = true
    return { pid }
  }
  async http(url) {
    const port = Number(new URL(url).port)
    if (url.includes('55321')) return { status: 200 }
    const listening = this.listens.some((l) => l.port === port)
    if (!listening) throw new Error('ECONNREFUSED')
    if (port === 18000) return { status: 200, json: { data: this.models.map((id) => ({ id })) } }
    return { status: 200 }
  }
  async sshCheck() { return this.sshResult }
  tailLog(name) { return name === 'worker' && this.spawned.includes('worker') ? '2026 [info] worker_started concurrency=4' : '' }
  async openBrowser(url) { this.opened = url }
  readRegistry() { return this.registry && structuredClone(this.registry) }
  writeRegistry(v) { this.registry = structuredClone(v) }
  clearRegistry() { this.registry = null }
  readLock() { return this.lock }
  createLock(v) { if (this.lock) return false; this.lock = v; return true }
  removeLock() { this.lock = null }
}

describe('process identity', () => {
  it('recognises MailPilot components only inside this project', () => {
    assert.equal(classify({ cmd: CMDS.api }, ROOT), 'api')
    assert.equal(classify({ cmd: CMDS.worker }, ROOT), 'worker')
    assert.equal(classify({ cmd: CMDS.tunnel }, ROOT), 'tunnel')
    assert.equal(classify({ cmd: `powershell -NoExit -Command Set-Location '${ROOT}'; .\\scripts\\dgx-tunnel.ps1` }, ROOT), 'tunnel')
    assert.equal(classify({ cmd: CMDS.frontend }, ROOT), 'frontend')
    assert.equal(classify({ cmd: '"C:\\other\\.venv\\Scripts\\python.exe" -m uvicorn app.main:app' }, ROOT), null)
    assert.equal(classify({ cmd: `node ${ROOT}\\frontend\\node_modules\\storybook\\bin\\index.cjs dev -p 6006` }, ROOT), null)
    assert.equal(classify({ cmd: 'ssh -N -L 127.0.0.1:18000:127.0.0.1:11434 klh@100.80.191.86' }, ROOT), null)
    assert.equal(classify({ cmd: `node ${ROOT}\\scripts\\launcher\\index.mjs stop` }, ROOT), null)
  })

  it('treats a reused PID (different creation time) as a different process', () => {
    assert.equal(sameProcess({ pid: 7, created: 'a' }, { pid: 7, created: 'a' }), true)
    assert.equal(sameProcess({ pid: 7, created: 'a' }, { pid: 7, created: 'b' }), false)
    assert.equal(sameProcess({ pid: 7, created: null }, { pid: 7, created: null }), false)
  })

  it('finds child trees, including multiprocessing children whose parent already exited', () => {
    const procs = [
      { pid: 10, ppid: 1, created: '2', cmd: CMDS.api },
      { pid: 11, ppid: 10, created: '3', cmd: 'python child' },
      { pid: 12, ppid: 99, created: '4', cmd: 'python -c "from multiprocessing.spawn import spawn_main; spawn_main(parent_pid=11, pipe_handle=5)"' },
      { pid: 13, ppid: 10, created: '1', cmd: 'older than its parent: PID reuse' },
    ]
    assert.deepEqual(descendants(procs, [procs[0]]).map((p) => p.pid).sort(), [11, 12])
  })
})

describe('npm stop', () => {
  it('stops registered and leftover MailPilot processes but never unrelated ones', async () => {
    const sys = new FakeSystem()
    const ctx = context()
    const leftoverApi = sys.add({ pid: 200, cmd: CMDS.api }, 8000)
    sys.add({ pid: 201, ppid: 200, cmd: 'python spawn child' })
    const unrelatedPython = sys.add({ pid: 300, cmd: '"C:\\other\\python.exe" -m uvicorn app.main:app' }, 9000)
    const manualSsh = sys.add({ pid: 301, name: 'ssh.exe', cmd: 'ssh -o PubkeyAuthentication=no klh@100.80.191.86' })
    sys.registry = { components: { worker: { pid: 400, created: 'c400' } } }
    sys.add({ pid: 400, created: 'c400', cmd: CMDS.worker })

    const { results } = await stopAll(sys, ctx)
    assert.ok(!sys.alive(leftoverApi.pid) && !sys.alive(201) && !sys.alive(400))
    assert.ok(sys.alive(unrelatedPython.pid) && sys.alive(manualSsh.pid))
    assert.deepEqual(results.filter((r) => r.stopped).map((r) => r.name).sort(), ['api', 'worker'])
    assert.equal(sys.registry, null)
  })

  it('does not kill a process that reused a registered PID after a reboot', async () => {
    const sys = new FakeSystem()
    sys.registry = { components: { api: { pid: 500, created: 'before-reboot' } } }
    sys.add({ pid: 500, name: 'chrome.exe', created: 'after-reboot', cmd: 'chrome.exe --type=renderer' })
    const { results } = await stopAll(sys, context())
    assert.ok(sys.alive(500))
    assert.equal(sys.killed.length, 0)
    assert.ok(results.every((r) => !r.stopped))
    assert.equal(sys.registry, null) // stale metadata cleared
  })

  it('works from a new terminal (only the registry survives) and is idempotent', async () => {
    const first = new FakeSystem()
    const ctx = context()
    await start(first, ctx, { noBrowser: true })
    const later = new FakeSystem({ procs: first.procs.filter((p) => p.pid !== 1) }) // the launcher terminal is gone
    later.listens = first.listens
    later.registry = first.registry
    const { results } = await stopAll(later, ctx)
    assert.deepEqual(results.filter((r) => r.stopped).map((r) => r.name), ['frontend', 'api', 'worker', 'tunnel'])
    assert.deepEqual(later.procs.map((p) => p.pid), [1])
    assert.equal(later.listens.length, 0) // ports released
    const again = await stopAll(later, ctx)
    assert.ok(again.results.every((r) => !r.stopped && r.note === 'not running'))
  })

  it('does not wait out the grace period for processes Windows can only stop forcefully', async () => {
    const sys = new FakeSystem()
    sys.add({ pid: 610, cmd: CMDS.worker })
    sys.windowless = new Set([610])
    const t = sys.now()
    await stopAll(sys, context({ timeouts: { ...context().timeouts, graceMs: 60000 } }), { quiet: true })
    assert.ok(!sys.alive(610) && sys.now() - t < 5000)
  })

  it('escalates to a forced kill only for verified processes that ignore the polite request', async () => {
    const sys = new FakeSystem()
    sys.add({ pid: 600, cmd: CMDS.worker })
    sys.stubborn.add(600)
    await stopAll(sys, context())
    assert.deepEqual(sys.killed, [{ pid: 600, force: false }, { pid: 600, force: true }])
    assert.ok(!sys.alive(600))
  })
})

describe('npm start', () => {
  it('starts tunnel, API, worker and frontend, records them, and opens the browser', async () => {
    const sys = new FakeSystem()
    const res = await start(sys, context(), {})
    assert.equal(res.ok, true)
    assert.equal(res.degraded, false)
    assert.deepEqual(sys.spawned, ['tunnel', 'api', 'worker', 'frontend'])
    assert.deepEqual(Object.keys(sys.registry.components).sort(), ['api', 'frontend', 'tunnel', 'worker'])
    for (const rec of Object.values(sys.registry.components)) assert.ok(rec.pid && rec.created)
    assert.equal(sys.opened, 'http://localhost:5173')
    assert.ok(sys.logs.some((l) => l.startsWith('[8/8]')))
  })

  it('a repeated start reports the running instance; a forced restart replaces it, never running two', async () => {
    const sys = new FakeSystem()
    const ctx = context()
    await start(sys, ctx, { noBrowser: true })
    const firstPids = Object.values(sys.registry.components).map((c) => c.pid)
    const again = await start(sys, ctx, { noBrowser: true })
    assert.equal(again.alreadyRunning, true)
    assert.equal(sys.spawned.length, 4)
    for (const pid of firstPids) assert.ok(sys.alive(pid))

    await start(sys, ctx, { noBrowser: true, forceRestart: true })
    for (const pid of firstPids) assert.ok(!sys.alive(pid))
    const groups = ownedProcesses(await sys.snapshot(), sys.registry, ctx)
    for (const name of ['api', 'worker', 'frontend', 'tunnel']) assert.equal(groups[name].managed.length, 1, name)
  })

  it('refuses to run while another launcher holds the lock, and replaces a stale lock', async () => {
    const sys = new FakeSystem()
    const ctx = context()
    sys.add({ pid: 700, name: 'node.exe', created: 'L', cmd: 'node index.mjs start' })
    sys.lock = { pid: 700, created: 'L' }
    await assert.rejects(acquireLock(sys, ctx), /Another MailPilot launcher is already running \(PID 700/)
    sys.procs = sys.procs.filter((p) => p.pid !== 700) // that terminal was closed
    await acquireLock(sys, ctx)
    assert.equal(sys.lock.pid, 1)
    releaseLock(sys, ctx)
    assert.equal(sys.lock, null)
  })

  it('restarts when the previous instance is incomplete (e.g. the worker died)', async () => {
    const sys = new FakeSystem()
    const ctx = context()
    await start(sys, ctx, { noBrowser: true })
    await sys.kill(sys.registry.components.worker.pid, true)
    const res = await start(sys, ctx, { noBrowser: true })
    assert.ok(!res.alreadyRunning)
    assert.equal(sys.spawned.filter((n) => n === 'worker').length, 2)
    const groups = ownedProcesses(await sys.snapshot(), sys.registry, ctx)
    assert.equal(groups.api.managed.length, 1)
  })

  it('stops a leftover MailPilot API on port 8000, but refuses to touch a foreign program on it', async () => {
    const sys = new FakeSystem()
    sys.add({ pid: 800, cmd: CMDS.api }, 8000)
    await start(sys, context(), { noBrowser: true })
    assert.ok(!sys.alive(800))

    const other = new FakeSystem()
    other.add({ pid: 900, name: 'java.exe', cmd: 'java -jar server.jar' }, 8000)
    await assert.rejects(start(other, context(), { noBrowser: true }), (e) => e instanceof LauncherError && /Port 8000 .* java\.exe \(PID 900\).* not a MailPilot process/.test(e.message))
    assert.ok(other.alive(900))
    assert.deepEqual(other.spawned, [])
  })

  it('reuses a working tunnel on 18000 that it does not own, without killing it', async () => {
    const sys = new FakeSystem()
    sys.add({ pid: 950, name: 'ssh.exe', cmd: 'ssh -N -L 18000:127.0.0.1:11434 klh@100.80.191.86' }, 18000)
    const res = await start(sys, context(), { noBrowser: true })
    assert.equal(res.inference.ok, true)
    assert.ok(sys.alive(950))
    assert.ok(!sys.spawned.includes('tunnel'))
    await stopAll(sys, context(), { quiet: true })
    assert.ok(sys.alive(950)) // not ours: npm stop leaves it alone
  })

  it('cleans up everything it started when a later step fails', async () => {
    const sys = new FakeSystem({ apiReady: false })
    await assert.rejects(start(sys, context(), { noBrowser: true }), /API not ready/)
    assert.deepEqual(sys.spawned, ['tunnel', 'api'])
    assert.deepEqual(sys.procs.map((p) => p.pid), [1])
    assert.equal(sys.registry, null)
  })

  it('fails and cleans up when the worker exits right after starting', async () => {
    const sys = new FakeSystem({ workerDies: true })
    await assert.rejects(start(sys, context(), { noBrowser: true }), /worker/i)
    assert.deepEqual(sys.procs.map((p) => p.pid), [1])
  })

  it('stops what it started when interrupted with Ctrl+C', async () => {
    const sys = new FakeSystem()
    sys.abortAfterSpawn = 'api'
    await assert.rejects(start(sys, context(), { noBrowser: true }), AbortedError)
    assert.deepEqual(sys.procs.map((p) => p.pid), [1])
  })

  it('never claims inference when the model is not served, and never substitutes another model', async () => {
    const sys = new FakeSystem({ models: ['gemma4:26b', 'qwen3.6:27b'] })
    const res = await start(sys, context(), { noBrowser: true })
    assert.equal(res.degraded, true)
    assert.match(res.inference.detail, /does not serve qwen2\.5vl:7b \(serves: gemma4:26b, qwen3\.6:27b\)/)
    await assert.rejects(start(new FakeSystem({ models: [] }), context(), { requireDgx: true, noBrowser: true }), /required but unavailable/)
  })

  it('starts in labelled rule-based mode when Spark 2 SSH is refused, unless --require-dgx', async () => {
    const sys = new FakeSystem({ ssh: { ok: false, detail: 'Permission denied (publickey)' } })
    const res = await start(sys, context(), { noBrowser: true })
    assert.equal(res.degraded, true)
    assert.ok(!sys.spawned.includes('tunnel'))
    assert.match(res.inference.detail, /Permission denied/)
  })

  it('reports missing prerequisites with the exact recovery command', async () => {
    const sys = new FakeSystem()
    sys.files.delete(PY)
    await assert.rejects(start(sys, context(), {}), (e) => /virtual environment is missing/.test(e.message) && /pip install -r requirements-dev\.txt/.test(e.hint))
    assert.deepEqual(sys.spawned, [])
  })
})

describe('npm run status', () => {
  it('distinguishes running components, reachable Spark 2 and a served model', async () => {
    const sys = new FakeSystem()
    const ctx = context()
    await start(sys, ctx, { noBrowser: true })
    const s = await collectStatus(sys, ctx)
    assert.ok(s.api.running && s.api.health.ok && s.worker.running && s.frontend.health.ok)
    assert.deepEqual([s.tunnel.dgx.reachable, s.tunnel.dgx.modelServed], [true, true])
    await stopAll(sys, ctx, { quiet: true })
    const after = await collectStatus(sys, ctx)
    assert.ok(!after.api.running && !after.worker.running && !after.tunnel.dgx.reachable)
  })
})
