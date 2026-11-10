#!/usr/bin/env node
'use strict';
// Region/language settings over a LIVE held ns2jb RPC session (node run.cjs --rpc).
// Attach-only: it reuses the run folder's own engine copy and the retained FS
// memory endpoint; it never starts the exploit, pairs, or sends console input.
const fs = require('node:fs/promises'), path = require('node:path');
const check = (ok, message) => { if (!ok) throw Error(message); };

const usage = 'Usage: node main.cjs RUN-FOLDER --mode english|restore\n' +
  '       node main.cjs --check-only\n' +
  'RUN-FOLDER is the runs/switch2-XXXXXX printed by vanilla ns2jb `node run.cjs --rpc`;\n' +
  'the runner must still be open. One settings attempt per held session.\n' +
  'Exit codes: 0 verified | 1 no-write refusal/failure | 3 write uncertain, stop, no retry | 4 no live host.';

async function main(args) {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) { console.log(usage); return 0; }
  if (args.length === 1 && args[0] === '--check-only') {
    console.log('CHECK_ONLY_OK: attach plan region-same-value gate -> region-language-roundtrip (english) | region-language-restore; ' +
      'no host touched, live session NOT verified. See README.md for the held-session requirement.');
    return 0;
  }
  let mode = null;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && mode === null) mode = args[++i];
    else positional.push(args[i]);
  }
  check(positional.length === 1, 'Expected exactly one ns2jb run folder; see --help');
  check(['english', 'restore'].includes(mode), '--mode english|restore is required');
  return await attach(path.resolve(positional[0]), mode);
}

async function attach(run, mode) {
  const currentFile = path.join(run, 'switch2', 'current-acquisition.json');
  const executionFile = path.join(run, 'switch2', 'fs-execution-current.json');
  let current, execution;
  try {
    current = JSON.parse(await fs.readFile(currentFile));
    execution = JSON.parse(await fs.readFile(executionFile));
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('No live host: not a held ns2jb run folder (missing current-acquisition/fs-execution reports): ' + run);
      return 4;
    }
    throw error;
  }
  check(execution.retainedEndpoint?.ready === true && execution.cleanup?.deferred === true,
    'The session is not held; start it with vanilla ns2jb `node run.cjs --rpc <ip>` and keep the runner open.');
  check(execution.retainedEndpoint.session === current.session, 'Held endpoint belongs to another session.');
  const session = current.session;
  const runtime = require('./runtime.cjs').create(run);
  await fs.mkdir(runtime.directory, {recursive: true}).catch(() => {});
  const gateName = '-settings-region-same-value.json';
  const trialName = mode === 'english' ? '-settings-english.json' : '-settings-restore.json';

  // One settings attempt per held session: a journaled trial is never replayed.
  const priorTrial = await runtime.read(runtime.local(session, trialName)).catch(() => null);
  check(!priorTrial, 'A settings trial is already journaled for this held session (' +
    priorTrial?.status + '); preserve the run folder, Ctrl-C the runner and restart the console before another attempt.');
  // Any gate receipt is terminal: lookups and the same-value write run at most
  // once per held session; only an acknowledged gate may feed the trial stage.
  const priorGate = await runtime.read(runtime.local(session, gateName)).catch(() => null);
  if (priorGate && priorGate.status !== 'SAME_VALUE_WRITE_ACK_AND_READBACK') {
    const uncertain = priorGate.writePossiblyAdmitted === true;
    console.error('Gate receipt already exists (' + priorGate.status +
      '); do not replay. Preserve the receipts' +
      (uncertain ? ' and restart the console (a write outcome is uncertain).' : ' before a fresh session.'));
    return uncertain ? 3 : 1;
  }

  let memory;
  try {
    // The run folder's own client stack: identical transport on ns2jb and the trial.
    memory = await require(path.join(run, 'switch2', 'tools', 'fs-memory.cjs')).connect();
  } catch (error) {
    console.error('Attach failed (no usable live endpoint): ' + error.message);
    return 4;
  }

  let gate = priorGate;
  if (!gate) {
    try {
      gate = await require('./region-same-value.cjs').main(memory, runtime, mode);
    } catch (error) {
      const receipt = await runtime.read(runtime.local(session, gateName)).catch(() => null);
      console.error('Same-value gate stopped: ' + error.message.split('\n')[0] +
        '\nReceipt: ' + (receipt?.file ?? runtime.local(session, gateName)));
      return receipt?.status === 'WRITE_UNCERTAIN_STOP_NO_RETRY' ? 3 : 1;
    }
  }
  if (gate.status !== 'SAME_VALUE_WRITE_ACK_AND_READBACK') {
    console.error('Current boot lacks an authorized same-value write (' + gate.status +
      '); refusing any target region change.');
    return 1;
  }
  try {
    const trial = await require(mode === 'english'
      ? './region-language-roundtrip.cjs' : './region-language-restore.cjs').main(memory, runtime);
    check(trial.status === (mode === 'english'
      ? 'ENGLISH_TARGET_READBACK_NO_RESTORE' : 'JAPANESE_TARGET_READBACK_NO_RESTORE') &&
      trial.restorationIntentionallySkipped === true, 'Requested language readback did not verify.');
    console.log(mode === 'english'
      ? 'English target readback verified (region 1 / en-US kept); the Japanese-first ordering was not applicable.'
      : 'Japanese restoration readback verified (region 0 / ja kept).' +
        (trial.languageChanged === false ? ' Mixed state: no unnecessary language write was issued.' : ''));
    console.log('UI observation still requires an independent capture after resource release.');
    console.log('Release the held session now: Ctrl-C the ns2jb runner, then restart the console.');
    return 0;
  } catch (error) {
    const receipt = await runtime.read(runtime.local(session, trialName)).catch(() => null);
    console.error('Settings trial stopped: ' + error.message.split('\n')[0] +
      '\nReceipt: ' + (receipt?.file ?? runtime.local(session, trialName)));
    return receipt?.status === 'RESTORE_UNCERTAIN_STOP_NO_RETRY' ? 3 : 1;
  }
}

main(process.argv.slice(2))
  .then(code => { process.exitCode = code || undefined; })
  .catch(error => { console.error(error.message); process.exitCode = 1; });
