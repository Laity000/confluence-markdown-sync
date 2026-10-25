/* Offline Markdown -> Confluence Wiki Markup converter. No third-party dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Md2Confluence = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const languageMap = { js:'javascript', node:'javascript', ts:'javascript', jsx:'javascript', tsx:'javascript', c:'c', 'c++':'cpp', cc:'cpp', cxx:'cpp', 'c#':'csharp', cs:'csharp', py:'python', rb:'ruby', yml:'yaml', sh:'bash', shell:'bash', zsh:'bash', console:'bash', ps1:'powershell', ps:'powershell', html:'html', htm:'html', xml:'xml', md:'text', markdown:'text', plain:'none', plaintext:'none', txt:'none', st:'none', llvm:'none', ir:'none' };

  function escapeFragment(value) {
    // Confluence uses pipes as table delimiters; let the caller decide where escaping is needed.
    return value;
  }
  // Markdown code spans require exactly equal-length opening/closing backtick runs.
  // Longer runs inside a span remain literal characters.
  function replaceCodeSpans(source, renderCode) {
    let result = '', i = 0;
    while (i < source.length) {
      if (source[i] !== '`') { result += source[i++]; continue; }
      const start = i;
      while (source[i] === '`') i++;
      const length = i - start;
      let close = -1, end = -1, cursor = i;
      while ((cursor = source.indexOf('`', cursor)) !== -1) {
        let next = cursor;
        while (source[next] === '`') next++;
        if (next - cursor === length) { close = cursor; end = next; break; }
        cursor = next;
      }
      if (close === -1) { result += source.slice(start, i); continue; }
      let body = source.slice(i, close).replace(/\r\n?|\n/g, ' ');
      if (body.startsWith(' ') && body.endsWith(' ') && /[^ ]/.test(body)) {
        body = body.slice(1, -1);
      }
      result += renderCode(body);
      i = end;
    }
    return result;
  }
  function inline(src, state) {
    let s = String(src == null ? '' : src);
    const saved = [];
    const keep = (value) => { saved.push(value); return '\uE000' + (saved.length - 1) + '\uE001'; };
    // Backslash-escaped punctuation is literal in Markdown. Keep it escaped for Wiki Markup.
    s = s.replace(/\\([\\`*_{}\[\]()#+.!<>|~\-])/g, (_, c) => keep('\\' + c));
    // Markdown inline code spans, with matching arbitrary-length backtick runs.
    s = replaceCodeSpans(s, code => keep('{{' + code + '}}'));
    // Markdown images are references. Attachments must still be uploaded to Confluence.
    s = s.replace(/!\[([^\]]*)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g, (_, alt, url) => {
      state.stats.images++;
      if (!state.warnedImage) {
        state.warnings.push('Markdown 图片会转换为 Confluence 图片引用；本地图片需先选择资源文件，并在同步时上传为页面附件。');
        state.warnedImage = true;
      }
      url = url.replace(/^<|>$/g, '');
      const safeAlt = String(alt).replace(/[|!]/g, ' ');
      return keep('!' + url + (safeAlt ? '|alt=' + safeAlt : '') + '!');
    });
    // Markdown hyperlinks: [text](url). Reference-style links aren't expanded.
    s = s.replace(/\[([^\]\n]+)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g, (_, label, url) => {
      state.stats.links++;
      return keep('[' + label + '|' + url.replace(/^<|>$/g, '') + ']');
    });
    // Autolinks e.g. <https://example.com> and <name@example.com>.
    s = s.replace(/<((?:https?:\/\/|mailto:)[^\s>]+)>/gi, (_, url) => { state.stats.links++; return keep('[' + url + ']'); });
    s = s.replace(/<([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})>/g, (_, email) => { state.stats.links++; return keep('[mailto:' + email + ']'); });
    s = s.replace(/<br\s*\/?\s*>/gi, () => keep('\\\\'));
    s = s.replace(/<\/?(?:strong|b)>/gi, (tag) => tag[1] === '/' ? '*' : '*');
    s = s.replace(/<\/?(?:em|i)>/gi, (tag) => tag[1] === '/' ? '_' : '_');

    // A plain [80] / [1..5] / [1,2] is a Confluence *page link* if copied
    // into Wiki Markup. Protect the closing bracket on ordinary prose, lists,
    // tables and headings. Important: don't escape the opening bracket here:
    // Atlassian CONFSERVER-55799 documents a Wiki/Markup macro regression
    // caused by \[. Its workaround is to escape the closing bracket only.
    // Deliberate Markdown links/images and inline code were saved above, and
    // fenced code blocks never reach this function.
    s = s.replace(/\]/g, '\\]');

    // Convert from longest delimiter down to avoid double conversions.
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, (_, body) => keep('*' + body + '*'));
    s = s.replace(/__(?=\S)([\s\S]*?\S)__/g, (_, body) => keep('*' + body + '*'));
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, (_, body) => keep('-' + body + '-'));
    s = s.replace(/(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '_$1_');
    s = s.replace(/(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g, '_$1_');
    // Formatting may contain saved inline-code markers: unwrap every layer.
    for (let depth=0; depth<=saved.length; depth++) {
      const next = s.replace(/\uE000(\d+)\uE001/g, (_, n) => saved[Number(n)]);
      if (next === s) break;
      s = next;
    }
    return escapeFragment(s);
  }

  function isFenceStart(line) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})\s*([^\r\n]*)$/);
    return m ? { char:m[1][0], len:m[1].length, lang:(m[2].trim().split(/[\s{]/,1)[0] || '') } : null;
  }
  function isHorizontal(line) {
    return /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line);
  }

  // YAML front matter is a file-level convention, not body content. Strip it
  // only when the file starts with a delimiter, has a closing delimiter, and
  // contains a recognizable YAML entry. This avoids treating two ordinary
  // horizontal rules around prose as metadata by accident.
  function stripFrontMatter(lines) {
    if (!lines.length || !/^---[ \t]*$/.test(lines[0])) return lines;

    let closing = -1;
    for (let i = 1; i < lines.length; i++) {
      if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[i])) {
        closing = i;
        break;
      }
    }
    if (closing < 0) return lines;

    const metadata = lines.slice(1, closing);
    const hasYamlEntry = metadata.some(line =>
      /^\s*(?:[A-Za-z0-9_-][\w.-]*\s*:|["'][^"']+["']\s*:|-\s+\S|\?\s+\S)/.test(line)
    );
    return hasYamlEntry ? lines.slice(closing + 1) : lines;
  }
  function listItem(line) {
    const m = line.match(/^(\s{0,24})([-+*]|\d{1,9}[.)])[\t ]+(.*)$/);
    if (!m) return null;
    return { indent: m[1].replace(/\t/g,'    ').length, type: /\d/.test(m[2][0]) ? '#' : '*', content:m[3] };
  }
  function splitCells(line) {
    let txt = line.trim();
    if (txt.startsWith('|')) txt = txt.slice(1);
    if (txt.endsWith('|') && !txt.endsWith('\\|')) txt = txt.slice(0,-1);
    let cells = [], cur = '', esc = false, tick = 0;
    for (let i=0; i<txt.length; i++) {
      let c = txt[i];
      if (esc) { cur += '\\' + c; esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '`') { tick = tick ? 0 : 1; cur += c; continue; }
      if (c === '|' && !tick) { cells.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (esc) cur += '\\';
    cells.push(cur.trim());
    return cells;
  }
  function isSeparator(row) {
    const cells = splitCells(row);
    return cells.length >= 1 && cells.every(x => /^:?-{3,}:?$/.test(x.trim()));
  }
  function isTableHeader(lines, i) {
    return i+1 < lines.length && lines[i].includes('|') && isSeparator(lines[i+1]) && splitCells(lines[i]).length === splitCells(lines[i+1]).length;
  }
  // Some generated documentation uses a dashed column ruler followed by
  // space-aligned rows instead of Markdown pipe-table syntax:
  // ------ --------------------- ------
  // Name                        0      4
  // Only recognize it when at least two following rows consistently contain
  // the same number of columns, so ordinary horizontal rules stay horizontal.
  function splitFixedWidthCells(line) {
    // Some generated Markdown uses an HTML space entity to indent cells.
    const cleaned = String(line).replace(/^\s*&#(?:x0*20|0*32);[ \t]*/i, '').trim();
    return cleaned.split(/[ \t]{2,}/).map(cell => cell.trim());
  }
  function fixedWidthRulerColumns(line) {
    if (!/^\s*-{3,}(?:[ \t]+-{3,}){1,}\s*$/.test(line)) return 0;
    return [...String(line).matchAll(/-{3,}/g)].length;
  }
  // Accept both ruler-first fixed-width tables and generated tables with a
  // header row followed by a dashed column ruler. Blank lines around the
  // header/ruler and immediately before the first data row are tolerated.
  function fixedWidthTable(lines, i) {
    if (i >= lines.length) return null;
    let header = null, rulerIndex = i, columns = fixedWidthRulerColumns(lines[i]);
    if (!columns) {
      header = splitFixedWidthCells(lines[i]);
      rulerIndex = i + 1;
      let skipped = 0;
      while (rulerIndex < lines.length && !lines[rulerIndex].trim() && skipped < 2) {
        rulerIndex++;
        skipped++;
      }
      columns = rulerIndex < lines.length ? fixedWidthRulerColumns(lines[rulerIndex]) : 0;
      if (!columns || header.length !== columns) return null;
    }
    if (columns < 2) return null;
    let dataStart = rulerIndex + 1, skippedAfterRuler = 0;
    while (dataStart < lines.length && !lines[dataStart].trim() && skippedAfterRuler < 2) {
      dataStart++;
      skippedAfterRuler++;
    }
    const rows = [];
    let end = dataStart;
    while (end < lines.length && lines[end].trim()) {
      const line = lines[end];
      if (isFenceStart(line) || /^ {0,3}#{1,6}\s+/.test(line) || listItem(line) ||
          /^\s*>/.test(line) || line.includes('|')) break;
      const cells = splitFixedWidthCells(line);
      if (cells.length !== columns) break;
      rows.push(cells);
      end++;
    }
    return rows.length >= 2 ? { header, rows, end } : null;
  }
  // Recognize a table enclosed by standalone horizontal rules.
  // Recognize a table enclosed by standalone horizontal rules.
  // Blank lines between data rows are tolerated.
  function fixedWidthRuleTable(lines, i) {
    if (i >= lines.length || !isHorizontal(lines[i])) return null;
    const skipBlanks = start => {
      let n = start;
      while (n < lines.length && !lines[n].trim()) n++;
      return n;
    };
    const headerIndex = skipBlanks(i + 1);
    if (headerIndex >= lines.length) return null;
    const header = splitFixedWidthCells(lines[headerIndex]);
    if (header.length < 2) return null;
    const rulerIndex = skipBlanks(headerIndex + 1);
    if (rulerIndex >= lines.length || !isHorizontal(lines[rulerIndex])) return null;
    const dataStart = skipBlanks(rulerIndex + 1);
    const rows = [];
    let cursor = dataStart, lastRowEnd = dataStart;
    while (cursor < lines.length) {
      if (!lines[cursor].trim()) {
        const next = skipBlanks(cursor);
        if (next >= lines.length || isHorizontal(lines[next]) ||
            isFenceStart(lines[next]) || /^ {0,3}#{1,6}\s+/.test(lines[next]) ||
            listItem(lines[next]) || /^\s*>/.test(lines[next]) || lines[next].includes('|')) break;
        if (splitFixedWidthCells(lines[next]).length !== header.length) break;
        cursor = next;
        continue;
      }
      const line = lines[cursor];
      if (isHorizontal(line) || isFenceStart(line) ||
          /^ {0,3}#{1,6}\s+/.test(line) || listItem(line) ||
          /^\s*>/.test(line) || line.includes('|')) break;
      const cells = splitFixedWidthCells(line);
      if (cells.length !== header.length) break;
      rows.push(cells);
      cursor++;
      lastRowEnd = cursor;
    }
    return rows.length >= 2 ? { header, rows, end: lastRowEnd } : null;
  }
  // reStructuredText/simple-table style:
  // --------------------------------------------------------------------------------
  //   LLDB 命令                           结果
  // ----------------------------------- --------------------------------------------------
  //   \`target variable STD__VAR\`          失败
  // Blank lines may separate rows. Column boundaries come from the dashed ruler,
  // not from ordinary Markdown's horizontal-rule or Setext-heading syntax.
  function simpleTableColumns(line) {
    if (!/^\s*-{3,}(?:[ \t]+-{3,})+\s*$/.test(line)) return null;
    const spans = [...line.matchAll(/-{3,}/g)];
    return spans.length >= 2 ? spans.map(match => match.index) : null;
  }
  function simpleTableCells(line, columns) {
    const normalized = String(line).replace(/&#(?:x0*20|0*32);/gi, ' ');
    const cells = columns.map((start, i) =>
      normalized.slice(start, i + 1 < columns.length ? columns[i + 1] : undefined).trim()
    );
    return cells.every(Boolean) ? cells : null;
  }
  function simpleRuleTable(lines, i) {
    if (i >= lines.length || !isHorizontal(lines[i])) return null;
    const skipBlanks = start => {
      let at = start, count = 0;
      while (at < lines.length && !lines[at].trim() && count < 2) { at++; count++; }
      return at;
    };
    const headerAt = skipBlanks(i + 1);
    if (headerAt >= lines.length || !lines[headerAt].trim()) return null;
    const rulerAt = skipBlanks(headerAt + 1);
    if (rulerAt >= lines.length) return null;
    const columns = simpleTableColumns(lines[rulerAt]);
    if (!columns) return null;
    const header = simpleTableCells(lines[headerAt], columns);
    if (!header) return null;
    let at = skipBlanks(rulerAt + 1), end = at;
    const rows = [];
    while (at < lines.length) {
      if (!lines[at].trim()) {
        const next = skipBlanks(at);
        if (next >= lines.length || !lines[next].trim()) break;
        at = next;
      }
      const line = lines[at];
      if (simpleTableColumns(line)) { end = at + 1; break; } // optional bottom border
      if (isHorizontal(line) || isFenceStart(line) || /^ {0,3}#{1,6}\s+/.test(line) ||
          listItem(line) || /^\s*>/.test(line) || line.includes('|')) break;
      const cells = simpleTableCells(line, columns);
      if (!cells) break;
      rows.push(cells);
      at++;
      end = at;
    }
    return rows.length >= 2 ? { header, rows, end } : null;
  }
  function isStartBlock(lines, i) {
    if (i >= lines.length) return true;
    let t = lines[i];
    return !t.trim() || !!isFenceStart(t) || /^ {0,3}#{1,6}\s+/.test(t) || isHorizontal(t) || /^\s*>/.test(t) || !!listItem(t) || isTableHeader(lines,i);
  }
  function convert(source, opts) {
    const options = Object.assign({ normalizeBlankLines: true }, opts || {});
    const state = {stats:{headings:0, codeBlocks:0, tables:0, lists:0, links:0, images:0, quotes:0}, warnings:[], warnedImage:false};
    const text = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const lines = stripFrontMatter(text.split('\n'));
    const rendered = convertLines(lines, state, options, 0);
    let result = rendered.join('\n');
    result = result.trim() + (result.trim() ? '\n' : '');
    if (/\]\[[^\]]+\]|^\s*\[[^\]]+\]:/m.test(text)) state.warnings.push('引用式链接（如 [标题][id]）未自动解析，请改用 [标题](URL)。');
    if (/\$\$[\s\S]*?\$\$/.test(text)) state.warnings.push('检测到 LaTeX 公式块：请在 Confluence 中改为对应公式宏。');
    return { output:result, stats:state.stats, warnings:[...new Set(state.warnings)] };
  }
  function convertLines(lines, state, options, depth) {
    if (depth > 10) return lines.map(line=>inline(line,state));
    const out = [];
    let listStack=[];
    const resetList=()=>{ listStack=[]; };
    for (let i=0; i<lines.length;) {
      const line=lines[i];
      const fence=isFenceStart(line);
      if (fence) {
        resetList();
        const data=[], re=new RegExp('^ {0,3}' + (fence.char==='`'?'`':'~') + '{'+fence.len+',}\\s*$');
        let end=false;
        i++;
        while(i<lines.length) {
          if (re.test(lines[i])) { i++; end=true; break; }
          data.push(lines[i++]);
        }
        const lang = (languageMap[fence.lang.toLowerCase()] || fence.lang.toLowerCase() || 'none').replace(/[^a-z0-9#+_.-]/g,'') || 'none';
        out.push('{code:language='+lang+'}', ...data, '{code}');
        state.stats.codeBlocks++;
        if (!end) state.warnings.push('发现未闭合的 Markdown 围栏代码块，已按文档末尾自动闭合。');
        continue;
      }
      const atx=line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
      if(atx) { resetList(); out.push('h'+atx[1].length+'. '+inline(atx[2],state)); state.stats.headings++; i++; continue; }
      if (line.trim() && i+1<lines.length && /^ {0,3}(?:=+|-{3,})\s*$/.test(lines[i+1]) && !isFenceStart(line) && !listItem(line)) {
        resetList(); out.push('h'+(lines[i+1].trim().startsWith('=')?'1':'2')+'. '+inline(line.trim(),state));
        state.stats.headings++; i+=2; continue;
      }
      const simpleTable = simpleRuleTable(lines, i);
      if (simpleTable) {
        resetList(); state.stats.tables++;
        const renderCell = cell => inline(cell, state).replace(/\n/g, ' ');
        out.push('||' + simpleTable.header.map(renderCell).join('||') + '||');
        for (const row of simpleTable.rows) out.push('|' + row.map(renderCell).join('|') + '|');
        i = simpleTable.end;
        continue;
      }
      const ruledFixedTable = fixedWidthRuleTable(lines, i);
      if (ruledFixedTable) {
        resetList(); state.stats.tables++;
        const renderCell = cell => inline(cell, state).replace(/\n/g, ' ');
        out.push('||' + ruledFixedTable.header.map(renderCell).join('||') + '||');
        for (const row of ruledFixedTable.rows) out.push('|' + row.map(renderCell).join('|') + '|');
        i = ruledFixedTable.end;
        continue;
      }
      const fixedTable = fixedWidthTable(lines, i);
      if (fixedTable) {
        resetList(); state.stats.tables++;
        const renderCell = cell => inline(cell, state).replace(/\n/g, ' ');
        if (fixedTable.header) out.push('||' + fixedTable.header.map(renderCell).join('||') + '||');
        for (const row of fixedTable.rows) out.push('|' + row.map(renderCell).join('|') + '|');
        i = fixedTable.end;
        continue;
      }
      if (isHorizontal(line)) { resetList(); out.push('----'); i++; continue; }
      if(isTableHeader(lines,i)) {
        resetList(); state.stats.tables++;
        const header=splitCells(lines[i]);
        const renderCell=(cell)=>inline(cell,state).replace(/\n/g,' ');
        out.push('||'+header.map(renderCell).join('||')+'||');
        i+=2;
        while(i<lines.length && lines[i].trim() && lines[i].includes('|')) {
          const row=splitCells(lines[i]);
          while(row.length<header.length) row.push('');
          out.push('|'+row.slice(0,header.length).map(renderCell).join('|')+'|');
          i++;
        }
        continue;
      }
      if(/^\s*>/.test(line)) {
        resetList(); state.stats.quotes++;
        let quoted=[];
        while(i<lines.length && /^\s*>/.test(lines[i])) {
          quoted.push(lines[i].replace(/^\s*> ?/,'')); i++;
        }
        const inner=convertLines(quoted,state,options,depth+1);
        out.push('{quote}',...inner,'{quote}');
        continue;
      }
      const item=listItem(line);
      if(item) {
        state.stats.lists++;
        if(!listStack.length) listStack=[{indent:item.indent,type:item.type}];
        else if(item.indent > listStack[listStack.length-1].indent) listStack.push({indent:item.indent,type:item.type});
        else {
          while(listStack.length>1 && item.indent < listStack[listStack.length-1].indent) listStack.pop();
          if(item.indent === listStack[listStack.length-1].indent) listStack[listStack.length-1].type=item.type;
          else if(item.indent < listStack[0].indent) listStack=[{indent:item.indent,type:item.type}];
          else if(item.indent>listStack[listStack.length-1].indent) listStack.push({indent:item.indent,type:item.type});
          else listStack[listStack.length-1]={indent:item.indent,type:item.type};
        }
        let value=item.content;
        const task=value.match(/^\[([ xX])\]\s+(.*)$/);
        if(task) value=(task[1].toLowerCase()==='x'?'☑ ':'☐ ')+task[2];
        out.push(listStack.map(x=>x.type).join('')+' '+inline(value,state));
        i++;continue;
      }
      if(!line.trim()) { resetList(); if (!options.normalizeBlankLines || out[out.length-1] !== '') out.push(''); i++;continue; }
      // Indented code blocks: four spaces or a tab, after a blank line.
      if((/^ {4}\S/.test(line)||/^\t\S/.test(line)) && (i===0 || !lines[i-1].trim())) {
        resetList(); const code=[];
        while(i<lines.length && (lines[i].trim()==='' || /^(?: {4}|\t)/.test(lines[i]))) {
          code.push(lines[i].replace(/^(?: {4}|\t)/,''));i++;
        }
        while(code.length && !code[code.length-1].trim()) code.pop();
        out.push('{code:language=none}',...code,'{code}');state.stats.codeBlocks++;continue;
      }
      if(listStack.length && /^\s{2,}\S/.test(line)) {
        out[out.length-1] += ' \\\\ ' + inline(line.trim(),state);i++;continue;
      }
      resetList();
      // Inline formatting on each prose line; no changes to regular paragraph content.
      out.push(inline(line.replace(/[ \t]{2,}$/,'').trimEnd(),state));i++;
    }
    return out;
  }
  return {convert,inline};
});

