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
export const SUPPLY_COLORS = Object.freeze({top:'#FFD46B',bottom:'#78F4BA'});
export const WEAPON_NAMES = Object.freeze({normal:'TWIN CANNON',spread:'SPREAD',lance:'LANCE',helix:'HELIX'});
export function supplyPresentation(item, player) {
  if(!item || !['preview','active'].includes(item.status))return null;
  const level=Math.max(1,Math.min(5,player.basicLevel||1));
  const effect=item.type==='change'?WEAPON_NAMES[item.weaponMode]||'CHANGE':player.powerTime>0?'EXTEND +15s':level<5?`BASE Lv.${level} → ${level+1}`:'MAX · DRONE 15s';
  const remaining=Math.max(0,item.remaining||0);
  return {id:item.id,side:item.side,color:SUPPLY_COLORS[item.side],mode:item.type==='change'?item.weaponMode:'normal',effect,remaining,
    label:`${item.side==='top'?'↑':'↓'} ${effect} · ${remaining.toFixed(1)}s`,
    phase:item.status==='preview'?'APPROACH':'COLLECT',gauge:Math.min(1,remaining/(item.status==='preview'?3:2.1))};
}

export function gameViewport(width,height) {
  const w=Math.min(width,height*16/9),h=w*9/16;
  return {width:w,height:h,left:(width-w)/2,top:(height-h)/2,
    size:w>=1280?'large':w>=800?'medium':'small',compact:w<640,short:h<300};
}

export function tensionPresentation(time,duration=2) {
  const remaining=Math.max(0,Math.min(duration,time||0));
  return {active:remaining>0,remaining,gauge:remaining/duration,label:remaining>0?`${remaining.toFixed(1)}s`:'GRAZE TO CHARGE'};
}
