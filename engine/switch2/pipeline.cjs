const fs = require('node:fs/promises');
const path = require('node:path');
const {a} = require('../shared/rpc.cjs');
const {run} = require('../shared/stages.cjs');
const {connect} = require('./tools/fs-memory.cjs');
const runtime = require('./ro/runtime.cjs');
const {read, save, local, hash} = runtime;
const check = (ok, message) => {if (!ok) throw Error(message);};

async function main() {
  const mode = process.env.NS2_LANGUAGE_MODE || 'english';
  check(['english', 'restore'].includes(mode), 'Unknown language mode');
  const flags = process.argv.slice(2);
  check(flags.length <= 2 && flags.every(flag => ['--dump-firmware', '--hold-rpc'].includes(flag)) &&
    new Set(flags).size === flags.length, 'Usage: pipeline.cjs [--dump-firmware] [--hold-rpc]');
  const dumpFirmware = flags.includes('--dump-firmware');
  const holdRpc = flags.includes('--hold-rpc');
  check(!holdRpc || typeof process.send === 'function', 'Held FS mode requires runner IPC');
  const file = path.join(__dirname, 'pipeline.json');
  const record = {session: a.session, started: new Date().toISOString(), stages: []};
  await fs.writeFile(file, JSON.stringify(record) + '\n', {flag: 'wx', mode: 0o600});
  async function stage(name, action) {
    console.log(name);
    const row = {name, started: new Date().toISOString(), status: 'running'};
    record.stages.push(row); await save(file, record);
    try {
      row.result = await action(); row.status = 'complete';
      return row.result;
    } catch (error) {row.status = 'failed'; row.error = error.stack; throw error;}
    finally {row.finished = new Date().toISOString(); await save(file, record);}
  }
  const script = (folder, name, args = [], timeout) =>
    stage(folder + '/' + name, () => run(path.join(__dirname, folder), name, args, timeout));
  let acquisition;
  try {
    console.log('1/4 Checking the console');
    await script('app', 'map');
    await script('app', 'inspect-mounts');
    // Earlier exact-owned scratch was already removed on separately verified
    // boots. The old honUgs cleaner is intentionally NOT replayed here: its
    // immutable target is absent. Do not scan other save files by prefix.
    const app = await script('app', 'qualify');
    check(app.verified && app.cleanedUp, 'Application worker qualification failed');
    console.log('2/4 Acquiring FS memory');
    await stage('FS read, write and restoration', async () => {
      acquisition = await require('./acquire.cjs').start();
      return {report: acquisition.report, proof: acquisition.proof};
    });
    console.log('3/4 Starting the native helper');
    const captured = await read(acquisition.report);
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!captured.retainedMemory?.captures?.some(c => c.length === 0x4d8000))
      await script('retained', 'find-metadata', [acquisition.supervisorReport]);
    await script('ro', 'install-retained');
    await stage('FS layout', () => require('./ro/layout.cjs').main());
    await stage('Owned FS root', () => require('./ro/objects.cjs').main('root'));
    await stage('Owned FS notifier', () => require('./ro/objects.cjs').main('notifier'));
    const layout = await read(local(a.session, '-layout.json'));
    await script('ro', 'test-sm', [String(layout.sdk + 0x12a0)]);
    // Separate owner-requested idempotent region writer: never send target=1 here.
    const region = await script('ro', 'region-same-value');
    check(region && ['SET_GETTER_UNAVAILABLE_NO_WRITE', 'SET_SYS_UNAVAILABLE_NO_WRITE', 'SAME_VALUE_WRITE_ACK_AND_READBACK'].includes(region.status),
      'Region test did not produce a bounded result');
    check(region.status === 'SAME_VALUE_WRITE_ACK_AND_READBACK',
      'Current boot lacks an authorized same-value write; refuse target region change');
    const trial = await script('ro', mode === 'english' ? 'region-language-roundtrip' : 'region-language-restore');
    check(trial?.status === (mode === 'english' ?
      'ENGLISH_TARGET_READBACK_NO_RESTORE' : 'JAPANESE_TARGET_READBACK_NO_RESTORE') &&
      trial.restorationIntentionallySkipped === true,
      'Requested language readback did not verify');
    record.trial = trial; await save(file, record);
    // This dedicated trial does not launch replacement RO, run a native FS demo,
    // or capture firmware. Keep the independently verified setter receipt.
    const cleanup = await stage('Release owned FS resources', () => acquisition.retire());
    check(cleanup.cleanedUp, 'Owned FS resources were not fully released');
    record.cleanup = cleanup;
    record.verified = true;
  } catch (error) {
    record.error = error.stack;
    if (acquisition) {
      try {
        const latest = await read(acquisition.report);
        // Before promotion, the acquisition still owns its original restoration
        // path. Later failures may have native state that needs a console reboot.
        if (!latest.nativeRo && !latest.retainedMemory?.promoted)
          record.failureCleanup = await acquisition.retire();
        else await acquisition.abandon();
      } catch (cleanupError) {
        record.cleanupError = cleanupError.stack;
        await acquisition.abandon();
      }
    }
    throw error;
  } finally {record.finished = new Date().toISOString(); await save(file, record);}
}

module.exports = {main};
if (require.main === module) main().catch(error => {console.error(error.stack); process.exitCode = 1;});
