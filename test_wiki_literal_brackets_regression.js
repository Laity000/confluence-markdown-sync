/* Regression: Confluence Wiki {{monospace}} autolinks [index] despite valid Markdown. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('./sync-core.js');
const storage=require('./storage-converter.js');
const wiki=require('./wiki-converter.js');
const attachments=require('./attachment-resolver.js');
const BT=String.fromCharCode(96);
const md='取BIT数组'+BT+'VARSTRUCT1.B[index]'+BT+'解析有问题';
for(const sample of [
 md,
 BT.repeat(2)+'VARSTRUCT1.B[index]'+BT.repeat(2),
 '**'+BT+'VARSTRUCT1.B[index]'+BT+'**',
 'STRING[80]',
 '数组 ARRAY[1..5] 和 VARSTRUCT1.B[index]',
 '| 字段 | 内容 |\n| --- | --- |\n| '+BT+'VARSTRUCT1.B[index]'+BT+' | **BIT** |',
 '字段 '+BT+'var[1]'+BT+' 和 '+BT+'arr[2]'+BT
]){
 assert.equal(core.hasWikiSensitiveBrackets(sample),true,sample);
 assert.equal(core.selectConversionMode(sample,'auto').mode,'local');
 assert.throws(()=>core.selectConversionMode(sample,'server'),/方括号表达式/);
 const html=storage.render(sample).value;
 assert.ok(!html.includes('<ri:page'),sample);
 assert.ok(!html.includes('createpage.action'),sample);
 assert.ok(!html.includes('<ac:link'),sample);
}
assert.equal(core.hasWikiSensitiveBrackets(BT.repeat(3)+'st\nVARSTRUCT1.B[index]\n'+BT.repeat(3)),false);
assert.equal(core.hasWikiSensitiveBrackets('~~~\nSTRING[80]\n~~~'),false);
assert.equal(core.hasWikiSensitiveBrackets('[文档](https://example.test)'),false);
assert.equal(core.selectConversionMode('普通文档','auto').mode,'auto');
assert.equal(core.selectConversionMode('STRING[80]','local').mode,'local');
assert.throws(()=>core.selectConversionMode('x','something-else'),/未知/);
const expected='<p>取BIT数组<code>VARSTRUCT1.B[index]</code>解析有问题</p>';
assert.equal(storage.render(md).value,expected);
assert.match(wiki.convert(md).output,/\{\{VARSTRUCT1\.B\[index\]\}\}/);
const editor=fs.readFileSync(__dirname+'/editor.js','utf8');
const fn=editor.slice(editor.indexOf('async function preview(){'),editor.indexOf('function textBlocks(storage)'));
assert.ok(fn.includes('SyncCore.selectConversionMode'));
assert.ok(editor.includes('function assertSafeWikiExport()'));
assert.ok(editor.includes('const output=createWikiExport();await navigator.clipboard.writeText'));
assert.ok(editor.includes('const output=createWikiExport();saveBlob'));
async function check(mode,shouldWork){
 const calls=[];let rendered=null,error=null;
 const state={revision:0,preview:null,resourceFiles:[],sourceRelativePath:'',sourceFile:null};
 const page={id:'12345',type:'page',title:'PLC',version:{number:2},body:{storage:{value:'<p>old</p>'}}};
 const details={pageId:'12345',exactUrl:'http://intra.example/pages/viewpage.action?pageId=12345'};
 const context=vm.createContext({
   state,els:{md:{value:md},mode:{value:mode}},SyncCore:core,Md2Confluence:wiki,StorageConverter:storage,AttachmentResolver:attachments,
   requestSiteAccess:async()=>{},parse:()=>details,setBusy:()=>{},
   invalidate:()=>{state.revision++;state.preview=null;},
   callSite:async(_d,operation)=>{calls.push(operation);if(operation==='read')return page;throw Error('Unsafe server convert called');},
   showPreview:()=>{rendered=state.preview;},
   note:(t,type)=>{if(type==='err')error=t;},
   errorText:e=>String(e?.message||e),
   chrome:{storage:{local:{set:async()=>{}}}},
 });
 vm.runInContext(fn,context);
 await context.preview();
 assert.deepEqual(calls,['read']);
 if(shouldWork){
   assert.ok(rendered,error);
   assert.equal(rendered.storage,expected);
   assert.equal(rendered.method,'本地基础 Storage（兼容模式）');
   assert.ok(rendered.warnings.some(x=>x.includes('Storage XHTML')));
 }else{
   assert.equal(rendered,null);
   assert.match(error,/方括号表达式/);
 }
}
(async()=>{
 await check('auto',true);
 await check('server',false);
 console.log('PASS Wiki bracket indexing safe direct Storage conversion');
})().catch(e=>{console.error(e);process.exitCode=1;});
