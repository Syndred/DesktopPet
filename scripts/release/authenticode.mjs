import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export function authenticode(executable) {
  if (process.platform !== 'win32') return { kind: 'Authenticode', status: 'NotChecked', signed: false, reason: 'Windows verification required' };
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./verify-authenticode.ps1', import.meta.url)), '-Path', executable], { windowsHide: true, encoding: 'utf8' }).replace(/^\uFEFF/, '').trim());
}
