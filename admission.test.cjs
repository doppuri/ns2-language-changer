'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {inspectAdmission,consumeBoot}=require('./admission.cjs');
const sha='a'.repeat(64);
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ns2-language-admission-'));
 try {const admission={bootId:'new-os-boot-123456',mode:'english',confirmedFreshOsBoot:true,
  confirmedNoPendingOwnedScratch:true,confirmedSavedNs2:true,confirmedStartUnused:true};
  const file=path.join(dir,'admission.json');await fs.writeFile(file,JSON.stringify(admission));
  await fn({dir,file,admission,runs:path.join(dir,'runs')});
 } finally {await fs.rm(dir,{recursive:true,force:true})}}
test('check manual admission then atomically consume boot ID once',async()=>fixture(async({file,runs})=>{
 const value=await inspectAdmission(file,'english');await consumeBoot(runs,value,sha);
 await assert.rejects(consumeBoot(runs,value,sha),{code:'EEXIST'});
}));
test('mode, unknown field, missing confirmation and symlink refuse before journal',async()=>fixture(async({dir,file,admission,runs})=>{
 await assert.rejects(inspectAdmission(file,'restore'),/mode mismatch/);
 await fs.writeFile(file,JSON.stringify({...admission,confirmedSavedNs2:false}));
 await assert.rejects(inspectAdmission(file,'english'),/confirmedSavedNs2/);
 await fs.writeFile(file,JSON.stringify({...admission,privateToken:'no'}));
 await assert.rejects(inspectAdmission(file,'english'),/unexpected admission fields/);
 await fs.symlink(file,path.join(dir,'link.json'));
 await assert.rejects(inspectAdmission(path.join(dir,'link.json'),'english'),/non-symlink/);
 await fs.mkdir(path.join(dir,'real-parent'));
 await fs.writeFile(path.join(dir,'real-parent','a.json'),JSON.stringify(admission));
 await fs.symlink(path.join(dir,'real-parent'),path.join(dir,'linked-parent'));
 await assert.rejects(inspectAdmission(path.join(dir,'linked-parent','a.json'),'english'),/parent is not a plain directory/);
 await assert.rejects(fs.stat(runs),{code:'ENOENT'});
}));
test('unresolved previous run blocks even a fresh boot claim',async()=>fixture(async({dir,file,runs})=>{
 await fs.mkdir(path.join(runs,'switch2-prior'),{recursive:true});
 const value=await inspectAdmission(file,'english');
 await assert.rejects(consumeBoot(runs,value,sha),/unresolved prior host run/);
 await assert.rejects(fs.stat(path.join(runs,'boot-'+value.bootId+'.json')),{code:'ENOENT'});
}));
test('completed previous run permits distinct boot ID, but symlink in runs refuses',async()=>fixture(async({dir,file,runs})=>{
 const prior=path.join(runs,'switch2-prior');await fs.mkdir(prior,{recursive:true});
 await fs.writeFile(path.join(prior,'result.json'),JSON.stringify({verified:true,pipeline:{cleanup:{cleanedUp:true}}}));
 const value=await inspectAdmission(file,'english');await consumeBoot(runs,value,sha);
 await fs.symlink(file,path.join(runs,'foreign'));
 const next={...value,bootId:'new-os-boot-654321'};
 await assert.rejects(consumeBoot(runs,next,sha),/symlink in runs/);
}));
