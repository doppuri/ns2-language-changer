'use strict';
// Read-only producer+raw-derived planning for this exact source revision.
// Does not remove files, connect to a console, or authorize START.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const PRODUCER_SHA='428939bd5ed1798533f862c09fac1b863cf38cac85ed9a5bd8026ccc3e284e6e';
const SHA=/^[0-9a-f]{64}$/;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const check=(yes,why)=>{if(!yes)throw Error('future scratch plan: '+why)};
function derive(report,{run,rawSha256,producerSha256}){
 check(typeof run==='string'&&/^switch2-[A-Za-z0-9]{6}$/.test(run),'invalid runtime run');
 check(SHA.test(rawSha256)&&producerSha256===PRODUCER_SHA,'unbound raw or producer hash');
 check(report&&report.session===run&&/^\/NS2_GAP_[0-9]{13}$/.test(report.scratch),'new unique root absent');
 const root=report.scratch,canary=report.canary;
 check(typeof canary==='string'&&canary.startsWith(root+'/canary/')&&Buffer.byteLength(canary)===0x5a0,
   'producer canary differs');
 const parts=canary.slice(1).split('/');
 check(parts[0]===root.slice(1)&&parts[1]==='canary'&&parts.slice(2,-1).every(s=>s==='A'.repeat(32))&&
   /^A{1,32}$/.test(parts.at(-1)),'producer canary path differs');
 const segments=report.markerSegments;
 check(Array.isArray(segments)&&segments.length===3&&segments.every((s,i)=>
   typeof s==='string'&&new RegExp('^S'+i+'_[0-9]{13}$').test(s)),
   'marker producer segments missing or malformed');
 const marker=root+'/'+segments.join('/');
 const nodes=[{path:root,type:0},{path:root+'/commit_data',type:1},
   ...parts.slice(1).map((_,i)=>({path:'/'+parts.slice(0,i+2).join('/'),type:i===parts.length-2?1:0})),
   {path:root+'/selected',type:0},
   ...segments.map((_,i)=>({path:root+'/'+segments.slice(0,i+1).join('/'),type:0})),
   {path:marker+'/SPAN_MARKER',type:1}];
 check(nodes.length===51&&new Set(nodes.map(n=>n.path)).size===51&&
   JSON.stringify(report.createdNodes)===JSON.stringify(nodes),
   'exact owned tree differs');
 check(report.cleanedUp===false&&report.qualifiedReadSize===0x180000&&
   report.recoveryRequired?.scratch===root&&report.recoveryRequired?.nonrecursiveOnly===true&&
   JSON.stringify(report.recoveryRequired?.mounts)==='["save"]'&&
   report.retained?.cacheNeedsRestore===false&&report.retained?.released===true&&
   report.retained?.threads?.length===0&&report.retained?.handles?.length===0&&
   report.retained?.workers?.length===13&&report.retained.workers.every(w=>w.joined===true)&&
   report.retained?.created?.length===1&&report.retained.created[0].name==='save'&&
   report.retained.created[0].path===root&&!report.pending&&!report.cleanupError,
   'ownership or release not complete');
 return {kind:'FUTURE_SCRATCH_PLAN_ONLY',run,root,nodes,rawSha256,producerSha256,
   filePattern:{[root+'/commit_data']:{size:0x1000000,byte:0x66},
     [canary]:{size:1,byte:0},[marker+'/SPAN_MARKER']:{size:1,byte:0}},
   mayDelete:false,bootVerified:false,liveSaveCloneVerified:false};
}
async function readOrdinary(file,reader=fs){
 const stat=await reader.lstat(file);
 check(stat.isFile()&&!stat.isSymbolicLink(),'not an ordinary file: '+file);
 return reader.readFile(file);
}
async function plan({rawFile,producerFile,expectedRawSha256,expectedRun},reader=fs){
 check(typeof rawFile==='string'&&path.isAbsolute(rawFile)&&
   typeof producerFile==='string'&&path.isAbsolute(producerFile)&&
   SHA.test(expectedRawSha256)&&/^switch2-[A-Za-z0-9]{6}$/.test(expectedRun),
   'missing raw/source/run pins');
 // No arbitrary path pair: only memory report plus its producer in the same
 // dedicated run's engine, *and* a SHA-bound live-execution-produced raw.
 const dir=path.dirname(rawFile);
 for(const parent of [dir,path.dirname(dir),path.dirname(path.dirname(dir))]){
  const stat=await reader.lstat(parent);
  check(stat.isDirectory()&&!stat.isSymbolicLink(),'linked or non-directory run parent');
 }
 check(path.basename(dir)==='memory'&&path.basename(producerFile)==='probe-reserved-gap.cjs'&&
   path.dirname(producerFile)===dir&&
   path.basename(path.dirname(dir))==='switch2'&&
   path.basename(path.dirname(path.dirname(dir)))===expectedRun&&
   /^reserved-gap-[0-9]{13}\.json$/.test(path.basename(rawFile)),
   'raw is not from the exact dedicated producer directory');
 const raw=await readOrdinary(rawFile,reader),producer=await readOrdinary(producerFile,reader);
 check(hash(raw)===expectedRawSha256&&hash(producer)===PRODUCER_SHA,
   'raw or producer contents changed');
 return derive(JSON.parse(raw),{run:expectedRun,rawSha256:expectedRawSha256,
   producerSha256:PRODUCER_SHA});
}
module.exports={plan,derive,PRODUCER_SHA};
