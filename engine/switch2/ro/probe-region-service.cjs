'use strict';
// RO-process own-SM GetService capability check; absolutely no region write.
const fs=require('node:fs/promises'),path=require('node:path');
const {connect}=require('../tools/fs-memory.cjs');
const {read,save,local}=require('./runtime.cjs');
const check=(ok,why)=>{if(!ok)throw Error(why)};
async function main(pid,proofFile) {
  check(/^\d+$/.test(String(pid)) && BigInt(pid)>1n,'Expected current RO PID');
  const memory=await connect(),session=memory.info.session;
  const activation=await read(local(session,'-activation.json'));
  check(typeof proofFile==='string' && path.dirname(proofFile)===__dirname &&
    path.basename(proofFile).startsWith(session+'-execution-proof-'), 'Expected local RO proof');
  const challenges=await read(proofFile);
  check(activation.report===memory.reportFile && activation.pid===String(pid) &&
    challenges.verified===true && challenges.pid===String(pid), 'RO identity/challenges not current');
  const state=await memory.request({command:'root-native-info'});
  const sm=state.services?.find(s=>s.name==='pm:shell')?.sm;
  check(sm,'Original FS SM bridge not present for RO server lookup');
  const proof={session,report:memory.reportFile,pid:String(pid),kind:'ro-own-sm-set-sys-lookup-only',
    status:'PREPARED_NO_INPUT',started:new Date().toISOString()};
  const file=local(session,'-ro-set-sys-lookup.json');
  await fs.writeFile(file,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
  let handle=0;
  async function worker(request) {
    await memory.request({command:'root-native-worker-prepare',...request});
    await memory.request({command:'root-native-worker-release'});
    const until=Date.now()+4000;
    for(;;){
      const status=await memory.request({command:'root-native-worker-state'});
      if(status.finished)return memory.request({command:'root-native-worker-join'});
      check(Date.now()<until,'RO service worker pending; never retry synchronous request');
      await new Promise(resolve=>setTimeout(resolve,25));
    }
  }
  try {
    proof.lookup=await worker({kind:'sm-get',handle:sm,name:'ro:dmnt'});await save(file,proof);
    const got=proof.lookup.responses?.[0];
    check(got && !got.transport && got.result===0 && got.handle,'RO server session lookup failed');
    handle=got.handle;
    proof.status='RO_PROBE_POSSIBLY_ADMITTED';await save(file,proof);
    proof.reply=await worker({kind:'ro-region-service',handle});await save(file,proof);
    const reply=proof.reply.responses?.[0];
    check(reply && !reply.transport && reply.result===0 && reply.kernelPid===String(pid),
      'RO service result not from native process');
    const data=Buffer.from(reply.data,'hex');
    check(data.length>=48 && data.readBigUInt64LE(0)===0x4f52535953544553n &&
      data.readBigUInt64LE(24)===BigInt(pid), 'Native RO service proof differs');
    proof.serviceResult=Number(data.readBigUInt64LE(8));
    proof.opened=Number(data.readBigUInt64LE(16));
    check((proof.opened===1 && proof.serviceResult===0) ||
      (proof.opened===0 && proof.serviceResult!==0),'RO lookup state inconsistent');
    proof.status=proof.opened?'RO_SET_SYS_AUTHORIZED_NO_WRITE':'RO_SET_SYS_DENIED_NO_WRITE';
    proof.finished=new Date().toISOString();await save(file,proof);
    return {file,status:proof.status,serviceResult:proof.serviceResult,pid:proof.pid,writeAttempted:false};
  } catch(e){proof.status='RO_LOOKUP_UNCERTAIN_NO_WRITE_NO_RETRY';proof.error=e.stack;await save(file,proof);throw e}
  finally {if(handle){try{proof.closed=await memory.request({command:'root-native-close-handle',handle})}
    catch(e){proof.closeError=e.stack}await save(file,proof)}}
}
module.exports={main};
if(require.main===module)main(process.argv[2],process.argv[3]).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.stack);process.exitCode=1});
