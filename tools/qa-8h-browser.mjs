// Native Chrome DevTools input checks. No packages, production writes or video.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { saveEvidenceScreenshot } from './qa-8h-capture.mjs';
const port = Number(process.env.SKYWIND_QA_CDP_PORT || 9230);
const base = process.env.SKYWIND_QA_URL || 'http://127.0.0.1:5173/';
const output = resolve('.work/8h-build/evidence');
const run = process.argv[2] || 'integration';
if (!/^[a-z0-9-]+$/i.test(run)) throw new Error('Invalid QA run name');
await mkdir(output, { recursive: true });
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find(item => item.type === 'page');
if (!target) throw new Error('QA Chrome page unavailable');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', bad, { once: true }); });
let nextId = 0;
const pending = new Map(), errors = [], requests = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const item = pending.get(message.id); pending.delete(message.id);
    if (message.error) item?.bad(new Error(JSON.stringify(message.error))); else item?.ok(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(item => item.description || item.value).join(' '));
  else if (message.method === 'Network.responseReceived') requests.push({ url: message.params.response.url, status: message.params.response.status });
  else if (message.method === 'Network.loadingFailed') requests.push({ error: message.params.errorText });
});
function cdp(method, params = {}) {
  return new Promise((ok, bad) => { const id = ++nextId; pending.set(id, { ok, bad }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
const delay = ms => new Promise(ok => setTimeout(ok, ms));
async function ready() {
  for (let index = 0; index < 100; index++) {
    if (await evaluate("document.getElementById('loading')?.hidden===true")) return;
    await delay(200);
  }
  throw new Error(await evaluate("document.getElementById('loading-text')?.textContent"));
}
async function snapshot() {
  return evaluate(`(async()=>{const {game,renderer,audio}=await import(new URL('src/main.js',location.href));
    const {getMechaSpec,mechaAnchorWorld}=await import(new URL('src/mecha-art.js',location.href));
    const gl=renderer.environment?.gl,ext=gl?.getExtension('WEBGL_debug_renderer_info');
    const box=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {hidden:e.hidden,x:r.x,y:r.y,width:r.width,height:r.height,text:e.innerText?.slice(0,180)}};
    return {url:location.href,viewport:{width:innerWidth,height:innerHeight},gameArea:box('game-ui'),title:box('title-screen'),pause:box('pause-screen'),touch:box('touch-controls'),pilot:box('pilot-hud'),
      mode:game.mode,time:game.time,normalTime:game.normalTime,phase:game.phase,stage:game.stage,cycle:game.cycle,bossesDefeated:game.bossesDefeated,hp:game.player.hp,
      player:{x:game.player.x,y:game.player.y,vx:game.player.vx,vy:game.player.vy},score:game.score,shots:game.bullets.length,enemyBullets:game.enemyBullets.length,
      weapon:document.getElementById('weapon-name').textContent,flight:document.getElementById('flight-status').textContent,
      models:game.enemies.map(enemy=>{const spec=getMechaSpec(enemy);if(!spec)return null;const expected=spec.runtimeMuzzles.map(anchor=>mechaAnchorWorld(enemy,anchor));return{role:enemy.type==='boss'?enemy.bossKind:enemy.type,key:spec.key,state:spec.state,weakpointEnabled:spec.weakpointEnabled,displayWidth:spec.displayWidth,renderLoaded:Boolean(renderer.mechaFrames?.[spec.filename]),angle:enemy.artAngle,muzzles:enemy.muzzles,expectedMuzzles:expected,maxMuzzleError:Math.max(0,...expected.map((point,index)=>Math.hypot(point.x-(enemy.muzzles?.[index]?.x??Infinity),point.y-(enemy.muzzles?.[index]?.y??Infinity))))}}).filter(Boolean),
      audio:{ready:audio.ready,muted:audio.muted,context:audio.context?.state,error:audio.error},
      webgl:{version:gl?.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER)}}})()`);
}
async function capture(name) {
  if (process.env.SKYWIND_QA_CAPTURE === '0') return;
  const filename = `${run}-${name}.png`;
  await saveEvidenceScreenshot(cdp, output, filename);
  report.screenshots.push(filename);
}
async function key(code, key, type = 'keyDown') {
  const number = { Space: 32, ArrowUp: 38, ArrowDown: 40, KeyP: 80, KeyM: 77 }[code];
  await cdp('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number });
}
async function tap(code, value) { await key(code, value); await key(code, value, 'keyUp'); }
async function click(id) {
  const point = await evaluate(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
async function viewport(width, height, mobile = false) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 3 });
  await delay(250);
}
const report = { startedAt: new Date().toISOString(), base, run, browser: await cdp('Browser.getVersion'), observations: [], screenshots: [], limitations: ['Chrome device emulation is not physical mobile hardware', 'Audio readiness is not a listening-quality judgment', 'Short native input checks do not prove human difficulty or enjoyment'] };
try {
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await viewport(1366, 768); await cdp('Page.navigate', { url: base }); await ready(); await delay(400);
  report.observations.push({ name: 'desktop-title', state: await snapshot() }); await capture('title');
  await click('start-button'); await delay(1500);
  const before = await snapshot(); assert.equal(before.mode, 'playing');
  await key('Space', ' '); await key('ArrowDown', 'ArrowDown'); await delay(150);
  const down = await snapshot(); assert.ok(down.player.y > before.player.y + 20, 'keyboard dodge responds');
  await key('ArrowDown', 'ArrowDown', 'keyUp'); await key('ArrowUp', 'ArrowUp'); await delay(150);
  const up = await snapshot(); assert.ok(up.player.vy < 0, 'keyboard direction reverses');
  await key('ArrowUp', 'ArrowUp', 'keyUp'); await delay(650);
  const shooting = await snapshot(); assert.ok(shooting.shots > 0, 'native shoot input creates projectiles');
  report.observations.push({ name: 'native-keyboard-response-fire', before, down, up, shooting });
  if (process.env.SKYWIND_QA_MODELS === '1') {
    const observedModels = [before, down, up, shooting].flatMap(state => state.models);
    assert.ok(observedModels.some(model => model.role === 'beetle' && model.renderLoaded), 'real representative PNG is loaded for an observed active enemy');
    assert.ok(observedModels.every(model => typeof model.maxMuzzleError === 'number' && model.maxMuzzleError < 1e-7), 'actual firing ports follow the shared rotated model projection');
  }
  await key('Space', ' ', 'keyUp');
  await capture('playing');
  await tap('KeyP', 'p'); const paused = await snapshot(); await delay(400); const pausedAfter = await snapshot();
  assert.equal(paused.time, pausedAfter.time); assert.equal(pausedAfter.pause.hidden, false);
  report.observations.push({ name: 'pause-keeps-game-clock', before: paused, after: pausedAfter });
  const muted = pausedAfter.audio.muted; await tap('KeyM', 'm'); await delay(100);
  assert.equal((await snapshot()).audio.muted, !muted);
  await tap('KeyM', 'm'); await tap('KeyP', 'p');
  const pointerStart = await snapshot(), area = pointerStart.gameArea;
  const point = { x: area.x + area.width * 0.30, y: area.y + area.height * Number(process.env.SKYWIND_QA_POINTER_Y || 0.30) };
  const hitTarget = await evaluate(`document.elementFromPoint(${point.x},${point.y})?.id`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }); await delay(350);
  const pointerHeld = await snapshot();
  report.observations.push({ name: 'native-pointer-move-fire', point, hitTarget, before: pointerStart, after: pointerHeld });
  assert.ok(pointerHeld.shots > 0); assert.ok(Math.abs(pointerHeld.player.y - pointerStart.player.y) > 5);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await viewport(width, height, true); await delay(100); const mobileBefore = await snapshot();
    const points = await evaluate("['joystick','shot-button'].map((id,index)=>{const r=document.getElementById(id).getBoundingClientRect();return{id:index+1,x:r.x+r.width/2,y:r.y+r.height/2+(index===0?r.height*.25:0),radiusX:4,radiusY:4,force:1}})");
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points }); await delay(400);
    const held = await snapshot(); assert.ok(held.shots > 0); assert.ok(held.player.y > mobileBefore.player.y + 20);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(180);
    const released = await snapshot(); assert.ok(Math.abs(released.player.vy) < 30, 'touch release brakes promptly');
    report.observations.push({ name: `emulated-native-multitouch-${width}x${height}`, before: mobileBefore, held, released }); await capture(`mobile-${width}x${height}`);
  }
  await tap('KeyP', 'p');
  report.success = true;
} catch (error) { report.success = false; report.failure = String(error.stack || error); }
report.endedAt = new Date().toISOString(); report.errors = errors;
report.requestCount = requests.length; report.failedRequests = requests.filter(item => item.error || item.status >= 400);
if (report.errors.length || report.failedRequests.length) report.success = false;
await writeFile(resolve(output, `${run}-browser.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ success: report.success, failure: report.failure, observations: report.observations.map(item => item.name), screenshots: report.screenshots, errors: report.errors, failedRequests: report.failedRequests, report: resolve(output, `${run}-browser.json`) }, null, 2));
socket.close();
if (!report.success) process.exitCode = 1;
