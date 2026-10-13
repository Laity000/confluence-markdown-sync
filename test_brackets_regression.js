/* v1.2 regression suite: Confluence links created from PLC array syntax. */
'use strict';
const assert = require('node:assert/strict');
const converter = require('./wiki-converter.js');
const storage = require('./storage-converter.js');
const sync = require('./sync-core.js');
const run = (name, fn) => { fn(); process.stdout.write('PASS '+name+'\n'); };
const wiki = (md) => converter.convert(md).output;
const bracket = String.raw`\]`;
run('raw plain text bracket closing is escaped (avoid creating page 80)', () => {
  for (const [raw, expected] of [
    ['STRING[80]', 'STRING[80'+bracket],
    ['STRING[80]、BOOL[1]', 'STRING[80'+bracket+'、BOOL[1'+bracket],
    ['ARRAY[1..5,1..5] OF INT', 'ARRAY[1..5,1..5'+bracket+' OF INT'],
    ['ARR[1,2]', 'ARR[1,2'+bracket],
    ['A.data[5]', 'A.data[5'+bracket],
    ['STD_TESTPRG_ARR[1-1][2-1]', 'STD_TESTPRG_ARR[1-1'+bracket+'[2-1'+bracket],
    ['[80]', '[80'+bracket],
  ]) assert.ok(wiki(raw).includes(expected), `${raw}: unexpected ${JSON.stringify(wiki(raw))}`);
});
run('Wiki pages, inline links and images remain intentional links', () => {
  assert.ok(wiki('参见 [规范](https://example.test/path) + STRING[80]').includes('[规范|https://example.test/path] + STRING[80'+bracket));
  assert.ok(wiki('![图片](http://example.test/pic.png)').includes('!http://example.test/pic.png|alt=图片!'));
});
run('escaped Markdown bracket stays singly escaped (not doubly escaped)', () => {
  assert.equal(wiki(String.raw`STRING[80\]`).trim(),String.raw`STRING[80\]`);
  assert.equal(wiki(String.raw`STRING\[80\]`).trim(),String.raw`STRING\[80\]`);
});
run('table, heading, nested list and bold preserve PLC expressions', () => {
  const s=wiki('# STRING[80]\n\n| 类型 | 值 |\n| --- | --- |\n| STRING[80] | **ARR[1,2]** |\n\n- STRING[80]\n  - data[5]\n');
  assert.ok(s.includes('h1. STRING[80'+bracket));
  assert.ok(s.includes('||类型||值||'));
  assert.ok(s.includes('|STRING[80'+bracket+'|*ARR[1,2'+bracket+'*|'));
  assert.ok(s.includes('* STRING[80'+bracket));
  assert.ok(s.includes('** data[5'+bracket));
});
run('fenced code is not modified or double-escaped', () => {
  const s=wiki('```st\nSTRING[80]\nARR[1,2]\n```');
  assert.ok(s.includes('{code:language=none}\nSTRING[80]\nARR[1,2]\n{code}'));
});
run('inline code stays in a protected monospace span', () => {
  assert.ok(wiki('`STRING[80]`').includes('{{STRING[80]}}'));
});
run('local Storage emits plain text without link markup', () => {
  const s=storage.render('STRING[80] ARRAY[1..5] ARR[1,2]').value;
  assert.ok(s.includes('STRING[80] ARRAY[1..5] ARR[1,2]'));
  assert.ok(!s.includes('<a '));
});
run('detects Confluence-created page links to numeric bracket values',()=>{
  const md='STRING[80] and ARR[1,2]';
  const unexpected='<p>STRING<ac:link><ri:page ri:content-title="80"/></ac:link> ARR<a href="http://example.test/pages/createpage.action?spaceKey=abc&amp;title=1%2C2">1,2</a></p>';
  assert.deepEqual(sync.unexpectedBracketLinks(md,unexpected).sort(),['1,2','80']);
  assert.deepEqual(sync.unexpectedBracketLinks(md,'<p>STRING[80] ARR[1,2]</p>'),[]);
  assert.deepEqual(sync.unexpectedBracketLinks('普通文字[80]','<ri:page ri:content-title="80"/>'),[]);
});
