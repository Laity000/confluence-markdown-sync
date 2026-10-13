'use strict';

// The Windows companion updater replaces the unpacked files and writes this
// marker *last*. There is no remote JS execution inside the extension.
const UPDATE_ALARM = 'local-unpacked-release-check';
const UPDATE_MARKER = 'update-status.json';
const EDITOR_PAGE = chrome.runtime.getURL('editor.html');

function compareVersions(a, b) {
  const valid = /^\d+(?:\.\d+){2,3}$/;
  if (!valid.test(a) || !valid.test(b)) return null;
  const lhs = a.split('.').map(Number);
  const rhs = b.split('.').map(Number);
  for (let i = 0; i < Math.max(lhs.length, rhs.length); i++) {
    const delta = (lhs[i] || 0) - (rhs[i] || 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}

async function checkLocalUpgrade() {
  try {
    const response = await fetch(chrome.runtime.getURL(UPDATE_MARKER) + '?t=' + Date.now(), {cache: 'no-store'});
    if (!response.ok) return; // A store install or a pre-updater install has no marker.
    const marker = await response.json();
    if (!marker || marker.source !== 'github-release-windows-updater') return;
    const installed = String(marker.version || '');
    if (compareVersions(installed, chrome.runtime.getManifest().version) !== 1) return;
    // Never discard edited Markdown or interrupt a Confluence PUT by reloading
    // while any editor workspace is open in this Chrome profile.
    const tabs = await chrome.tabs.query({});
    if (tabs.some(tab => typeof tab.url === 'string' && tab.url.startsWith(EDITOR_PAGE))) return;
    chrome.runtime.reload();
  } catch (error) {
    console.debug('Local update probe deferred:', String(error));
  }
}

async function ensureUpdateAlarm() {
  const alarm = await chrome.alarms.get(UPDATE_ALARM);
  if (!alarm) await chrome.alarms.create(UPDATE_ALARM, {delayInMinutes: 1, periodInMinutes: 2});
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === UPDATE_ALARM) void checkLocalUpgrade();
});
chrome.runtime.onInstalled.addListener(() => {
  void ensureUpdateAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  void ensureUpdateAlarm();
});
void ensureUpdateAlarm();

chrome.action.onClicked.addListener(async (tab) => {
  const u = EDITOR_PAGE;
  const initial = /^https?:\/\//i.test(tab.url || '') ? '?target=' + encodeURIComponent(tab.url) : '';
  await chrome.tabs.create({url: u + initial});
});
