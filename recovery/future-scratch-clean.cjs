'use strict';
// Source-only cleanup core. No listener, boot verifier, CLI or console adapter.
// Never call on a live SAVE without separate source/raw/boot/peer/lease binding,
// durable journaling, session cleanup and fresh-clone absence verification.
const path=require('node:path'),{PRODUCER_SHA}=require('./future-scratch-plan.cjs');
const check=(yes,why)=>{if(!yes)throw Error('future scratch cleanup: '+why)};
function bound(p){
 check(p?.kind==='FUTURE_SCRATCH_PLAN_ONLY'&&p.producerSha256===PRODUCER_SHA&&
   p.mayDelete===false&&p.bootVerified===false&&p.liveSaveCloneVerified===false&&
   /^switch2-[A-Za-z0-9]{6}$/.test(p.run)&&/^[a-f0-9]{64}$/.test(p.rawSha256)&&
   /^\/NS2_GAP_[0-9]{13}$/.test(p.root)&&
   p.nodes?.length===51&&new Set(p.nodes.map(n=>n.path)).size===51&&
   p.nodes[0].path===p.root&&p.nodes[0].type===0&&
   p.nodes.every(n=>[0,1].includes(n.type)&&
     (n.path===p.root||n.path.startsWith(p.root+'/')))&&
   Object.keys(p.filePattern||{}).length===3&&
   p.nodes.filter(n=>n.type===1).length===3&&
   p.nodes.filter(n=>n.type===1).every(n=>p.filePattern[n.path]),
   'exact source-derived plan required');
}
async function fileBytes(adapter,p,node){
 const f=p.filePattern[node.path];check(f&&[1,0x1000000].includes(f.size)&&
   (f.size===0x1000000?f.byte===0x66:f.byte===0),
   'unexpected producer file pattern');
 for(let offset=0;offset<f.size;offset+=0x40000){
  const count=Math.min(f.size-offset,0x40000),bytes=await adapter.read(node.path,offset,count);
  check(Buffer.isBuffer(bytes)&&bytes.length===count&&bytes.equals(Buffer.alloc(count,f.byte)),
   'file bytes changed at '+node.path);
 }
}
async function verify(adapter,p){
 bound(p);
 const children=new Map();
 for(const n of p.nodes.slice(1)){
  const dir=path.posix.dirname(n.path),existing=children.get(dir)||[];
  existing.push(n);children.set(dir,existing);
 }
 for(const n of p.nodes.filter(n=>n.type===0)){
  const observed=await adapter.list(n.path),expected=children.get(n.path)||[];
  check(Array.isArray(observed)&&observed.length===expected.length,
    'foreign/missing children at '+n.path);
  for(const child of expected){
   const item=observed.find(o=>o.name===path.posix.basename(child.path));
   check(item&&item.type===child.type&&
     (child.type===0||item.size===String(p.filePattern[child.path].size)),
     'foreign type/size at '+child.path);
  }
 }
 for(const n of p.nodes.filter(n=>n.type===1))await fileBytes(adapter,p,n);
 return true;
}
async function clean(adapter,p,journal){
 check(typeof journal==='function','durable journal callback required');
 await verify(adapter,p); // no mutation before exhaustive inventory/content check
 const remaining=new Map(p.nodes.map(n=>[n.path,n]));
 async function exactChildren(dir){
  const expected=[...remaining.values()].filter(n=>path.posix.dirname(n.path)===dir);
  const observed=await adapter.list(dir);
  check(Array.isArray(observed)&&observed.length===expected.length,
   'foreign/missing child before removing from '+dir);
  for(const n of expected){
   const item=observed.find(o=>o.name===path.posix.basename(n.path));
   check(item&&item.type===n.type&&
    (n.type===0||item.size===String(p.filePattern[n.path].size)),
    'foreign/changed child before removing '+n.path);
  }
 }
 for(const n of p.nodes.slice(1).reverse()){
  const parent=path.posix.dirname(n.path);
  // Reject foreign siblings before even an owned file mutation, not only when
  // later removing a now non-empty parent directory.
  await exactChildren(parent);
  if(n.type===0)check((await adapter.list(n.path)).length===0,
    'directory gained a child: '+n.path);
  else await fileBytes(adapter,p,n);
  await journal({phase:'POSSIBLY_ADMITTED',rawSha256:p.rawSha256,path:n.path,command:n.type===1?1:3});
  check(await adapter.remove(n.type===1?1:3,n.path)===true,'remove acknowledgement missing: '+n.path);
  remaining.delete(n.path);
  await exactChildren(parent);
  await journal({phase:'REMOVED_ACK',path:n.path});
 }
 await exactChildren(p.root);
 await journal({phase:'ROOT_POSSIBLY_ADMITTED',rawSha256:p.rawSha256,path:p.root,command:3});
 check(await adapter.remove(3,p.root)===true,'root removal acknowledgement missing');
 check(!(await adapter.list('/')).some(o=>o.name===path.posix.basename(p.root)),
  'root still exists');
 await journal({phase:'COMMIT_POSSIBLY_ADMITTED',rawSha256:p.rawSha256});
 check(await adapter.commit()===true,'commit acknowledgement missing');
 await journal({phase:'COMMITTED',rawSha256:p.rawSha256,root:p.root});
 return {root:p.root,removed:51,commitAcknowledged:true,
   // Deliberately not true: must be proved with another fresh SAVE clone.
   freshSaveAbsenceVerified:false,sessionReleased:false};
}
module.exports={verify,clean};
