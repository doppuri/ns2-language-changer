'use strict';
// Experimental, current-boot FS-context SM lookup + idempotent SystemSettings write.
// Requires acquisition + retained FS bridge + exact RO/test-sm proof; no target-1 write.
const fs=require('node:fs/promises'),path=require('node:path');
const {connect}=require('../tools/fs-memory.cjs');
const {read,save,local}=require('./runtime.cjs');
const check=(ok,why)=>{if(!ok)throw Error(why)};
const MODE=process.env.NS2_LANGUAGE_MODE || 'english';
check(['english','restore'].includes(MODE),'Unknown language mode');
const REGION=MODE==='restore'?1:0;
function value(reply, label) {
  check(reply && !reply.transport && reply.result===0 && typeof reply.hex==='string' &&
    /^[0-9a-f]*$/i.test(reply.hex) && reply.hex.length>=8,label+': invalid GetRegionCode');
  const v=Buffer.from(reply.hex.slice(0,8),'hex').readUInt32LE(0);
  check(v<=5,label+': unexpected RegionCode enum');return v;
}
async function main(memory) {
  memory ||= await connect();
  const proof={session:memory.info.session,report:memory.reportFile,kind:'fs-context-idempotent-region-0',
    started:new Date().toISOString(),status:'PREFLIGHT',writePossiblyAdmitted:false,mode:MODE};
  const file=local(proof.session,'-region-same-value.json');
  await fs.writeFile(file,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
  let setHandle=0,sysHandle=0,error;
  try {
    const sm=await read(local(proof.session,'-sm-proof.json'));
    check(sm.session===proof.session && sm.report===proof.report && sm.program?.result===0 &&
      sm.service?.name==='pm:shell' && sm.service?.result===0 && sm.export?.handle,
      'Current native FS SM source not proved');
    const state=await memory.request({command:'root-native-info'});
    check(state.services?.some(s=>s.name==='pm:shell' && s.sm===sm.export.handle && s.handle===sm.service.moves[0]),
      'SM borrowed handle or session differs');
    proof.smProof=local(proof.session,'-sm-proof.json');proof.smHandle=sm.export.handle;
    await save(file,proof);
    const ordinary=await memory.request({command:'root-native-sm-service',handle:sm.export.handle,name:'set'});
    proof.ordinaryLookup=ordinary;await save(file,proof);
    if (ordinary.transport || ordinary.result) {
      proof.status='SET_GETTER_UNAVAILABLE_NO_WRITE';await save(file,proof);
      return {status:proof.status,lookupResult:ordinary.result??null,writePossiblyAdmitted:false,file};
    }
    check(ordinary.moves?.length===1,'FS getter returned an unexpected handle count');
    setHandle=ordinary.moves[0];
    proof.original=value(await memory.request({command:'root-native-ipc',handle:setHandle,id:4,hex:''}),'before');
    check(proof.original===REGION,'Original system region changed; no write');
    proof.beforeSecond=value(await memory.request({command:'root-native-ipc',handle:setHandle,id:4,hex:''}),'before-second');
    check(proof.beforeSecond===REGION,'Two independent reads differ; no write');
    await save(file,proof);
    const sys=await memory.request({command:'root-native-sm-service',handle:sm.export.handle,name:'set:sys'});
    proof.sysLookup=sys;await save(file,proof);
    if (sys.transport || sys.result || sys.moves?.length!==1) {
      proof.status='SET_SYS_UNAVAILABLE_NO_WRITE';await save(file,proof);
      return {status:proof.status,lookupResult:sys.result??null,writePossiblyAdmitted:false,file};
    }
    sysHandle=sys.moves[0];
    // Persist before dispatch. A lost acknowledgement cannot authorize replay.
    proof.writePossiblyAdmitted=true;proof.status='SAME_VALUE_WRITE_POSSIBLY_ADMITTED';await save(file,proof);
    proof.write=await memory.request({command:'root-native-ipc',handle:sysHandle,id:57,
      hex:REGION===0?'00000000':'01000000'});
    await save(file,proof);
    check(!proof.write.transport && proof.write.result===0,'Same-value SetRegionCode did not acknowledge');
    proof.after=value(await memory.request({command:'root-native-ipc',handle:setHandle,id:4,hex:''}),'after');
    check(proof.after===REGION,'System region readback is not original');
    proof.status='SAME_VALUE_WRITE_ACK_AND_READBACK';await save(file,proof);
    return {status:proof.status,original:proof.original,after:proof.after,writePossiblyAdmitted:true,file};
  } catch(e) {
    error=e;proof.error=e.stack;proof.status=proof.writePossiblyAdmitted?'WRITE_UNCERTAIN_STOP_NO_RETRY':'PREFLIGHT_FAILED_NO_WRITE';
    await save(file,proof);throw e;
  } finally {
    for (const [name,handle] of [['sys',sysHandle],['set',setHandle]]) if(handle) {
      try {proof[name+'Close']=await memory.request({command:'root-native-close-handle',handle});}
      catch(e) {proof[name+'CloseError']=e.stack; if(!error) error=e;}
    }
    proof.finished=new Date().toISOString();await save(file,proof);
    if (error && !proof.error) throw error;
  }
}
module.exports={main,value};
if(require.main===module)main().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.stack);process.exitCode=1});
