'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const background=fs.readFileSync(__dirname+'/background.js','utf8');
async function runScenario({current='1.4.0',available='1.4.1',hasMarker=true,editors=[],source='github-release-windows-updater'}){
  const alarms={},actions={},installed={},startup={};let reloads=0,fetches=0;
  const chrome={
    runtime:{getURL:path=>'chrome-extension://sampleid/'+path,getManifest:()=>({version:current}),reload:()=>{reloads++;},onInstalled:{addListener:fn=>installed.fn=fn},onStartup:{addListener:fn=>startup.fn=fn}},
    action:{onClicked:{addListener:fn=>actions.clicked=fn}},
    alarms:{get:async()=>undefined,create:async(name,config)=>{alarms.created={name,config}},onAlarm:{addListener:fn=>alarms.listener=fn}},
    tabs:{query:async()=>editors.map(url=>({url})),create:async()=>({})}
  };
  const fetch=async(url)=>{fetches++;assert.match(url,/^chrome-extension:\/\/sampleid\/update-status\.json\?t=/);return {ok:hasMarker,json:async()=>({version:available,source})}};
  vm.runInNewContext(background,{chrome,fetch,Date,console});
  assert.equal(typeof actions.clicked,'function');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(alarms.created?.name,'local-unpacked-release-check');
  assert.equal(alarms.created?.config?.periodInMinutes,2);
  alarms.listener({name:'local-unpacked-release-check'});
  // The event listener intentionally schedules its async function.
  await new Promise(resolve=>setImmediate(resolve));
  return {reloads,fetches};
}
(async()=>{
  assert.equal((await runScenario({})).reloads,1);
  assert.equal((await runScenario({current:'1.4.0',available:'1.4.0'})).reloads,0);
  assert.equal((await runScenario({current:'1.4.1',available:'1.4.0'})).reloads,0);
  assert.equal((await runScenario({hasMarker:false})).reloads,0);
  assert.equal((await runScenario({source:'untrusted'})).reloads,0);
  assert.equal((await runScenario({editors:['chrome-extension://sampleid/editor.html?target=test']})).reloads,0);
  assert.equal((await runScenario({editors:['https://elsewhere.example/']})).reloads,1);
  assert.equal((await runScenario({current:'1.4.9',available:'1.4.10'})).reloads,1);
  console.log('PASS local-update marker, version order, idle-only reload and alarm');
})().catch(error=>{console.error(error);process.exitCode=1});
