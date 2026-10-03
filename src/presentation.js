import { getWeaponStatus, getPickupEffect, worldToScreen } from './game.js';

// Shared display colors only; firing rules and projectile geometry live in game.js.
export const WEAPON_PRESENTATION = Object.freeze(Object.fromEntries([
  ['normal','#78E8FF','#DEF9FF'],
  ['spread','#FFD45A','#FFF0C2'],
  ['lance','#FF644B','#FFE2D9'],
  ['helix','#6F8BFF','#E0E6FF'],
  ['drone','#73F2AF','#DEFFEB'],
].map(([mode,color,core])=>[mode,Object.freeze({color,core,rgb:Object.freeze([1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255))})])));

// A: flare/core. B: luminous corona. C: corona with overlapping outer light restrained.
export const THREAT_VARIANTS = Object.freeze(['A','B','C']);
export const DEFAULT_THREAT_VARIANT = 'C';

// HUD values are projections of simulation state, never a second set of timers.
export const SUPPLY_COLORS = Object.freeze({maintain:'#FFD46B',change:'#70BCFF',heal:'#A4F2BA'});
export const WEAPON_NAMES = Object.freeze({normal:'TWIN CANNON',spread:'SPREAD',lance:'LANCE',helix:'HELIX'});
export function pickupPresentation(item,player) {
  const outcome=getPickupEffect(player,item),action=outcome.action;
  const level=Math.max(1,Math.min(5,player.basicLevel||1));
  const seconds=value=>value>0&&value<.1?'<0.1':String(Math.round(value*10)/10);
  const effect=action==='change'?`SWAP · ${WEAPON_NAMES[outcome.weaponMode]||'WEAPON'} ${seconds(outcome.powerTime)}s`
    :action==='extend'?outcome.powerTimeDelta>0?`EXTEND +${seconds(outcome.powerTimeDelta)}s`:`MAX ${seconds(outcome.powerTime)}s`
    :action==='levelUp'?`BASE Lv.${level} → ${outcome.basicLevel}`
    :action==='drone'?`DRONE ${seconds(outcome.droneTime)}s`
    :action==='heal'?outcome.hp>player.hp?`HP +${seconds(outcome.hp-player.hp)}`:'FULL HP':action.toUpperCase();
  return {...outcome,color:SUPPLY_COLORS[outcome.colorGroup],effect,mode:outcome.weaponMode,
    glow:outcome.colorGroup==='change'?'supplyChange':outcome.colorGroup==='maintain'?'supplyMaintain':'green',
    shortEffect:action==='change'?`${WEAPON_NAMES[outcome.weaponMode]} ${seconds(outcome.powerTime)}s`:action==='levelUp'?`Lv.${level} → ${outcome.basicLevel}`:effect};
}
export function supplyPresentation(item, player) {
  if(!item || !['preview','active'].includes(item.status))return null;
  const pickup=pickupPresentation(item,player);
  const remaining=Math.max(0,item.remaining||0);
  return {...pickup,id:item.id,side:item.side,remaining,
    label:`${item.side==='top'?'↑':'↓'} ${pickup.effect} · ${remaining.toFixed(1)}s`,
    phase:item.status==='preview'?'APPROACH':'COLLECT',gauge:Math.min(1,remaining/(item.status==='preview'?3:2.1))};
}

export function gameViewport(width,height) {
  const w=Math.min(width,height*16/9),h=w*9/16;
  return {width:w,height:h,left:(width-w)/2,top:(height-h)/2,
    size:w>=1280?'large':w>=800?'medium':'small',compact:w<640,short:h<300};
}

// Pilot-adjacent HUD geometry uses CSS pixels from the actual 16:9 image.
// No combat state, timer, random source or device-dependent rule is involved.
export function hudLayout(width,height) {
  const view=gameViewport(width,height),pilotWidth=Math.min(362,Math.max(96,view.width*362/1920));
  const left=pilotWidth+(view.compact?8:12),top=view.height*32/1080;
  const available=Math.max(0,view.width-left-(view.compact?50:16));
  const preferred=view.compact?230:view.size==='small'?248:view.size==='medium'?274:294;
  return {left,top,width:Math.min(preferred,available),pilotWidth,
    healthWidth:view.compact?54:76,gap:view.compact?8:12,
    iconWidth:view.compact?14:20,timerWidth:view.compact?36:50};
}

// Presentation only: use the same projected core as the Canvas and QA helper.
// The 80px envelope covers the 106px ship sprite, rotation and shake margin;
// it is unrelated to the physical hit radius and never changes simulation.
export function pilotClearance(game,width,height) {
  const view=gameViewport(width,height),layout=hudLayout(width,height),scale=view.width/1280;
  const panel={left:0,top:layout.top,right:layout.pilotWidth,bottom:layout.top+layout.pilotWidth*108/362};
  const epsilon=1e-7; // World/screen round trips must retain exact visual contact.
  const intersects=(point,radius)=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&
    point.x+radius>=panel.left-epsilon&&point.x-radius<=panel.right+epsilon&&
    point.y+radius>=panel.top-epsilon&&point.y-radius<=panel.bottom+epsilon;
  const project=point=>{const p=worldToScreen(game,point);return {x:p.x*scale,y:p.y*scale};};
  const active=game.mode==='playing'||game.mode==='entering',core=project(game.player),inner=80*scale;
  const coreClear=active&&intersects(core,inner);
  const threatClear=active&&(game.enemyBullets||[]).some(b=>{
    if(b.dead||b.life<=0)return false;
    const p=project(b),radius=Math.max(1,(b.radius||0)*scale);
    if(p.x+radius<0||p.x-radius>view.width||p.y+radius<0||p.y-radius>view.height)return false;
    return intersects(p,radius);
  });
  return {occluded:coreClear||threatClear,coreClear,threatClear,
    x:core.x-panel.left,y:core.y-panel.top,inner,outer:inner+8*scale};
}

export function tensionPresentation(time,duration=2) {
  const remaining=Math.max(0,Math.min(duration,time||0));
  return {active:remaining>0,remaining,gauge:remaining/duration,label:remaining>0?`${remaining.toFixed(1)}s`:'GRAZE TO CHARGE'};
}

export function healthPresentation(player) {
  const maximum=Math.max(1,Number(player.maxHp)||100);
  const hp=Math.max(0,Math.min(maximum,Number(player.hp)||0)),gauge=hp/maximum;
  const state=gauge<=.3?'critical':gauge<=.55?'warning':'stable';
  return {hp,maximum,gauge,state,value:String(Math.ceil(hp)),
    label:state==='critical'?'LOW HP':state==='warning'?'CAUTION':'HP',
    color:state==='critical'?'#FF8099':state==='warning'?'#FFE084':'#A4F2BA'};
}

export function weaponPresentation(player) {
  const weapon=getWeaponStatus(player),level=weapon.level||player.basicLevel||1;
  const special=weapon.remaining>0;
  const seconds=value=>`${(Math.ceil(value*10)/10).toFixed(1)}s`;
  return {...weapon,level,special,name:WEAPON_NAMES[weapon.mode],
    time:special?seconds(weapon.remaining):level===5?'MAX':`Lv.${level}`,
    warning:special&&weapon.remaining<=3,
    gauge:special?Math.min(1,Math.max(0,weapon.gauge)):level/5,
    growth:`BASE Lv.${level}${level===5?' · MAX':''}`,
    drone:weapon.drone?{...weapon.drone,time:seconds(weapon.drone.remaining),warning:weapon.drone.remaining<=3}:null};
}
