/** Real operating-system implementation of the launcher's `sys` interface (Windows), plus config loading. */

import { execFile, spawn as nodeSpawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SNAPSHOT_PS = `
$ErrorActionPreference = 'SilentlyContinue'
$procs = @(Get-CimInstance Win32_Process | ForEach-Object {
  [pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = $_.Name
    created = $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null }); cmd = $_.CommandLine } })
$listens = @(Get-NetTCPConnection -State Listen | ForEach-Object { [pscustomobject]@{ port = [int]$_.LocalPort; pid = [int]$_.OwningProcess } })
[pscustomobject]@{ procs = $procs; listens = $listens } | ConvertTo-Json -Depth 3 -Compress
`

function run(cmd, args, { cwd, timeoutMs = 30000, inherit = false, env } = {}) {
  return new Promise((resolve) => {
    if (inherit) {
      const child = nodeSpawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32', env: env ?? process.env })
      const timer = setTimeout(() => child.kill(), timeoutMs)
      child.on('exit', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout: '', stderr: '' }) })
      child.on('error', (e) => { clearTimeout(timer); resolve({ code: 1, stdout: '', stderr: e.message }) })
      return
    }
    execFile(cmd, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: env ?? process.env },
      (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr: stderr || (err && !stderr ? err.message : '') }))
  })
}

/** Parse KEY=VALUE lines. Only the requested keys are returned, so secrets never leave this function. */
export function readEnvKeys(file, keys) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*)/)
    if (m && keys.includes(m[1])) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const expand = (p) => p.replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? '').replace(/^~(?=[\\/])/, process.env.USERPROFILE ?? '~')
  .replace(/\$(?:env:)?(HOME|USERPROFILE)/gi, process.env.USERPROFILE ?? '')

export function loadContext(root, env = process.env) {
  const be = readEnvKeys(path.join(root, 'backend', '.env'), ['DGX_SSH_HOST', 'DGX_SSH_USER', 'DGX_SSH_PORT', 'DGX_SSH_KEY_PATH',
    'DGX_REMOTE_LLM_PORT', 'DGX_LOCAL_TUNNEL_PORT', 'DGX_LLM_MODEL', 'DGX_LLM_API_BASE_URL'])
  const fe = readEnvKeys(path.join(root, 'frontend', '.env.local'), ['VITE_SUPABASE_URL'])
  const dgx = {
    host: be.DGX_SSH_HOST ?? '', user: be.DGX_SSH_USER ?? '', port: Number(be.DGX_SSH_PORT || 22),
    keyPath: be.DGX_SSH_KEY_PATH ? expand(be.DGX_SSH_KEY_PATH) : '', remotePort: Number(be.DGX_REMOTE_LLM_PORT || 0),
    localPort: Number(be.DGX_LOCAL_TUNNEL_PORT || 18000), model: be.DGX_LLM_MODEL ?? '', baseUrl: be.DGX_LLM_API_BASE_URL ?? '',
  }
  dgx.missing = [['DGX_SSH_HOST', dgx.host], ['DGX_REMOTE_LLM_PORT', dgx.remotePort], ['DGX_LLM_MODEL', dgx.model],
    ['DGX_LLM_API_BASE_URL', dgx.baseUrl]].filter(([, v]) => !v).map(([k]) => k)
  dgx.configured = dgx.missing.length === 0
  const seconds = (name, dflt) => Number(env[name] ?? dflt) * 1000
  return {
    root, selfPid: process.pid, protectedPids: [process.pid, process.ppid],
    python: path.join(root, 'backend', '.venv', 'Scripts', 'python.exe'),
    viteScript: path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
    apiPort: 8000, frontendPort: 5173, apiUrl: 'http://127.0.0.1:8000', frontendUrl: 'http://localhost:5173',
    supabaseUrl: fe.VITE_SUPABASE_URL || 'http://127.0.0.1:55321',
    dgx,
    timeouts: {
      tunnelMs: seconds('MAILPILOT_TUNNEL_TIMEOUT', 30), apiMs: seconds('MAILPILOT_API_TIMEOUT', 90),
      workerMs: seconds('MAILPILOT_WORKER_TIMEOUT', 60), frontendMs: seconds('MAILPILOT_FRONTEND_TIMEOUT', 60),
      supabaseMs: seconds('MAILPILOT_SUPABASE_TIMEOUT', 600), graceMs: seconds('MAILPILOT_STOP_GRACE', 5), workerSettleMs: 2000,
    },
  }
}

/** Command lines for each component. Every one contains the project path so ownership can be verified. */
export function commandFor(name, ctx) {
  switch (name) {
    case 'tunnel':
      // Node supervisor, not dgx-tunnel.ps1: Windows PowerShell exits at once when started without a console.
      return { cmd: process.execPath, args: [path.join(ctx.root, 'scripts', 'launcher', 'tunnel.mjs')], cwd: ctx.root }
    case 'api':
      return { cmd: ctx.python, args: ['-m', 'uvicorn', 'app.main:app', '--reload', '--reload-include', '.env', '--host', '127.0.0.1', '--port', String(ctx.apiPort)], cwd: path.join(ctx.root, 'backend') }
    case 'worker':
      return { cmd: ctx.python, args: ['-m', 'app.jobs.worker'], cwd: path.join(ctx.root, 'backend') }
    case 'frontend':
      return { cmd: process.execPath, args: [ctx.viteScript, '--port', String(ctx.frontendPort), '--strictPort'], cwd: path.join(ctx.root, 'frontend') }
    default:
      throw new Error(`unknown component ${name}`)
  }
}

export function createSystem(ctx, { log = console.log } = {}) {
  const stateDir = path.join(ctx.root, '.mailpilot')
  const logDir = path.join(stateDir, 'logs')
  const registryFile = path.join(stateDir, 'processes.json')
  const lockFile = path.join(stateDir, 'launcher.lock')
  fs.mkdirSync(logDir, { recursive: true })
  let aborted = false
  const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
  const writeJson = (f, v) => { fs.writeFileSync(`${f}.tmp`, JSON.stringify(v, null, 2)); fs.renameSync(`${f}.tmp`, f) }
  const logPath = (name) => path.join(logDir, `${name}.log`)

  return {
    log, now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    aborted: () => aborted, abort: () => { aborted = true },
    exists: (p) => fs.existsSync(p), join: (...p) => path.join(...p), run, logPath,

    async snapshot() {
      const res = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SNAPSHOT_PS], { timeoutMs: 60000 })
      if (res.code !== 0) throw new Error(`process snapshot failed: ${res.stderr.slice(0, 300)}`)
      const data = JSON.parse(res.stdout)
      return { procs: data.procs ?? [], listens: data.listens ?? [] }
    },

    /** taskkill on one verified PID and its tree. Never by image name. Reports when Windows can only
     * stop it forcefully (background processes without a window cannot receive a close request). */
    async kill(pid, force) {
      const res = await run('taskkill.exe', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])], { timeoutMs: 15000 })
      return { forceRequired: /only be terminated forcefully/i.test(`${res.stdout}${res.stderr}`) }
    },

    async spawn(name) {
      const { cmd, args, cwd } = commandFor(name, ctx)
      const file = logPath(name)
      try { if (fs.statSync(file).size > 10 * 1024 * 1024) fs.renameSync(file, `${file}.old`) } catch { /* no log yet */ }
      fs.appendFileSync(file, `\n===== ${new Date().toISOString()} starting ${name}: ${path.basename(cmd)} ${args.join(' ')} =====\n`)
      const fd = fs.openSync(file, 'a')
      const child = nodeSpawn(cmd, args, {
        cwd, detached: true, windowsHide: true, stdio: ['ignore', fd, fd],
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', FORCE_COLOR: '0', NO_COLOR: '1', BROWSER: 'none' },
      })
      fs.closeSync(fd)
      child.unref()
      if (!child.pid) throw new Error(`could not start ${name}`)
      return { pid: child.pid }
    },

    async http(url, timeoutMs) {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      let json = null
      if ((res.headers.get('content-type') ?? '').includes('json')) json = await res.json().catch(() => null)
      else await res.arrayBuffer().catch(() => null)
      return { status: res.status, json }
    },

    async sshCheck(dgx) {
      const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'PasswordAuthentication=no', '-p', String(dgx.port)]
      if (dgx.keyPath) args.push('-i', dgx.keyPath, '-o', 'IdentitiesOnly=yes')
      args.push(dgx.user ? `${dgx.user}@${dgx.host}` : dgx.host, 'true')
      const res = await run('ssh.exe', args, { timeoutMs: 25000 })
      if (res.code === 0) return { ok: true }
      const msg = (res.stderr || '').trim().split(/\r?\n/).filter(Boolean).at(-1) ?? `exit ${res.code}`
      const hint = /permission denied/i.test(msg) ? ' (key not authorized on Spark 2, see docs\\DGX_SPARK.md)'
        : /timed out|no route|could not resolve|refused/i.test(msg) ? ' (Spark 2 offline or Tailscale disconnected?)' : ''
      return { ok: false, detail: msg + hint }
    },

    tailLog(name, lines) {
      try {
        const text = fs.readFileSync(logPath(name), 'utf8')
        const start = text.lastIndexOf('\n===== ')
        return (start >= 0 ? text.slice(start) : text).split(/\r?\n/).filter(Boolean).slice(-lines).map((l) => `    ${l}`).join('\n')
      } catch { return '' }
    },

    async openBrowser(url) {
      nodeSpawn('cmd.exe', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    },

    readRegistry: () => readJson(registryFile),
    writeRegistry: (v) => writeJson(registryFile, v),
    clearRegistry: () => fs.rmSync(registryFile, { force: true }),
    readLock: () => readJson(lockFile),
    /** Atomic create; false if a lock file already exists. */
    createLock(v) {
      try { fs.writeFileSync(lockFile, JSON.stringify(v), { flag: 'wx' }); return true } catch { return false }
    },
    removeLock: () => fs.rmSync(lockFile, { force: true }),
  }
}
