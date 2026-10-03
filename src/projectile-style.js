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
const appearances=new Map();
export const PROJECTILE_MATERIALS=Object.freeze({
  'normal-pink':Object.freeze({id:'normal-pink',surface:'pearl',halo:1,emission:.66}),
  pattern:Object.freeze({id:'pattern',surface:'frost',halo:1.12,emission:.58}),
  direct:Object.freeze({id:'direct',surface:'filament',halo:.8,emission:.7}),
  legacy:Object.freeze({id:'legacy',surface:'pearl',halo:1,emission:.66}),
});

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

// Damage identity is supplied at birth by the simulation. Hue and speed are
// never used to infer damage, and this view never contains combat parameters.
export function projectileAppearance(shot) {
  const damageClass=Object.hasOwn(PROJECTILE_MATERIALS,shot.damageClass)?shot.damageClass:'legacy';
  const material=PROJECTILE_MATERIALS[damageClass];
  const style=damageClass==='normal-pink'?'bead'
    :damageClass==='direct'?(shot.style==='rail'?'rail':'needle'):shot.style;
  const view=projectileStyle(style,damageClass==='normal-pink'?'magenta':shot.palette);
  const key=damageClass+':'+view.id+':'+view.palette.id;
  if(!appearances.has(key))appearances.set(key,Object.freeze({...view,material}));
  return appearances.get(key);
}

// Fixed deterministic texels for the existing Canvas cache. No game clock or
// random generator is sampled, and transparent texels never extend the core.
export function projectileSurfacePixels(palette, surface='pearl', size=64) {
  const colors=Object.hasOwn(PROJECTILE_PALETTES,palette)?PROJECTILE_PALETTES[palette]:PROJECTILE_PALETTES.magenta;
  const rgb=[1,3,5].map(offset=>parseInt(colors.color.slice(offset,offset+2),16));
  const pixels=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const nx=(x+.5)/size*2-1,ny=(y+.5)/size*2-1,radiusSq=nx*nx+ny*ny;
    if(radiusSq>=1)continue;
    const z=Math.sqrt(1-radiusSq),light=Math.max(0,-nx*.44-ny*.57+z*.69);
    const noise=(((x*19+y*23+x*y*3)%17)-8)/255;
    const frost=surface==='frost'?Math.sin(nx*29+ny*17)*Math.sin(ny*23-nx*11)*.065:0;
    const specular=Math.pow(light,surface==='filament'?32:18)*.8;
    const shade=.28+light*.82+noise+frost,index=(y*size+x)*4;
    for(let channel=0;channel<3;channel++)pixels[index+channel]=rgb[channel]*shade+(255-rgb[channel]*shade)*specular;
    pixels[index+3]=Math.min(1,(1-Math.sqrt(radiusSq))*10)*(surface==='frost'?215:235);
  }
  return pixels;
}
