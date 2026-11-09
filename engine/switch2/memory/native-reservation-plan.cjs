'use strict';
// Source-only owned-memory reservation plan. No boot-bound runner exists.
const PAGE = 4096, REPLY = 256, LIMIT = 0x40000;
function fail(why) {throw Error('Reservation plan: ' + why)}
function plan({count, addresses, sdk, sendOffset, ownerHandle, gate, waitOffset,
               resultBuffer, copyOffset}) {
  if (![59, 62, 66].includes(count) || !Array.isArray(addresses) || addresses.length !== count ||
      ![sdk, sendOffset, ownerHandle, gate, waitOffset, resultBuffer, copyOffset]
        .every(Number.isSafeInteger) || sdk % PAGE || ownerHandle <= 0 ||
      sendOffset % 4 || waitOffset % 4 || copyOffset % 4 || gate % 8 ||
      resultBuffer % 8) fail('invalid count or source-bound values');
  addresses.forEach((address, i) => {
    if (!Number.isSafeInteger(address) || address % PAGE ||
        i && address !== addresses[i - 1] + PAGE) fail('addresses must be consecutive owned pages');
  });
  if (resultBuffer < addresses.at(-1) + PAGE &&
      resultBuffer + count * REPLY > addresses[0]) fail('response region overlaps request pages');
  const calls = [{function:sdk + waitOffset,args:[gate,0,0,0],name:'reservationGate'}];
  for (let i=0;i<count;i++) calls.push({function:sdk + sendOffset,
    args:[addresses[i],PAGE,ownerHandle,0],name:'reserve'+i,kind:'ipc'});
  for (let i=0;i<count;i++) calls.push({function:sdk + copyOffset,
    args:[resultBuffer + i*REPLY,addresses[i],REPLY,0],name:'reply'+i});
  return calls;
}
function frameBytes({base,sdk,calls,code,build}) {
  if (typeof build !== 'function' || !Number.isSafeInteger(base) || base % PAGE || !Array.isArray(calls) ||
      ![119,125,133].includes(calls.length)) fail('invalid frame source');
  const {proof} = build(base,sdk,calls,code);
  if (proof.bytes > LIMIT || proof.nativeCalls !== calls.length) fail('frame exceeds reserved allocation');
  return proof.bytes;
}
function validate({count,results,replies,decode,resultBuffer}) {
  if (![59,62,66].includes(count) || !Array.isArray(results) ||
      results.length !== 1 + count*2 || !Buffer.isBuffer(replies) ||
      replies.length !== count*REPLY || typeof decode !== 'function' ||
      results[0] !== 0n || !Number.isSafeInteger(resultBuffer)) fail('incomplete native completion');
  const objects=[];
  for (let i=0;i<count;i++) {
    if (results[1+i] !== 0n || results[1+count+i] !== BigInt(resultBuffer+i*REPLY))
      fail('transport or reply copy failed at '+i);
    const reply=decode(replies.subarray(i*REPLY,(i+1)*REPLY));
    if (reply?.result !== 0 || reply.objects?.length !== 1 ||
        reply.moves?.length !== 0 || reply.copies?.length !== 0)
      fail('manager reservation reply failed at '+i);
    objects.push(reply.objects[0]);
  }
  return objects;
}
// All native-launch uncertainty is journaled and leaves the owned allocation
// intact. The caller must not release/finalize anything on an uncertain path.
async function execute({count, batch, report, save, native, session, frameBase,
                        frameLimit, slot, calls, label, signal, gate,
                        resultBuffer, decode, acceptObjects, setWorker}) {
  if (![59,62,66].includes(count) || !Number.isSafeInteger(batch) || batch < 1 ||
      typeof save !== 'function' || typeof signal !== 'function' ||
      typeof decode !== 'function' || typeof acceptObjects !== 'function' ||
      typeof setWorker !== 'function') fail('invalid execution dependencies');
  report.activeReservation = {batch, count, state:'PREPARED_BEFORE_THREAD', signaled:false};
  await save(); // Failure here has not admitted a worker.
  try {
    const worker = await native.start(session,frameBase,frameLimit,slot,calls,label);
    setWorker(worker);
    report.activeReservation.thread = worker.thread;
    report.activeReservation.state = 'CREATED_UNSIGNALED';
    await save();
    report.activeReservation.state = 'SIGNAL_POSSIBLY_ADMITTED';
    await save();
    await signal(session,gate);
    report.activeReservation.signaled = true;
    report.activeReservation.state = 'SIGNALED';
    await save();
    const results = await native.join(session,worker,15000);
    report.activeReservation.state = 'JOINED_RESULTS_UNVALIDATED';
    await save();
    const replies = await session.readOwned(resultBuffer,count*REPLY);
    const objects = validate({count,results,replies,decode,resultBuffer});
    acceptObjects(objects);
    (report.reservationBatches ||= []).push({batch,count:objects.length,
      mode:'gated-native',nativeCalls:calls.length});
    delete report.activeReservation;
    setWorker(null);
    await save();
    return objects.length;
  } catch(error) {
    report.placementUncertain = true;
    report.reservationBatchError = error.stack || String(error);
    try {await save();} catch(journalError) {
      error.reservationJournalError = journalError.stack || String(journalError);
    }
    throw error;
  }
}
module.exports={PAGE,REPLY,LIMIT,plan,frameBytes,validate,execute};
