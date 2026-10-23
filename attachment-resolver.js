/* Resolve local Markdown links/images to Confluence page attachments. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AttachmentResolver = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
  const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

  function xml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function cdata(value) {
    return String(value).replace(/\]\]>/g, ']]]]><![CDATA[>');
  }
  function basename(path) {
    return String(path || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
  }
  function normalizePath(value, base) {
    const raw = String(value || '').replace(/\\/g, '/');
    const parts = [];
    for (const part of ((base ? base + '/' : '') + raw).split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!parts.length) return null;
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    return parts.join('/');
  }
  function decodeTarget(raw) {
    let target = String(raw || '').trim().replace(/^<|>$/g, '');
    target = target.replace(/\\([ ()])/g, '$1');
    try { target = decodeURIComponent(target); } catch { /* Keep the literal path for diagnosis. */ }
    return target;
  }
  function isLocalTarget(raw) {
    const target = decodeTarget(raw);
    if (!target) return false;
    if (/^[a-z]:[\\/]/i.test(target) || /^file:/i.test(target)) return true;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(target)) return false;
    return true;
  }
  function localPath(raw, sourceRelativePath) {
    let target = decodeTarget(raw).replace(/[?#].*$/, '');
    if (/^[a-z]:[\\/]/i.test(target) || /^file:/i.test(target) || target.startsWith('/')) return null;
    const base = basename(sourceRelativePath) ? String(sourceRelativePath).replace(/\\/g, '/').split('/').slice(0, -1).join('/') : '';
    if (!base) {
      target = target.replace(/^(?:\.\/)+/, '');
      // Pasted Markdown has no known source directory. Treat leading parent hops as a path hint,
      // then require a unique matching resource path/basename in the selected files.
      target = target.replace(/^(?:\.\.\/)+/, '');
    }
    return normalizePath(target, base);
  }
  function collectFiles(fileList) {
    const result = [];
    for (const file of Array.from(fileList || [])) {
      const rel = String(file.webkitRelativePath || '').replace(/\\/g, '/');
      let path = file.name;
      if (rel) {
        const parts = rel.split('/').filter(Boolean);
        path = parts.length > 1 ? parts.slice(1).join('/') : (parts[0] || file.name);
      }
      const normalized = normalizePath(path, '');
      if (normalized) result.push({ path: normalized, file });
    }
    return result;
  }
  function findSourcePath(sourceFile, entries) {
    if (!sourceFile) return '';
    const list = Array.from(entries || []);
    const exactObject = list.filter(entry => entry.file === sourceFile);
    if (exactObject.length === 1) return exactObject[0].path;
    const same = list.filter(entry =>
      basename(entry.path) === sourceFile.name &&
      Number(entry.file?.size) === Number(sourceFile.size) &&
      Number(entry.file?.lastModified || 0) === Number(sourceFile.lastModified || 0)
    );
    if (same.length === 1) return same[0].path;
    const byName = list.filter(entry => basename(entry.path) === sourceFile.name);
    if (byName.length === 1) return byName[0].path;
    return sourceFile.name;
  }
  function listMarkdownFiles(entries) {
    const list = Array.from(entries || []).filter(entry => entry && entry.file && entry.path);
    const markdown = list.filter(entry => /\.(?:md|markdown)$/i.test(entry.path));
    const candidates = markdown.length ? markdown : list.filter(entry => /\.txt$/i.test(entry.path));
    return candidates.slice().sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
  }
  function maskInlineCode(line) {
    const chars = line.split('');
    let i = 0;
    while (i < line.length) {
      if (line[i] !== '\x60') { i++; continue; }
      let slashes = 0;
      for (let p = i - 1; p >= 0 && line[p] === '\\'; p--) slashes++;
      if (slashes % 2) { i++; continue; }
      let openEnd = i + 1;
      while (line[openEnd] === '\x60') openEnd++;
      const ticks = line.slice(i, openEnd);
      let cursor = openEnd, close = -1, closeEnd = -1;
      while (cursor < line.length) {
        const found = line.indexOf('\x60', cursor);
        if (found < 0) break;
        let end = found + 1;
        while (line[end] === '\x60') end++;
        if (line.slice(found, end) === ticks) { close = found; closeEnd = end; break; }
        cursor = end;
      }
      if (close < 0) { i = openEnd; continue; }
      for (let p = i; p < closeEnd; p++) chars[p] = ' ';
      i = closeEnd;
    }
    return chars.join('');
  }
  function findReferences(markdown) {
    const source = String(markdown || '').replace(/\r\n?/g, '\n');
    const refs = [];
    const lines = source.split('\n');
    let offset = 0, fence = null;
    const linkPattern = /(!?)\[([^\]\n]*)\]\(\s*(<[^>\n]+>|(?:\\.|[^)\s])+)(?:\s+["'][^"\n]*["'])?\s*\)/g;
    for (const line of lines) {
      if (fence) {
        const close = new RegExp('^ {0,3}' + fence.char + '{' + fence.length + ',}\\s*$');
        if (close.test(line)) fence = null;
        offset += line.length + 1;
        continue;
      }
      const opening = line.match(/^ {0,3}(\x60{3,}|~{3,})/);
      if (opening) {
        fence = { char: opening[1][0], length: opening[1].length };
        offset += line.length + 1;
        continue;
      }
      const masked = maskInlineCode(line);
      for (const match of masked.matchAll(linkPattern)) {
        const rawTarget = match[3];
        if (!isLocalTarget(rawTarget)) continue;
        const target = decodeTarget(rawTarget);
        refs.push({
          start: offset + match.index,
          end: offset + match.index + match[0].length,
          isImage: match[1] === '!',
          label: match[2] || '',
          rawTarget,
          target
        });
      }
      offset += line.length + 1;
    }
    return { source, refs };
  }
  function safeName(value) {
    let name = basename(value).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').trim();
    if (!name || name === '.' || name === '..') name = 'attachment.bin';
    return name.slice(0, 180);
  }
  function prepare(markdown, resourceEntries, sourceRelativePath) {
    const found = findReferences(markdown);
    const entries = Array.from(resourceEntries || []).map(entry => ({
      path: normalizePath(entry.path, ''),
      file: entry.file
    })).filter(entry => entry.path && entry.file);
    const byPath = new Map();
    const byName = new Map();
    for (const entry of entries) {
      if (!byPath.has(entry.path)) byPath.set(entry.path, []);
      byPath.get(entry.path).push(entry);
      const name = basename(entry.path).toLowerCase();
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(entry);
    }
    function resolve(rawTarget) {
      const targetPath = localPath(rawTarget, sourceRelativePath);
      if (!targetPath) return { error: '不支持绝对本地路径：' + decodeTarget(rawTarget) };
      const candidates = byPath.get(targetPath) || [];
      if (candidates.length === 1) return { entry: candidates[0] };
      if (candidates.length > 1) return { error: '资源路径重复，无法确定文件：' + targetPath };
      const rootPath = normalizePath(decodeTarget(rawTarget).replace(/[?#].*$/, ''), '');
      if (rootPath && rootPath !== targetPath) {
        const rootCandidates = byPath.get(rootPath) || [];
        if (rootCandidates.length === 1) return { entry: rootCandidates[0] };
        if (rootCandidates.length > 1) return { error: '资源路径重复，无法确定文件：' + rootPath };
      }
      const name = basename(targetPath || decodeTarget(rawTarget)).toLowerCase();
      const named = byName.get(name) || [];
      if (named.length === 1) return { entry: named[0] };
      if (named.length > 1) return { error: '存在多个同名文件，请选择资源目录并确保相对路径唯一：' + decodeTarget(rawTarget) };
      return { error: '未找到本地文件：' + decodeTarget(rawTarget) };
    }

    const replacements = [];
    const unique = new Map();
    for (const ref of found.refs) {
      const resolved = resolve(ref.rawTarget);
      const replacement = { ...ref, token: '', filename: '', unresolved: !resolved.entry, error: resolved.error || '' };
      if (resolved.entry) {
        replacement.entry = resolved.entry;
        const key = resolved.entry.path + '\u0000' + resolved.entry.file.name + '\u0000' +
          String(resolved.entry.file.size) + '\u0000' + String(resolved.entry.file.lastModified || 0);
        replacement.fileKey = key;
        if (!unique.has(key)) unique.set(key, { key, path: resolved.entry.path, file: resolved.entry.file, refs: [] });
        unique.get(key).refs.push(replacement);
      }
      replacements.push(replacement);
    }

    const files = Array.from(unique.values());
    const nameGroups = new Map();
    for (const item of files) {
      const name = safeName(item.path);
      const key = name.toLowerCase();
      if (!nameGroups.has(key)) nameGroups.set(key, []);
      nameGroups.get(key).push(item);
    }
    const usedNames = new Set();
    for (const item of files) {
      let name = safeName(item.path);
      const group = nameGroups.get(name.toLowerCase()) || [];
      if (group.length > 1) {
        const withoutExt = name.replace(/(\.[^.]+)$/, '');
        const ext = name.match(/(\.[^.]+)$/)?.[1] || '';
        const prefix = item.path.slice(0, -basename(item.path).length).replace(/[\\/]+$/g, '').replace(/[\\/]/g, '_');
        name = safeName((prefix ? prefix + '_' : '') + withoutExt + ext);
      }
      let candidate = name, n = 2;
      while (usedNames.has(candidate.toLowerCase())) {
        const ext = candidate.match(/(\.[^.]+)$/)?.[1] || '';
        const stem = candidate.slice(0, candidate.length - ext.length);
        candidate = safeName(stem + '_' + n++ + ext);
      }
      item.filename = candidate;
      usedNames.add(candidate.toLowerCase());
      for (const ref of item.refs) ref.filename = candidate;
    }

    const prefixBase = 'CMSYNCATTACHMENTTOKEN';
    let prefix = prefixBase;
    while (found.source.includes(prefix)) prefix += 'X';
    replacements.forEach((ref, i) => { ref.token = prefix + i + 'TOKEN'; });

    const errors = replacements.filter(ref => ref.unresolved).map(ref => ref.error);
    let totalBytes = 0;
    for (const item of files) {
      const size = Number(item.file.size || 0);
      totalBytes += size;
      if (size > MAX_FILE_BYTES) errors.push('附件超过单文件 10 MiB 限制：' + item.path);
      for (const ref of item.refs) {
        if (ref.isImage) {
          const ext = (item.filename.match(/(\.[^.]+)$/)?.[1] || '').toLowerCase();
          if (!IMAGE_EXTENSIONS.has(ext)) errors.push('图片引用不是受支持的常见图片格式（PNG/JPG/GIF/WEBP/BMP）：' + item.path);
        }
      }
    }
    if (totalBytes > MAX_TOTAL_BYTES) errors.push('本次附件总大小超过 20 MiB 限制，请分批同步或压缩文件。');

    let transformed = found.source;
    for (const ref of [...replacements].sort((a, b) => b.start - a.start)) {
      transformed = transformed.slice(0, ref.start) + ref.token + transformed.slice(ref.end);
    }
    const uploads = files.map(item => ({
      path: item.path, filename: item.filename, file: item.file,
      size: Number(item.file.size || 0), mimeType: item.file.type || 'application/octet-stream'
    }));
    const warnings = [];
    if (replacements.length) warnings.push('检测到 ' + replacements.length + ' 个本地文件引用，将上传 ' + uploads.length + ' 个 Confluence 附件（仅在点击同步后上传）。');
    for (const error of [...new Set(errors)]) warnings.push(error);
    return {
      markdown: transformed, references: replacements, uploads,
      unresolved: replacements.filter(ref => ref.unresolved),
      errors: [...new Set(errors)], warnings,
      blocked: errors.length > 0
    };
  }
  function applyStorageTokens(storage, plan) {
    let result = String(storage || '');
    for (const ref of plan.references || []) {
      let markup;
      if (ref.unresolved) {
        markup = '<strong>[' + xml(ref.error || ('未找到本地文件：' + ref.target)) + ']</strong>';
      } else if (ref.isImage) {
        markup = '<ac:image ac:alt="' + xml(ref.label || ref.filename) + '"><ri:attachment ri:filename="' + xml(ref.filename) + '" /></ac:image>';
      } else {
        markup = '<ac:link><ri:attachment ri:filename="' + xml(ref.filename) + '" /><ac:plain-text-link-body><![CDATA[' + cdata(ref.label || ref.filename) + ']]></ac:plain-text-link-body></ac:link>';
      }
      result = result.split(ref.token).join(markup);
    }
    return result;
  }
  function applyWikiTokens(wiki, plan) {
    let result = String(wiki || '');
    for (const ref of plan.references || []) {
      let markup;
      if (ref.unresolved) {
        markup = '[本地文件未找到：' + ref.target + ']';
      } else if (ref.isImage) {
        markup = '!' + ref.filename + (ref.label ? '|alt=' + ref.label.replace(/[|!]/g, ' ') : '') + '!';
      } else {
        markup = '[' + (ref.label || ref.filename) + '^' + ref.filename + ']';
      }
      result = result.split(ref.token).join(markup);
    }
    return result;
  }
  return {
    MAX_FILE_BYTES, MAX_TOTAL_BYTES, collectFiles, findSourcePath, listMarkdownFiles, findReferences,
    normalizePath, prepare, applyStorageTokens, applyWikiTokens
  };
});
