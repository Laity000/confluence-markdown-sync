'use strict';
const assert=require('node:assert/strict');
const wiki=require('./wiki-converter.js');
const storage=require('./storage-converter.js');
const sync=require('./sync-core.js');
const w=s=>wiki.convert(s).output.trim();
const x=s=>storage.render(s).value.trim();
const cases=[
  ['取BIT数组`VARSTRUCT1.B[index]`解析有问题','取BIT数组{{VARSTRUCT1.B[index]}}解析有问题','<p>取BIT数组<code>VARSTRUCT1.B[index]</code>解析有问题</p>'],
  ['``VARSTRUCT1.B[index]``','{{VARSTRUCT1.B[index]}}','<p><code>VARSTRUCT1.B[index]</code></p>'],
  ['`` `VARSTRUCT1.B[index]` ``','{{`VARSTRUCT1.B[index]`}}','<p><code>`VARSTRUCT1.B[index]`</code></p>'],
  ['**取BIT数组`VARSTRUCT1.B[index]`解析**','*取BIT数组{{VARSTRUCT1.B[index]}}解析*','<p><strong>取BIT数组<code>VARSTRUCT1.B[index]</code>解析</strong></p>'],
  ['**`VARSTRUCT1.B[index]`**','*{{VARSTRUCT1.B[index]}}*','<p><strong><code>VARSTRUCT1.B[index]</code></strong></p>'],
  ['~~`VARSTRUCT1.B[index]`~~','-{{VARSTRUCT1.B[index]}}-','<p><del><code>VARSTRUCT1.B[index]</code></del></p>'],
  ['`a``b`','{{a``b}}','<p><code>a``b</code></p>'],
  ['`a`与`b`','{{a}}与{{b}}','<p><code>a</code>与<code>b</code></p>'],
  ['` a `','{{a}}','<p><code>a</code></p>'],
  ['`STRING[80]`','{{STRING[80]}}','<p><code>STRING[80]</code></p>']
];
for(const [input,expectedWiki,expectedStorage] of cases){
  assert.equal(w(input),expectedWiki,'Wiki '+input);
  assert.equal(x(input),expectedStorage,'Storage '+input);
  assert.ok(!Array.from(w(input)).some(c=>c.charCodeAt(0)>=0xe000&&c.charCodeAt(0)<=0xf8ff),'placeholder leaked');
}
assert.ok(w('参考 [规范](https://example.test) `A[1]`').includes('[规范|https://example.test] {{A[1]}}'));
assert.deepEqual(sync.unexpectedBracketLinks('取BIT数组`VARSTRUCT1.B[index]`','<ac:link><ri:page ri:content-title="index"/></ac:link>'),['index']);
console.log('PASS Markdown inline code/backtick regression');
