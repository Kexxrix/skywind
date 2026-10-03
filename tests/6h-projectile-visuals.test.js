import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, projectileScreenTrail, projectileLightBudget, PROJECTILE_LIGHT_LIMITS, playerGrazeCue } from '../src/renderer.js';
import { projectileAppearance, projectileStyle, projectileSurfacePixels } from '../src/projectile-style.js';
import { cameraRoll, worldToScreen, PLAYER_HIT_RADIUS } from '../src/game.js';
import { advanceHostileProjectile } from '../src/projectile-motion.js';
import { grazeOuterRadius } from '../src/combat-damage.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const game=(time,cameraY,flightAltitude=.5,angle=0)=>({mode:'playing',time,sceneTime:time,flightAltitude,cameraY,player:{angle}});
const camera=g=>({time:g.time,cameraY:g.cameraY,roll:cameraRoll(g)});

test('projected trails include altitude camera motion and changing roll at low, middle and high flight samples',()=>{
  for(const altitude of [0,.5,1])for(const direction of [-1,0,1]) {
    const before=game(8,-156+altitude*312,altitude,-.48),after=game(8+1/60,before.cameraY+direction*8,altitude,.48);
    const start={x:970,y:-80+altitude*850,vx:-440,vy:50,radius:5.5};
    const end={...start,x:start.x+start.vx/60,y:start.y+start.vy/60},copy=structuredClone(end);
    const previous={...worldToScreen(before,start),time:before.time};
    const actual=worldToScreen(after,end),trail=projectileScreenTrail(end,camera(after),previous,30);
    close(trail.screenVX,(actual.x-previous.x)*60);close(trail.screenVY,(actual.y-previous.y)*60);
    close(Math.cos(trail.angle+cameraRoll(after)),trail.screenVX/Math.hypot(trail.screenVX,trail.screenVY));
    close(Math.sin(trail.angle+cameraRoll(after)),trail.screenVY/Math.hypot(trail.screenVX,trail.screenVY));
    assert.ok(trail.length>=0&&trail.length<=30);assert.deepEqual(end,copy);
  }
});

test('the former world-velocity direction is demonstrably wrong during vertical camera pursuit',()=>{
  const before=game(4,0),after=game(4+1/60,10),start={x:700,y:200,vx:-180,vy:0};
  const end={...start,x:697},trail=projectileScreenTrail(end,camera(after),{...worldToScreen(before,start),time:4},19);
  const velocityDirection=Math.atan2(end.vy,end.vx)+cameraRoll(after);
  const apparentDirection=Math.atan2(trail.screenVY,trail.screenVX);
  assert.ok(Math.abs(Math.sin(apparentDirection-velocityDirection))>.8,'camera pursuit substantially rotates the visible displacement');
  close(trail.angle+cameraRoll(after),apparentDirection);
});

test('curve, wave and acceleration trails use their actual sampled path and never integrate or mutate combat state',()=>{
  for(const motion of [{kind:'curve',turnRate:.8,turnSeconds:2},{kind:'wave',amplitude:16,frequency:1.6},
    {kind:'accelerate',acceleration:80,maxSpeed:500}]) {
    const shot={x:980,y:210,vx:-240,vy:40,radius:7,age:0,motion:{...motion}};
    advanceHostileProjectile(shot,.4);
    const before=game(6,-100,.2,-.3),previous={...worldToScreen(before,shot),time:6};
    advanceHostileProjectile(shot,1/30);
    const after=game(6+1/30,-111,.25,-.2),copy=structuredClone(shot),current=worldToScreen(after,shot);
    const trail=projectileScreenTrail(shot,camera(after),previous,19);
    close(trail.screenVX,(current.x-previous.x)*30);close(trail.screenVY,(current.y-previous.y)*30);
    assert.deepEqual(shot,copy);assert.equal(trail.source,'sample');
  }
});

test('renderer motion samples remain private and stable on pause, then clear on reset and a new game mode',()=>{
  const renderer={roll:-.15,projectileSamples:new WeakMap(),projectileTrails:new WeakMap(),
    trail:[],particles:[],flashes:[],labels:[],exitGhosts:[]};
  const shot={x:800,y:300,vx:-240,vy:0,radius:5.5,style:'bead'},g={mode:'playing',time:1,cameraY:0,enemyBullets:[shot]};
  Renderer.prototype.sampleProjectileMotion.call(renderer,g);
  assert.equal(renderer.projectileTrails.get(shot).length,0,'initial renderer draw has no unmeasured direction tail');
  shot.x-=4;g.time+=1/60;g.cameraY=8;
  Renderer.prototype.sampleProjectileMotion.call(renderer,g);
  const sampled=renderer.projectileTrails.get(shot),copy=structuredClone(g);
  Renderer.prototype.sampleProjectileMotion.call(renderer,{...g,mode:'paused'});
  Renderer.prototype.sampleProjectileMotion.call(renderer,g);
  assert.strictEqual(renderer.projectileTrails.get(shot),sampled);assert.deepEqual(g,copy);
  Renderer.prototype.sampleProjectileMotion.call(renderer,{...g,mode:'title',time:0});
  assert.equal(renderer.projectileTrails.get(shot).source,'velocity');
  Renderer.prototype.reset.call(renderer);assert.equal(renderer.projectileSamples.has(shot),false);
  assert.equal(renderer.projectileTrails.has(shot),false);
});

test('fresh and screen-stationary direct shots omit every directional shoulder and rail tail while retaining the complete nucleus',()=>{
  const renderer={roll:-.15,projectileSamples:new WeakMap(),projectileTrails:new WeakMap(),
    presentation:{threatVariant:'A'},flashes:[]};
  const shot={x:800,y:300,vx:-460,vy:0,radius:5.5,style:'rail',damageClass:'direct',palette:'scarlet'};
  const g={mode:'title',time:1,cameraY:0,enemyBullets:[shot],enemies:[]};
  for(const time of [1,1+1/60]) {
    g.time=time;Renderer.prototype.sampleProjectileMotion.call(renderer,g);
    const lines=[],fills=[];let arc;
    const c=new Proxy({lineTo(...args){lines.push(args);},arc(...args){arc=args;},
      fill(){fills.push({arc,color:this.fillStyle,alpha:this.globalAlpha});}}, {get(target,key){return key in target?target[key]:()=>{};}});
    Renderer.prototype.drawCombatCues.call(renderer,c,g);
    assert.equal(lines.length,0,'neither a shoulder nor a pair of rail lines invents a heading');
    assert.ok(fills.some(fill=>fill.arc[0]===800&&fill.arc[1]===300&&fill.arc[2]===5.5&&fill.alpha===1));
  }
});

test('first draw, stale sample and zero apparent motion never manufacture an unbounded or misleading trail',()=>{
  const shot={x:500,y:300,vx:-460,vy:20,radius:5.5},current={roll:-.2,cameraY:40,time:3};
  const stale=projectileScreenTrail(shot,current,{x:-100000,y:100000,time:2},30);
  assert.equal(stale.source,'velocity');assert.equal(stale.length,30);
  const stopped=projectileScreenTrail({...shot,vx:0,vy:0},current,null,30);
  assert.equal(stopped.length,0);assert.ok(Number.isFinite(stopped.angle));
  const point=worldToScreen({mode:'playing',time:3,flightAltitude:.5,player:{angle:0},cameraY:40},shot);
  const stationary=projectileScreenTrail(shot,{...current,roll:cameraRoll(game(3,40))},{...point,time:3-1/60},30);
  assert.equal(stationary.length,0,'a stopped screen image has no direction arrow despite stored velocity');
});

test('birth damage class chooses the material and normal/direct shape without classifying by color, speed or power',()=>{
  const source={style:'petal',palette:'acid',vx:-500,vy:0,radius:7,power:999};
  const normal=projectileAppearance({...source,damageClass:'normal-pink'});
  assert.equal(normal.id,'bead');assert.equal(normal.palette.id,'magenta');assert.equal(normal.material.surface,'pearl');
  const direct=projectileAppearance({...source,damageClass:'direct'});
  assert.equal(direct.id,'needle');assert.equal(direct.material.surface,'filament');
  const pattern=projectileAppearance({...source,damageClass:'pattern'});
  assert.equal(pattern.id,'petal');assert.equal(pattern.palette.id,'acid');assert.equal(pattern.material.surface,'frost');
  const legacy=projectileAppearance({...source,pattern:'rail',power:10});
  assert.equal(legacy.material.id,'legacy');assert.equal(legacy.id,'petal');
  assert.strictEqual(projectileAppearance({...source,damageClass:'pattern'}),pattern);
  assert.ok(Object.isFrozen(pattern)&&Object.isFrozen(pattern.material));
  for(const field of ['radius','power','speed','motion','target'])assert.equal(pattern[field],undefined);
  assert.equal(projectileStyle('petal','acid').material,undefined,'legacy style API remains unchanged');
});

test('cached procedural surfaces have deterministic shading and no texels outside the physical circular nucleus',()=>{
  const variants=[];
  for(const surface of ['pearl','frost','filament']) {
    const pixels=projectileSurfacePixels('magenta',surface,64);
    assert.deepEqual(pixels,projectileSurfacePixels('magenta',surface,64));
    let opaque=0;
    for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
      const alpha=pixels[(y*64+x)*4+3],r2=((x+.5)/32-1)**2+((y+.5)/32-1)**2;
      if(r2>=1)assert.equal(alpha,0,'core texture has no outer damage-like fringe');
      if(alpha>0)opaque++;assert.ok(alpha<=235);
    }
    assert.ok(opaque>3000);assert.equal(pixels.length,64*64*4);
    const luminance=(x,y)=>pixels[(y*64+x)*4]+pixels[(y*64+x)*4+1]+pixels[(y*64+x)*4+2];
    assert.ok(luminance(22,19)>luminance(43,46),'off-center reflection and underside shading give a spherical surface');
    variants.push(Buffer.from(pixels).toString('base64'));
  }
  assert.equal(new Set(variants).size,3,'three material responses are distinct');
});

test('dense and spread hell-size fields keep bounded outer additive area without fading any physical nucleus',()=>{
  for(const compact of [true,false]) {
    const bullets=Array.from({length:900},(_,i)=>({x:compact?500+i%10:(i%45)*29,
      y:compact?300+Math.floor(i/10)*.1:Math.floor(i/45)*36,radius:7,vx:-400,vy:0,
      style:i%2?'rail':'petal',palette:i%2?'scarlet':'violet',damageClass:i%2?'direct':'pattern'}));
    const before=structuredClone(bullets),budget=projectileLightBudget(bullets);
    assert.ok(budget.additiveArea<=PROJECTILE_LIGHT_LIMITS.maxAdditiveArea+1e-8);
    assert.ok(budget.lights.every(light=>light.diameter<=42&&light.frontDiameter<=42&&light.alpha>0));
    const nuclei=[],surfaces=[],glows=[];let arc;
    const ctx=new Proxy({arc(x,y,r){arc=[x,y,r];},fill(){nuclei.push({arc,color:this.fillStyle,alpha:this.globalAlpha});},
      drawImage(...args){surfaces.push(args);}}, {get(target,key){return key in target?target[key]:()=>{};}});
    const renderer={presentation:{threatVariant:'C'},flashes:[],glows:{},projectileSurfaces:{
      'scarlet:filament':'direct-surface','violet:frost':'pattern-surface'},
      glow(c,x,y,size,color,alpha){glows.push({x,y,size,color,alpha});}};
    Renderer.prototype.drawCombatCues.call(renderer,ctx,{mode:'title',enemyBullets:bullets,enemies:[]});
    for(const b of bullets)assert.ok(nuclei.some(fill=>fill.arc?.[0]===b.x&&fill.arc?.[1]===b.y&&fill.arc?.[2]===b.radius&&
      fill.color===projectileAppearance(b).palette.color&&fill.alpha===1),'the full danger nucleus survives light attenuation');
    assert.equal(surfaces.length,900);assert.ok(surfaces.every(args=>args[3]===14&&args[4]===14));
    assert.equal(glows.length,900);assert.ok(glows.every(glow=>glow.size<=42&&glow.alpha<=.7*PROJECTILE_LIGHT_LIMITS.frontAlpha));
    assert.deepEqual(bullets,before);
  }
});

test('graze cue uses the actual nearest eligible shot outer radius, separate from hit cores and already consumed grazes',()=>{
  const b={x:240,y:300,radius:7},g={mode:'playing',time:0,flightAltitude:.5,cameraY:0,player:{x:200,y:300,angle:0,invincible:0},enemyBullets:[b]};
  const before=structuredClone(g),cue=playerGrazeCue(g);
  assert.equal(cue.radius,grazeOuterRadius(PLAYER_HIT_RADIUS+7));assert.equal(cue.radius,41.7);
  assert.deepEqual(g,before);assert.equal(b.radius,7);
  for(const patch of [{grazed:true},{arming:.2},{dead:true},{x:206},{x:1000}])
    assert.equal(playerGrazeCue({...g,enemyBullets:[{...b,...patch}]}),null);
  assert.equal(playerGrazeCue({...g,player:{...g.player,invincible:.1}}),null);
  assert.equal(playerGrazeCue({...g,mode:'paused'}),null);
  assert.equal(playerGrazeCue({...g,enemyBullets:[b,{x:230,y:300,radius:5.5}]}).radius,38.7);
  assert.equal(playerGrazeCue({...g,cameraY:1000}),null,'a near world-space shot off the actual projected viewport has no cue');
});

test('the renderer constructs exactly twenty-one small surface caches and reuses them across day and night',()=>{
  const previous={document:globalThis.document,window:globalThis.window,matchMedia:globalThis.matchMedia,ResizeObserver:globalThis.ResizeObserver};
  const uploads=[];
  const textureContext={createRadialGradient(){return {addColorStop(){}};},fillRect(){},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(data){uploads.push(data.data);}};
  const ctx=new Proxy({}, {get(target,key){return key in target?target[key]:()=>{};}});
  try {
    globalThis.document={createElement(){return {getContext(){return textureContext;}};}};
    globalThis.window={devicePixelRatio:1};globalThis.matchMedia=()=>({matches:false});
    globalThis.ResizeObserver=class {observe(){}};
    const renderer=new Renderer({getContext(){return ctx;},getBoundingClientRect(){return {width:1280,height:720};}});
    assert.equal(Object.keys(renderer.projectileSurfaces).length,21);assert.equal(uploads.length,21);
    assert.equal(uploads.reduce((sum,data)=>sum+data.byteLength,0),344064);
    const b={x:500,y:300,vx:-400,vy:20,radius:5.5,damageClass:'direct',style:'rail',palette:'scarlet'};
    for(const daylight of [0,1]) {
      const g={mode:'title',time:3,daylight,enemyBullets:[b],enemies:[]};
      ctx.createRadialGradient=()=>{throw new Error('cached projectile rendering must not rebuild a per-shot gradient');};
      Renderer.prototype.drawCombatCues.call(renderer,ctx,g);
    }
    assert.equal(uploads.length,21,'day/night rendering does not allocate further texture surfaces');
  } finally {
    for(const [key,value] of Object.entries(previous)) {
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});
