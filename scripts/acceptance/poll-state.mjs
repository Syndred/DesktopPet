export async function pollState(read, accept, { timeoutMs = 20000, intervalMs = 200, label = 'State did not become ready' } = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    const value = await read();
    if (accept(value)) return value;
    await new Promise(done => setTimeout(done, intervalMs));
  } while (Date.now() < deadline);
  throw new Error(label);
}
