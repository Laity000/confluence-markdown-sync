'use strict';
// All HTTP requests are injected into the target Confluence tab's MAIN world.
// The browser sends the site's own logged-in cookies; this extension never reads them.
const $=id=>document.getElementById(id);
const state={preview:null,filename:'document.md',working:false,revision:0,sourceFile:null,sourceRelativePath:'',resourceFiles:[],projectMarkdownFiles:[]};
const els={url:$('url'),md:$('markdown'),status:$('status'),meta:$('meta'),mode:$('mode')};
function note(message,type='info'){
  els.status.className='alert '+type;
  els.status.textContent=message;
}
function errorText(e){return String(e?.message||e||'未知错误').slice(0,1800);}
function setBusy(flag){state.working=flag; $('preview').disabled=flag;$('openPage').disabled=flag; $('publish').disabled=flag||!canPublish();$('backup').disabled=flag||!state.preview;
  els.url.disabled=flag;els.md.disabled=flag;els.mode.disabled=flag;$('chooseProjectDirectory').disabled=flag;$('projectDirectory').disabled=flag;$('choose').disabled=flag;$('file').disabled=flag;$('fileEncoding').disabled=flag;
  $('chooseAttachments').disabled=flag;$('attachments').disabled=flag;$('chooseResourceDirectory').disabled=flag;$('resourceDirectory').disabled=flag;$('projectMarkdownSelect').disabled=flag;}
function canPublish(){return !!state.preview && !state.preview.noChange && !state.preview.blocked;}
function invalidate(){state.revision++;state.preview=null;$('diffPanel').hidden=true;els.meta.hidden=true;$('backup').disabled=true;$('publish').disabled=true;$('publishHint').textContent='源文档或目标发生变化，请重新生成预览。';}
function refreshMarkdown(){
  invalidate();let md=els.md.value;
  const localReferences=AttachmentResolver.findReferences(md).refs;
  const attachmentPlan=AttachmentResolver.prepare(md,state.resourceFiles,state.sourceRelativePath);
  const res=Md2Confluence.convert(attachmentPlan.markdown);
  $('parseInfo').textContent=`${md.length.toLocaleString()} 字符 · ${res.stats.headings} 个标题 · ${res.stats.codeBlocks} 个代码块 · ${res.stats.tables} 个表格 · ${res.stats.lists} 个列表项 · ${attachmentPlan.references.length} 个本地文件引用`;
  let warns=[...res.warnings,...attachmentPlan.warnings];
  if(localReferences.length&&!state.resourceFiles.length)warns.push('检测到本地文件引用；尚未选择本地资源。请点击「选择项目目录」或「仅选择资源目录」，授权读取引用的文件。');
  if(SyncCore.hasWikiSensitiveBrackets(md))warns.push('包含 PLC 方括号表达式：自动同步将直接使用 Storage XHTML；请勿复制或导出 Wiki 标记手动导入，以免 Confluence 将 [index] 误转为链接。');
  $('mdWarnings').hidden=!warns.length;$('mdWarnings').textContent=[...new Set(warns)].join('\n');
  return res;
}
function parse(){return SyncCore.parsePageUrl(els.url.value);}
async function getSiteTab(details){
  const tabs=await chrome.tabs.query({});
  const matches=tabs.filter(t=>{try{const u=new URL(t.url);return u.origin===details.origin && u.pathname.startsWith(details.prefix+'/');}catch{return false;}});
  const exact=matches.find(t=>{try{const u=new URL(t.url);return u.pathname===new URL(details.exactUrl).pathname && u.searchParams.get('pageId')===details.pageId;}catch{return false;}});
  const tab=exact||matches[0];
  if(!tab)throw new Error('没有找到同一站点的 Confluence 标签页。请先点击「打开页面」，在浏览器完成登录，然后再生成预览。');
  if(tab.status==='loading')throw new Error('Confluence 标签页还未加载完成，请稍后再试。');
  return tab;
}
async function requestSiteAccess(details){
  // Called directly from user-initiated button click. Restrict access to one site.
  // Chrome Match Patterns do not include port numbers; the request is scoped to the hostname.
  const u=new URL(details.origin);
  const hostPattern=u.protocol+'//'+u.hostname+'/*';
  const granted=await chrome.permissions.request({origins:[hostPattern]});
  if(!granted)throw new Error('未获得该 Confluence 站点的浏览器授权，无法访问页面。');
}
/** This function executes inside the existing Confluence page, not in the extension origin. */
async function onConfluencePage(req){
  'use strict';
  if(window.location.origin!==req.origin)throw new Error('安全检查失败：目标浏览器标签页与指定 Confluence 站点不同源。');
  const path=req.prefix+'/rest/api/content/'+encodeURIComponent(req.pageId);
  async function call(url,options){
    const response=await fetch(url,{credentials:'same-origin',redirect:'follow',cache:'no-store',headers:{'Accept':'application/json',...(options?.headers||{})},method:options?.method||'GET',body:options?.body});
    const ctype=response.headers.get('content-type')||'';
    const body=await response.text();
    if(!ctype.toLowerCase().includes('json'))throw new Error('接口未返回 JSON，HTTP '+response.status+'；可能是登录失效、接口不存在或代理重定向。'+body.slice(0,140).replace(/<[^>]+>/g,''));
    let value;try{value=JSON.parse(body);}catch{throw new Error('无法解析 Confluence REST JSON（HTTP '+response.status+'）。');}
    if(!response.ok){const description=(value.message||value.errorMessage||JSON.stringify(value.errors||value)).slice(0,500);throw new Error('Confluence API HTTP '+response.status+': '+description);}
    return value;
  }
  if(req.operation==='read')return await call(path+'?expand=version,body.storage,space');
  if(req.operation==='convert'){
    const result=await call(req.prefix+'/rest/api/contentbody/convert/storage',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:req.wiki,representation:'wiki'})
    });
    if(typeof result.value!=='string'||result.representation!=='storage')throw new Error('Confluence 未返回 Storage 格式转换结果。');
    return {value:result.value};
  }
  if(req.operation==='update'){
    const expected=req.snapshot;
    const matchesSnapshot=page=>String(page.id)===String(req.pageId)&&page.type==='page'&&
      typeof page.body?.storage?.value==='string'&&typeof page.version?.number==='number'&&
      page.version.number===expected.version&&page.title===expected.title&&page.body.storage.value===expected.storage;
    const now=await call(path+'?expand=version,body.storage');
    if(String(now.id)!==String(req.pageId)||now.type!=='page'||typeof now.body?.storage?.value!=='string'||typeof now.version?.number!=='number')
      throw new Error('更新前远端页面信息不完整，已终止。');
    if(!matchesSnapshot(now))
      return {conflict:true,latestVersion:now.version.number, message:'目标页面在预览后已变化，尚未上传附件或写入正文。请重新预览并确认。'};
    let uploaded=0;
    try{
      for(const attachment of (req.attachments||[])){
        if(!attachment||typeof attachment.filename!=='string'||!attachment.filename.trim()||
           /[\\/\x00-\x1f]/.test(attachment.filename)||typeof attachment.data!=='string')
          throw new Error('附件数据格式无效。');
        const binary=atob(attachment.data);
        const bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        const form=new FormData();
        form.append('file',new Blob([bytes],{type:attachment.mimeType||'application/octet-stream'}),attachment.filename);
        await call(path+'/child/attachment',{method:'POST',headers:{'X-Atlassian-Token':'nocheck'},body:form});
        uploaded++;
      }
    }catch(e){
      throw new Error('附件上传失败；页面正文尚未更新，已成功上传 '+uploaded+' 个附件。原因：'+String(e?.message||e));
    }
    const after=await call(path+'?expand=version,body.storage');
    if(String(after.id)!==String(req.pageId)||after.type!=='page'||typeof after.body?.storage?.value!=='string'||typeof after.version?.number!=='number')
      throw new Error('附件上传后页面信息不完整，未写入正文。已上传附件数：'+uploaded+'。');
    if(!matchesSnapshot(after))
      return {conflict:true,latestVersion:after.version.number,uploadedAttachments:uploaded,
        message:'上传附件期间目标页面发生变化，正文未写入。已上传的附件可能已保留在页面附件列表中；请重新预览后再同步。'};
    if(req.storage===after.body.storage.value)
      return {unchanged:true,version:after.version.number,attachmentsUploaded:uploaded};
    const payload={id:String(req.pageId),type:'page',title:after.title,
      version:{number:after.version.number+1},body:{storage:{value:req.storage,representation:'storage'}}};
    const saved=await call(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(String(saved.id)!==String(req.pageId)||!Number.isInteger(saved.version?.number)||saved.version.number!==payload.version.number)
      throw new Error('PUT 已收到响应，但返回的页面 ID/版本不符合预期。已上传附件数：'+uploaded+'。请先检查远端是否已经更新，切勿直接重试。');
    return {updated:true,version:saved.version.number,attachmentsUploaded:uploaded};
  }
  throw new Error('未知操作。');
}
async function callSite(details,operation,data={}){
  const tab=await getSiteTab(details);
  const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:onConfluencePage,args:[{operation,origin:details.origin,prefix:details.prefix,pageId:details.pageId,...data}]});
  if(!result)throw new Error('Confluence 标签页未执行脚本；请检查扩展访问权限和浏览器策略。');
  if(!('result' in result))throw new Error('无法收到 Confluence 标签页的接口返回值。');
  return result.result;
}
async function preview(){
  let details;try{details=parse();if(!els.md.value.trim())throw new Error('请先导入或填写 Markdown 内容。');}catch(e){note(errorText(e),'err');return;}
  setBusy(true);invalidate();const requestedRevision=state.revision;note('正在检查页面权限、读取远端版本并准备同步预览…');
  try{
    await requestSiteAccess(details);
    const current=SyncCore.requiredPage(await callSite(details,'read'),details.pageId);
    const attachmentPlan=AttachmentResolver.prepare(els.md.value,state.resourceFiles,state.sourceRelativePath);
    const wiki=Md2Confluence.convert(attachmentPlan.markdown);
    const selection=SyncCore.selectConversionMode(els.md.value,els.mode.value);
    let converted=null,mode=selection.mode,method='';
    const warns=[...wiki.warnings,...attachmentPlan.warnings];
    if(selection.warning)warns.push(selection.warning);
    if(mode!=='local'){
      try{
        converted=await callSite(details,'convert',{wiki:wiki.output});
        const unexpected=SyncCore.unexpectedBracketLinks(els.md.value,converted.value);
        if(unexpected.length)throw new Error('Confluence 意外把 PLC 方括号转换成了页面链接：'+unexpected.join('、')+'；已禁止使用这份服务器转换结果');
        method='服务器 Wiki → Storage';
      }
      catch(e){if(mode==='server')throw new Error('服务器 Wiki → Storage 转换失败：'+errorText(e));
        warns.push('服务器 Wiki → Storage 不可用，已经切换为本地基础 Storage 转换。请特别检查源码预览。原因：'+errorText(e));
      }
    }
    if(!converted){converted=StorageConverter.render(attachmentPlan.markdown);method='本地基础 Storage（兼容模式）';warns.push(...converted.warnings);}
    if(typeof converted.value!=='string'||!converted.value.trim())throw new Error('转换后 Storage 正文为空，已拒绝同步。');
    converted.value=AttachmentResolver.applyStorageTokens(converted.value,attachmentPlan);
    if(state.revision!==requestedRevision)throw new Error('预览时源文档、页面 URL 或转换方式发生变化。请重新执行预览。');
    const blocked=attachmentPlan.blocked;
    if(blocked)warns.push('阻止发布：存在未找到的本地文件、路径歧义或附件限制错误，请修复后重新预览。');
    const unchanged=current.storage===converted.value&&attachmentPlan.uploads.length===0;
    state.preview={details,current,storage:converted.value,wiki:AttachmentResolver.applyWikiTokens(wiki.output,attachmentPlan),
      markdown:els.md.value,blocked,noChange:unchanged,method,warnings:[...new Set(warns)],
      attachments:attachmentPlan.uploads,attachmentPlan};
    showPreview();
    note('预览生成完成：'+current.title+'（v'+current.version+'）。'+(unchanged?'新旧 Storage 正文相同，无需更新。':blocked?'检测到本地附件引用问题，已禁止自动覆盖。':attachmentPlan.uploads.length?'正文尚未修改；同步时将先上传 '+attachmentPlan.uploads.length+' 个附件。':'尚未修改任何远端内容。'),'ok');
    await chrome.storage.local.set({lastPage:details.exactUrl});
  }catch(e){invalidate();note('连接 / 预览失败：'+errorText(e),'err');}
  finally{setBusy(false);}
}
function textBlocks(storage){
  const raw=storage.replace(/<ac:plain-text-body[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/gi,(_,v)=>'\n[CODE] '+StorageConverter.xml(v)+'\n');
  const spaced=raw.replace(/<\/?(?:p|div|tr|li|h[1-6]|table|blockquote|ul|ol|ac:structured-macro)\b[^>]*>/gi,'\n').replace(/<br\b[^>]*\/?\s*>/gi,'\n').replace(/<\/t[dh]>/gi,' | ');
  const doc=new DOMParser().parseFromString(spaced,'text/html');
  const text=doc.body.textContent||'';
  return text.split(/\n+/).map(t=>t.trim().replace(/\s+/g,' ')).filter(Boolean).slice(0,800);
}
function diffText(before,after){
  const a=textBlocks(before),b=textBlocks(after),limit=360;
  if(a.length>limit||b.length>limit){return {rows:[['same','文档较长，省略逐行差异。请查看下方两份 Storage 源码。']],adds:'—',dels:'—'};}
  const n=a.length,m=b.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const rows=[];let i=0,j=0,adds=0,dels=0;
  while(i<n||j<m){
    if(i<n&&j<m&&a[i]===b[j]){rows.push(['same','  '+a[i]]);i++;j++;}
    else if(j<m&&(i===n||dp[i][j+1]>=dp[i+1][j])){rows.push(['add','+ '+b[j++]]);adds++;}
    else{rows.push(['del','− '+a[i++]]);dels++;}
  }
  return {rows,adds,dels};
}
function showPreview(){
  const p=state.preview;$('diffPanel').hidden=false;els.meta.hidden=false;
  const existingMacro=(p.current.storage.match(/<ac:structured-macro\b/g)||[]).length;
  const warn=(existingMacro?`⚠ 原页面包含 ${existingMacro} 个 Confluence 宏；整页替换可能删除原来的宏和附件引用。\n`:'')+
    (p.method.startsWith('本地')?'⚠ 当前使用本地兼容转换，不等同于 Confluence 官方 Wiki 导入效果。\n':'')+
    (p.warnings.length?'⚠ 转换提醒：'+p.warnings.join('；'):'');
  els.meta.textContent='';
  const lines=[`页面：${p.current.title}`,`Page ID：${p.current.id} · 版本：v${p.current.version}`,`转换方式：${p.method}`,`当前正文：${p.current.storage.length.toLocaleString()} 字符 → 新正文：${p.storage.length.toLocaleString()} 字符`];
  for(const line of lines){const row=document.createElement('div');row.textContent=line;els.meta.append(row);}
  if(warn){const elem=document.createElement('div');elem.style.color='#ab6215';elem.style.whiteSpace='pre-wrap';elem.textContent=warn;els.meta.append(elem);}
  $('wiki').value=p.wiki;$('storage').value=p.storage;$('original').value=p.current.storage;
  const d=diffText(p.current.storage,p.storage);$('diffCount').textContent=`增加 ${d.adds} 段 / 删除 ${d.dels} 段`;
  $('diff').replaceChildren();for(const [kind,txt] of d.rows.slice(0,600)){const line=document.createElement('div');line.className='diff-line '+kind;line.textContent=txt;$('diff').append(line);}
  if(!d.rows.length){const row=document.createElement('div');row.className='diff-line same';row.textContent='文本提取结果无差异；格式或宏仍可能发生变化，请检查 Storage 源码。';$('diff').append(row);}
  $('backup').disabled=false;$('publishHint').textContent=p.blocked?'本地附件引用未解析或超出限制：禁止发布':p.noChange?'内容相同，无需更新':p.attachments?.length?'预览完成；同步时将先上传 '+p.attachments.length+' 个附件，再更新正文。':'预览已完成，可直接点击「同步更新页面」（整页替换）。';
  $('publish').disabled=!canPublish();
}
function saveBlob(blob,filename){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function downloadBackup(p){
  const obj=SyncCore.backupRecord(p.details,p.current);
  const timestamp=new Date().toISOString().replace(/[:.]/g,'-');
  const name=`Confluence备份/${SyncCore.safeFilename(p.current.title)}_page${p.current.id}_v${p.current.version}_${timestamp}.json`;
  const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'}));
  let downloadId;
  try{
    downloadId=await chrome.downloads.download({url,filename:name,conflictAction:'uniquify',saveAs:false});
    if(typeof downloadId!=='number')throw new Error('备份下载任务未创建。');
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{cleanup();reject(new Error('备份下载等待超过 90 秒，已取消本次同步。'));},90000);
      function cleanup(){clearTimeout(timer);chrome.downloads.onChanged.removeListener(onChanged);}
      function onChanged(item){if(item.id!==downloadId)return;
        if(item.state?.current==='complete'){cleanup();resolve();}
        else if(item.state?.current==='interrupted'){cleanup();reject(new Error('备份下载被中断：'+(item.error?.current||'未知原因')));}
      }
      chrome.downloads.onChanged.addListener(onChanged);
      // A very small backup could complete before listener installation.
      chrome.downloads.search({id:downloadId},items=>{
        if(chrome.runtime.lastError)return;
        const item=items?.[0];if(item?.state==='complete'){cleanup();resolve();}
        else if(item?.state==='interrupted'){cleanup();reject(new Error('备份下载未完成。'));}
      });
    });
    return name;
  } finally {setTimeout(()=>URL.revokeObjectURL(url),4000);}
}
async function justBackup(){if(!state.preview)return;setBusy(true);note('正在下载原页面备份到浏览器下载目录…');
  try{const name=await downloadBackup(state.preview);note('原页面备份下载完成：'+name,'ok');}
  catch(e){note('备份失败：'+errorText(e),'err');}finally{setBusy(false);}
}
async function encodeAttachment(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=0x8000){
    binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+0x8000,bytes.length)));
  }
  return btoa(binary);
}
async function serializeAttachments(uploads){
  const result=[];
  for(const item of (uploads||[])){
    result.push({filename:item.filename,mimeType:item.mimeType||item.file?.type||'application/octet-stream',data:await encodeAttachment(item.file)});
  }
  return result;
}
async function publish(){
  const p=state.preview;
  if(!p||!canPublish()||state.working)return;
  // The preview must still match the content in the editor.
  if(els.md.value!==p.markdown){invalidate();note('Markdown 已被修改，请重新生成预览。','err');return;}
  // No checkbox, browser confirmation or mandatory downloaded backup.
  // Confluence's native page version history remains available for restoring older content.
  setBusy(true);note('正在重新核对页面版本、标题及正文，随后同步更新…');
  try{
    const attachments=await serializeAttachments(p.attachments);
    const result=await callSite(p.details,'update',{snapshot:p.current,storage:p.storage,attachments});
    if(result?.conflict){invalidate();note('版本冲突：'+result.message+' 最新版本 v'+result.latestVersion+'。'+(result.uploadedAttachments?'已上传 '+result.uploadedAttachments+' 个附件，但正文未更新。':'未修改远端正文。'),'err');return;}
    if(result?.unchanged){invalidate();note(result.attachmentsUploaded?'附件已上传/更新 '+result.attachmentsUploaded+' 个；正文内容无需更新。':'远端内容与新 Storage 相同，无需更新。','ok');return;}
    if(!result?.updated)throw new Error('远端未确认更新成功。请打开页面自行核查后再决定是否重试。');
    invalidate();note(`同步成功！Confluence 已生成 v${result.version}，上传/更新附件 ${result.attachmentsUploaded||0} 个；页面 URL 不变。`,'ok');
  }catch(e){invalidate();note('同步过程停止：'+errorText(e)+'\n如果已经发起 PUT 但连接中断，请先刷新目标 Confluence 页面确认实际版本，避免重复提交。','err');}
  finally{setBusy(false);}
}
$('preview').addEventListener('click',preview);
$('publish').addEventListener('click',publish);
$('backup').addEventListener('click',justBackup);
$('url').addEventListener('input',invalidate);
$('markdown').addEventListener('input',refreshMarkdown);
$('mode').addEventListener('change',invalidate);
$('openPage').addEventListener('click',async()=>{try{const p=parse();await chrome.tabs.create({url:p.exactUrl});}catch(e){note(errorText(e),'err');}});
$('chooseProjectDirectory').addEventListener('click',()=>$('projectDirectory').click());
$('choose').addEventListener('click',()=>$('file').click());
$('chooseAttachments').addEventListener('click',()=>$('attachments').click());
$('chooseResourceDirectory').addEventListener('click',()=>$('resourceDirectory').click());

function updateAssetLabel(kind){
  $('assetLabel').textContent=state.resourceFiles.length
    ?'已授权 '+state.resourceFiles.length+' 个'+kind+'；本地引用按相对路径优先匹配。'
    :'尚未选择本地附件或资源目录';
}
function setResourceFiles(fileList,kind,append=false){
  const incoming=AttachmentResolver.collectFiles(fileList);
  if(append){
    const merged=state.resourceFiles.slice();
    for(const entry of incoming){
      const duplicate=merged.some(existing=>existing.path.toLowerCase()===entry.path.toLowerCase()&&
        Number(existing.file?.size)===Number(entry.file?.size)&&
        Number(existing.file?.lastModified||0)===Number(entry.file?.lastModified||0));
      if(!duplicate)merged.push(entry);
    }
    state.resourceFiles=merged;
  }else{
    state.resourceFiles=incoming;
  }
  state.sourceRelativePath=AttachmentResolver.findSourcePath(state.sourceFile,state.resourceFiles);
  updateAssetLabel(kind);
  invalidate();refreshMarkdown();
}
function showProjectMarkdownChoices(entries){
  state.projectMarkdownFiles=AttachmentResolver.listMarkdownFiles(entries);
  const row=$('projectMarkdownRow'),select=$('projectMarkdownSelect');
  select.textContent='';
  if(state.projectMarkdownFiles.length<=1){row.hidden=true;return;}
  for(const entry of state.projectMarkdownFiles){
    const option=document.createElement('option');
    option.value=entry.path;option.textContent=entry.path;select.appendChild(option);
  }
  row.hidden=false;
}
async function loadFile(file,relativePath=''){
  if(!file)return;
  state.sourceFile=file;state.filename=file.name;
  state.sourceRelativePath=relativePath||AttachmentResolver.findSourcePath(file,state.resourceFiles);
  try{
    const bytes=await file.arrayBuffer();
    els.md.value=new TextDecoder($('fileEncoding').value).decode(bytes);
    $('fileLabel').textContent=relativePath?'当前项目文档：'+relativePath:'当前文件：'+file.name;
    refreshMarkdown();
  }catch(e){note('文件读取失败：'+errorText(e),'err');}
}
$('projectDirectory').addEventListener('change',async()=>{
  const entries=AttachmentResolver.collectFiles($('projectDirectory').files);
  if(!entries.length){note('未读取到项目目录中的文件，请重新选择目录。','err');return;}
  state.resourceFiles=entries;
  state.sourceRelativePath=AttachmentResolver.findSourcePath(state.sourceFile,state.resourceFiles);
  const candidates=AttachmentResolver.listMarkdownFiles(entries);
  state.projectMarkdownFiles=candidates;
  showProjectMarkdownChoices(entries);
  updateAssetLabel('项目目录文件');
  if(!candidates.length){
    invalidate();refreshMarkdown();
    note('已读取目录中的 '+entries.length+' 个文件，但没有找到 .md/.markdown 文件；保留当前编辑区内容，可将该目录用作粘贴内容的资源目录。','info');
    return;
  }
  if(candidates.length>1){
    const select=$('projectMarkdownSelect');
    select.textContent='';
    for(const entry of candidates){
      const option=document.createElement('option');
      option.value=entry.path;option.textContent=entry.path;select.appendChild(option);
    }
    $('projectMarkdownRow').hidden=false;
  }else{
    $('projectMarkdownRow').hidden=true;
  }
  const selected=candidates[0];
  $('projectMarkdownSelect').value=selected.path;
  await loadFile(selected.file,selected.path);
  if(candidates.length>1)note('已读取项目目录，找到 '+candidates.length+' 份 Markdown；当前先载入 '+selected.path+'，可在上方切换。','ok');
  else note('已读取项目目录并载入 '+selected.path+'，共授权 '+entries.length+' 个文件用于匹配相对路径。','ok');
});
$('projectMarkdownSelect').addEventListener('change',async()=>{
  const selected=state.projectMarkdownFiles.find(entry=>entry.path===$('projectMarkdownSelect').value);
  if(selected)await loadFile(selected.file,selected.path);
});
$('attachments').addEventListener('change',()=>setResourceFiles($('attachments').files,'附件文件',true));
$('resourceDirectory').addEventListener('change',()=>setResourceFiles($('resourceDirectory').files,'资源目录文件'));
$('file').addEventListener('change',async()=>{
  const file=$('file').files?.[0];
  if(!file)return;
  $('projectMarkdownRow').hidden=true;
  await loadFile(file);
});
$('fileEncoding').addEventListener('change',()=>{if(state.sourceFile)loadFile(state.sourceFile,state.sourceRelativePath);});
els.md.addEventListener('paste',()=>{
  const replacesWholeDocument=!els.md.value.trim()||
    (els.md.selectionStart===0&&els.md.selectionEnd===els.md.value.length);
  if(replacesWholeDocument){
    state.sourceFile=null;state.sourceRelativePath='';
    $('fileLabel').textContent='当前内容：粘贴或手动编辑';
    $('projectMarkdownRow').hidden=true;
  }
});
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
document.addEventListener('drop',async e=>{const f=Array.from(e.dataTransfer?.files||[]).find(x=>/\.(?:md|markdown|txt)$/i.test(x.name));if(!f)return;e.preventDefault();await loadFile(f);});
function assertSafeWikiExport(){
  if(SyncCore.hasWikiSensitiveBrackets(els.md.value))throw new Error('PLC 方括号表达式会被 Confluence Wiki 误解析为页面链接，请使用「自动」模式生成 Storage 同步预览，勿手动导入 Wiki Markup。');
}
function createWikiExport(){
  assertSafeWikiExport();
  const plan=AttachmentResolver.prepare(els.md.value,state.resourceFiles,state.sourceRelativePath);
  if(plan.blocked)throw new Error('本地附件未全部找到或超过大小/格式限制。请先选择资源文件并修复提示，再导出 Wiki Markup。');
  return AttachmentResolver.applyWikiTokens(Md2Confluence.convert(plan.markdown).output,plan);
}
$('copyWiki').addEventListener('click',async()=>{try{const output=createWikiExport();await navigator.clipboard.writeText(output);note('Wiki Markup 已复制；本地附件引用已转换为 Confluence 附件语法，但附件仍需先上传。','ok');}catch(e){note('复制失败：'+errorText(e),'err');}});
$('downloadWiki').addEventListener('click',()=>{try{const output=createWikiExport();saveBlob(new Blob([output],{type:'text/plain;charset=utf-8'}),SyncCore.safeFilename(state.filename.replace(/\.(md|markdown|txt)$/i,''))+'.wiki.txt');note('Wiki Markup 已导出 TXT。','ok');}catch(e){note('导出失败：'+errorText(e),'err');}});
(async()=>{
  try{const qs=new URLSearchParams(location.search);let initial=qs.get('target')||'';if(initial&&!/\/pages\/viewpage\.action/.test(initial))initial='';
    if(!initial){const saved=await chrome.storage.local.get('lastPage');initial=saved.lastPage||'';}
    els.url.value=initial;
  }catch(e){note('读取本地配置失败：'+errorText(e),'err');}
  refreshMarkdown();note('就绪。请打开并登录目标 Confluence 页面，再填写 URL、导入 Markdown 并生成预览。');
})();
