import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function authenticode(executable) {
  if (process.platform !== 'win32') return { kind: 'Authenticode', status: 'NotChecked', signed: false, reason: 'Windows verification required' };
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./verify-authenticode.ps1', import.meta.url)), '-Path', executable], { windowsHide: true, encoding: 'utf8' }).replace(/^\uFEFF/, '').trim());
}
