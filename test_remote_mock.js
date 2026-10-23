'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const js=fs.readFileSync(__dirname+'/editor.js','utf8');
const functionCode=js.slice(js.indexOf('async function onConfluencePage(req)'),js.indexOf('async function callSite(details,operation,data={})'));
const db={id:'123456',type:'page',title:'Debug 测试文档',version:{number:10},body:{storage:{value:'<p>old</p>',representation:'storage'}}};
let readCount=0,putCount=0,authRequestCount=0;
const stub=async(url,opts)=>{
  const method=opts?.method||'GET';
  assert.equal(opts.credentials,'same-origin');
  if(url.endsWith('/rest/api/contentbody/convert/storage')&&method==='POST'){
    const body=JSON.parse(opts.body);assert.equal(body.representation,'wiki');
    return response({value:'<h1>Header</h1>',representation:'storage'});
  }
  if(url.includes('/rest/api/content/123456')&&method==='GET'){
    readCount++;
    return response(db);
  }
  if(url.includes('/rest/api/content/123456')&&method==='PUT'){
    putCount++;
    const put=JSON.parse(opts.body);
    assert.equal(put.version.number,db.version.number+1);
    assert.equal(put.title,db.title);
    db.version.number++;
    db.body.storage.value=put.body.storage.value;
    return response({id:db.id,version:db.version});
  }
  throw Error('Unexpected path '+url);
};
function response(data,status=200){return {ok:status===200,status,headers:{get:()=> 'application/json;charset=UTF-8'},text:async()=>JSON.stringify(data)};}
const context=vm.createContext({window:{location:{origin:'http://intra.example'}},fetch:stub,JSON,Error});
vm.runInContext(functionCode,context);
const run=context.onConfluencePage;
const req={origin:'http://intra.example',prefix:'',pageId:'123456'};
(async()=>{
  const page=await run({...req,operation:'read'});assert.equal(page.id,db.id);
  const rendered=await run({...req,operation:'convert',wiki:'h1. Header'});assert.equal(rendered.value,'<h1>Header</h1>');
  const expected={id:db.id,title:db.title,version:db.version.number,storage:db.body.storage.value};
  const conflict=await run({...req,operation:'update',snapshot:{...expected,version:9},storage:'<h2>New</h2>'});
  assert.equal(conflict.conflict,true);assert.equal(putCount,0);
  const save=await run({...req,operation:'update',snapshot:expected,storage:'<h2>New</h2>'});
  assert.equal(save.updated,true);assert.equal(save.version,11);assert.equal(putCount,1);
  const nochange=await run({...req,operation:'update',snapshot:{id:db.id,title:db.title,version:db.version.number,storage:db.body.storage.value},storage:db.body.storage.value});
  assert.equal(nochange.unchanged,true);assert.equal(putCount,1);
  const securityError=await run({...req,origin:'http://other.example',operation:'read'});assert.match(securityError.__cmsyncError,/安全检查/);
  console.log('PASS mock Confluence 已登录 GET / Wiki 转 Storage / 版本冲突拒绝写入 / 安全 PUT / 无变化跳过 / 同源检查');
  console.log(`mock GET=${readCount}, PUT=${putCount}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
