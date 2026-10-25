/* eslint-disable @typescript-eslint/no-require-imports -- Standalone QA helper; no product/profile imports. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const http = require('node:http');
const { SOURCE, MODES, validateBinding, makeSession, createHandler } = require('./provider.cjs');
const FILES = ['provider.cjs', 'cli.cjs', 'provider.test.cjs', 'binding.example.json', 'PLAN.txt'];
const hashText = file => createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/gu, '\n')).digest('hex');
function fail(code) { const error = new Error(code); error.publicCode = code; throw error; }
function verifyPackage() {
  const file = path.join(__dirname, 'freeze.json'), freeze = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (freeze.sourceCommit !== SOURCE || Object.keys(freeze.files).sort().join() !== [...FILES].sort().join()) fail('FREEZE_INVALID');
  for (const name of FILES) if (hashText(path.join(__dirname, name)) !== freeze.files[name]) fail('PACKAGE_HASH_MISMATCH');
  return { freeze, freezeSha256: hashText(file) };
}
function runtimeRoot() {
  const workspace = process.cwd(), pkg = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
  if (pkg.name !== 'lingjing-desktop' || !fs.existsSync(path.join(workspace, '.git'))) fail('WORKSPACE_REQUIRED');
  return path.join(workspace, 'artifacts', 'conversations', 'dc7-simulated-provider');
}
function within(root, value) { const relative = path.relative(root, value); return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
function ownedInput(root, value) {
  const resolved = fs.realpathSync(path.resolve(value)); if (!within(fs.realpathSync(root), resolved)) fail('HELPER_ARTIFACT_PATH_REQUIRED'); return resolved;
}
function writeJson(file, value) {
  const temporary = `${file}.tmp-${randomUUID()}`; fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); fs.renameSync(temporary, file);
}
function readRun(root, value) {
  const dir = ownedInput(root, value), state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  if (path.basename(dir) !== `run-${state.runId}` || state.format !== 'lingjing.simulated-chat-provider') fail('OWNED_RUN_REQUIRED');
  const expected = makeSession(state.binding, state.runId);
  if (state.dummyKey !== expected.dummyKey || state.model !== expected.model) fail('OWNED_RUN_REQUIRED');
  return { dir, state };
}
function argumentsFor(argv) {
  const [command, ...items] = argv, options = {};
  if (items.length % 2) fail('ARGUMENT_PAIRS_REQUIRED');
  for (let i = 0; i < items.length; i += 2) { if (!items[i].startsWith('--') || Object.hasOwn(options, items[i].slice(2))) fail('INVALID_ARGUMENTS'); options[items[i].slice(2)] = items[i + 1]; }
  return { command, options };
}
function output(value) { process.stdout.write(JSON.stringify(value) + '\n'); }
async function start(options, verified) {
  if (!/^[a-zA-Z0-9:_-]{8,200}$/u.test(options['approval-ref'] ?? '') || options['approved-freeze-sha256'] !== verified.freezeSha256) fail('ROOT_APPROVAL_AND_FROZEN_HASH_REQUIRED');
  const root = runtimeRoot(), bindingFile = ownedInput(root, options.binding);
  const bindingSha256 = hashText(bindingFile);
  if (options['approved-binding-sha256'] !== bindingSha256) fail('ROOT_APPROVED_BINDING_HASH_REQUIRED');
  const binding = validateBinding(JSON.parse(fs.readFileSync(bindingFile, 'utf8'))), session = makeSession(binding);
  const dir = path.join(root, `run-${session.runId}`); fs.mkdirSync(dir);
  const stateFile = path.join(dir, 'state.json'), modeFile = path.join(dir, 'mode.json'), commandFile = path.join(dir, 'command.json');
  session.approvalRef = options['approval-ref']; session.freezeSha256 = verified.freezeSha256; session.bindingSha256 = bindingSha256;
  session.status = 'starting'; writeJson(stateFile, session); writeJson(modeFile, { runId: session.runId, mode: 'stream' });
  const auditFile = path.join(dir, 'audit.jsonl'), audit = value => fs.appendFileSync(auditFile, JSON.stringify(value) + '\n');
  const activeSockets = new Set(); let watcher, lifetime, stopping = false;
  const readMode = () => { const value = JSON.parse(fs.readFileSync(modeFile, 'utf8')); if (value.runId !== session.runId || !MODES.includes(value.mode)) fail('CONTROL_MODE_INVALID'); return value.mode; };
  const server = http.createServer(createHandler(session, readMode, audit));
  server.headersTimeout = 5000; server.requestTimeout = 5000;
  server.on('connection', socket => { activeSockets.add(socket); socket.on('close', () => activeSockets.delete(socket)); });
  server.on('clientError', (_error, socket) => { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); });
  const stop = reason => {
    if (stopping) return; stopping = true; clearInterval(watcher); clearTimeout(lifetime);
    session.status = 'stopping'; session.stopReason = reason; writeJson(stateFile, session);
    server.close(() => { session.status = reason === 'server_error' ? 'failed' : 'stopped'; session.stoppedAt = new Date().toISOString(); writeJson(stateFile, session); });
    for (const socket of activeSockets) socket.destroy();
  };
  server.on('error', () => { session.status = 'failed'; writeJson(stateFile, session); stop('server_error'); });
  process.once('SIGINT', () => stop('sigint')); process.once('SIGTERM', () => stop('sigterm'));
  // This is the package's only listener entry point. It is never run by verify,
  // status, set-mode, stop, imports, or the no-socket preparation tests.
  server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
    session.pid = process.pid; session.port = server.address().port; session.baseUrl = `http://127.0.0.1:${session.port}/v1`;
    session.status = 'listening'; session.startedAt = new Date().toISOString(); writeJson(stateFile, session);
    output({ ...session, runDirectory: dir, note: 'simulated upstream / real loopback HTTP; not an external model receipt' });
    watcher = setInterval(() => {
      if (!fs.existsSync(commandFile)) return;
      try { const command = JSON.parse(fs.readFileSync(commandFile, 'utf8')); if (command.runId === session.runId && command.stop === true) stop('owned_stop_command'); }
      catch { /* An incomplete control file never controls a different process. */ }
    }, 200); watcher.unref();
    lifetime = setTimeout(() => stop('one_hour_limit'), 60 * 60 * 1000); lifetime.unref();
  });
}
async function main(argv) {
  const { command, options } = argumentsFor(argv);
  if (command === 'help' || !command) { output({ commands: ['verify', 'start', 'status', 'set-mode', 'stop'], modes: MODES, sourceCommit: SOURCE, listenerStarted: false }); return; }
  const verified = verifyPackage();
  if (command === 'verify') {
    const result = { status: 'prepared_not_started', sourceCommit: SOURCE, freezeSha256: verified.freezeSha256, listenerStarted: false, pid: null, port: null };
    if (options.binding) { const file = ownedInput(runtimeRoot(), options.binding); result.expectedBinding = validateBinding(JSON.parse(fs.readFileSync(file, 'utf8'))); result.bindingSha256 = hashText(file); }
    output(result); return;
  }
  if (command === 'start') { await start(options, verified); return; }
  const { dir, state } = readRun(runtimeRoot(), options.run);
  if (command === 'status') { const safe = { ...state }; delete safe.dummyKey; output({ ...safe, observation: 'last_recorded_file_state_no_socket_probe' }); return; }
  if (command === 'set-mode') {
    if (state.status !== 'listening' || state.freezeSha256 !== verified.freezeSha256 || !MODES.includes(options.mode)) fail('MODE_OR_RUN_INVALID');
    writeJson(path.join(dir, 'mode.json'), { runId: state.runId, mode: options.mode }); output({ status: 'next_request_mode_recorded', mode: options.mode, activeRequestsChanged: false }); return;
  }
  if (command === 'stop') { writeJson(path.join(dir, 'command.json'), { runId: state.runId, stop: true }); output({ status: 'stop_requested', confirmationRequired: 'state.json status must become stopped' }); return; }
  fail('COMMAND_UNKNOWN');
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { output({ ok: false, code: error.publicCode ?? error.code ?? 'HELPER_INPUT_OR_IO_ERROR' }); process.exitCode = 1; });
module.exports = { hashText, verifyPackage, within, argumentsFor, main };
