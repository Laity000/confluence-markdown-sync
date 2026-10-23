'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Resolver = require('./attachment-resolver.js');

const html = fs.readFileSync(__dirname + '/editor.html', 'utf8');
const editor = fs.readFileSync(__dirname + '/editor.js', 'utf8');

assert.match(html, /id="chooseProjectDirectory">选择项目目录/);
assert.match(html, /id="projectDirectory"[^>]*webkitdirectory/);
assert.match(html, /id="projectMarkdownSelect"/);
assert.match(html, /id="chooseResourceDirectory">仅选择资源目录/);
assert.match(editor, /AttachmentResolver\.listMarkdownFiles\(entries\)/);
assert.match(editor, /await loadFile\(selected\.file,selected\.path\)/);
assert.match(editor, /localReferences\.length&&!state\.resourceFiles\.length/);
assert.match(editor, /请选择本地资源/);

const mock = name => ({name,size:1,lastModified:1,webkitRelativePath:'project/'+name});
const entries = Resolver.collectFiles([
  mock('README.md'),
  mock('design.pdf'),
  mock('guide.md'),
  mock('images/architecture.png')
]);
const docs = Resolver.listMarkdownFiles(entries);
assert.deepEqual(docs.map(x=>x.path), ['guide.md','README.md'].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'})));
assert.ok(entries.some(x=>x.path==='design.pdf'));
assert.ok(entries.some(x=>x.path==='images/architecture.png'));

console.log('PASS project-directory import: discover Markdown files, retain resource paths, allow document switching and prompt only when local refs lack resources');
