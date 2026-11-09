'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'region-language-roundtrip.cjs'),'utf8');
const JA='6a61000000000000', EN='656e2d5553000000';
function fixture(opt={}){
 const files=new Map(), calls=[], closed=[];let region=opt.region??0, lang=opt.lang??JA;
 const runtime={local:(s,suf)=>'/fake/'+s+suf,
  read:async f=>f.endsWith('-region-same-value.json')?{session:'S',report:'/raw',status:opt.sameStatus??'SAME_VALUE_WRITE_ACK_AND_READBACK',original:0,after:0}:
   {session:'S',report:'/raw',export:{handle:42}},
  save:async(f,v)=>files.set(f,JSON.parse(JSON.stringify(v)))};
 const fakeFs={writeFile:async(f,v,o)=>{assert.equal(o.flag,'wx');files.set(f,JSON.parse(v))}};
 const mod={exports:{}};
 const req=n=>n==='node:fs/promises'?fakeFs:n==='./runtime.cjs'?runtime:
  n==='../tools/fs-memory.cjs'?{connect:async()=>{throw Error('Unexpected connect')}}:
  n==='./region-same-value.cjs'?{value:r=>{assert.equal(r.result,0);return Buffer.from(r.hex,'hex').readUInt32LE()}}:require(n);
 vm.runInNewContext(source,{module:mod,exports:mod.exports,require:req,Buffer,Error,console,process:{exitCode:0,hrtime:process.hrtime}}, {filename:'region-language-roundtrip.cjs'});
 const memory={info:{session:'S'},reportFile:'/raw',async request(r){
  calls.push({...r});
  if(r.command==='root-native-info')return {services:[{name:'pm:shell',sm:42}]};
  if(r.command==='root-native-sm-service')return r.name==='set'?{result:0,moves:[100]}:{result:opt.denied?0x1015:0,moves:opt.denied?[]:[101]};
  if(r.command==='root-native-ipc'){
   if(r.handle===100){
    if(r.id===4){let b=Buffer.alloc(4);b.writeUInt32LE(region);return {result:0,hex:b.toString('hex')}}
    if(r.id===0)return {result:0,hex:lang};
    if(r.id===2){assert.ok(['01000000','00000000'].includes(r.hex));return {result:0,hex:r.hex==='01000000'?(opt.mapping??EN):(opt.jaMapping??JA)}}
   }
   assert.equal(r.handle,101);
   if(r.id===57){
    if(r.hex==='01000000'){if(opt.regionTargetError)return {result:0x202};region=opt.regionTargetRead??1}
    else {assert.equal(r.hex,'00000000');if(opt.regionRestoreError)return {result:0x202};region=opt.regionRestoreRead??0}
    return {result:0};
   }
   if(r.id===0){
    if(r.hex===EN){if(opt.languageTargetError)return {result:0x202};lang=opt.languageTargetRead??EN}
    else {assert.equal(r.hex,JA);if(opt.languageRestoreError)return {result:0x202};lang=opt.languageRestoreRead??JA}
    return {result:0};
   }
  }
  if(r.command==='root-native-close-handle'){closed.push(r.handle);return {closed:r.handle}}
  throw Error('Unexpected request '+JSON.stringify(r));
 }};
 const capture=async checkpoint=>{
  assert.equal(lang,EN);assert.deepEqual(writes({calls}),[[57,'01000000'],[0,EN]]);
  if(opt.captureError)throw Error('HDMI capture failed');
  return {path:'/fake/switch-english-active.jpg',sha256:'a'.repeat(64),seq:123,
    readAtMonotonic:checkpoint+0.01,uiEnglishVerified:false,returnedToApp:!opt.returnUnverified};
 };
 return {main:memory=>mod.exports.main(memory,capture),memory,files,calls,closed};
}
const writes=f=>f.calls.filter(x=>x.command==='root-native-ipc'&&x.handle===101).map(x=>[x.id,x.hex]);
const outcome=f=>f.files.get('/fake/S-region-language-roundtrip.json');
test('region1 permits English with no immediate settings restoration',async()=>{
 const f=fixture(),r=await f.main(f.memory);assert.equal(r.status,'ENGLISH_TARGET_READBACK_NO_RESTORE');
 assert.deepEqual(writes(f),[[57,'01000000'],[0,EN]]);
 assert.equal(outcome(f).intermediateLanguage,EN);assert.equal(outcome(f).uiEnglishVerified,false);assert.equal(outcome(f).restorationIntentionallySkipped,true);assert.deepEqual(f.closed,[101,100]);
});
test('NUL-terminated ja with nonzero getter tail is semantically ja and restores canonically',async()=>{
 const f=fixture({lang:'6a6100fbf4505e00'}),r=await f.main(f.memory);
 assert.equal(r.status,'ENGLISH_TARGET_READBACK_NO_RESTORE');
 assert.equal(outcome(f).originalLanguageWire,'6a6100fbf4505e00');
 assert.equal(outcome(f).originalLanguage,JA);
 assert.deepEqual(writes(f),[[57,'01000000'],[0,EN]]);
});
test('firmware Japanese mapping mismatch refuses all writes',async()=>{const f=fixture({jaMapping:EN});await assert.rejects(f.main(f.memory),/ja language code/);assert.deepEqual(writes(f),[])});
test('malformed non-terminated getter refuses all writes',async()=>{const f=fixture({lang:'6a61616161616161'});await assert.rejects(f.main(f.memory),/non-terminated/);assert.deepEqual(writes(f),[])});
test('unknown original region refuses all writes',async()=>{const f=fixture({region:1});await assert.rejects(f.main(f.memory),/Original mutable/);assert.deepEqual(writes(f),[])});
test('unknown original language refuses all writes',async()=>{const f=fixture({lang:EN});await assert.rejects(f.main(f.memory),/Original mutable/);assert.deepEqual(writes(f),[])});
test('old same-value proof refuses all writes',async()=>{const f=fixture({sameStatus:'WRONG'});await assert.rejects(f.main(f.memory),/same-value/);assert.deepEqual(writes(f),[])});
test('unknown firmware language mapping refuses all writes',async()=>{const f=fixture({mapping:JA});await assert.rejects(f.main(f.memory),/not confirmed/);assert.deepEqual(writes(f),[])});
test('set:sys denied refuses all writes',async()=>{const f=fixture({denied:true});await assert.rejects(f.main(f.memory),/setter/);assert.deepEqual(writes(f),[])});
test('region target response error restores region, no language write',async()=>{const f=fixture({regionTargetError:true});await assert.rejects(f.main(f.memory),/not acknowledged/);assert.deepEqual(writes(f),[[57,'01000000'],[57,'00000000']]);assert.equal(outcome(f).status,'ABORT_RESTORED')});
test('region target readback mismatch restores region, no language write',async()=>{const f=fixture({regionTargetRead:0});await assert.rejects(f.main(f.memory),/Region target did not/);assert.deepEqual(writes(f),[[57,'01000000'],[57,'00000000']]);assert.equal(outcome(f).status,'ABORT_RESTORED')});
test('language target rejected still restores both values once',async()=>{const f=fixture({languageTargetError:true});await assert.rejects(f.main(f.memory),/not acknowledged/);assert.deepEqual(writes(f),[[57,'01000000'],[0,EN],[0,JA],[57,'00000000']]);assert.equal(outcome(f).status,'ABORT_RESTORED')});
test('language readback mismatch still restores both values once',async()=>{const f=fixture({languageTargetRead:JA});await assert.rejects(f.main(f.memory),/did not read back/);assert.deepEqual(writes(f),[[57,'01000000'],[0,EN],[0,JA],[57,'00000000']]);assert.equal(outcome(f).status,'ABORT_RESTORED')});
test('English success never invokes capture during FS relay',async()=>{const f=fixture({captureError:true});await f.main(f.memory);assert.deepEqual(writes(f),[[57,'01000000'],[0,EN]]);assert.equal(outcome(f).status,'ENGLISH_TARGET_READBACK_NO_RESTORE')});
