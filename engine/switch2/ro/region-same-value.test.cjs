'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'region-same-value.cjs'),'utf8');
function fixture({denied=false,getDenied=false,baseline=0,writeError=false,mode='english'}={}) {
 const files=new Map(),calls=[],closed=[];
 const runtime={local:(s,suffix)=>`/fake/${s}${suffix}`,read:async()=>({session:'S',report:'/fake/raw.json',program:{result:0},service:{name:'pm:shell',result:0,moves:[99]},export:{handle:42}}),save:async(p,o)=>files.set(p,JSON.parse(JSON.stringify(o)))};
 const fakeFs={writeFile:async(p,s,o)=>{assert.equal(o.flag,'wx');files.set(p,JSON.parse(s))}};
 const module={exports:{}};
 const requireStub=(name)=>name==='node:fs/promises'?fakeFs:name==='./runtime.cjs'?runtime:name==='../tools/fs-memory.cjs'?{connect:async()=>{throw Error('live connect prohibited in test')}}:require(name);
 vm.runInNewContext(source,{module,exports:module.exports,require:requireStub,Buffer,process:{exitCode:0,env:{NS2_LANGUAGE_MODE:mode}},console,Error}, {filename:'region-same-value.cjs'});
 const memory={info:{session:'S'},reportFile:'/fake/raw.json',async request(r){calls.push({...r});switch(r.command){
  case 'root-native-info':return {services:[{name:'pm:shell',sm:42,handle:99}]};
  case 'root-native-sm-service':return r.name==='set'?(getDenied?{result:0x1015,moves:[]}:{result:0,moves:[100]}):denied?{result:0x1015,moves:[]}:{result:0,moves:[101]};
  case 'root-native-ipc':if(r.id===4){const b=Buffer.alloc(4);b.writeUInt32LE(baseline);return {result:0,hex:b.toString('hex')}};
    assert.equal(r.handle,101);assert.equal(r.id,57);assert.equal(r.hex,mode==='restore'?'01000000':'00000000');return {result:writeError?0x202:0,hex:''};
  case 'root-native-close-handle':closed.push(r.handle);return {closed:r.handle};
  default:throw Error('unexpected bridge operation '+r.command);
 }}};
 return {main:module.exports.main,memory,files,calls,closed};
}
test('same-value write acknowledged and getter readback; owned service handles closed',async()=>{const f=fixture(),r=await f.main(f.memory);assert.equal(r.status,'SAME_VALUE_WRITE_ACK_AND_READBACK');assert.deepEqual(f.calls.filter(x=>x.command==='root-native-ipc').map(x=>x.id),[4,4,57,4]);assert.deepEqual(f.closed,[101,100]);assert.equal(f.files.get('/fake/S-region-same-value.json').status,r.status)});
test('set:sys denied before any command57, set closed',async()=>{const f=fixture({denied:true}),r=await f.main(f.memory);assert.equal(r.status,'SET_SYS_UNAVAILABLE_NO_WRITE');assert.equal(r.lookupResult,0x1015);assert.equal(f.calls.filter(x=>x.id===57).length,0);assert.deepEqual(f.closed,[100])});
test('FS set getter denied; RO probe remains separately reachable without any write',async()=>{const f=fixture({getDenied:true}),r=await f.main(f.memory);assert.equal(r.status,'SET_GETTER_UNAVAILABLE_NO_WRITE');assert.equal(f.calls.filter(x=>x.name==='set:sys'||x.id===57).length,0);assert.deepEqual(f.closed,[])});
test('wrong original blocks lookup and all writes',async()=>{const f=fixture({baseline:1});await assert.rejects(f.main(f.memory),/Original system region changed/);assert.equal(f.calls.filter(x=>x.name==='set:sys'||x.id===57).length,0);assert.deepEqual(f.closed,[100])});
test('setter error persists uncertain result and forbids replay',async()=>{const f=fixture({writeError:true});await assert.rejects(f.main(f.memory),/did not acknowledge/);assert.equal(f.calls.filter(x=>x.id===57).length,1);assert.equal(f.files.get('/fake/S-region-same-value.json').status,'WRITE_UNCERTAIN_STOP_NO_RETRY');assert.deepEqual(f.closed,[101,100])});
test('restore mode proves region1 with a same-value write',async()=>{const f=fixture({mode:'restore',baseline:1}),r=await f.main(f.memory);assert.equal(r.status,'SAME_VALUE_WRITE_ACK_AND_READBACK');assert.equal(r.original,1);assert.equal(f.files.get('/fake/S-region-same-value.json').mode,'restore');assert.equal(f.calls.filter(x=>x.id===57)[0].hex,'01000000')});
test('restore mode refuses region0 without writing',async()=>{const f=fixture({mode:'restore',baseline:0});await assert.rejects(f.main(f.memory),/Original system region changed/);assert.equal(f.calls.filter(x=>x.id===57).length,0)});
