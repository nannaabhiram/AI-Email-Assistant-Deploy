#!/usr/bin/env node
/**
 * Background SSH tunnel supervisor started by `npm start`: forwards 127.0.0.1:<DGX_LOCAL_TUNNEL_PORT> to the
 * inference server on DGX Spark 2 and reconnects with backoff if the connection drops.
 * Same settings and ssh options as scripts\dgx-tunnel.ps1 (use that one for a visible, interactive window;
 * Windows PowerShell cannot run without a console, so the launcher uses this Node equivalent).
 * Key authentication only (BatchMode): it never waits for a password.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadContext } from './windows.mjs'

export function sshTunnelArgs(dgx) {
  const args = ['-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
    '-o', 'ConnectTimeout=15', '-p', String(dgx.port), '-L', `127.0.0.1:${dgx.localPort}:127.0.0.1:${dgx.remotePort}`]
  if (dgx.keyPath) args.push('-i', dgx.keyPath, '-o', 'IdentitiesOnly=yes')
  args.push(dgx.user ? `${dgx.user}@${dgx.host}` : dgx.host)
  return args
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const { dgx } = loadContext(root)
  if (!dgx.host || !dgx.remotePort) {
    console.error('DGX_SSH_HOST and DGX_REMOTE_LLM_PORT must be set in backend\\.env')
    process.exit(2)
  }
  const args = sshTunnelArgs(dgx)
  let child = null
  let delay = 2000
  let stopping = false
  const stop = () => { stopping = true; child?.kill(); setTimeout(() => process.exit(0), 500) }
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, stop)
  const connect = () => {
    const since = Date.now()
    console.log(`${new Date().toISOString()} forwarding 127.0.0.1:${dgx.localPort} -> 127.0.0.1:${dgx.remotePort} on ${dgx.user}@${dgx.host}`)
    child = spawn('ssh.exe', args, { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
    child.on('exit', (code) => {
      if (stopping) return
      delay = Date.now() - since > 60000 ? 2000 : Math.min(delay * 2, 60000) // back off while it keeps failing
      console.log(`${new Date().toISOString()} ssh exited (code ${code}); reconnecting in ${delay / 1000} s`)
      setTimeout(connect, delay)
    })
  }
  connect()
}
