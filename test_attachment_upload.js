'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(__dirname + '/editor.js', 'utf8');
const code = source.slice(source.indexOf('async function onConfluencePage(req)'), source.indexOf('async function callSite(details,operation,data={})'));
const db = {id:'123456',type:'page',title:'Attachment test',version:{number:10},body:{storage:{value:'<p>old</p>',representation:'storage'}}};
let uploadCount=0, putCount=0, getCount=0;
function response(data,status=200){
  return {ok:status>=200&&status<300,status,headers:{get:()=> 'application/json;charset=UTF-8'},text:async()=>JSON.stringify(data)};
}
const fetchStub=async(url,opts={})=>{
  const method=opts.method||'GET';
  assert.equal(opts.credentials,'same-origin');
  if(url.endsWith('/rest/api/content/123456?expand=version,body.storage')&&method==='GET'){
    getCount++;return response(JSON.parse(JSON.stringify(db)));
  }
  if(url.includes('/rest/api/content/123456/child/attachment?limit=200')&&method==='GET'){
    return response({results:[],_links:{}});
  }
  if(url.endsWith('/rest/api/content/123456/child/attachment')&&method==='POST'){
    uploadCount++;
    assert.equal(opts.headers['X-Atlassian-Token'],'nocheck');
    assert.ok(opts.body instanceof FormData);
    const uploaded=opts.body.get('file');
    assert.equal(uploaded.name,'readme.pdf');
    assert.equal(await uploaded.text(),'hello');
    return response({results:[{id:'attachment-1'}]});
  }
  if(url.endsWith('/rest/api/content/123456')&&method==='PUT'){
    putCount++;
    const body=JSON.parse(opts.body);
    assert.equal(body.version.number,db.version.number+1);
    db.version.number=body.version.number;
    db.body.storage.value=body.body.storage.value;
    return response({id:db.id,version:db.version});
  }
  throw new Error('Unexpected request '+method+' '+url);
};
const context=vm.createContext({
  window:{location:{origin:'http://intra.example'}},
  fetch:fetchStub,JSON,Error,atob,Uint8Array,FormData,Blob
});
vm.runInContext(code,context);
(async()=>{
  const run=context.onConfluencePage;
  const req={origin:'http://intra.example',prefix:'',pageId:'123456',storage:'<p>new</p>',
    attachments:[{filename:'readme.pdf',mimeType:'application/pdf',data:Buffer.from('hello').toString('base64')}]};
  const conflict=await run({...req,operation:'update',snapshot:{id:'123456',title:'Attachment test',version:9,storage:'<p>old</p>'}});
  assert.equal(conflict.conflict,true);
  assert.equal(uploadCount,0,'conflicts must be detected before uploading files');

  const saved=await run({...req,operation:'update',snapshot:{id:'123456',title:'Attachment test',version:10,storage:'<p>old</p>'}});
  assert.equal(saved.updated,true);
  assert.equal(saved.version,11);
  assert.equal(saved.attachmentsUploaded,1);
  assert.equal(uploadCount,1);
  assert.equal(putCount,1);
  assert.equal(getCount,3,'read once before upload and again before page PUT');
  console.log('PASS attachment upload: conflict check before upload, same-origin multipart POST, recheck before page PUT');
})().catch(e=>{console.error(e);process.exitCode=1;});
