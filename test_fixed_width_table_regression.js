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
