'use strict';
// Attach-mode copy of engine/switch2/ro/region-language-restore.cjs: the
// Japanese restoration stage (including the mixed-state region1/ja branch)
// against a retained ns2jb FS session. Writes journaled before dispatch.
const fs=require('node:fs/promises');
const {value:region}=require('./region-same-value.cjs');
const check=(yes,why)=>{if(!yes)throw Error(why)};
const JA='6a61000000000000',EN_US='656e2d5553000000';
function language(reply,label){
  check(reply&&!reply.transport&&reply.result===0&&typeof reply.hex==='string'&&
    /^[0-9a-f]+$/i.test(reply.hex)&&reply.hex.length>=16,label+': invalid GetLanguageCode');
  const raw=Buffer.from(reply.hex.slice(0,16),'hex');
  const end=raw.indexOf(0);
  check(end>0&&end<8&&/^[A-Za-z-]+$/.test(raw.subarray(0,end).toString('ascii')),
    label+': non-terminated or invalid language code');
  // The FW getter returned ja\0 followed by nonzero tail on the real unit.
  // LanguageCode is a NUL-terminated 8-byte string; never feed getter tail to a setter.
  return Buffer.concat([raw.subarray(0,end),Buffer.alloc(8-end)]).toString('hex');
}
async function main(memory,runtime){
  const {read,save,local}=runtime;
  const session=memory.info.session,report=memory.reportFile,file=local(session,'-settings-restore.json');
  const proof={kind:'attach-mutable-system-region-and-language-restore-japanese',session,report,
    started:new Date().toISOString(),status:'PREFLIGHT',regionTargetPossiblyAdmitted:false,
    languageTargetPossiblyAdmitted:false,languageRestorePossiblyAdmitted:false,
    regionRestorePossiblyAdmitted:false,languageRestored:false,regionRestored:false};
  await fs.writeFile(file,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
  let getter=0,setter=0;
  const ipc=(handle,id,hex='')=>memory.request({command:'root-native-ipc',handle,id,hex});
  const getRegion=async label=>region(await ipc(getter,4),label);
  const getLanguage=async label=>language(await ipc(getter,0),label);
  async function restoreLanguage(phase){
    check(!proof.languageRestorePossiblyAdmitted,'English rollback already attempted; no replay');
    proof.languageRestorePossiblyAdmitted=true;proof.status='LANGUAGE_RESTORE_POSSIBLY_ADMITTED';
    proof.languageRestorePhase=phase;await save(file,proof);
    proof.languageRestoreReply=await ipc(setter,0,EN_US);await save(file,proof);
    check(!proof.languageRestoreReply.transport&&proof.languageRestoreReply.result===0,
      'SetLanguageCode(en-US) rollback not acknowledged');
    proof.restoredLanguage=await getLanguage('language restore');
    proof.languageRestored=proof.restoredLanguage===EN_US;await save(file,proof);
    check(proof.languageRestored,'English rollback readback mismatch');
  }
  async function restoreRegion(phase){
    check(!proof.regionRestorePossiblyAdmitted,'Region restore already attempted; no replay');
    proof.regionRestorePossiblyAdmitted=true;proof.status='REGION_RESTORE_POSSIBLY_ADMITTED';
    proof.regionRestorePhase=phase;await save(file,proof);
    proof.regionRestoreReply=await ipc(setter,57,'01000000');await save(file,proof);
    check(!proof.regionRestoreReply.transport&&proof.regionRestoreReply.result===0,
      'SetRegionCode(1) rollback not acknowledged');
    proof.restoredRegion=await getRegion('region restore');
    proof.regionRestored=proof.restoredRegion===1;await save(file,proof);
    check(proof.regionRestored,'Region rollback readback is not 1');
  }
  try{
    const prior=await read(local(session,'-settings-region-same-value.json'));
    const sm=await read(local(session,'-sm-proof.json'));
    check(prior.session===session&&prior.report===report&&
      prior.status==='SAME_VALUE_WRITE_ACK_AND_READBACK'&&prior.mode==='restore'&&
      prior.original===1&&prior.after===1&&
      sm.session===session&&sm.report===report&&sm.export?.handle,
      'Current-boot same-value region proof missing');
    const state=await memory.request({command:'root-native-info'});
    check(state.services?.some(s=>s.name==='pm:shell'&&s.sm===sm.export.handle),
      'FS initialized SM session not retained');
    proof.sameValueProof=local(session,'-settings-region-same-value.json');
    const ordinary=await memory.request({command:'root-native-sm-service',handle:sm.export.handle,name:'set'});
    proof.getterLookup=ordinary;await save(file,proof);
    check(!ordinary.transport&&ordinary.result===0&&ordinary.moves?.length===1,
      'No authorized system settings getter');getter=ordinary.moves[0];
    proof.originalRegion=await getRegion('original region');
    proof.originalRegionSecond=await getRegion('original region second');
    const firstLanguageReply=await ipc(getter,0);
    proof.originalLanguageWire=firstLanguageReply.hex;
    proof.originalLanguage=language(firstLanguageReply,'original language');
    proof.originalLanguageSecond=await getLanguage('original language second');
    check(proof.originalRegion===1&&proof.originalRegionSecond===1&&
      [JA,EN_US].includes(proof.originalLanguage)&&
      proof.originalLanguageSecond===proof.originalLanguage,
      'Original mutable settings differ from stable region1/ja or region1/en-US; no write');
    proof.mixedStateRecovery=proof.originalLanguage===JA;await save(file,proof);
    // Current FW must map language enum AmericanEnglish(1) to the documented en-US u64.
    const mapped=await ipc(getter,2,'01000000');
    proof.englishMappingWire=mapped.hex;
    proof.englishMapping=language(mapped,'MakeLanguageCode(1)');
    const japaneseMapped=await ipc(getter,2,'00000000');
    proof.japaneseMappingWire=japaneseMapped.hex;
    proof.japaneseMapping=language(japaneseMapped,'MakeLanguageCode(0)');await save(file,proof);
    check(proof.japaneseMapping===JA,'ja language code not confirmed by this firmware');
    check(proof.englishMapping===EN_US,'en-US language code not confirmed by this firmware');
    const sys=await memory.request({command:'root-native-sm-service',handle:sm.export.handle,name:'set:sys'});
    proof.setterLookup=sys;await save(file,proof);
    check(!sys.transport&&sys.result===0&&sys.moves?.length===1,
      'No authorized mutable system settings setter');setter=sys.moves[0];
    // Already-ja after reboot: never issue an unnecessary language setter.
    // The normal 1/en-US path keeps the historically observed Japanese-first order.
    if(!proof.mixedStateRecovery){
      proof.languageTargetPossiblyAdmitted=true;proof.status='LANGUAGE_JA_POSSIBLY_ADMITTED';await save(file,proof);
      proof.languageTargetReply=await ipc(setter,0,JA);await save(file,proof);
      check(!proof.languageTargetReply.transport&&proof.languageTargetReply.result===0,
        'SetLanguageCode(ja) not acknowledged');
    }
    proof.intermediateLanguage=await getLanguage('Japanese readback');
    proof.regionBeforeTarget=await getRegion('region before target');await save(file,proof);
    check(proof.intermediateLanguage===JA&&proof.regionBeforeTarget===1,
      'Japanese readback with original region did not verify');
    proof.regionTargetPossiblyAdmitted=true;proof.status='REGION_TARGET_0_POSSIBLY_ADMITTED';await save(file,proof);
    proof.regionTargetReply=await ipc(setter,57,'00000000');await save(file,proof);
    check(!proof.regionTargetReply.transport&&proof.regionTargetReply.result===0,
      'SetRegionCode(0) not acknowledged');
    proof.intermediateRegion=await getRegion('region target');
    proof.languageAfterTarget=await getLanguage('language after region target');await save(file,proof);
    check(proof.intermediateRegion===0&&proof.languageAfterTarget===JA,
      'Region 0 with Japanese language did not read back');
    // UI observation must occur after resource release; no HOME input in this relay.
    proof.status='JAPANESE_TARGET_READBACK_NO_RESTORE';proof.finished=new Date().toISOString();
    proof.uiJapaneseVerified=false;proof.restorationIntentionallySkipped=true;
    await save(file,proof);
    return{file,status:proof.status,languageChanged:!proof.mixedStateRecovery,languageRestored:false,
      regionRestored:false,restorationIntentionallySkipped:true};
  }catch(e){
    proof.error=e.stack;
    if(proof.languageTargetPossiblyAdmitted&&setter&&!proof.languageRestorePossiblyAdmitted){
      try{await restoreLanguage('attach-abort-after-language-target')}catch(err){proof.languageRestoreError=err.stack}
    }
    if(proof.regionTargetPossiblyAdmitted&&setter&&!proof.regionRestorePossiblyAdmitted){
      try{await restoreRegion('attach-abort-after-region-target')}catch(err){proof.regionRestoreError=err.stack}
    }
    proof.status=!proof.regionTargetPossiblyAdmitted&&!proof.languageTargetPossiblyAdmitted?
      'PREFLIGHT_FAILED_NO_WRITE':
      (!proof.regionTargetPossiblyAdmitted||proof.regionRestored)&&
      (!proof.languageTargetPossiblyAdmitted||proof.languageRestored)?
        'ABORT_RESTORED':'RESTORE_UNCERTAIN_STOP_NO_RETRY';
    await save(file,proof);throw e;
  }finally{
    for(const[name,handle]of[['setter',setter],['getter',getter]])if(handle){
      try{proof[name+'Close']=await memory.request({command:'root-native-close-handle',handle})}
      catch(err){proof[name+'CloseError']=err.stack}
    }
    proof.finished=new Date().toISOString();await save(file,proof);
  }
}
module.exports={main,language,JA,EN_US};
