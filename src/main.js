import { createGame, startGame, updateGame, consumeEvents } from './game.js';
import { Renderer } from './renderer.js';
import { AudioDirector } from './audio.js';
import { WEAPON_PRESENTATION, WEAPON_NAMES, supplyPresentation, tensionPresentation, healthPresentation, weaponPresentation, gameViewport, hudLayout, pilotClearance } from './presentation.js';
import { PilotUI } from './pilot-ui.js';
import { LEVEL_RULES } from './level.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
export const game = createGame(74912);
export const renderer = new Renderer(canvas);
export const audio = new AudioDirector();
const pilot = new PilotUI($('pilot-hud'));
let ready = false, paused = false, best = 0, recordBeforeRun = 0;
let noticeTime = 0, weaponFeedbackTime = 0, previousMode = 'loading', lastStage = 1, lastFrame = 0;
let lastPilotFrame = 0;
let hudView={width:1280,height:720};
let pointer = null, pointerHeld = false, touchFire = false, touchFirePointer = null, joystickPointer = null;
const joystickInput = {x:0,y:0};
const keys = new Set();
const formatScore = value => Math.floor(value).toString().padStart(6,'0');
const weaponLabels = WEAPON_NAMES;
const weaponIcons = {
  normal:'M3 7H21M3 17H21',
  spread:'M3 12L21 3M3 12L21 8M3 12H21M3 12L21 16M3 12L21 21',
  lance:'M2 12H22M8 7H20M8 17H20M18 9L22 12L18 15',
  helix:'M2 7C8 7 8 17 14 17S20 7 22 7M2 17C8 17 8 7 14 7S20 17 22 17',
};
try { best = Math.max(0, Number(localStorage.getItem('skywind.best.v2')) || 0); audio.setMuted(localStorage.getItem('skywind.muted.v1') === 'true'); } catch { /* Storage is optional in private/restricted browsers. */ }
$('title-best').querySelector('span').textContent = formatScore(best);

function refreshSoundButton() {
  document.body.classList.toggle('muted',audio.muted || !audio.ready);
  $('sound-button').setAttribute('aria-label',audio.muted || !audio.ready ? '사운드 켜기' : '사운드 끄기');
  $('sound-button').title = `${audio.muted || !audio.ready ? '사운드 켜기' : '사운드 끄기'} · M`;
  $('pause-sound').textContent=audio.muted||!audio.ready?'사운드 켜기':'사운드 끄기';
}

function resizeHUD() {
  const shell=$('game-shell'),ui=$('game-ui'),view=gameViewport(shell.clientWidth,shell.clientHeight);
  hudView=view;
  for(const name of ['width','height','left','top'])ui.style[name]=`${view[name]}px`;
  ui.dataset.size=view.size;ui.dataset.compact=String(view.compact);ui.dataset.short=String(view.short);
  ui.style.setProperty('--game-width',`${view.width}px`);
  const layout=hudLayout(view.width,view.height);
  for(const [name,value] of Object.entries(layout))ui.style.setProperty(`--hud-${name}`,`${value}px`);
  pilot.scale=Math.min(1,Math.max(96,view.width*362/1920)/362);
}
new ResizeObserver(resizeHUD).observe($('game-shell'));
resizeHUD();

function clearInput() {
  keys.clear();pointerHeld=false;touchFire=false;touchFirePointer=null;pointer=null;joystickPointer=null;
  joystickInput.x=joystickInput.y=0;$('joystick-knob').style.transform='';
}

function newRunSeed() {
  const seed=new Uint32Array(1);crypto.getRandomValues(seed);return seed[0];
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
  recordBeforeRun=best;renderer.reset();audio.resetEffects();clearInput();startGame(game,newRunSeed());paused=false;
  pilot.reset();pilot.update(game,0);lastPilotFrame=performance.now();
  pointer=null;joystickInput.x=joystickInput.y=0;lastStage=1;noticeTime=0;weaponFeedbackTime=0;
  $('notice').classList.remove('show');audio.setPaused(false);audio.setState('normal');
  canvas.focus({preventScroll:true});updateUI();
}

export function setPaused(value) {
  if(game.mode!=='playing'&&game.mode!=='entering')return;
  if(paused===value)return;
  paused=value;clearInput();game.player.vx=game.player.vy=0;
  audio.setPaused(paused);$('pause-screen').hidden=!paused;
  $('pause-button').setAttribute('aria-label',paused?'계속하기':'일시정지');
  if(!paused){lastFrame=lastPilotFrame=performance.now();canvas.focus({preventScroll:true});}
  updateUI();
}

function toTitle() {
  const sceneTime=game.sceneTime,altitude=game.altitude,scrollTime=game.scrollTime;
  Object.assign(game,createGame(74912));game.sceneTime=sceneTime;game.altitude=altitude;game.scrollTime=scrollTime;
  renderer.reset();audio.resetEffects();paused=false;clearInput();
  pilot.reset();pilot.update(game,0);lastPilotFrame=performance.now();
  noticeTime=0;weaponFeedbackTime=0;$('notice').classList.remove('show');
  audio.setPaused(false);audio.setState('title');$('title-best').querySelector('span').textContent=formatScore(best);
  updateUI();
}

function finish() {
  noticeTime=0;$('notice').classList.remove('show');
  best=Math.max(best,game.score);
  try { localStorage.setItem('skywind.best.v2',String(best)); } catch { /* A run is still playable without storage. */ }
  $('final-score').textContent=formatScore(game.score);$('final-best').textContent=formatScore(best);
  $('new-record').hidden=game.score<=recordBeforeRun || game.score===0;
  const seconds=Math.floor(game.time);$('run-summary').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} SURVIVED · ${game.bossesDefeated} BOSS CLEAR`;
  clearInput();audio.setState('ending');
}

function updateUI() {
  const active=game.mode==='playing'||game.mode==='entering';
  const clearance=pilotClearance(game,hudView.width,hudView.height),pilotHUD=$('pilot-hud');
  pilotHUD.dataset.occluded=String(clearance.occluded);
  pilotHUD.dataset.coreClear=String(clearance.coreClear);
  for(const name of ['x','y','inner','outer'])pilotHUD.style.setProperty(`--pilot-clear-${name}`,`${clearance[name]}px`);
  const compact=$('game-ui').dataset.compact==='true';
  const dense=$('game-ui').dataset.size==='small';
  document.body.classList.toggle('in-game',active);
  $('title-screen').hidden=game.mode!=='title';$('gameover-screen').hidden=game.mode!=='gameover';
  $('pause-screen').hidden=!paused;$('hud').hidden=!active;
  $('touch-controls').hidden=paused||(!active&&game.mode!=='title');
  $('cycle-label').textContent=game.difficulty.hell?`HELL ${String(Math.max(1,game.cycle-5)).padStart(2,'0')}`:`STAGE ${String(Math.min(5,game.cycle||1)).padStart(2,'0')}`;
  const phaseRemaining=Math.max(0,LEVEL_RULES.normalDuration-(game.normalTime||0));
  $('phase-label').textContent=game.phase==='boss-entry'?'INCOMING':game.phase==='boss'?'BOSS':`${game.normalTime>=42?'BOSS ':''}${phaseRemaining.toFixed(1)}s`;
  const health=healthPresentation(game.player),healthBlock=$('health-block');
  healthBlock.dataset.state=health.state;$('hud').dataset.health=health.state;
  $('hud').style.setProperty('--hp-color',health.color);
  $('energy-fill').style.width=`${100*health.gauge}%`;
  $('energy-fill').style.background=health.color;
  $('hp-value').textContent=health.value;$('hp-max').textContent=`/ ${health.maximum}`;
  $('hp-state').textContent=health.label;
  const healthMeter=healthBlock.querySelector('.energy-track');
  healthMeter.setAttribute('aria-valuemax',String(health.maximum));healthMeter.setAttribute('aria-valuenow',String(health.hp));
  healthBlock.setAttribute('aria-label',`${health.label} ${health.value} / ${health.maximum}`);
  $('score').textContent=formatScore(game.score);
  $('combo').textContent=game.combo>1?`×${Math.min(5,1+Math.floor(game.combo/8))}  ${game.combo} CHAIN`:'';
  const weapon=weaponPresentation(game.player), row=$('weapon-row');
  row.style.setProperty('--weapon-color',WEAPON_PRESENTATION[weapon.mode].color);
  $('drone-row').style.setProperty('--weapon-color',WEAPON_PRESENTATION.drone.color);
  if(row.dataset.mode!==weapon.mode){row.dataset.mode=weapon.mode;$('weapon-icon').setAttribute('d',weaponIcons[weapon.mode]);}
  $('weapon-name').textContent=compact&&weapon.mode==='normal'?'TWIN':weaponLabels[weapon.mode];
  $('weapon-name').title=weaponLabels[weapon.mode];
  const level=weapon.level||game.player.basicLevel||1;
  $('weapon-time').textContent=weapon.time;
  $('weapon-time').setAttribute('aria-label',weapon.remaining>0?'무기 남은 시간':'기본 무기, 시간 제한 없음');
  $('weapon-gauge').style.width=weapon.special?'100%':`${100*weapon.gauge}%`;
  $('weapon-gauge').style.transform=`scaleX(${weapon.special?weapon.gauge:1})`;
  row.dataset.warning=String(weapon.warning);row.dataset.special=String(weapon.special);
  row.setAttribute('aria-label',`${weapon.name}, ${weapon.time}${weapon.warning?', 종료 임박':''}`);
  row.dataset.fresh=String(weaponFeedbackTime>0);
  row.style.setProperty('--warning-opacity',String(.7+Math.sin(game.time*4)*.2));
  $('drone-row').hidden=!weapon.drone;
  if(weapon.drone){
    $('drone-name').textContent=compact?'DRONE':'DRONE ×2';
    $('drone-time').textContent=weapon.drone.time;
    $('drone-row').setAttribute('aria-label',`독립 드론 2기, ${weapon.drone.time}${weapon.drone.warning?', 종료 임박':''}`);
    $('drone-gauge').style.transform=`scaleX(${weapon.drone.gauge})`;
    $('drone-row').dataset.warning=String(weapon.drone.warning);
    $('drone-row').dataset.fresh=String(weapon.drone.remaining>14.3);
  }
  $('base-level').textContent=dense?`BASE ${level}/5`:weapon.growth;
  $('base-level').setAttribute('aria-label',weapon.growth);
  $('base-level').hidden=false;$('base-level').dataset.max=String(level===5);
  const tension=tensionPresentation(game.tensionTime,game.tensionDuration);
  $('tension-row').dataset.active=String(tension.active);
  $('tension-row').dataset.fresh=String(tension.active&&tension.remaining>1.82);
  $('tension-label').textContent=tension.active&&!dense?'TENSION UP':'TENSION';
  $('tension-time').textContent=tension.active?tension.label:'GRAZE';
  $('tension-row').setAttribute('aria-label',tension.active?`텐션 강화 ${tension.label}`:'근접 비행으로 텐션 활성화');
  $('tension-gauge').style.transform=`scaleX(${tension.gauge})`;
  $('supply-hud').hidden=!active;
  for(const side of ['top','bottom']) {
    const element=$(`supply-${side}`),item=game.supply?.items.find(item=>item.side===side);
    const supply=supplyPresentation(item,game.player);element.hidden=!supply;
    if(supply){
      element.dataset.phase=item.status;element.dataset.action=supply.action;
      element.dataset.colorGroup=supply.colorGroup;element.style.setProperty('--supply-color',supply.color);
      element.setAttribute('aria-label',supply.label);
      element.querySelector('.supply-copy').textContent=supply.effect;
      element.querySelector('.supply-time').textContent=`${supply.remaining.toFixed(1)}s`;
      element.querySelector('.supply-icon path').setAttribute('d',supply.action==='change'?weaponIcons[supply.mode]||weaponIcons.normal:supply.action==='extend'?'M12 3a9 9 0 1 0 9 9M12 6v6l4 2M18 2v6M15 5h6':supply.action==='drone'?'M2 7L7 2L12 7L7 12ZM12 17L17 12L22 17L17 22Z':'M12 5v14M5 12h14');
      element.querySelector('.supply-phase').textContent=`${side==='top'?'↑':'↓'} ${supply.phase}`;
      element.querySelector('.supply-label b').style.transform=`scaleX(${supply.gauge})`;
    }
  }
  $('boss-hud').hidden=!game.boss || !active;
  if(game.boss){$('boss-fill').style.width=`${100*game.boss.hp/game.boss.maxHp}%`;$('boss-hud').querySelector('span').textContent=game.boss.bossName;}
  if(previousMode!==game.mode){previousMode=game.mode;document.body.dataset.state=game.mode;}
}

function processEvents(events) {
  renderer.handleEvents(events);
  for(const event of events) {
    audio.playEvent(event);
    if(event.type==='pickup'&&['change','extend','levelUp'].includes(event.effect))weaponFeedbackTime=.7;
    if(event.type==='pickup'&&event.pickupType==='health')notice(game.player.hp===game.player.maxHp?'FULL HP':`ENERGY +${event.effectiveHeal??event.rawHeal??30}`);
    if(event.type==='bossWarning')notice(`${event.bossName||'WARDEN'} INCOMING`,3);
    if(event.type==='boss')notice(`${event.bossName||'WARDEN'} APPROACHING`,3);
    if(event.type==='bossDefeated')notice(event.hell?'HELL / ENDURE':`STAGE ${Math.min(5,event.cycle||game.cycle)} / SKY CLEAR`,3);
    if(event.type==='charge'&&event.boss&&event.bossKind==='bastion'&&event.routeLanes?.length) {
      const labels=event.routeLanes.map(y=>y<300?'UP':y>420?'LOW':'MID');
      notice(`GATES: ${labels.join(' > ')}`,Math.min(2,event.duration+0.35));
    }
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
  // HUD effects keep real durations even when the expensive background drops frames.
  const pilotDt=Math.max(0,(now-lastPilotFrame)/1000 || 0);lastPilotFrame=now;
  // The game owns fixed 1/120s collision steps. Keep legitimate 10–20Hz frames
  // in game time too; a resume explicitly resets lastFrame above.
  const dt=Math.min(.12,(now-lastFrame)/1000 || 0);lastFrame=now;
  if(ready && !paused) {
    const input={
      x:((keys.has('KeyD')||keys.has('ArrowRight'))?1:0)-((keys.has('KeyA')||keys.has('ArrowLeft'))?1:0)+joystickInput.x,
      y:((keys.has('KeyS')||keys.has('ArrowDown'))?1:0)-((keys.has('KeyW')||keys.has('ArrowUp'))?1:0)+joystickInput.y,
      shoot:keys.has('Space')||keys.has('KeyJ')||pointerHeld||touchFire,
      pointer:pointerHeld&&pointer?renderer.screenToWorld(pointer.x,pointer.y):null,
    };
    weaponFeedbackTime=Math.max(0,weaponFeedbackTime-dt);
    updateGame(game,dt,input);const events=consumeEvents(game);processEvents(events);pilot.update(game,pilotDt,events);
    if(game.stage!==lastStage){lastStage=game.stage;}
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
$('pause-sound').addEventListener('click',toggleSound);
$('pause-fullscreen').addEventListener('click',toggleFullscreen);

window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','KeyJ','KeyP','KeyM','KeyF','Escape'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='KeyM'){toggleSound();return;}
  if(e.code==='KeyF'){toggleFullscreen();return;}
  if(e.code==='KeyP'||e.code==='Escape'){setPaused(!paused);return;}
  if(e.code==='Space'||e.code==='KeyJ'){if(game.mode==='title'||game.mode==='gameover')start();}
  if(!paused)keys.add(e.code);
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
shot.addEventListener('pointerdown',e=>{
  e.preventDefault();if(game.mode==='title'||game.mode==='gameover')start();
  if(!paused&&touchFirePointer===null){touchFire=true;touchFirePointer=e.pointerId;shot.setPointerCapture(e.pointerId);}
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])shot.addEventListener(event,e=>{
  if(e.pointerId===touchFirePointer){touchFire=false;touchFirePointer=null;}
});
const stick=$('joystick');
function moveStick(e) {
  if(e.pointerId!==joystickPointer)return;
  const r=stick.getBoundingClientRect(),limit=r.width*.36;
  let x=(e.clientX-r.left-r.width/2)/limit,y=(e.clientY-r.top-r.height/2)/limit;
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  joystickInput.x=x;joystickInput.y=y;$('joystick-knob').style.transform=`translate(${x*limit}px,${y*limit}px)`;
}
stick.addEventListener('pointerdown',e=>{e.preventDefault();if(paused||joystickPointer!==null)return;joystickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
stick.addEventListener('pointermove',moveStick);
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{
  if(e.pointerId===joystickPointer){joystickPointer=null;joystickInput.x=joystickInput.y=0;$('joystick-knob').style.transform='';}
});

refreshSoundButton();
Promise.all([renderer.load((loaded,total)=>{$('loading-text').textContent=`하늘을 준비하고 있습니다 · ${loaded} / ${total}`;}),pilot.load()]).then(()=>{
  ready=true;$('loading').hidden=true;window.dispatchEvent(new Event('skywind-ready'));updateUI();requestAnimationFrame(frame);
}).catch(error=>{window.dispatchEvent(new Event('skywind-load-error'));$('loading-text').textContent=error.message;$('retry-loading').hidden=false;$('loading').querySelector('i').hidden=true;console.error(error);});
