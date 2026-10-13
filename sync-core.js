/* Pure functions shared by browser UI and Node tests. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SyncCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';
  function parsePageUrl(value) {
    let url;
    try { url = new URL(String(value).trim()); } catch { throw new Error('请输入完整的 Confluence 页面 URL。'); }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new Error('仅支持 http:// 或 https:// 的页面 URL，不允许在链接中包含账号密码。');
    }
    const m = url.pathname.match(/^(.*?)\/pages\/viewpage\.action\/?$/);
    if (!m) throw new Error('暂时仅支持 /pages/viewpage.action?pageId=数字 格式的页面 URL。');
    const pageId = url.searchParams.get('pageId');
    if (!/^[1-9]\d*$/.test(pageId || '')) throw new Error('URL 中缺少有效的 pageId。');
    const prefix = m[1] || '';
    const base = url.origin + prefix;
    const exactUrl = url.origin + url.pathname + '?pageId=' + pageId;
    return {pageId, origin:url.origin, base, exactUrl, endpoint:base+'/rest/api/content/'+pageId, prefix};
  }
  function requiredPage(data, pageId) {
    if (!data || String(data.id) !== String(pageId) || data.type !== 'page' ||
        !Number.isInteger(data.version?.number) || typeof data.title !== 'string' ||
        typeof data.body?.storage?.value !== 'string') {
      throw new Error('读取结果缺少页面 ID、标题、版本或 Storage 正文，无法安全同步。');
    }
    return {id:String(data.id),title:data.title,version:data.version.number, storage:data.body.storage.value};
  }
  function conflict(snapshot, newest) {
    if (String(newest.id) !== String(snapshot.id)) return '目标页面 ID 变化';
    if (newest.version !== snapshot.version) return '页面版本由 v'+snapshot.version+' 变化为 v'+newest.version;
    if (newest.title !== snapshot.title) return '页面标题已改变';
    if (newest.storage !== snapshot.storage) return '页面正文已变化（即使版本号相同）';
    return '';
  }
  function payload(snapshot, storage) {
    if (!snapshot?.id || !Number.isInteger(snapshot.version) || typeof storage !== 'string' || !storage.trim()) throw new Error('更新数据无效');
    return {
      id:snapshot.id, type:'page', title:snapshot.title,
      version:{number:snapshot.version+1},
      body:{storage:{value:storage,representation:'storage'}}
    };
  }
  function backupRecord(details, snapshot) {
    return {
      kind:'Confluence page backup', exportedAt:new Date().toISOString(), pageUrl:details.exactUrl,
      pageId:snapshot.id,title:snapshot.title, version:snapshot.version,
      body:{storage:{representation:'storage',value:snapshot.storage}}
    };
  }
  function safeFilename(name) {
    return String(name||'page').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,65).trim()||'page';
  }
  // Defensive check for Confluence versions whose wiki renderer still treats
  // literal PLC brackets as new-page links, even after Wiki escaping.
  // Detect only targets that actually occur in source as identifier[index].
  function unexpectedBracketLinks(markdown, storage) {
    const targets = new Set();
    for (const match of String(markdown).matchAll(/[A-Za-z_$][A-Za-z0-9_.$]*\[([^\]\r\n]{1,100})\]/g)) {
      targets.add(match[1]);
    }
    if (!targets.size) return [];
    const found = new Set();
    const content = String(storage);
    for (const match of content.matchAll(/\bri:content-title\s*=\s*["']([^"']+)["']/gi)) {
      if (targets.has(match[1])) found.add(match[1]);
    }
    for (const match of content.matchAll(/createpage\.action[^"'<>\s]*/gi)) {
      const title = match[0].replace(/&amp;/gi,'&').match(/[?&]title=([^&]+)/i)?.[1];
      if (!title) continue;
      try { const parsed = decodeURIComponent(title.replace(/\+/g,' ')); if(targets.has(parsed)) found.add(parsed); }
      catch { /* Invalid URL encoding does not authorize a write. */ }
    }
    return [...found];
  }
  return {parsePageUrl,requiredPage,conflict,payload,backupRecord,safeFilename,unexpectedBracketLinks};
});
