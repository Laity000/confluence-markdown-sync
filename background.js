'use strict';
chrome.action.onClicked.addListener(async (tab) => {
  const u = chrome.runtime.getURL('editor.html');
  const initial = /^https?:\/\//i.test(tab.url || '') ? '?target=' + encodeURIComponent(tab.url) : '';
  await chrome.tabs.create({url: u + initial});
});
