/* Markdown -> Confluence Storage XHTML fallback. No remote scripts, no third-party dependencies. */
(function(root,factory){
  const api=factory(); if(typeof module==='object'&&module.exports)module.exports=api;root.StorageConverter=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const xml=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const cmap={c:'c',cpp:'cpp','c++':'cpp',cxx:'cpp',cc:'cpp',java:'java',js:'javascript',javascript:'javascript',ts:'javascript',python:'python',py:'python',json:'javascript',xml:'xml',html:'html',css:'css',sql:'sql',bash:'bash',sh:'bash',yaml:'yaml',yml:'yaml',groovy:'groovy',powershell:'powershell',diff:'diff',txt:'none',text:'none',st:'none',llvm:'none'};
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
  function inline(src,warnings){
    let s=String(src); const saved=[];
    const hold=(v)=>{const mark='\uE400'+saved.length+'\uE401';saved.push(v);return mark;};
    s=s.replace(/\\([\\`*_{}\[\]()#+.!<>|~\-])/g,(_,c)=>hold(xml(c)));
    s=replaceCodeSpans(s,code=>hold('<code>'+xml(code)+'</code>'));
    s=s.replace(/!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"\n]*["'])?\s*\)/g,(_,alt,rawHref)=>{
      const href=String(rawHref).replace(/^<|>$/g,'');
      if(/^https?:\/\//i.test(href)){
        return hold('<ac:image ac:alt="'+xml(alt||'')+'"><ri:url ri:value="'+xml(href)+'" /></ac:image>');
      }
      warnings.push('检测到无法解析的 Markdown 图片路径：'+href+'。请选择包含该文件的资源目录或附件文件。');
      return hold('<strong>[图片未同步：'+xml(alt||href)+']</strong>');
    });
    s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,(_,label,href)=>hold('<a href="'+xml(href)+'">'+xml(label)+'</a>'));
    s=xml(s);
    s=s.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<strong>$1</strong>');
    s=s.replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
    s=s.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g,'$1<em>$2</em>');
    s=s.replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g,'$1<em>$2</em>');
    return s.replace(/\uE400(\d+)\uE401/g,(_,n)=>saved[Number(n)]);
  }
  function cells(line){
    let s=line.trim();if(s.startsWith('|'))s=s.slice(1);if(s.endsWith('|')&&!s.endsWith('\\|'))s=s.slice(0,-1);
    let out=[],b='',esc=false,code=false;
    for(const c of s){if(esc){b+=c;esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c==='`'){code=!code;b+=c;continue;}if(c==='|'&&!code){out.push(b.trim());b='';continue;}b+=c;}
    out.push(b.trim());return out;
  }
  function isTable(lines,i){return i+1<lines.length&&lines[i].includes('|')&&cells(lines[i+1]).every(x=>/^:?-{3,}:?$/.test(x))&&cells(lines[i]).length===cells(lines[i+1]).length;}
  // Recognize generated text tables that use a dashed column ruler and
  // space-aligned rows, with or without a header row.
  function splitFixedWidthCells(line){
    const cleaned=String(line).replace(/^\s*&#(?:x0*20|0*32);[ \t]*/i,'').trim();
    return cleaned.split(/[ \t]{2,}/).map(x=>x.trim());
  }
  function fixedWidthRulerColumns(line){
    if(!/^\s*-{3,}(?:[ \t]+-{3,}){1,}\s*$/.test(line))return 0;
    return [...String(line).matchAll(/-{3,}/g)].length;
  }
  function fixedWidthTable(lines,i){
    if(i>=lines.length)return null;
    let header=null,rulerIndex=i,columns=fixedWidthRulerColumns(lines[i]);
    if(!columns){
      header=splitFixedWidthCells(lines[i]);
      rulerIndex=i+1;
      let skipped=0;
      while(rulerIndex<lines.length&&!lines[rulerIndex].trim()&&skipped<2){rulerIndex++;skipped++;}
      columns=rulerIndex<lines.length?fixedWidthRulerColumns(lines[rulerIndex]):0;
      if(!columns||header.length!==columns)return null;
    }
    if(columns<2)return null;
    let dataStart=rulerIndex+1,skippedAfterRuler=0;
    while(dataStart<lines.length&&!lines[dataStart].trim()&&skippedAfterRuler<2){dataStart++;skippedAfterRuler++;}
    const rows=[];let end=dataStart;
    while(end<lines.length&&lines[end].trim()){
      const line=lines[end];
      if(fenceStart(line)||/^ {0,3}#{1,6}\s+/.test(line)||listItem(line)||/^\s*>/.test(line)||line.includes('|'))break;
      const row=splitFixedWidthCells(line);
      if(row.length!==columns)break;
      rows.push(row);end++;
    }
    return rows.length>=2?{header,rows,end}:null;
  }
  function isStandaloneHorizontalRule(line){return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);}
  function fixedWidthRuleTable(lines,i){
    if(i>=lines.length||!isStandaloneHorizontalRule(lines[i]))return null;
    const skipBlanks=start=>{let n=start;while(n<lines.length&&!lines[n].trim())n++;return n;};
    const headerIndex=skipBlanks(i+1);
    if(headerIndex>=lines.length)return null;
    const header=splitFixedWidthCells(lines[headerIndex]);
    if(header.length<2)return null;
    const rulerIndex=skipBlanks(headerIndex+1);
    if(rulerIndex>=lines.length||!isStandaloneHorizontalRule(lines[rulerIndex]))return null;
    const dataStart=skipBlanks(rulerIndex+1);
    const rows=[];let cursor=dataStart,lastRowEnd=dataStart;
    while(cursor<lines.length){
      if(!lines[cursor].trim()){
        const next=skipBlanks(cursor);
        if(next>=lines.length||isStandaloneHorizontalRule(lines[next])||fenceStart(lines[next])||
           /^ {0,3}#{1,6}\s+/.test(lines[next])||listItem(lines[next])||
           /^\s*>/.test(lines[next])||lines[next].includes('|'))break;
        if(splitFixedWidthCells(lines[next]).length!==header.length)break;
        cursor=next;continue;
      }
      const line=lines[cursor];
      if(isStandaloneHorizontalRule(line)||fenceStart(line)||/^ {0,3}#{1,6}\s+/.test(line)||
         listItem(line)||/^\s*>/.test(line)||line.includes('|'))break;
      const cells=splitFixedWidthCells(line);
      if(cells.length!==header.length)break;
      rows.push(cells);cursor++;lastRowEnd=cursor;
    }
    return rows.length>=2?{header,rows,end:lastRowEnd}:null;
  }
  function simpleTableColumns(line){
    if(!/^\s*-{3,}(?:[ \t]+-{3,})+\s*$/.test(line))return null;
    const spans=[...line.matchAll(/-{3,}/g)];
    return spans.length>=2?spans.map(match=>match.index):null;
  }
  function simpleTableCells(line,columns){
    const normalized=String(line).replace(/&#(?:x0*20|0*32);/gi,' ');
    const cells=columns.map((start,i)=>normalized.slice(start,i+1<columns.length?columns[i+1]:undefined).trim());
    return cells.every(Boolean)?cells:null;
  }
  function simpleRuleTable(lines,i){
    if(i>=lines.length||!isStandaloneHorizontalRule(lines[i]))return null;
    const skipBlanks=start=>{
      let at=start,count=0;
      while(at<lines.length&&!lines[at].trim()&&count<2){at++;count++;}
      return at;
    };
    const headerAt=skipBlanks(i+1);
    if(headerAt>=lines.length||!lines[headerAt].trim())return null;
    const rulerAt=skipBlanks(headerAt+1);
    if(rulerAt>=lines.length)return null;
    const columns=simpleTableColumns(lines[rulerAt]);
    if(!columns)return null;
    const header=simpleTableCells(lines[headerAt],columns);
    if(!header)return null;
    let at=skipBlanks(rulerAt+1),end=at;
    const rows=[];
    while(at<lines.length){
      if(!lines[at].trim()){
        const next=skipBlanks(at);
        if(next>=lines.length||!lines[next].trim())break;
        at=next;
      }
      const line=lines[at];
      if(simpleTableColumns(line)){end=at+1;break;}
      if(isStandaloneHorizontalRule(line)||fenceStart(line)||/^ {0,3}#{1,6}\s+/.test(line)||
         listItem(line)||/^\s*>/.test(line)||line.includes('|'))break;
      const cells=simpleTableCells(line,columns);
      if(!cells)break;
      rows.push(cells);at++;end=at;
    }
    return rows.length>=2?{header,rows,end}:null;
  }
  function listItem(line){let m=line.match(/^(\s{0,24})([-+*]|\d+[.)])\s+(.*)$/);return m?{indent:m[1].length,type:/\d/.test(m[2][0])?'ol':'ul',text:m[3]}:null;}
  function fenceStart(line){let m=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);return m?{symbol:m[1][0],count:m[1].length,lang:m[2].trim().split(/\s+/)[0]||'none'}:null;}
  function code(body,language,warnings){
    const rawLang=String(language||'none').toLowerCase(); const lang=cmap[rawLang]||'none';
    if(!cmap[rawLang]&&rawLang!=='none') warnings.push('未知代码语言 '+rawLang+'，将用纯文本代码块显示。');
    const content=String(body).replace(/\]\]>/g,']]]]><![CDATA[>');
    return '<ac:structured-macro ac:name="code" ac:schema-version="1"><ac:parameter ac:name="language">'+xml(lang)+'</ac:parameter><ac:plain-text-body><![CDATA['+content+']]></ac:plain-text-body></ac:structured-macro>';
  }
  function render(source){
    const warnings=[];
    const lines=String(source||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
    const out=[];let listStack=[];
    function closeList(){while(listStack.length){out.push('</li></'+listStack.pop().type+'>');}}
    function isBlock(i){if(i>=lines.length)return true;let x=lines[i];return !x.trim()||fenceStart(x)||/^ {0,3}#{1,6}\s+/.test(x)||/^\s*>/.test(x)||/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(x)||listItem(x)||isTable(lines,i)||fixedWidthTable(lines,i);}
    for(let i=0;i<lines.length;){
      let line=lines[i],f=fenceStart(line);
      if(f){closeList();let data=[],re=new RegExp('^ {0,3}'+(f.symbol==='`'?'`':'~')+'{'+f.count+',}\\s*$');i++;
        while(i<lines.length&&!re.test(lines[i]))data.push(lines[i++]);if(i<lines.length)i++;else warnings.push('存在未闭合的代码块，已按文件结尾处理。');
        out.push(code(data.join('\n'),f.lang,warnings));continue;
      }
      const head=line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if(head){closeList();out.push('<h'+head[1].length+'>'+inline(head[2],warnings)+'</h'+head[1].length+'>');i++;continue;}
      if(line.trim()&&i+1<lines.length&&/^ {0,3}(?:=+|-{3,})\s*$/.test(lines[i+1])&&!listItem(line)){
        closeList();let h=lines[i+1].trim()[0]==='='?1:2;out.push('<h'+h+'>'+inline(line.trim(),warnings)+'</h'+h+'>');i+=2;continue;
      }
      const simpleTable=simpleRuleTable(lines,i);
      if(simpleTable){
        closeList();
        let table='<table><tbody><tr>'+simpleTable.header.map(v=>'<th>'+inline(v,warnings)+'</th>').join('')+'</tr>';
        for(const row of simpleTable.rows)table+='<tr>'+row.map(v=>'<td>'+inline(v,warnings)+'</td>').join('')+'</tr>';
        out.push(table+'</tbody></table>');i=simpleTable.end;continue;
      }
      const ruledFixedTable=fixedWidthRuleTable(lines,i);
      if(ruledFixedTable){
        closeList();
        let table='<table><tbody><tr>'+ruledFixedTable.header.map(v=>'<th>'+inline(v,warnings)+'</th>').join('')+'</tr>';
        for(const row of ruledFixedTable.rows)table+='<tr>'+row.map(v=>'<td>'+inline(v,warnings)+'</td>').join('')+'</tr>';
        out.push(table+'</tbody></table>');i=ruledFixedTable.end;continue;
      }
      const fixedTable=fixedWidthTable(lines,i);
      if(fixedTable){
        closeList();let table='<table><tbody>';
        if(fixedTable.header)table+='<tr>'+fixedTable.header.map(v=>'<th>'+inline(v,warnings)+'</th>').join('')+'</tr>';
        for(const row of fixedTable.rows)table+='<tr>'+row.map(v=>'<td>'+inline(v,warnings)+'</td>').join('')+'</tr>';
        out.push(table+'</tbody></table>');i=fixedTable.end;continue;
      }
      if(/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)){closeList();out.push('<hr />');i++;continue;}
      if(isTable(lines,i)){
        closeList();const hdr=cells(lines[i]);let table='<table><tbody><tr>'+hdr.map(v=>'<th>'+inline(v,warnings)+'</th>').join('')+'</tr>';i+=2;
        while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){const row=cells(lines[i++]);table+='<tr>'+hdr.map((_,j)=>'<td>'+inline(row[j]||'',warnings)+'</td>').join('')+'</tr>';}
        out.push(table+'</tbody></table>');continue;
      }
      if(/^\s*>/.test(line)){
        closeList();let q=[];while(i<lines.length&&/^\s*>/.test(lines[i]))q.push(lines[i++].replace(/^\s*> ?/,''));
        out.push('<blockquote>'+render(q.join('\n')).value+'</blockquote>');continue;
      }
      const item=listItem(line);
      if(item){
        let last=listStack[listStack.length-1];
        if(!last || item.indent>last.indent){out.push('<'+item.type+'><li>');listStack.push({indent:item.indent,type:item.type});}
        else {
          while(listStack.length&&item.indent<listStack[listStack.length-1].indent){out.push('</li></'+listStack.pop().type+'>');}
          last=listStack[listStack.length-1];
          if(last&&item.indent===last.indent&&item.type===last.type)out.push('</li><li>');
          else if(last&&item.indent===last.indent){out.push('</li></'+listStack.pop().type+'>');out.push('<'+item.type+'><li>');listStack.push({indent:item.indent,type:item.type});}
          else{out.push('<'+item.type+'><li>');listStack.push({indent:item.indent,type:item.type});}
        }
        out.push(inline(item.text.replace(/^\[([ xX])\]\s+/,(_,a)=>(a.trim()?'☑ ':'☐ ')),warnings));i++;continue;
      }
      if(!line.trim()){closeList();i++;continue;}
      if((/^ {4}\S/.test(line)||/^\t\S/.test(line))&&(i===0||!lines[i-1].trim())){
        closeList();let data=[];while(i<lines.length&&(!lines[i].trim()||/^(?: {4}|\t)/.test(lines[i])))data.push(lines[i++].replace(/^(?: {4}|\t)/,''));
        out.push(code(data.join('\n').replace(/\s+$/,''),'none',warnings));continue;
      }
      if(listStack.length&&/^ {2,}\S/.test(line)){out.push('<br />'+inline(line.trim(),warnings));i++;continue;}
      closeList();let para=[line.trim()];i++;
      while(i<lines.length&&!isBlock(i)&&!(lines[i].trim()&&i+1<lines.length&&/^ {0,3}(?:=+|-{3,})\s*$/.test(lines[i+1]))){para.push(lines[i++].trim());}
      out.push('<p>'+para.map((v,j)=>inline(v,warnings)+(j<para.length-1?(v.endsWith('  ')?'<br />':' '):'')).join('')+'</p>');
    }
    closeList();
    if(/^\s*\[.+\]:/m.test(source)||/\]\[[^\]]+\]/.test(source))warnings.push('引用式链接暂不支持，请改为 [文字](URL)。');
    if(/\$\$/.test(source))warnings.push('LaTeX 数学公式未转换为 Confluence 公式宏。');
    if(/<\/?[a-z][^>]*>/i.test(source))warnings.push('检测到原生 HTML：兼容转换会将其视为普通文本。');
    return {value:out.join('\n'),warnings:[...new Set(warnings)]};
  }
  return {render,xml};
});
