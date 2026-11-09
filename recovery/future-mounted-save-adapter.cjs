'use strict';
// Source-only adapter for a separately authenticated, freshly cloned mounted SAVE.
// Does not clone, connect, read raw receipts, send START or authorize deletion.
const {PRODUCER_SHA}=require('./future-scratch-plan.cjs');
const check=(ok,why)=>{if(!ok)throw Error('future mounted SAVE adapter: '+why)};
function makeAdapter(session,handle,filesystem,normal,plan){
 check(session&&typeof session.close==='function'&&typeof session.ipc==='function'&&
   Number.isSafeInteger(handle)&&handle>0&&typeof normal==='function'&&filesystem&&
   ['listDirectory','listDirectoryLong','openFile','openFileLong','fileSize','readFile'].every(
     method=>typeof filesystem[method]==='function')&&
   plan?.kind==='FUTURE_SCRATCH_PLAN_ONLY'&&plan.producerSha256===PRODUCER_SHA&&
   /^\/NS2_GAP_[0-9]{13}$/.test(plan.root)&&
   /^switch2-[A-Za-z0-9]{6}$/.test(plan.run)&&/^[a-f0-9]{64}$/.test(plan.rawSha256)&&
   plan.nodes?.length===51&&plan.nodes[0].path===plan.root,
   'exact new-run producer/raw plan and long-path helpers required');
 const nodes=new Map(plan.nodes.map(n=>[n.path,n.type]));
 const list=async name=>{
  check(name===plan.root||name.startsWith(plan.root+'/')||name==='/',
   'listing outside owned root/refcheck');
  return (Buffer.byteLength(name)<0x301?filesystem.listDirectory:filesystem.listDirectoryLong)(session,handle,name);
 };
 return {list,
  async read(name,offset,count){
   check(nodes.get(name)===1&&Number.isSafeInteger(offset)&&offset>=0&&
     Number.isSafeInteger(count)&&count>0&&count<=0x40000&&
     offset+count<=plan.filePattern[name]?.size,'read outside owned file');
   const open=Buffer.byteLength(name)<0x301?filesystem.openFile:filesystem.openFileLong;
   const opened=await open(session,handle,name);
   check(!opened.result&&Number.isSafeInteger(opened.handle)&&opened.handle>0,'owned file open failed');
   try{
    check(await filesystem.fileSize(session,opened.handle)===BigInt(plan.filePattern[name].size),
      'owned file size changed');
    return await filesystem.readFile(session,opened.handle,offset,count);
   }finally{await session.close(opened.handle)}
  },
  async remove(command,name){
   check((command===1&&nodes.get(name)===1)||(command===3&&nodes.get(name)===0),
     'nonrecursive exact-owned removal only');
   const reply=await normal(handle,command,name);
   return reply.result===0&&reply.canonicalResult===0;
  },
  async commit(){
   const reply=await session.ipc('Commit future exact SAVE cleanup',handle,10);
   return reply.result===0;
  }
 };
}
module.exports={makeAdapter};
