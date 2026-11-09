'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'region-roundtrip.cjs'),'utf8');
function fixture({original=0,targetError=false,targetRead=1,restoreError=false,denied=false}={}){
 const files=new Map(),calls=[],closes=[];let current=original,reads=0;
 const runtime={local:(s,suffix)=>'/fake/'+s+suffix,
  read:async f=>f.endsWith('-region-same-value.json')?{session:'S',report:'/raw',status:'SAME_VALUE_WRITE_ACK_AND_READBACK',original:0,after:0}:
    {session:'S',report:'/raw',export:{handle:42}},
  save:async(f,v)=>files.set(f,JSON.parse(JSON.stringify(v)))};
 const fakeFs={writeFile:async(f,v,opt)=>{assert.equal(opt.flag,'wx');files.set(f,JSON.parse(v))}};
 const mod={exports:{}};const req=n=>n==='node:fs/promises'?fakeFs:n==='./runtime.cjs'?runtime:
    n==='../tools/fs-memory.cjs'?{connect:async()=>{throw Error('unexpected connect')}}:
    n==='./region-same-value.cjs'?{value:r=>{assert.equal(r.result,0);return Buffer.from(r.hex,'hex').readUInt32LE()}}:require(n);
 vm.runInNewContext(source,{module:mod,exports:mod.exports,require:req,Buffer,Error,console,process:{exitCode:0}}, {filename:'region-roundtrip.cjs'});
 const memory={info:{session:'S'},reportFile:'/raw',async request(r){calls.push({...r});if(r.command==='root-native-info')return{services:[{name:'pm:shell',sm:42}]};
  if(r.command==='root-native-sm-service')return r.name==='set'?{result:denied?0x1015:0,moves:denied?[]:[100]}:{result:0,moves:[101]};
  if(r.command==='root-native-ipc'){
   if(r.id===4){reads++;const b=Buffer.alloc(4);b.writeUInt32LE(current);return{result:0,hex:b.toString('hex')}}
   assert.equal(r.handle,101);assert.equal(r.id,57);
   if(r.hex==='01000000'){if(targetError)return{result:0x202};current=targetRead;return{result:0}}
   assert.equal(r.hex,'00000000');if(restoreError)return{result:0x202};current=0;return{result:0};
  }
  if(r.command==='root-native-close-handle'){closes.push(r.handle);return{closed:r.handle}}
  throw Error('Unexpected request '+r.command);
 }};
 return{main:mod.exports.main,memory,files,calls,closes,readCount:()=>reads};
}
const writes=f=>f.calls.filter(x=>x.command==='root-native-ipc'&&x.id===57).map(x=>x.hex);
test('real-value roundtrip: baseline twice, target1 read1, restore0 read0, close',async()=>{let f=fixture();let r=await f.main(f.memory);assert.equal(r.status,'ROUNDTRIP_VERIFIED_RESTORED');assert.deepEqual(writes(f),['01000000','00000000']);assert.equal(f.readCount(),4);assert.deepEqual(f.closes,[101,100]);assert.equal(f.files.get('/fake/S-region-roundtrip.json').restored,true)});
test('baseline changed: no target or restore write',async()=>{let f=fixture({original:1});await assert.rejects(f.main(f.memory),/Original region/);assert.deepEqual(writes(f),[]);assert.equal(f.files.get('/fake/S-region-roundtrip.json').status,'PREFLIGHT_FAILED_NO_WRITE')});
test('getter denied: no write',async()=>{let f=fixture({denied:true});await assert.rejects(f.main(f.memory),/getter/);assert.deepEqual(writes(f),[])});
test('target response error: exactly one target then distinct abort restore',async()=>{let f=fixture({targetError:true});await assert.rejects(f.main(f.memory),/did not acknowledge/);assert.deepEqual(writes(f),['01000000','00000000']);assert.equal(f.files.get('/fake/S-region-roundtrip.json').status,'ABORT_RESTORED')});
test('target readback unexpected: restore once and stop',async()=>{let f=fixture({targetRead:0});await assert.rejects(f.main(f.memory),/did not read back/);assert.deepEqual(writes(f),['01000000','00000000']);assert.equal(f.files.get('/fake/S-region-roundtrip.json').status,'ABORT_RESTORED')});
test('restore error: no repeated restore, uncertain status',async()=>{let f=fixture({restoreError:true});await assert.rejects(f.main(f.memory),/did not acknowledge/);assert.deepEqual(writes(f),['01000000','00000000']);assert.equal(f.files.get('/fake/S-region-roundtrip.json').status,'RESTORE_UNCERTAIN_STOP_NO_RETRY')});
