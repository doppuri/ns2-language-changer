'use strict';
// Owner-authorized mutable SystemSettings region 0→1→0. Never factory/calibration.
// Every write is separately journaled before dispatch; no ambiguous write replay.
const fs=require('node:fs/promises');
const {connect}=require('../tools/fs-memory.cjs');
const {read,save,local}=require('./runtime.cjs');
const {value}=require('./region-same-value.cjs');
const check=(ok,why)=>{if(!ok)throw Error(why)};
async function main(memory) {
  memory ||= await connect();
  const session=memory.info.session,report=memory.reportFile,file=local(session,'-region-roundtrip.json');
  const proof={kind:'system-region-0-to-1-to-0',session,report,started:new Date().toISOString(),
    status:'PREFLIGHT',targetPossiblyAdmitted:false,restorePossiblyAdmitted:false,restored:false};
  await fs.writeFile(file,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
  let getter=0,setter=0;
  const ipc=(handle,id,hex='')=>memory.request({command:'root-native-ipc',handle,id,hex});
  const readValue=async label=>value(await ipc(getter,4),label);
  async function restore(phase) {
    check(!proof.restorePossiblyAdmitted,'Restore was already attempted; never replay');
    proof.restorePossiblyAdmitted=true;proof.status='RESTORE_POSSIBLY_ADMITTED';proof.restorePhase=phase;
    await save(file,proof);
    proof.restoreReply=await ipc(setter,57,'00000000');await save(file,proof);
    check(!proof.restoreReply.transport && proof.restoreReply.result===0,'Restore SetRegionCode(0) did not acknowledge');
    proof.restoredValue=await readValue('restore readback');
    proof.restored=proof.restoredValue===0;
    proof.status=proof.restored?'RESTORED_TO_0':'RESTORE_READBACK_MISMATCH';await save(file,proof);
    check(proof.restored,'Region not restored to 0');
  }
  try {
    const prior=await read(local(session,'-region-same-value.json'));
    const sm=await read(local(session,'-sm-proof.json'));
    check(prior.session===session && prior.report===report &&
      prior.status==='SAME_VALUE_WRITE_ACK_AND_READBACK' && prior.original===0 && prior.after===0 &&
      sm.session===session && sm.report===report && sm.export?.handle,'Current-boot same-value proof missing');
    const state=await memory.request({command:'root-native-info'});
    check(state.services?.some(s=>s.name==='pm:shell'&&s.sm===sm.export.handle),
      'Borrowed initialized FS SM session not retained');
    proof.sameValueProof=local(session,'-region-same-value.json');
    const ordinary=await memory.request({command:'root-native-sm-service',handle:sm.export.handle,name:'set'});
    proof.getterLookup=ordinary;await save(file,proof);
    check(!ordinary.transport && ordinary.result===0 && ordinary.moves?.length===1,'No authorized system-region getter');
    getter=ordinary.moves[0];
    proof.original=await readValue('original');proof.originalSecond=await readValue('original confirmation');
    check(proof.original===0 && proof.originalSecond===0,'Original region is not Japan 0');
    const sys=await memory.request({command:'root-native-sm-service',handle:sm.export.handle,name:'set:sys'});
    proof.setterLookup=sys;await save(file,proof);
    check(!sys.transport && sys.result===0 && sys.moves?.length===1,'No authorized mutable-region setter');
    setter=sys.moves[0];
    proof.targetPossiblyAdmitted=true;proof.status='TARGET_1_POSSIBLY_ADMITTED';await save(file,proof);
    proof.targetReply=await ipc(setter,57,'01000000');await save(file,proof);
    check(!proof.targetReply.transport && proof.targetReply.result===0,'SetRegionCode(1) did not acknowledge');
    proof.intermediate=await readValue('target readback');await save(file,proof);
    check(proof.intermediate===1,'Temporary region did not read back 1');
    await restore('normal');
    proof.status='ROUNDTRIP_VERIFIED_RESTORED';proof.finished=new Date().toISOString();await save(file,proof);
    return {file,status:proof.status,original:0,intermediate:1,restoredValue:0,restored:true};
  } catch(e) {
    proof.error=e.stack;
    if(proof.targetPossiblyAdmitted && setter && !proof.restorePossiblyAdmitted) {
      try {await restore('abort-after-target')}
      catch(recoveryError){proof.restoreError=recoveryError.stack}
    }
    proof.status=proof.targetPossiblyAdmitted?
      (proof.restored?'ABORT_RESTORED':'RESTORE_UNCERTAIN_STOP_NO_RETRY'):'PREFLIGHT_FAILED_NO_WRITE';
    await save(file,proof);throw e;
  } finally {
    for(const [name,handle] of [['setter',setter],['getter',getter]])if(handle) {
      try {proof[name+'Close']=await memory.request({command:'root-native-close-handle',handle})}
      catch(e){proof[name+'CloseError']=e.stack}
    }
    proof.finished=new Date().toISOString();await save(file,proof);
  }
}
module.exports={main};
if(require.main===module)main().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.stack);process.exitCode=1});
