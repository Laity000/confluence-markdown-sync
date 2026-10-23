'use strict';
const assert = require('node:assert/strict');
const wiki = require('./wiki-converter.js');

function test(name, fn) {
  fn();
  process.stdout.write('PASS ' + name + '\n');
}

test('strips YAML front matter before converting the document body', () => {
  const md = '\uFEFF---\r\ntitle: Debug guide\r\ndate: 2026-10-23\r\ntags:\r\n  - lldb\r\n---\r\n\r\n# Debug guide\r\n\r\nBody text.\r\n';
  const output = wiki.convert(md).output;
  assert.match(output, /h1\. Debug guide/);
  assert.match(output, /Body text\./);
  assert.doesNotMatch(output, /title: Debug guide|date: 2026-10-23|tags:/);
  assert.doesNotMatch(output, /^----$/m);
});

test('converts a standalone horizontal rule to Confluence Wiki Markup', () => {
  const output = wiki.convert('before\n\n---\n\nafter').output;
  assert.match(output, /before\n\n----\n\nafter/);
});

test('keeps Setext heading syntax instead of treating it as a horizontal rule', () => {
  const output = wiki.convert('Release notes\n---').output.trim();
  assert.equal(output, 'h2. Release notes');
});

test('keeps Markdown table separator rows as table syntax', () => {
  const output = wiki.convert('| Name | Value |\n| --- | --- |\n| A | B |').output;
  assert.match(output, /^\|\|Name\|\|Value\|\|\n\|A\|B\|\n?$/);
  assert.doesNotMatch(output, /^----$/m);
});

test('preserves --- inside fenced code blocks', () => {
  const output = wiki.convert('```yaml\n---\ntitle: example\n---\n```').output;
  assert.match(output, /\{code:language=yaml\}\n---\ntitle: example\n---\n\{code\}/);
});

test('does not strip an unclosed front-matter delimiter', () => {
  const output = wiki.convert('---\ntitle: Unclosed\nBody text').output;
  assert.match(output, /^----\ntitle: Unclosed/);
});

test('does not mistake horizontal rules around prose for YAML front matter', () => {
  const output = wiki.convert('---\nfirst section\n\n---\nsecond section').output;
  assert.match(output, /^----\nfirst section\n\n----\nsecond section/);
});
