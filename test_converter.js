'use strict';
const assert=require('node:assert/strict');
const wiki=require('./wiki-converter.js'),storage=require('./storage-converter.js'),sync=require('./sync-core.js');
function test(name,fn){fn();process.stdout.write('PASS '+name+'\n');}
test('解析根路径 pageId',()=>{
  const u=sync.parsePageUrl('http://confluence.corp/pages/viewpage.action?pageId=123456');
  assert.equal(u.pageId,'123456');assert.equal(u.base,'http://confluence.corp');
  assert.equal(u.endpoint,'http://confluence.corp/rest/api/content/123456');
});
test('解析 /confluence/ 子路径',()=>{
  const u=sync.parsePageUrl('http://confluence.corp/confluence/pages/viewpage.action?pageId=155');
  assert.equal(u.base,'http://confluence.corp/confluence');
});
test('非法路径、凭据、缺失 pageId 均拒绝',()=>{
  for(const s of ['http://confluence.corp/display/AAA/XXX','https://u:p@confluence.corp/pages/viewpage.action?pageId=123','http://foo/pages/viewpage.action?pageId=x','file:///pages/viewpage.action?pageId=9']){
    assert.throws(()=>sync.parsePageUrl(s));
  }
});
test('转换表格、列表、代码块、中文',()=>{
  const md='# 中国技术文档\n\n| 字段 | 内容 |\n| --- | --- |\n| A | **BOOL** |\n\n- **变量**\n  - ARR[1,2]\n\n```cpp\nint v = 1 < 2;\n```\n';
  const w=wiki.convert(md).output;
  assert.match(w,/h1\. 中国技术文档/);assert.match(w,/\|\|字段\|\|内容\|\|/);assert.match(w,/{code:language=cpp}/);
  const x=storage.render(md).value;
  assert.match(x,/<h1>中国技术文档<\/h1>/);assert.match(x,/<table>/);assert.match(x,/<strong>BOOL<\/strong>/);
  assert.match(x,/<ul><li>/);assert.match(x,/<ac:structured-macro ac:name="code"/);assert.match(x,/int v = 1 < 2;/);
});
test('Storage 对普通文本 XML 转义，代码 CDATA 支持特殊终止符',()=>{
  const x=storage.render('一行 x < y & z\n\n```xml\n]]>\n```');
  assert.match(x.value,/x &lt; y &amp; z/);assert.match(x.value, /\]\]\]\]><!\[CDATA\[>/);
});
test('原页面宏、标题、版本和正文一致才允许安全写入',()=>{
  const d={id:'12',type:'page',title:'ABC',version:{number:7},body:{storage:{value:'<p>x</p>'}}};
  const p=sync.requiredPage(d,'12');assert.equal(sync.conflict(p,p),'');
  assert.match(sync.conflict(p,{...p,version:8}),/版本/);
  assert.match(sync.conflict(p,{...p,storage:'<p>y</p>'}),/正文/);
  assert.match(sync.conflict(p,{...p,title:'ZZ'}),/标题/);
  const pay=sync.payload(p,'<h1>new</h1>');assert.equal(pay.version.number,8);assert.equal(pay.title,'ABC');
});
test('备份包含完整 Storage 正文及元数据',()=>{
  const d=sync.parsePageUrl('http://a/pages/viewpage.action?pageId=12'),p={id:'12',title:'ABC',version:2,storage:'<p>old</p>'};
  const x=sync.backupRecord(d,p);assert.equal(x.body.storage.value,p.storage);assert.equal(x.pageId,'12');
});

test('本地 Storage 转换器保留可访问的外部图片引用',()=>{
  const x=storage.render('![diagram](https://example.com/a.png)').value;
  assert.match(x,/<ac:image ac:alt="diagram"><ri:url ri:value="https:\/\/example\.com\/a\.png" \/><\/ac:image>/);
});
