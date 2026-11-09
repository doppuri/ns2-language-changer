// Observation only after a sequential native join timeout; no IPC-memory
// reads, pthread_join, worker restart, or additional FS requests.
async function snapshotPendingWorkers(s, workers, tryWait, budgetMs = 3000) {
  if (!Array.isArray(workers) || workers.length < 1 || workers.length > 16 ||
      typeof tryWait !== 'function' || !Number.isInteger(budgetMs) || budgetMs < 1 || budgetMs > 3000)
    throw Error('Invalid bounded worker snapshot');
  const started = process.hrtime.bigint();
  const deadlineNs = started + BigInt(budgetMs) * 1000000n;
  const states = [];
  for (const worker of workers) {
    if (process.hrtime.bigint() >= deadlineNs) break;
    if (worker.joined || !s.threads.has(worker.thread)) {
      states.push({label: worker.label, thread: worker.thread, state: 'already-joined-or-not-owned'});
      continue;
    }
    try {
      const finished = await tryWait(worker.thread, deadlineNs);
      if (finished !== 0 && finished !== 1) {
        states.push({label: worker.label, thread: worker.thread, state: 'invalid-return', value: String(finished)});
        break;
      }
      states.push({label: worker.label, thread: worker.thread,
        state: finished ? 'finished-unjoined' : 'pending'});
    } catch (error) {
      states.push({label: worker.label, thread: worker.thread, state: 'probe-error', error: error.message});
      break;
    }
  }
  const snapshot = {operation: 'nativeTimeoutTryWaitSnapshot', elapsedMs: Number(process.hrtime.bigint() - started)/1000000,
    sampled: states.length, total: workers.length, states, incomplete: states.length !== workers.length};
  await s.record(snapshot);
  return snapshot;
}
module.exports = {snapshotPendingWorkers};
