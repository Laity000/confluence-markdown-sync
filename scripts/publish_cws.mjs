/** Upload and submit an existing Chrome Web Store item using API v2.
 *  Runs only in GitHub Actions after service account credentials are configured.
 *  Never outputs a credential, raw Markdown, Cookie, or Confluence document.
 */
import fs from 'node:fs/promises';
import { GoogleAuth } from 'google-auth-library';

const required = (key) => {
  const val = process.env[key]?.trim();
  if (!val) throw new Error(`${key} is not configured. See docs/CHROME_WEB_STORE.md`);
  return val;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const base = 'https://chromewebstore.googleapis.com';
const uploadBase = 'https://chromewebstore.googleapis.com/upload';

async function main() {
  const publisher = required('CWS_PUBLISHER_ID');
  const extension = required('CWS_EXTENSION_ID');
  const credentials = JSON.parse(required('CWS_SERVICE_ACCOUNT_JSON'));
  const zipFile = process.argv[2];
  if (!zipFile) throw new Error('Usage: node scripts/publish_cws.mjs path/to/extension.zip');
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(publisher) || !/^[a-p]{32}$/.test(extension)) {
    throw new Error('Publisher or extension ID is malformed.');
  }
  if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) {
    throw new Error('The GitHub secret must be a Google service account JSON.');
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/chromewebstore'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse.token;
  if (!accessToken) throw new Error('Failed to get Chrome Web Store access token');
  const resource = `publishers/${publisher}/items/${extension}`;
  const request = async (method, uri, body, type) => {
    const response = await fetch(uri, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(type ? { 'Content-Type': type } : {}),
      },
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(120000),
    });
    const content = await response.text();
    let json;
    try { json = content ? JSON.parse(content) : {}; } catch { throw new Error(`HTTP ${response.status} returned non-JSON response`); }
    if (!response.ok) {
      const message = json.error?.message || json.message || `HTTP ${response.status}`;
      throw new Error(`${method} ${uri.split(':')[0]} failed (${response.status}): ${String(message).slice(0,400)}`);
    }
    return json;
  };

  const zipBytes = await fs.readFile(zipFile);
  console.log(`Uploading ${zipFile} (${zipBytes.byteLength} bytes) to Chrome Web Store item ${extension}.`);
  const uploaded = await request('POST', `${uploadBase}/v2/${resource}:upload`, zipBytes, 'application/zip');
  console.log(`Upload state: ${uploaded.uploadState || 'unspecified'}; version: ${uploaded.crxVersion || '(processing)'}`);
  if (uploaded.itemId && uploaded.itemId !== extension) throw new Error('Uploaded item ID mismatch');
  let status = uploaded.uploadState;
  if (status === 'IN_PROGRESS') {
    for (let attempts = 0; attempts < 12; attempts++) {
      await sleep(5000);
      const remote = await request('GET', `${base}/v2/${resource}:fetchStatus`);
      status = remote.lastAsyncUploadState;
      console.log(`Async upload state: ${status || 'not available'}`);
      if (status && status !== 'IN_PROGRESS') break;
    }
  }
  if (status !== 'SUCCEEDED') {
    // Chrome Web Store API v2 returns SUCCEEDED; anything else is not safe to publish.
    throw new Error(`Upload was not confirmed successful (${status || 'unknown state'}). Do not submit for review.`);
  }

  const submitted = await request('POST', `${base}/v2/${resource}:publish`, JSON.stringify({
    publishType: 'DEFAULT_PUBLISH',
    skipReview: false,
    blockOnWarnings: true,
  }), 'application/json');
  console.log(`Publish submitted: ${submitted.state || 'unknown state'}. Review and publication are managed by Chrome Web Store.`);
  console.log(`Item: https://chromewebstore.google.com/detail/${extension}`);
}
main().catch(error => { console.error(`Chrome Web Store release failed: ${error.message}`); process.exitCode = 1; });
