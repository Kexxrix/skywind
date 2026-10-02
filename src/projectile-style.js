// Presentation only: style never chooses a damage radius, velocity or target.
// Every enemy shot retains its simulation-owned circular nucleus (b.radius).
export const PROJECTILE_PALETTES = Object.freeze(Object.fromEntries(Object.entries({
  magenta: {color:'#ff62ad',core:'#fff1f8',edge:'#71304c'},
  scarlet: {color:'#ff6652',core:'#fff2e9',edge:'#783327'},
  violet: {color:'#b68aff',core:'#f7efff',edge:'#503a76'},
  acid: {color:'#b8f064',core:'#f5ffe5',edge:'#48662a'},
  cyan: {color:'#58e7dc',core:'#edfffd',edge:'#286660'},
  ochre: {color:'#edb65f',core:'#fff4df',edge:'#77542b'},
  gold: {color:'#f2ce69',core:'#fffae7',edge:'#76602c'},
}).map(([id,colors])=>[id,Object.freeze({id,...colors,glow:`threat-${id}`})])));

export const PROJECTILE_STYLES = Object.freeze(Object.fromEntries(Object.entries({
  bead: {shape:'bead',palette:'magenta',trail:8,shoulder:0,stretch:1.2},
  seed: {shape:'seed',palette:'acid',trail:11,shoulder:0,stretch:1.7},
  needle: {shape:'needle',palette:'scarlet',trail:34,shoulder:17,stretch:4.2},
  rail: {shape:'rail',palette:'scarlet',trail:48,shoulder:25,stretch:5.4},
  petal: {shape:'petal',palette:'violet',trail:15,shoulder:0,stretch:1.6},
  crescent: {shape:'crescent',palette:'violet',trail:19,shoulder:0,stretch:2.0},
}).map(([id,style])=>[id,Object.freeze({id,...style})])));

const aliases=Object.freeze({slowbead:'bead','slow-bead':'bead',fastneedle:'needle','fast-needle':'needle',curvepetal:'petal','curve-petal':'petal'});
const views=new Map();

// Returning a shared immutable view avoids per-projectile allocation in both
// render passes. Unknown metadata falls back to a readable magenta bead.
export function projectileStyle(style='bead',palette) {
  const id=Object.hasOwn(aliases,style)?aliases[style]:style;
  const base=Object.hasOwn(PROJECTILE_STYLES,id)?PROJECTILE_STYLES[id]:PROJECTILE_STYLES.bead;
  const colors=Object.hasOwn(PROJECTILE_PALETTES,palette)?PROJECTILE_PALETTES[palette]:PROJECTILE_PALETTES[base.palette];
  const key=base.id+':'+colors.id;
  if(!views.has(key))views.set(key,Object.freeze({...base,palette:colors}));
  return views.get(key);
}
