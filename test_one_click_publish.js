'use strict';
// Regression test: publishing after preview must NOT require checkbox, confirm or backup download.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const editor=fs.readFileSync(path.join(__dirname,'editor.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'editor.html'),'utf8');
assert.doesNotMatch(html,/id=["']accept["']/);
assert.match(html,/id="backup"/);
const source=editor.slice(editor.indexOf('async function publish(){'),editor.indexOf("$('preview').addEventListener('click',preview);"));
assert.doesNotMatch(source,/\bdownloadBackup\s*\(/);
assert.doesNotMatch(source,/\bconfirm\s*\(/);
assert.doesNotMatch(source,/\baccept\b/);
let backupCalls=0, confirmCalls=0, requests=0, readRequests=0, busy=false, clears=0;
let notification='';
let remotePage={id:'123456',type:'page',title:'测试页面',version:{number:3},body:{storage:{value:'<p>old</p>'}}};
const preview={details:{pageId:'123456'},current:{id:'123456',title:'测试页面',version:3,storage:'<p>old</p>'},storage:'<p>new</p>',markdown:'# New',attachments:[],noChange:false,blocked:false};
const state={preview,working:false};
const els={md:{value:'# New'}};
let serverResult={updated:true,version:4};
const context={
  state,els,
  serializeAttachments:async uploads=>uploads||[],
  canPublish:()=>!!state.preview && !state.preview.noChange && !state.preview.blocked,
  setBusy:flag=>{busy=flag;state.working=flag;},
  note:msg=>{notification=msg;},
  callSite:async(_details,op,data)=>{
    if(op==='read'){readRequests++;return JSON.parse(JSON.stringify(remotePage));}
    requests++;assert.equal(op,'update');assert.equal(data.snapshot.version,3);assert.deepEqual(data.attachments,[]);return serverResult;
  },
  SyncCore:{requiredPage(data,pageId){
    assert.equal(String(data.id),String(pageId));
    return {id:String(data.id),title:data.title,version:data.version.number,storage:data.body.storage.value};
  }},
  invalidate:()=>{clears++;state.preview=null;},
  errorText:err=>String(err),
  downloadBackup:()=>{backupCalls++;throw new Error('should not call backup');},
  confirm:()=>{confirmCalls++;throw new Error('should not show prompt');}
};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
  await context.publish();
  assert.equal(requests,1);assert.equal(backupCalls,0);assert.equal(confirmCalls,0);assert.equal(busy,false);assert.equal(clears,1);
  assert.match(notification,/同步成功/);
  state.preview=preview;
  serverResult={conflict:true,latestVersion:5,message:'changed'};
  await context.publish();
  assert.equal(requests,2);assert.match(notification,/版本冲突/);
  assert.equal(backupCalls,0);assert.equal(confirmCalls,0);
  // If the write response is missing but the remote body matches the requested Storage,
  // verify by reading the page instead of reporting an ambiguous failure.
  state.preview=preview;serverResult=undefined;
  remotePage={id:'123456',type:'page',title:'测试页面',version:{number:4},body:{storage:{value:'<p>new</p>'}}};
  await context.publish();
  assert.equal(readRequests,1);assert.match(notification,/重新读取远端页面确认成功/);
  // If the response is missing and the remote snapshot is unchanged, report a confirmed non-update.
  state.preview=preview;remotePage={id:'123456',type:'page',title:'测试页面',version:{number:3},body:{storage:{value:'<p>old</p>'}}};
  await context.publish();
  assert.equal(readRequests,2);assert.match(notification,/确认正文仍未更新/);
  state.preview={...preview,blocked:true};
  await context.publish();assert.equal(requests,4);
  console.log('PASS one-click publish, conflicts, and read-back verification for ambiguous update results');
})().catch(e=>{console.error(e);process.exitCode=1;});
