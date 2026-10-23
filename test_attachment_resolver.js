'use strict';
const assert = require('node:assert/strict');
const Resolver = require('./attachment-resolver.js');

function file(name, size, relativePath = '', extra = {}) {
  return {name,size,lastModified:123,type:extra.type||'application/octet-stream',webkitRelativePath:relativePath};
}

const folderFiles = [
  file('guide.md', 50, 'project/docs/guide.md'),
  file('arch.png', 1024, 'project/images/arch.png', {type:'image/png'}),
  file('spec.pdf', 4096, 'project/docs/spec.pdf', {type:'application/pdf'})
];
const entries = Resolver.collectFiles(folderFiles);
assert.deepEqual(entries.map(x=>x.path), ['docs/guide.md','images/arch.png','docs/spec.pdf']);

assert.equal(Resolver.listMarkdownFiles(entries).length, 1);
assert.equal(Resolver.listMarkdownFiles(entries)[0].path, 'docs/guide.md');
assert.equal(Resolver.findSourcePath(folderFiles[0], entries), 'docs/guide.md');

const multipleMarkdown = Resolver.listMarkdownFiles([
  {path:'z/guide10.md',file:file('guide10.md',10)},
  {path:'a/README.md',file:file('README.md',20)},
  {path:'a/design.pdf',file:file('design.pdf',30)}
]);
assert.deepEqual(multipleMarkdown.map(x=>x.path), ['a/README.md','z/guide10.md']);
assert.deepEqual(Resolver.listMarkdownFiles([
  {path:'notes.txt',file:file('notes.txt',10)},
  {path:'manual.pdf',file:file('manual.pdf',20)}
]).map(x=>x.path), ['notes.txt']);

const md = [
  '# Guide',
  '',
  '![Architecture](../images/arch.png)',
  '',
  '[Specification](./spec.pdf)',
  '',
  'External [site](https://example.com/a.pdf) stays external.',
  'Inline code \x60![fake](./fake.png)\x60 must remain literal.',
  '',
  '~~~md',
  '![also fake](./code.png)',
  '~~~'
].join('\n');
const plan = Resolver.prepare(md, entries, 'docs/guide.md');
assert.equal(plan.references.length, 2);
assert.equal(plan.uploads.length, 2);
assert.equal(plan.blocked, false);
assert.match(plan.markdown, /CMSYNCATTACHMENTTOKEN0TOKEN/);
assert.match(plan.markdown, /CMSYNCATTACHMENTTOKEN1TOKEN/);
assert.match(plan.markdown, /https:\/\/example\.com\/a\.pdf/);
assert.match(plan.markdown, /\x60!\[fake\]\(\.\/fake\.png\)\x60/);
assert.match(plan.markdown, /!\[also fake\]\(\.\/code\.png\)/);

const storage = Resolver.applyStorageTokens('<p>CMSYNCATTACHMENTTOKEN0TOKEN</p><p>CMSYNCATTACHMENTTOKEN1TOKEN</p>', plan);
assert.match(storage, /<ac:image ac:alt="Architecture"><ri:attachment ri:filename="arch\.png" \/><\/ac:image>/);
assert.match(storage, /<ac:link><ri:attachment ri:filename="spec\.pdf" \/><ac:plain-text-link-body><!\[CDATA\[Specification\]\]><\/ac:plain-text-link-body><\/ac:link>/);
const wiki = Resolver.applyWikiTokens('CMSYNCATTACHMENTTOKEN0TOKEN CMSYNCATTACHMENTTOKEN1TOKEN', plan);
assert.match(wiki, /!arch\.png\|alt=Architecture!/);
assert.match(wiki, /\[Specification\^spec\.pdf\]/);

const missing = Resolver.prepare('![Missing](./missing.png)', [], 'guide.md');
assert.equal(missing.blocked, true);
assert.equal(missing.uploads.length, 0);
assert.match(Resolver.applyStorageTokens('<p>'+missing.references[0].token+'</p>', missing), /未找到本地文件/);

const duplicate = Resolver.prepare(
  '[x](./logo.png)',
  [
    {path:'a/logo.png',file:file('logo.png',20)},
    {path:'b/logo.png',file:file('logo.png',21)}
  ],
  'guide.md'
);
assert.equal(duplicate.blocked, true);
assert.match(duplicate.errors.join(' '), /多个同名文件/);

const tooLarge = Resolver.prepare('![Big](./big.png)', [
  {path:'big.png',file:file('big.png',Resolver.MAX_FILE_BYTES+1)}
], 'guide.md');
assert.equal(tooLarge.blocked, true);
assert.match(tooLarge.errors.join(' '), /单文件 10 MiB/);

console.log('PASS local attachment references: directory mapping, relative paths, code exclusion, links/images, unresolved files and size limits');
