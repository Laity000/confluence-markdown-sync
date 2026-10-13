'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync(__dirname+'/editor.js','utf8');
const source=js.slice(js.indexOf('async function downloadBackup(p){'),js.indexOf('async function justBackup(){'));
const SyncCore=require('./sync-core.js');
const preview={details:SyncCore.parsePageUrl('http://intra/pages/viewpage.action?pageId=12'),current:{id:'12',title:'Debug',version:3,storage:'<p>v3</p>'}};
let listeners=new Set(),downloadCount=0,shouldFail=false;
const chrome={
  downloads:{
    download:async()=>{downloadCount++;if(shouldFail)throw Error('DOWNLOAD_DENIED');return 99;},
    onChanged:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},
    search:(q,cb)=>cb([{id:99,state:'complete'}])
  },runtime:{lastError:null}
};
const URLMock={createObjectURL:()=>'blob:backup-mock',revokeObjectURL:()=>{}};
const context=vm.createContext({chrome,URL:URLMock,Blob,JSON,Date,SyncCore,setTimeout,clearTimeout,Error,Promise});
vm.runInContext(source,context);
(async()=>{
  const name=await context.downloadBackup(preview);assert.match(name,/Debug_page12_v3_/);assert.equal(downloadCount,1);
  shouldFail=true;
  await assert.rejects(()=>context.downloadBackup(preview),/DOWNLOAD_DENIED/);
  console.log('PASS 可选手动备份下载完成 / 失败时报错');
})().catch(e=>{console.error(e);process.exitCode=1;});
