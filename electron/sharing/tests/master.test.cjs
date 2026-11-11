const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { createMasterSharing } = require('../master.cjs');
const { isLanAddress } = require('../security.cjs');
const ip = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && isLanAddress(i.address))?.address;
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'codesync-master-test-'));
const storage = { isEncryptionAvailable:()=>true, encryptString:s=>Buffer.from(s), decryptString:b=>b.toString() };
function instance(subdir) {
  const folder=path.join(dir,subdir); fs.mkdirSync(folder,{recursive:true});
  return createMasterSharing({app:{getPath:()=>folder,getName:()=> 'Test Master'},safeStorage:storage,powerSaveBlocker:{start:()=>1,stop:()=>{}},getIPs:()=>[ip],onViewerMode:()=>{}});
}
function raw(address,route,data) { return new Promise((resolve,reject)=>{const req=https.request({hostname:address,port:8767,method:'POST',path:route,rejectUnauthorized:false},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(s)}));});req.on('error',reject);req.end(JSON.stringify(data));});}
test('real encrypted LAN pairing, two viewers, no extra keys, updates, pagination, revocation and offline', async () => {
  assert.ok(ip,'test requires a private LAN interface');
  const originalFetch=global.fetch;
  let valid=true;
  global.fetch=async()=>({ok:true,json:async()=>({valid,tier:'full'})});
  const master=instance('master'), a=instance('viewer-a'), b=instance('viewer-b');
  const creds={productKey:'master-key',machineId:'master-machine',apiKey:'public'};
  try {
    let info=await master.start(creds);
    await assert.rejects(a.join({address:`${ip}:8767`,fingerprint:'0'.repeat(64),code:info.code,name:'wrong pin'}));
    await assert.rejects(a.join({address:`${ip}:8767`,fingerprint:info.fingerprint,code:'00000000',name:'wrong code'}));
    await a.join({address:`${ip}:8767`,fingerprint:info.fingerprint,code:info.code,name:'Office'});
    assert.equal((await a.poll()).status,'pending');
    await assert.rejects(b.join({address:`${ip}:8767`,fingerprint:info.fingerprint,code:info.code,name:'reused code'}));
    master.approve(master.info().pending[0].id);
    info=master.newCode();
    await b.join({address:`${ip}:8767`,fingerprint:info.fingerprint,code:info.code,name:'Service'});
    const bid=master.info().pending[0].id; master.approve(bid);
    assert.equal(a.mode(),'viewer'); assert.equal(b.mode(),'viewer');
    const printers=Array.from({length:10},(_,i)=>({id:i+1,name:`Printer ${i+1}`,status:'ready',isAvailable:true,isConnected:true,inkLevel:'FULL'}));
    master.publish({printers,metrics:{1:{observedAt:Date.now(),values:{pressure:40}}},history:{runs:[{id:'run',actualCount:125}],snapshots:[],templates:[]}});
    assert.equal((await a.poll()).snapshot.printers.length,10);
    assert.equal((await b.poll()).snapshot.metrics[1].values.pressure,40);
    assert.equal((await a.readHistory('runs',0)).records[0].actualCount,125);
    printers[0].inkLevel='LOW';master.publish({printers,metrics:{}});
    assert.equal((await a.poll()).snapshot.printers[0].inkLevel,'LOW');
    assert.equal((await b.poll()).snapshot.printers[0].inkLevel,'LOW');
    const disk=JSON.parse(fs.readFileSync(path.join(dir,'viewer-a','master-sharing.json'),'utf8'));
    const viewer=JSON.parse(Buffer.from(disk.viewer,'base64').toString());
    for(const route of ['/relay/connect','/relay/send-command','/relay/disconnect','/relay/pause-polling','/view/report-update']) assert.equal((await raw(ip,route,viewer)).status,403);
    master.revoke(bid); assert.equal((await b.poll()).status,'revoked');
    await master.stop();assert.equal((await a.poll()).status,'offline');
    await master.start(creds);assert.equal((await a.poll()).status,'approved');
    valid=false;await assert.rejects(master.authorize(creds));assert.equal(master.info().enabled,false);
  } finally { await master.stop();global.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true}); }
});
