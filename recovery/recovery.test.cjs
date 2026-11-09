'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {derive,PRODUCER_SHA}=require('./future-scratch-plan.cjs');
const {verify,clean}=require('./future-scratch-clean.cjs');
const {makeAdapter}=require('./future-mounted-save-adapter.cjs');
const run='switch2-TEST01',root='/NS2_GAP_1800999999999',segments=['S0_1800999999998','S1_1800999999998','S2_1800999999998'];
function fixture(){
 const canary=root+'/canary'+('/'+'A'.repeat(32)).repeat(42)+'/'+'A'.repeat(24);
 assert.equal(canary.length,0x5a0);
 const parts=canary.slice(1).split('/'),marker=root+'/'+segments.join('/');
 const createdNodes=[{path:root,type:0},{path:root+'/commit_data',type:1},
  ...parts.slice(1).map((_,i)=>({path:'/'+parts.slice(0,i+2).join('/'),type:i===parts.length-2?1:0})),
  {path:root+'/selected',type:0},...segments.map((_,i)=>({path:root+'/'+segments.slice(0,i+1).join('/'),type:0})),
  {path:marker+'/SPAN_MARKER',type:1}];
 const report={session:run,scratch:root,canary,markerSegments:segments,createdNodes,
  cleanedUp:false,qualifiedReadSize:0x180000,recoveryRequired:{scratch:root,nonrecursiveOnly:true,mounts:['save']},
  retained:{cacheNeedsRestore:false,released:true,threads:[],handles:[],
   workers:Array.from({length:13},()=>({joined:true})),created:[{name:'save',path:root}]}};
 return derive(report,{run,rawSha256:'a'.repeat(64),producerSha256:PRODUCER_SHA});
}
function mock(){
 const plan=fixture(),present=new Map(plan.nodes.map(n=>[n.path,n.type])),events=[];
 let removed=0,committed=false;
 const adapter={
  async list(dir){return [...present].filter(([name])=>path.posix.dirname(name)===dir)
   .map(([name,type])=>({name:path.posix.basename(name),type,
    ...(type===1?{size:String(plan.filePattern[name]?.size||1)}:{})}));},
  async read(name,off,length){return Buffer.alloc(length,plan.filePattern[name].byte)},
  async remove(command,name){assert.equal(events.at(-1).path,name);
   assert.equal(present.get(name),command===1?1:0);present.delete(name);removed++;return true},
  async commit(){committed=true;return true}
 };
 return {plan,present,adapter,events,journal:async e=>events.push(e),removed:()=>removed,committed:()=>committed};
}
test('synthetic producer tree is exactly 51 nodes; recovery core never claims fresh-clone proof',async()=>{
 const m=mock(),result=await clean(m.adapter,m.plan,m.journal);
 assert.equal(m.plan.nodes.length,51);assert.equal(m.removed(),51);assert.equal(m.present.size,0);
 assert.equal(m.committed(),true);assert.equal(result.freshSaveAbsenceVerified,false);
});
test('foreign or altered data aborts before deletion; lost acknowledgement is not replayed',async()=>{
 const a=mock();a.present.set(root+'/foreign',0);
 await assert.rejects(clean(a.adapter,a.plan,a.journal),/foreign\/missing children/);
 assert.equal(a.removed(),0);
 const b=mock();b.adapter.read=async(name,off,n)=>Buffer.alloc(n,0x00);
 await assert.rejects(verify(b.adapter,b.plan),/file bytes changed/);assert.equal(b.removed(),0);
 const c=mock();c.adapter.remove=async()=>{throw Error('lost acknowledgement')};
 await assert.rejects(clean(c.adapter,c.plan,c.journal),/lost acknowledgement/);
 assert.equal(c.events.at(-1).phase,'POSSIBLY_ADMITTED');assert.equal(c.committed(),false);
});
test('adapter restricts nonrecursive removal and closes exact-file handle on failure',async()=>{
 const p=fixture();let closed=0;
 const funcs={listDirectory:async()=>[],listDirectoryLong:async()=>[],
  openFile:async()=>({result:0,handle:19}),openFileLong:async()=>({result:0,handle:19}),
  fileSize:async()=>1n,readFile:async()=>{throw Error('read lost')}};
 const session={close:async()=>closed++,ipc:async()=>({result:0})};
 const a=makeAdapter(session,10,funcs,async()=>({result:0,canonicalResult:0}),p);
 await assert.rejects(a.remove(2,p.root),/nonrecursive/);
 await assert.rejects(a.read(p.nodes.find(n=>n.path.endsWith('/SPAN_MARKER')).path,0,1),/read lost/);
 assert.equal(closed,1);
});
