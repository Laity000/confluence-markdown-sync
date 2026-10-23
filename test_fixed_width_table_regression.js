'use strict';
const assert = require('node:assert/strict');
const wiki = require('./wiki-converter.js');
const storage = require('./storage-converter.js');

const source = [
  '------ --------------------- ------',
  'A                          0      4',
  'B                          4      4',
  'M                          8      4',
  'C.E                       12      4',
  'C.F                       16      4',
  'XG                        20      4'
].join('\n');

const converted = wiki.convert(source);
assert.equal(converted.stats.tables, 1);
assert.equal(converted.output.trim(), [
  '|A|0|4|',
  '|B|4|4|',
  '|M|8|4|',
  '|C.E|12|4|',
  '|C.F|16|4|',
  '|XG|20|4|'
].join('\n'));

const rendered = storage.render(source).value;
assert.match(rendered, /^<table><tbody>/);
assert.equal((rendered.match(/<tr>/g) || []).length, 6);
assert.equal((rendered.match(/<td>/g) || []).length, 18);
assert.match(rendered, /<td>C\.E<\/td><td>12<\/td><td>4<\/td>/);
assert.doesNotMatch(rendered, /<hr \/>/);

// Ordinary horizontal rules and Markdown pipe tables retain their old behavior.
assert.equal(wiki.convert('before\n\n------\n\nafter').output.trim(), 'before\n\n----\n\nafter');
assert.match(storage.render('before\n\n------\n\nafter').value, /<hr \/>/);
assert.match(wiki.convert('| Name | Value |\n| --- | --- |\n| A | B |').output, /\|\|Name\|\|Value\|\|/);
assert.match(storage.render('| Name | Value |\n| --- | --- |\n| A | B |').value, /<th>Name<\/th>/);

console.log('PASS fixed-width text tables convert to Confluence tables');

// Header + ruler tables with blank lines around the ruler are common in
// copied technical documentation. They must remain a real 3-column table.
const headedSource = [
  '##### 3. 两块物理内存',
  '',
  '###### NonRetain 区：24 字节',
  '',
  '  成员     物理 offset（byte）   大小',
  '',
  '------ --------------------- ------',
  '',
  '  A                          0      4',
  '  B                          4      4',
  '  M                          8      4',
  '  C.E                       12      4',
  '  C.F                       16      4',
  '  XG                        20      4',
  ''
].join('\n');

const headedWiki = wiki.convert(headedSource);
assert.equal(headedWiki.stats.tables, 1);
assert.match(headedWiki.output, /^\|\|成员\|\|物理 offset（byte）\|\|大小\|\|$/m);
assert.match(headedWiki.output, /^\|A\|0\|4\|$/m);
assert.match(headedWiki.output, /^\|XG\|20\|4\|$/m);
assert.doesNotMatch(headedWiki.output, /^----$/m, 'the column ruler must not become a horizontal rule');

const headedStorage = storage.render(headedSource).value;
assert.match(headedStorage, /<table><tbody><tr><th>成员<\/th><th>物理 offset（byte）<\/th><th>大小<\/th><\/tr>/);
assert.equal((headedStorage.match(/<tr>/g) || []).length, 7);
assert.equal((headedStorage.match(/<th>/g) || []).length, 3);
assert.equal((headedStorage.match(/<td>/g) || []).length, 18);
assert.match(headedStorage, /<td>C\.E<\/td><td>12<\/td><td>4<\/td>/);
assert.doesNotMatch(headedStorage, /<hr \/>/, 'the column ruler must not become a horizontal rule');

