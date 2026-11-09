'use strict';
// Local operator admission, not an independent console measurement.
// Fail closed after any uncertain host attempt. Never infer scratch absence from a prefix.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const check=(condition,message)=>{if(!condition)throw Error('Admission: '+message)};
async function inspectAdmission(file,mode,reader=fs){
 const absolute=path.resolve(file);
 for(let dir=path.dirname(absolute);;dir=path.dirname(dir)){
  const parent=await reader.lstat(dir);
  check(parent.isDirectory()&&!parent.isSymbolicLink(),'admission parent is not a plain directory');
  if(dir===path.dirname(dir))break;
 }
 const stat=await reader.lstat(absolute);
 check(stat.isFile()&&!stat.isSymbolicLink(),'admission must be a regular non-symlink file');
 const bytes=await reader.readFile(absolute);
 check(bytes.length<4096,'admission too large');
 const value=JSON.parse(bytes);
 check(Object.keys(value).sort().join(',')===
  'bootId,confirmedFreshOsBoot,confirmedNoPendingOwnedScratch,confirmedSavedNs2,confirmedStartUnused,mode',
  'unexpected admission fields');
 check(typeof value.bootId==='string'&&/^[a-zA-Z0-9_-]{16,64}$/.test(value.bootId),
  'unique bootId must be 16–64 ASCII letters/digits/_/-');
 check(value.mode===mode&&['english','restore'].includes(mode),'mode mismatch');
 for(const key of ['confirmedFreshOsBoot','confirmedNoPendingOwnedScratch','confirmedSavedNs2','confirmedStartUnused'])
  check(value[key]===true,'explicit operator confirmation missing: '+key);
 return {...value,admissionSha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
async function consumeBoot(runs,admission,sourceSha256,reader=fs){
 check(/^[a-f0-9]{64}$/.test(sourceSha256),'source hash invalid');
 await reader.mkdir(runs,{recursive:true,mode:0o700});
 const stats=await reader.lstat(runs);
 check(stats.isDirectory()&&!stats.isSymbolicLink(),'runs is not a plain directory');
 for(const entry of await reader.readdir(runs,{withFileTypes:true})){
  check(!entry.isSymbolicLink(),'symlink in runs: '+entry.name);
  if(!entry.isDirectory()){
   check(entry.isFile()&&/^boot-[a-zA-Z0-9_-]{16,64}\.json$/.test(entry.name),
    'unknown file in runs: '+entry.name);
   continue;
  }
  check(/^switch2-[a-zA-Z0-9_-]+$/.test(entry.name),'unknown directory in runs: '+entry.name);
  const result=path.join(runs,entry.name,'result.json');
  const prior=await reader.readFile(result,'utf8').then(JSON.parse).catch(()=>null);
  check(prior?.verified===true&&prior?.pipeline?.cleanup?.cleanedUp===true,
   'unresolved prior host run '+entry.name+'; preserve it and perform exact-owned recovery first');
 }
 const receipt=path.join(runs,'boot-'+admission.bootId+'.json');
 const record={bootId:admission.bootId,mode:admission.mode,admissionSha256:admission.admissionSha256,
  sourceSha256,attemptPossiblyAdmitted:true,started:new Date().toISOString(),
  warning:'Manual operator claims are not independently verified by this program. Do not retry same boot.'};
 await reader.writeFile(receipt,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
 return receipt;
}
module.exports={inspectAdmission,consumeBoot};
