import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, threatNeighborCounts, COMBAT_FX } from '../src/renderer.js';
import { registerMechaManifest, getMechaSpec, mechaAnchorWorld, MECHA_MANIFEST_PATH } from '../src/mecha-art.js';
import { sequenceToWorld } from '../src/game.js';
import { barragePlan, patternGeometry } from '../src/barrage.js';

const context = overrides => new Proxy(overrides || {},{get(target,key){return key in target?target[key]:()=>{};}});
const emptyManifest = () => registerMechaManifest({schemaVersion:1,entries:[]});

test('density grid preserves exact halo response across cell edges and different physical radii',()=>{
  const bullets=Array.from({length:480},(_,i)=>({x:(i*73)%1380-100,y:(i*97)%820-50,radius:[4,5.5,8,14][i%4]}));
  bullets.push({x:63,y:63,radius:5.5},{x:64,y:64,radius:5.5},{x:102.5,y:63,radius:5.5});
  const before=structuredClone(bullets),expected=bullets.map(bullet=>bullets.filter(other=>other!==bullet&&(other.x-bullet.x)**2+(other.y-bullet.y)**2<Math.max(30,bullet.radius*7)**2).length);
  for(const cellSize of [32,64,96])assert.deepEqual([...threatNeighborCounts(bullets,cellSize).counts],expected);
  assert.deepEqual(bullets,before);
  assert.throws(()=>threatNeighborCounts(bullets,0),/cell size/);
});

test('density grid limits comparisons for a reproducible spread-out hell-sized field',()=>{
  const bullets=Array.from({length:900},(_,i)=>({x:(i%45)*29,y:Math.floor(i/45)*36,radius:5.5}));
  const result=threatNeighborCounts(bullets);
  assert.ok(result.comparisons<bullets.length*(bullets.length-1)*.035,`${result.comparisons} candidate comparisons`);
  const before=structuredClone(bullets),alphas=[];
  Renderer.prototype.drawBullets.call({presentation:{threatVariant:'C'},glow(c,x,y,size,color,alpha){alphas.push(alpha);}},context(),{bullets:[],enemyBullets:bullets});
  assert.equal(alphas[100*2],.88/Math.sqrt(1+result.counts[100]*.35));
  assert.deepEqual(bullets,before);
});

test('enemy danger nucleus covers the full damage radius while the player core remains unchanged',()=>{
  const arcs=[];
  Renderer.prototype.drawCombatCues.call({presentation:{threatVariant:'A'},flashes:[]},context({arc(x,y,r){arcs.push([x,y,r]);}}),{
    mode:'playing',enemies:[],enemyBullets:[{x:500,y:300,vx:-180,vy:0,radius:8}],player:{x:200,y:300}});
  assert.deepEqual(arcs,[[500,300,8],[500,300,2.56],[200,300,3.35],[200,300,1.85]]);
});

test('model pixel anchors share fixed pivot, scale and combat-selected state without clocks',()=>{
  const manifest={schemaVersion:1,entries:[{key:'test-drone',roles:['beetle'],canvasWidth:512,canvasHeight:512,displayWidth:96,pivotPixels:{x:256,y:256},frames:{
    idle:{filename:'runtime/drone-idle.png',muzzlesPixels:[{x:128,y:256}],nozzlesPixels:[{x:400,y:256}]},
    open:{filename:'runtime/drone-open.png',muzzlesPixels:[{x:112,y:240}],corePixels:{x:240,y:256,radius:20}},
  }}]};
  const before=structuredClone(manifest);
  try {
    registerMechaManifest(manifest);
    const enemy={type:'beetle',x:500,y:300,artAngle:Math.PI/2,armorOpen:true},spec=getMechaSpec(enemy);
    assert.equal(spec.displayWidth,96);assert.equal(spec.displayHeight,96);
    assert.deepEqual(spec.pivot,{x:48,y:48});assert.equal(spec.filename,'runtime/drone-open.png');
    assert.deepEqual(spec.runtimeCore,{x:-3,y:0,radius:3.75});
    const muzzle=mechaAnchorWorld(enemy,spec.runtimeMuzzles[0]);
    assert.ok(Math.abs(muzzle.x-503)<1e-10);assert.ok(Math.abs(muzzle.y-273)<1e-10);
    const calls=[];
    Renderer.prototype.drawEnemy.call({mechaFrames:{[spec.filename]:{actual:true}},glow(){}},context({drawImage(...args){calls.push(args);}}),enemy,9999);
    assert.deepEqual(calls[0].slice(1),[-48,-48,96,96]);
    assert.deepEqual(manifest,before);
    assert.equal(getMechaSpec({...enemy,armorOpen:false,telegraph:.8}).filename,'runtime/drone-idle.png','an absent charge frame falls back with the same anchor set');
  } finally {emptyManifest();}
  assert.equal(getMechaSpec({type:'beetle'}),null);
  assert.equal(MECHA_MANIFEST_PATH,null,'new model artwork is not claimed before its files arrive');
});

test('model registration rejects unsafe paths and does not partially overwrite a working registry',()=>{
  const manifest={schemaVersion:1,entries:[{key:'safe',roles:['beetle'],canvasWidth:256,canvasHeight:256,displayWidth:64,pivotPixels:{x:128,y:128},frames:{idle:{filename:'drone.png'}}}]};
  try {
    registerMechaManifest(manifest);
    const invalid=structuredClone(manifest);invalid.entries[0].frames.idle.filename='../private.png';
    assert.throws(()=>registerMechaManifest(invalid),/filename/);
    assert.equal(getMechaSpec({type:'beetle'}).filename,'drone.png');
  } finally {emptyManifest();}
});

test('long high-density event batches bound flashes, labels and particles without changing events',()=>{
  const renderer=Object.assign(Object.create(Renderer.prototype),{flashes:[],labels:[],particles:[],trail:[],exitGhosts:[],impactShake:0,exposure:0,reducedMotion:false});
  const events=Array.from({length:200},(_,i)=>({type:'explosion',x:800,y:300,chain:3,score:100,id:i})),before=structuredClone(events);
  renderer.handleEvents(events);
  assert.equal(renderer.flashes.length,COMBAT_FX.maxFlashes);assert.equal(renderer.labels.length,COMBAT_FX.maxLabels);assert.equal(renderer.particles.length,COMBAT_FX.maxParticles);
  assert.deepEqual(events,before);
});

test('moving-window tells follow the next actual bundle and persist during its travel interval',()=>{
  for(const attackName of ['B04','B05'])for(const safeLane of [155,360,565]) {
    const plan={...barragePlan(attackName,4,.3),roll:-.12,cos:Math.cos(-.12),sin:Math.sin(-.12),cameraY:140,index:1};
    const enemy={x:1000,y:340,radius:80,attackName,telegraph:0,sequence:plan,safeLane,safeDirection:-1,safeWidth:70,
      muzzles:[{x:944,y:300},{x:944,y:380}]};
    const before=structuredClone(enemy),paths=[];let path=[];
    Renderer.prototype.drawThreats.call({glow(){}},context({beginPath(){path=[];},moveTo(x,y){path.push({x,y});},lineTo(x,y){path.push({x,y});},stroke(){paths.push([...path]);}}),{cameraY:-160,enemies:[enemy]});
    const shots=patternGeometry(plan.bundles[plan.index],{pattern:attackName,safeLane,safeDirection:-1});
    assert.ok(shots.length>0);const center=shots[0].windowY;
    assert.deepEqual(paths[0][1],sequenceToWorld(plan,{x:346,y:center-35}));
    assert.deepEqual(paths[1][1],sequenceToWorld(plan,{x:346,y:center+35}));
    assert.deepEqual(enemy,before);
  }
});

test('destroy events briefly boost peripheral flow without changing background or projectile speed',()=>{
  const renderer=Object.assign(Object.create(Renderer.prototype),{flashes:[],labels:[],particles:[],trail:[],exitGhosts:[],impactShake:0,exposure:0,reducedMotion:false});
  renderer.handleEvents([{type:'explosion',x:900,y:300,boss:true}]);
  assert.equal(renderer.flowKick,.2);
  const g={mode:'gameover',backgroundSpeed:4.6,speed:4.6},before=structuredClone(g);
  renderer.updateEffects(g,.2);assert.ok(renderer.flowKick>0&&renderer.flowKick<.05);
  assert.deepEqual(g,before);
  renderer.reset();assert.equal(renderer.flowKick,0);
});

test('visual pressure caps preserve the immediate player-damage and tension signals',()=>{
  const renderer=Object.assign(Object.create(Renderer.prototype),{flashes:[],labels:[],particles:[],trail:[],exitGhosts:[],impactShake:0,exposure:0,reducedMotion:false});
  renderer.handleEvents([{type:'hit',x:200,y:300,player:true},{type:'tension',x:200,y:300},...Array.from({length:300},()=>({type:'shot',x:250,y:300,weaponMode:'normal'}))]);
  assert.equal(renderer.flashes.length,COMBAT_FX.maxFlashes);
  assert.ok(renderer.flashes.some(f=>f.kind==='playerHit'));assert.ok(renderer.flashes.some(f=>f.kind==='tension'));
});

test('multi-port fire, projected core opening and five boss breaks use actual events and distinct geometry',()=>{
  const renderer=Object.assign(Object.create(Renderer.prototype),{flashes:[],labels:[],particles:[],trail:[],exitGhosts:[],impactShake:0,exposure:0,reducedMotion:false,glow(){}});
  const events=[{type:'enemyShot',x:900,y:300,attackName:'B05',launchMuzzles:[{x:900,y:280},{x:900,y:320},{x:900,y:320}]},
    {type:'coreOpen',x:942,y:315,bossKind:'warden'}],before=structuredClone(events);
  renderer.handleEvents(events);
  assert.deepEqual(renderer.flashes.map(f=>[f.kind,f.x,f.y]),[['enemyShot',900,280],['enemyShot',900,320],['coreOpen',942,315]]);
  assert.deepEqual(events,before);
  const geometries=[];
  for(const bossKind of ['warden','carrier','lancer','bastion','apex']) {
    renderer.reset();renderer.handleEvents([{type:'bossDefeated',x:1000,y:350,bossKind}]);
    const points=[];
    renderer.drawEffects(context({moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);}}));
    geometries.push(JSON.stringify(points));
  }
  assert.equal(new Set(geometries).size,5);
});
