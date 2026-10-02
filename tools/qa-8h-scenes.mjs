// Controlled live-renderer lighting/anchor evidence, not a natural survival run.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { saveEvidenceScreenshot } from './qa-8h-capture.mjs';
const port = Number(process.env.SKYWIND_QA_CDP_PORT || 9230);
const output = resolve('.work/8h-build/evidence');
const run = process.argv[2] || 'mecha';
if (!/^[a-z0-9-]+$/i.test(run)) throw new Error('Invalid run name');
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find(item => item.type === 'page' && item.url.startsWith('http://127.0.0.1:5173/'));
if (!target) throw new Error('Owned local QA page unavailable');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', bad, { once: true }); });
let next = 0; const pending = new Map();
socket.addEventListener('message', event => { const message = JSON.parse(event.data), entry = pending.get(message.id); if (!entry) return; pending.delete(message.id); if (message.error) entry.bad(new Error(JSON.stringify(message.error))); else entry.ok(message.result); });
function cdp(method, params = {}) { return new Promise((ok, bad) => { const id = ++next; pending.set(id, { ok, bad }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), type: 'controlled-live-renderer-lighting-and-anchor-observation', limitations: ['Actor placement and lighting are a constructed QA scene; this is not a natural combat progression', 'No audio listening judgment'], scenes: [] };
try {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await evaluate(`(async()=>{const main=await import(new URL('src/main.js',location.href));main.audio.setMuted(true);localStorage.setItem('skywind.muted.v1','true');const {screenToWorld,enemyMuzzles}=await import(new URL('src/game.js',location.href));const {getMechaSpec}=await import(new URL('src/mecha-art.js',location.href));const g=main.game;g.mode='title';main.start();g.mode='playing';main.setPaused(true);document.getElementById('pause-screen').hidden=true;g.phase='normal';g.boss=null;g.enemyBullets=[];g.bullets=[];g.pickups=[];g.events=[];g.shake=0;Object.assign(g.player,screenToWorld(g,{x:240,y:440}));g.enemies=['beetle'].map((type,index)=>{const position=screenToWorld(g,{x:890+index*100,y:300+index*100});const e={id:99000+index,type,...position,baseY:position.y,radius:26,hp:8,maxHp:8,angle:.14,artAngle:.14,age:1,phase:0,fireCooldown:1,telegraph:.65,chargeTime:.3,chargeDuration:.8,locked:true,attackName:'aim',attackAngle:Math.PI,armorOpen:false,fireFlash:.12};const spec=getMechaSpec(e);if(!spec)throw new Error('Representative not registered');e.muzzles=enemyMuzzles(e);return e;});if(g.player.hp!==100)throw new Error('Clean start fixture required');return {roles:g.enemies.map(e=>e.type)}})()`);
  for (const [lighting, night] of [['day', 0], ['night', 1]]) {
    const state = await evaluate(`(async()=>{const {game:g,renderer:r,audio}=await import(new URL('src/main.js',location.href));const {getMechaSpec,mechaAnchorWorld}=await import(new URL('src/mecha-art.js',location.href));g.night=${night};g.daylight=${1 - night};r.draw(g,0);return{night:g.night,audioMuted:audio.muted,actors:g.enemies.map(e=>{const s=getMechaSpec(e);return{role:e.type,key:s.key,state:s.state,width:s.displayWidth,weakpointEnabled:s.weakpointEnabled,pivot:s.pivot,muzzles:e.muzzles,nozzles:s.runtimeNozzles.map(p=>mechaAnchorWorld(e,p)),core:s.runtimeCore&&mechaAnchorWorld(e,s.runtimeCore),renderLoaded:Boolean(r.mechaFrames[s.filename])}})}})()`);
    if (!state.audioMuted || !state.actors.every(actor => actor.renderLoaded)) throw new Error('Quiet loaded-model scene not ready');
    const filename = `${run}-controlled-${lighting}.png`;
    await saveEvidenceScreenshot(cdp, output, filename);
    report.scenes.push({ lighting, filename, state });
  }
  report.success = true;
} catch (error) { report.success = false; report.error = String(error.stack || error); }
await writeFile(resolve(output, `${run}-scenes.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2)); socket.close(); if (!report.success) process.exitCode = 1;
