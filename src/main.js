import { createGame, startGame, updateGame, consumeEvents, getWeaponStatus } from './game.js';
import { Renderer } from './renderer.js';
import { AudioDirector } from './audio.js';
import { WEAPON_PRESENTATION } from './presentation.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
export const game = createGame(74912);
export const renderer = new Renderer(canvas);
export const audio = new AudioDirector();
let ready = false, paused = false, best = 0, recordBeforeRun = 0;
let noticeTime = 0, previousMode = 'loading', lastStage = 1, lastFrame = 0;
let pointer = null, pointerHeld = false, touchFire = false, joystickPointer = null;
const joystickInput = {x:0,y:0};
const keys = new Set();
const formatScore = value => Math.floor(value).toString().padStart(6,'0');
const weaponLabels = { normal:'TWIN CANNON', spread:'SPREAD ×5', lance:'PHOTON LANCE', helix:'HELIX DRIVER' };
const weaponIcons = {
  normal:'M3 7H21M3 17H21',
  spread:'M3 12L21 3M3 12L21 8M3 12H21M3 12L21 16M3 12L21 21',
  lance:'M2 12H22M8 7H20M8 17H20M18 9L22 12L18 15',
  helix:'M2 7C8 7 8 17 14 17S20 7 22 7M2 17C8 17 8 7 14 7S20 17 22 17',
};
try { best = Math.max(0, Number(localStorage.getItem('skywind.best.v1')) || 0); audio.setMuted(localStorage.getItem('skywind.muted.v1') === 'true'); } catch { /* Storage is optional in private/restricted browsers. */ }
$('title-best').querySelector('span').textContent = formatScore(best);

function refreshSoundButton() {
  document.body.classList.toggle('muted',audio.muted || !audio.ready);
  $('sound-button').setAttribute('aria-label',audio.muted || !audio.ready ? '음악 켜기' : '음악 끄기');
  $('sound-button').title = `${audio.muted || !audio.ready ? '음악 켜기' : '음악 끄기'} · M`;
}

async function unlockAudio() {
  await audio.unlock();
  refreshSoundButton();
}

function notice(text,duration=2.3) {
  $('notice').textContent=text;noticeTime=duration;$('notice').classList.add('show');
}

export function start() {
  if(!ready || (game.mode!=='title'&&game.mode!=='gameover'))return;
  unlockAudio();
  recordBeforeRun=best;renderer.reset();audio.resetEffects();startGame(game);paused=false;
  pointer=null;joystickInput.x=joystickInput.y=0;lastStage=1;noticeTime=0;
  $('notice').classList.remove('show');audio.setPaused(false);audio.setState('normal');
  canvas.focus({preventScroll:true});updateUI();
}

export function setPaused(value) {
  if(game.mode!=='playing'&&game.mode!=='entering')return;
  paused=value;keys.clear();pointerHeld=false;touchFire=false;pointer=null;
  joystickInput.x=joystickInput.y=0;$('joystick-knob').style.transform='';
  audio.setPaused(paused);$('pause-screen').hidden=!paused;
  $('pause-button').setAttribute('aria-label',paused?'계속하기':'일시정지');
  if(!paused)canvas.focus({preventScroll:true});
}

function toTitle() {
  const sceneTime=game.sceneTime,altitude=game.altitude,scrollTime=game.scrollTime;
  Object.assign(game,createGame(74912));game.sceneTime=sceneTime;game.altitude=altitude;game.scrollTime=scrollTime;
  renderer.reset();audio.resetEffects();paused=false;keys.clear();pointer=null;pointerHeld=false;touchFire=false;
  noticeTime=0;$('notice').classList.remove('show');
  audio.setPaused(false);audio.setState('title');$('title-best').querySelector('span').textContent=formatScore(best);
  updateUI();
}

function finish() {
  noticeTime=0;$('notice').classList.remove('show');
  best=Math.max(best,game.score);
  try { localStorage.setItem('skywind.best.v1',String(best)); } catch { /* A run is still playable without storage. */ }
  $('final-score').textContent=formatScore(game.score);$('final-best').textContent=formatScore(best);
  $('new-record').hidden=game.score<=recordBeforeRun || game.score===0;
  keys.clear();pointerHeld=false;touchFire=false;audio.setState('ending');
}

function updateUI() {
  const active=game.mode==='playing'||game.mode==='entering';
  document.body.classList.toggle('in-game',active);
  $('title-screen').hidden=game.mode!=='title';$('gameover-screen').hidden=game.mode!=='gameover';
  $('pause-screen').hidden=!paused;$('hud').hidden=!active;$('touch-controls').hidden=!active&&game.mode!=='title';
  $('energy-fill').style.width=`${game.player.hp}%`;
  $('energy-fill').style.background=game.player.hp<=30?'#ff728b':game.player.hp<=55?'#e8dc75':'#82ee75';
  $('hp-value').textContent=String(game.player.hp);$('score').textContent=formatScore(game.score);
  $('combo').textContent=game.combo>1?`×${Math.min(5,1+Math.floor(game.combo/8))}  ${game.combo} CHAIN`:'';
  const weapon=getWeaponStatus(game.player), row=$('weapon-row');
  row.style.setProperty('--weapon-color',WEAPON_PRESENTATION[weapon.mode].color);
  $('drone-row').style.setProperty('--weapon-color',WEAPON_PRESENTATION.drone.color);
  if(row.dataset.mode!==weapon.mode){row.dataset.mode=weapon.mode;$('weapon-icon').setAttribute('d',weaponIcons[weapon.mode]);$('weapon-name').textContent=weaponLabels[weapon.mode];}
  $('weapon-time').textContent=weapon.remaining>0?`${(Math.ceil(weapon.remaining*10)/10).toFixed(1)}s`:'∞';
  $('weapon-time').setAttribute('aria-label',weapon.remaining>0?'무기 남은 시간':'기본 무기, 시간 제한 없음');
  $('weapon-gauge').style.transform=`scaleX(${weapon.remaining>0?weapon.gauge:1})`;
  row.dataset.warning=String(weapon.remaining>0&&weapon.remaining<=3);
  row.dataset.fresh=String(weapon.remaining>13.3);
  row.style.setProperty('--warning-opacity',String(.7+Math.sin(game.time*4)*.2));
  $('drone-row').hidden=!weapon.drone;
  if(weapon.drone){
    $('drone-time').textContent=`${(Math.ceil(weapon.drone.remaining*10)/10).toFixed(1)}s`;
    $('drone-gauge').style.transform=`scaleX(${weapon.drone.gauge})`;
    $('drone-row').dataset.warning=String(weapon.drone.remaining<=3);
    $('drone-row').dataset.fresh=String(weapon.drone.remaining>14.3);
  }
  $('boss-hud').hidden=!game.boss || !active;
  if(game.boss){$('boss-fill').style.width=`${100*game.boss.hp/game.boss.maxHp}%`;$('boss-hud').querySelector('span').textContent=game.boss.bossName;}
  if(previousMode!==game.mode){previousMode=game.mode;document.body.dataset.state=game.mode;}
}

function processEvents(events) {
  renderer.handleEvents(events);
  for(const event of events) {
    audio.playEvent(event);
    if(event.type==='pickup'&&event.pickupType==='health')notice(game.player.hp===100?'FULL HP':'ENERGY +30');
    if(event.type==='boss')notice(`${event.bossName||'WARDEN'} APPROACHING`,3);
    if(event.type==='bossDefeated')notice('SKY CLEAR',3);
    if(event.type==='gameover')finish();
  }
}

function chooseMusic() {
  if(game.mode==='title')return 'title';
  if(game.mode==='gameover')return 'ending';
  if(game.player.hp<=30)return 'danger';
  if(game.boss)return 'boss';
  if(game.player.powerTime>0||game.player.droneTime>0)return 'powerup';
  return 'normal';
}

function frame(now) {
  const dt=Math.min(.05,(now-lastFrame)/1000 || 0);lastFrame=now;
  if(ready && !paused) {
    const input={
      x:((keys.has('KeyD')||keys.has('ArrowRight'))?1:0)-((keys.has('KeyA')||keys.has('ArrowLeft'))?1:0)+joystickInput.x,
      y:((keys.has('KeyS')||keys.has('ArrowDown'))?1:0)-((keys.has('KeyW')||keys.has('ArrowUp'))?1:0)+joystickInput.y,
      shoot:keys.has('Space')||keys.has('KeyJ')||pointerHeld||touchFire,
      pointer:pointerHeld&&pointer?renderer.screenToWorld(pointer.x,pointer.y):null,
    };
    updateGame(game,dt,input);processEvents(consumeEvents(game));
    if(game.stage!==lastStage){lastStage=game.stage;if(!game.boss)notice(`SECTOR ${String(game.stage).padStart(2,'0')}`,2);}
    if(noticeTime>0){noticeTime-=dt;if(noticeTime<=0)$('notice').classList.remove('show');}
    audio.setState(chooseMusic());renderer.draw(game,dt);updateUI();
  } else if(ready && paused) renderer.draw(game,0);
  requestAnimationFrame(frame);
}

$('start-button').addEventListener('click',start);
$('restart-button').addEventListener('click',start);
$('title-button').addEventListener('click',toTitle);
$('pause-button').addEventListener('click',()=>setPaused(!paused));
$('resume-button').addEventListener('click',()=>setPaused(false));

async function toggleSound() {
  if(!audio.ready){audio.setMuted(false);await unlockAudio();}
  else audio.setMuted(!audio.muted);
  try {localStorage.setItem('skywind.muted.v1',String(audio.muted));} catch { /* Optional preference. */ }
  refreshSoundButton();
}
async function toggleFullscreen() {
  try { if(document.fullscreenElement)await document.exitFullscreen();else await $('game-shell').requestFullscreen(); }
  catch {notice('전체 화면은 이 브라우저에서 지원되지 않습니다');}
}
$('sound-button').addEventListener('click',toggleSound);
$('fullscreen-button').addEventListener('click',toggleFullscreen);

window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','KeyJ','KeyP','KeyM','KeyF','Escape'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='KeyM'){toggleSound();return;}
  if(e.code==='KeyF'){toggleFullscreen();return;}
  if(e.code==='KeyP'||e.code==='Escape'){setPaused(!paused);return;}
  if(e.code==='Space'||e.code==='KeyJ'){if(game.mode==='title'||game.mode==='gameover')start();}
  keys.add(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{if(ready)setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPaused(true);});

canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0 || e.pointerType==='touch')return;
  if(game.mode==='title'||game.mode==='gameover')start();
  if(paused)return;
  pointerHeld=true;pointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{if(pointerHeld)pointer={x:e.clientX,y:e.clientY};});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{pointerHeld=false;pointer=null;});

const shot=$('shot-button');
shot.addEventListener('pointerdown',e=>{e.preventDefault();if(game.mode==='title')start();if(!paused){touchFire=true;shot.setPointerCapture(e.pointerId);}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])shot.addEventListener(event,()=>{touchFire=false;});
const stick=$('joystick');
function moveStick(e) {
  if(e.pointerId!==joystickPointer)return;
  const r=stick.getBoundingClientRect(),limit=r.width*.36;
  let x=(e.clientX-r.left-r.width/2)/limit,y=(e.clientY-r.top-r.height/2)/limit;
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  joystickInput.x=x;joystickInput.y=y;$('joystick-knob').style.transform=`translate(${x*limit}px,${y*limit}px)`;
}
stick.addEventListener('pointerdown',e=>{e.preventDefault();joystickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
stick.addEventListener('pointermove',moveStick);
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,()=>{joystickPointer=null;joystickInput.x=joystickInput.y=0;$('joystick-knob').style.transform='';});

refreshSoundButton();
renderer.load((loaded,total)=>{$('loading-text').textContent=`하늘을 준비하고 있습니다 · ${loaded} / ${total}`;}).then(()=>{
  ready=true;$('loading').hidden=true;window.dispatchEvent(new Event('skywind-ready'));updateUI();requestAnimationFrame(frame);
}).catch(error=>{window.dispatchEvent(new Event('skywind-load-error'));$('loading-text').textContent=error.message;$('retry-loading').hidden=false;$('loading').querySelector('i').hidden=true;console.error(error);});
