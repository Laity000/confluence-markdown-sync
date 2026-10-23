'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const editor=fs.readFileSync(path.join(__dirname,'editor.js'),'utf8');
const start=editor.indexOf('async function onConfluencePage(req){');
const end=editor.indexOf('async function callSite(details,operation,data={})',start);
assert.ok(start>=0&&end>start,'onConfluencePage function found');
const source=editor.slice(start,end)+'\nthis.onConfluencePage=onConfluencePage;';

const ORIGIN='http://confluence.local';
const PREFIX='/confluence';
const PAGE_ID='123';
const LOCAL_BYTES=Uint8Array.from([80,78,71]); // "PNG"
const LOCAL_BASE64='UE5H';

function responseJson(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8'}});
}
function page(version=3,storage='<p>old</p>'){
  return {id:PAGE_ID,type:'page',title:'Test page',version:{number:version},body:{storage:{value:storage}}};
}
async function runScenario({existing=[],remoteBytes=LOCAL_BYTES,failAttachmentUpdate=false}={}){
  let remotePage=page();
  let binary=Uint8Array.from(remoteBytes);
  const requests=[];
  const attachmentUpdates=[];
  const ctx={
    window:{location:{origin:ORIGIN}},
    URL,Uint8Array,Blob,FormData,Response,Headers,atob,
    fetch:async(input,options={})=>{
      const url=new URL(String(input),ORIGIN);
      const method=options.method||'GET';
      requests.push({method,url:url.pathname+url.search});
      if(url.pathname===PREFIX+'/rest/api/content/'+PAGE_ID&&method==='GET')
        return responseJson(remotePage);
      if(url.pathname===PREFIX+'/rest/api/content/'+PAGE_ID+'/child/attachment'&&method==='GET')
        return responseJson({results:existing,_links:{}});
      if(url.pathname==='/download/attachments/att-1/diagram.png'&&method==='GET')
        return new Response(binary,{status:200,headers:{'content-type':'application/octet-stream'}});
      if(url.pathname===PREFIX+'/rest/api/content/'+PAGE_ID+'/child/attachment/att-1/data'&&method==='POST'){
        attachmentUpdates.push(url.pathname);
        if(failAttachmentUpdate)return responseJson({message:'duplicate attachment rejected'},409);
        binary=Uint8Array.from(LOCAL_BYTES);
        return responseJson({results:[]});
      }
      if(url.pathname===PREFIX+'/rest/api/content/'+PAGE_ID+'/child/attachment'&&method==='POST')
        return responseJson({results:[]});
      if(url.pathname===PREFIX+'/rest/api/content/'+PAGE_ID&&method==='PUT'){
        const payload=JSON.parse(options.body);
        remotePage={id:PAGE_ID,type:'page',title:payload.title,version:payload.version,body:{storage:{value:payload.body.storage.value}}};
        return responseJson(remotePage);
      }
      throw new Error('Unexpected request '+method+' '+url.pathname+url.search);
    }
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  const result=await ctx.onConfluencePage({
    operation:'update',origin:ORIGIN,prefix:PREFIX,pageId:PAGE_ID,
    snapshot:{id:PAGE_ID,title:'Test page',version:3,storage:'<p>old</p>'},
    storage:'<p>new</p>',
    attachments:[{filename:'diagram.png',mimeType:'image/png',data:LOCAL_BASE64}]
  });
  return {result,requests,attachmentUpdates,remotePage};
}

(async()=>{
  const existing={id:'att-1',title:'diagram.png',_links:{download:'/download/attachments/att-1/diagram.png'}};

  const same=await runScenario({existing:[existing],remoteBytes:LOCAL_BYTES});
  assert.equal(same.result.updated,true);
  assert.equal(same.result.attachmentsUploaded,0);
  assert.equal(same.result.attachmentsSkipped,1);
  assert.equal(same.requests.some(r=>r.method==='POST'&&r.url.includes('/child/attachment')),false,
    'unchanged existing attachments must not be uploaded again');
  assert.equal(same.remotePage.version.number,4);

  const changed=await runScenario({existing:[existing],remoteBytes:Uint8Array.from([79,76,68])});
  assert.equal(changed.result.updated,true);
  assert.equal(changed.result.attachmentsUploaded,1);
  assert.equal(changed.result.attachmentsSkipped,0);
  assert.equal(changed.attachmentUpdates.length,1,'changed existing attachment must use its data endpoint');
  assert.equal(changed.requests.some(r=>r.method==='POST'&&r.url.endsWith('/child/attachment')),false,
    'an existing attachment must not be re-created by filename');

  const fresh=await runScenario({existing:[]});
  assert.equal(fresh.result.updated,true);
  assert.equal(fresh.result.attachmentsUploaded,1);
  assert.equal(fresh.result.attachmentsSkipped,0);
  assert.equal(fresh.requests.some(r=>r.method==='POST'&&r.url.endsWith('/child/attachment')),true,
    'a missing attachment should be created');

  const failed=await runScenario({existing:[existing],remoteBytes:Uint8Array.from([79,76,68]),failAttachmentUpdate:true});
  assert.equal(typeof failed.result.__cmsyncError,'string');
  assert.match(failed.result.__cmsyncError,/Confluence API HTTP 409: duplicate attachment rejected/);
  assert.equal(failed.remotePage.version.number,3,'body must not update when attachment processing fails');

  console.log('PASS attachment reconciliation: skip identical files, update changed existing files, create missing files, surface API errors');
})().catch(error=>{console.error(error);process.exitCode=1;});
