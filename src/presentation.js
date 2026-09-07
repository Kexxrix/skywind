// Shared display colors only; firing rules and projectile geometry live in game.js.
export const WEAPON_PRESENTATION = Object.freeze(Object.fromEntries([
  ['normal','#78E8FF','#DEF9FF'],
  ['spread','#FFD45A','#FFF0C2'],
  ['lance','#FF644B','#FFE2D9'],
  ['helix','#6F8BFF','#E0E6FF'],
  ['drone','#73F2AF','#DEFFEB'],
].map(([mode,color,core])=>[mode,Object.freeze({color,core,rgb:Object.freeze([1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255))})])));

// A: flare/core. B: soft backing. C: B with overlapping outer halos restrained.
export const THREAT_VARIANTS = Object.freeze(['A','B','C']);
export const DEFAULT_THREAT_VARIANT = 'C';
