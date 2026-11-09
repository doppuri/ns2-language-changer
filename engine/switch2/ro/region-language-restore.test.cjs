'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'region-language-restore.cjs'),'utf8');
const JA='6a61000000000000', EN='656e2d5553000000';
function fixture({region=1,language=EN,denied=false,languageError=false,regionError=false,rollbackError=false,readbackWrong=false,prior=1}={}) {
 const files=new Map(),calls=[];let currentRegion=region,currentLanguage=language;
 const runtime={local:(s,suffix)=>'/fake/'+s+suffix,
  read:async file=>file.endsWith('-region-same-value.json')?
   {session:'S',report:'/raw',status:'SAME_VALUE_WRITE_ACK_AND_READBACK',mode:'restore',original:prior,after:prior}:
   {session:'S',report:'/raw',export:{handle:42}},
  save:async(file,value)=>files.set(file,JSON.parse(JSON.stringify(value)))};
 const mod={exports:{}};
 const requireStub=name=>name==='node:fs/promises'?{writeFile:async(file,value,options)=>{
   assert.equal(options.flag,'wx');files.set(file,JSON.parse(value))}}:
  name==='./runtime.cjs'?runtime:
  name==='../tools/fs-memory.cjs'?{connect:async()=>{throw Error('No live connect in host test')}}:
  name==='./region-same-value.cjs'?{value:r=>Buffer.from(r.hex,'hex').readUInt32LE(0)}:require(name);
 vm.runInNewContext(source,{module:mod,exports:mod.exports,require:requireStub,Buffer,Error,console,
  process:{exitCode:0}}, {filename:'region-language-restore.cjs'});
 const memory={info:{session:'S'},reportFile:'/raw',async request(request){calls.push({...request});
  if(request.command==='root-native-info')return {services:[{name:'pm:shell',sm:42}]};
  if(request.command==='root-native-sm-service')return request.name==='set'?{result:0,moves:[100]}:
   denied?{result:0x1015,moves:[]}:{result:0,moves:[101]};
  if(request.command==='root-native-close-handle')return {result:0};
  if(request.command!=='root-native-ipc')throw Error('Unexpected request '+JSON.stringify(request));
  if(request.handle===100){
   if(request.id===4){const b=Buffer.alloc(4);b.writeUInt32LE(currentRegion);return {result:0,hex:b.toString('hex')}}
   if(request.id===0)return {result:0,hex:currentLanguage};
   if(request.id===2)return {result:0,hex:request.hex==='00000000'?JA:EN};
  }
  assert.equal(request.handle,101);
  if(request.id===57){if(regionError&&request.hex==='00000000')return {result:0x202};
   if(rollbackError&&request.hex==='01000000')return {result:0x202};
   currentRegion=request.hex==='00000000'?0:1;return {result:0}}
  if(request.id===0){if(languageError&&request.hex===JA)return {result:0x202};
   currentLanguage=readbackWrong&&request.hex===JA?EN:request.hex;return {result:0}}
  throw Error('Unknown IPC command');
 }};
 return {memory,calls,files,run:()=>mod.exports.main(memory),proof:()=>files.get('/fake/S-region-language-restore.json'),
  writes:()=>calls.filter(x=>x.command==='root-native-ipc'&&x.handle===101).map(x=>[x.id,x.hex])};
}
test('region1/en-US restores to region0/ja with two acknowledged readbacks',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.status,'JAPANESE_TARGET_READBACK_NO_RESTORE');
 assert.deepEqual(f.writes(),[[0,JA],[57,'00000000']]);
 assert.equal(f.proof().intermediateRegion,0);assert.equal(f.proof().intermediateLanguage,JA);
 assert.equal(f.proof().regionBeforeTarget,1);assert.equal(f.proof().languageAfterTarget,JA);
});
test('wrong original or stale same-value proof forbids all writes',async()=>{
 for(const opts of [{region:0},{language:'6672000000000000'},{prior:0}]){
  const f=fixture(opts);await assert.rejects(f.run());assert.deepEqual(f.writes(),[]);
 }
});
test('post-reboot region1/ja normalizes to region0/ja without language setter',async()=>{
 const f=fixture({language:JA}),result=await f.run();
 assert.equal(result.status,'JAPANESE_TARGET_READBACK_NO_RESTORE');
 assert.equal(result.languageChanged,false);assert.equal(f.proof().mixedStateRecovery,true);
 assert.deepEqual(f.writes(),[[57,'00000000']]);
 assert.equal(f.proof().intermediateLanguage,JA);assert.equal(f.proof().intermediateRegion,0);
});
test('mixed-state region setter error rolls back original region1 once and never writes language',async()=>{
 const f=fixture({language:JA,regionError:true});await assert.rejects(f.run(),/not acknowledged/);
 assert.deepEqual(f.writes(),[[57,'00000000'],[57,'01000000']]);
 assert.equal(f.proof().status,'ABORT_RESTORED');
});
test('mixed-state ambiguous target and failed rollback remains uncertain, never retries',async()=>{
 const f=fixture({language:JA,regionError:true,rollbackError:true});await assert.rejects(f.run());
 assert.deepEqual(f.writes(),[[57,'00000000'],[57,'01000000']]);
 assert.equal(f.proof().status,'RESTORE_UNCERTAIN_STOP_NO_RETRY');
});
test('mixed state with unavailable setter refuses without any write',async()=>{
 const f=fixture({language:JA,denied:true});await assert.rejects(f.run(),/setter/);
 assert.deepEqual(f.writes(),[]);
});
test('set:sys denial forbids all writes',async()=>{
 const f=fixture({denied:true});await assert.rejects(f.run(),/setter/);assert.deepEqual(f.writes(),[]);
});
test('failed Japanese setter rolls language back once before region write',async()=>{
 const f=fixture({languageError:true});await assert.rejects(f.run(),/not acknowledged/);
 assert.deepEqual(f.writes(),[[0,JA],[0,EN]]);
 assert.equal(f.proof().status,'ABORT_RESTORED');
});
test('wrong language readback rolls both back once',async()=>{
 const f=fixture({readbackWrong:true});await assert.rejects(f.run(),/Japanese readback with original region did not verify/);
 assert.deepEqual(f.writes(),[[0,JA],[0,EN]]);
 assert.equal(f.proof().status,'ABORT_RESTORED');
});

test('region setter error after Japanese readback rolls back region and language once',async()=>{
 const f=fixture({regionError:true});await assert.rejects(f.run(),/RegionCode\(0\) not acknowledged/);
 assert.deepEqual(f.writes(),[[0,JA],[57,'00000000'],[0,EN],[57,'01000000']]);
 assert.equal(f.proof().status,'ABORT_RESTORED');
});
