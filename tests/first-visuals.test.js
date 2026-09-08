import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, projectilePalette, TENSION_PALETTE, COMBAT_FX, AIM_SHOT_VISUALS } from '../src/renderer.js';
import { sequenceToWorld } from '../src/game.js';
import { VolumeEnvironment } from '../src/volume-environment.js';
import { Terrain3D } from '../src/terrain3d.js';
import { WEAPON_PRESENTATION } from '../src/presentation.js';

function effects() {
  return Object.assign(Object.create(Renderer.prototype),{flashes:[],particles:[],labels:[],trail:[],exitGhosts:[],impactShake:0,exposure:0,reducedMotion:false});
}

test('background distance integrates speed continuously through night, recovery and pause without rebaking',()=>{
  const environment={distance:19,volume:{retained:true}};
  const update=(daylight,speed,dt)=>VolumeEnvironment.prototype.update.call(environment,{daylight,speed},dt);
  update(1,1.3,.5);assert.equal(environment.distance,19.5);
  update(.5,1.95,.4);assert.ok(Math.abs(environment.distance-20.1)<1e-12);
  update(0,3.9,.8);assert.ok(Math.abs(environment.distance-22.5)<1e-12);
  assert.equal(environment.daylight,0);
  update(.5,2.6,0);assert.ok(Math.abs(environment.distance-22.5)<1e-12);assert.equal(environment.travel,0);
  update(1,1.3,1);assert.ok(Math.abs(environment.distance-23.5)<1e-12);
  assert.deepEqual(environment.volume,{retained:true});
});

test('terrain lighting receives the same continuous day/night value without changing mesh draws',()=>{
  const values=[],draws=[];
  const gl=new Proxy({uniform1f(name,value){values.push([name,value]);},drawArraysInstanced(...args){draws.push(args);}}, {get(target,key){return key in target?target[key]:/^[A-Z_0-9]+$/.test(key)?key:()=>{};}});
  const terrain={gl,uniforms:{Daylight:'daylight'},meshes:[{vao:1,wrap:100,ground:true,vertices:12,instances:8}]};
  const options={viewProjection:new Float32Array(16),camera:[0,12,48]};
  for(const daylight of [1,.5,0])Terrain3D.prototype.draw.call(terrain,{...options,daylight});
  assert.deepEqual(values.filter(([name])=>name==='daylight'),[['daylight',1],['daylight',.5],['daylight',0]]);
  assert.equal(draws.length,3);
  assert.deepEqual(draws[0],draws[1]);assert.deepEqual(draws[1],draws[2]);
});

test('normal and tension projectile palettes are stored-shot dependent for every weapon and drone',()=>{
  for(const weaponMode of Object.keys(WEAPON_PRESENTATION)) {
    const ordinary={weaponMode,tension:false},boosted={weaponMode,tension:true};
    assert.equal(projectilePalette(ordinary),WEAPON_PRESENTATION[weaponMode]);
    assert.equal(projectilePalette(boosted),TENSION_PALETTE);
    const strokes=[],glows=[];
    const c=new Proxy({stroke(){strokes.push({color:this.strokeStyle,width:this.lineWidth});}},{get(target,key){return key in target?target[key]:()=>{};}});
    const bullets=[ordinary,boosted].map((bullet,i)=>({...bullet,x:200+i*100,y:100,vx:900,vy:0,powered:weaponMode!=='normal'}));
    const g={bullets,enemyBullets:[],player:{tensionTime:0,weaponMode:'helix'}};
    Renderer.prototype.drawBullets.call({glow(...args){glows.push(args);}},c,g);
    assert.equal(strokes[0].color,WEAPON_PRESENTATION[weaponMode].color);
    assert.equal(strokes[2].color,TENSION_PALETTE.color);
    assert.equal(strokes[0].width,strokes[2].width,'tension preserves the existing weapon silhouette');
    assert.equal(glows[1][4],'tension');
  }
});

test('hit and shot cues keep launch tension; chain stage and effects are bounded',()=>{
  const renderer=effects();
  const events=[{type:'shot',x:100,y:200,tension:true,weaponMode:'lance',powered:true},
    {type:'hit',x:300,y:200,tension:true,weaponMode:'lance',enemyType:'boss'},
    {type:'hit',x:300,y:200,tension:false,weaponMode:'helix',enemyType:'beetle'},
    {type:'explosion',x:300,y:200,tension:true,weaponMode:'lance',chain:9999}];
  const before=structuredClone(events);renderer.handleEvents(events);
  assert.deepEqual(events,before,'presentation must not modify simulation events');
  assert.equal(renderer.flashes[0].color,'tension');assert.equal(renderer.flashes[1].color,'tension');
  assert.equal(renderer.flashes[1].armored,true);assert.equal(renderer.flashes[2].color,'helix');
  assert.equal(renderer.flashes[3].chain,COMBAT_FX.maxChainStage);
  for(let i=0;i<30;i++)renderer.handleEvents([{type:'explosion',x:300,y:200,chain:9999}]);
  assert.equal(renderer.particles.length,COMBAT_FX.maxParticles);
});

test('tension start and refresh cues use the real event position and have short distinct lifetimes',()=>{
  const renderer=effects();
  renderer.handleEvents([{type:'tension',x:217,y:83,refresh:false},{type:'tension',x:220,y:82,refresh:true}]);
  assert.equal(renderer.flashes.length,2);
  assert.deepEqual(renderer.flashes.map(f=>[f.x,f.y,f.kind]),[[217,83,'tension'],[220,82,'tension']]);
  assert.ok(renderer.flashes[1].life<renderer.flashes[0].life);
  assert.ok(renderer.flashes[0].life<=.6,'the impact is brief even after the requested stronger recognition pass');
});

test('pattern source cues track every current world-space muzzle and do not mutate it',()=>{
  const muzzles=[{x:861,y:241},{x:891,y:411}],before=structuredClone(muzzles),glows=[];
  const c=new Proxy({},{get(target,key){return key in target?target[key]:()=>{};}});
  for(const attackName of ['B01','B02','B03','aim']) {
    const g={enemies:[{x:960,y:350,radius:40,telegraph:.6,attackName,muzzles}]};
    Renderer.prototype.drawThreats.call({glow(...args){glows.push(args);}},c,g);
  }
  assert.deepEqual(muzzles,before);
  assert.equal(glows.length,8);
  for(let i=0;i<glows.length;i++)assert.deepEqual(glows[i].slice(1,3),[muzzles[i%2].x,muzzles[i%2].y]);
});

test('three aimed speeds have ordered directional lengths and the same danger-core radius',()=>{
  const lengths=[],cores=[];
  for(const speedTier of ['slow','medium','fast']) {
    let path=[];const strokes=[],arcs=[];
    const c=new Proxy({beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},stroke(){strokes.push([...path]);},
      arc(x,y,r){arcs.push(r);}}, {get(target,key){return key in target?target[key]:()=>{};}});
    const bullet={x:300,y:250,vx:-160,vy:0,radius:5.5,speedTier};
    Renderer.prototype.drawCombatCues.call({presentation:{threatVariant:'A'},flashes:[]},c,{mode:'title',enemies:[],enemyBullets:[bullet]});
    lengths.push(Math.hypot(strokes[0][1][0]-strokes[0][0][0],strokes[0][1][1]-strokes[0][0][1]));
    cores.push(arcs);
    assert.equal(lengths.at(-1),AIM_SHOT_VISUALS[speedTier].trail);
    assert.equal(bullet.radius,5.5);
  }
  assert.ok(lengths[0]<lengths[1]&&lengths[1]<lengths[2]);
  assert.deepEqual(cores[0],cores[1]);assert.deepEqual(cores[1],cores[2]);
});

test('B04 window brackets use the actual firing snapshot even while the current camera moves',()=>{
  const roll=-.12,plan={cos:Math.cos(roll),sin:Math.sin(roll),cameraY:-156,roll,index:1,bundles:[{row:0},{row:1}]};
  const enemy={x:920,y:310,telegraph:.8,attackName:'B04',sequence:plan,safeLane:240,safeDirection:1,safeWidth:94.7,muzzles:[{x:850,y:290},{x:850,y:330}]};
  const paths=[];
  for(const cameraY of [-156,0,156]) {
    let path=[];const strokes=[];
    const c=new Proxy({beginPath(){path=[];},moveTo(x,y){path.push({x,y});},lineTo(x,y){path.push({x,y});},stroke(){strokes.push([...path]);}},
      {get(target,key){return key in target?target[key]:()=>{};}});
    Renderer.prototype.drawThreats.call({glow(){}},c,{cameraY,sceneTime:18,altitude:.6,enemies:[enemy]});
    paths.push(strokes.slice(0,2));
  }
  assert.deepEqual(paths[0],paths[1]);assert.deepEqual(paths[1],paths[2]);
  const upperY=240+28-94.7/2;
  assert.deepEqual(paths[0][0][1],sequenceToWorld(plan,{x:346,y:upperY}));
  assert.deepEqual(paths[0][0][2],sequenceToWorld(plan,{x:375,y:upperY}));
});

test('cleared combat objects only leave copied, short-lived visual ghosts',()=>{
  const renderer=effects(),event={type:'combatClear',duration:.2,enemies:[{type:'beetle',x:800,y:300,radius:28}],bullets:[{x:500,y:310,radius:5.5}]};
  const before=structuredClone(event);renderer.handleEvents([event]);
  assert.deepEqual(event,before);assert.equal(renderer.exitGhosts.length,2);
  assert.notEqual(renderer.exitGhosts[0],event.enemies[0]);
  assert.ok(renderer.exitGhosts.every(ghost=>ghost.life===.2));
  renderer.updateEffects({mode:'gameover',speed:1.3},.21);
  assert.equal(renderer.exitGhosts.length,0);
  renderer.handleEvents([event]);renderer.reset();assert.equal(renderer.exitGhosts.length,0);
});

test('speed focus lines are deterministic, stay presentation-only and grow with background acceleration',()=>{
  const measure=speed=>{
    let start;const lines=[],stops=[];
    const c=new Proxy({createLinearGradient(){return {addColorStop(...args){stops.push(args);}};},
      moveTo(x,y){start=[x,y];},lineTo(x,y){lines.push({from:start,to:[x,y],alpha:this.globalAlpha});}},
      {get(target,key){return key in target?target[key]:()=>{};}});
    const g={backgroundSpeed:speed,altitude:.5,rng:42910},before=structuredClone(g);
    Renderer.prototype.drawSpeedLines.call({environment:{distance:83.7},reducedMotion:false},c,g);
    assert.deepEqual(g,before);
    return lines;
  };
  const slow=measure(1),fast=measure(4.6);
  assert.deepEqual(fast,measure(4.6));
  assert.ok(fast.length>slow.length);
  assert.ok(fast[0].alpha>slow[0].alpha);
  const length=line=>Math.hypot(line.to[0]-line.from[0],line.to[1]-line.from[1]);
  assert.ok(length(fast[0])>length(slow[0]));
});

test('enemy cue corona uses light compositing without a dark backing and leaves the danger core unchanged',()=>{
  const stops=[],fills=[],arcs=[];
  const c=new Proxy({createRadialGradient(){return {addColorStop(offset,color){stops.push([offset,color]);}};},
    fillRect(){fills.push(this.globalCompositeOperation);},arc(x,y,radius){arcs.push(radius);}},
    {get(target,key){return key in target?target[key]:()=>{};}});
  const b={x:300,y:200,vx:-160,vy:0,radius:5.5};
  Renderer.prototype.drawCombatCues.call({presentation:{threatVariant:'C'},flashes:[]},c,{mode:'title',enemies:[],enemyBullets:[b]});
  assert.deepEqual(fills,['lighter']);
  assert.ok(stops.every(([,color])=>color.startsWith('rgba(255,')));
  assert.deepEqual(arcs,[5.5*.72,5.5*.32]);
  assert.equal(b.radius,5.5);
});

test('supply light colors follow side independently of item type and never draw a dark panel',()=>{
  for(const side of ['top','bottom'])for(const type of ['change','maintain']) {
    const colors=[],glows=[];
    const c=new Proxy({fillRect(){colors.push(this.fillStyle);},createLinearGradient(){return {addColorStop(){}};}}, {get(target,key){return key in target?target[key]:()=>{};}});
    const item={id:83,x:270,y:100,side,type};
    Renderer.prototype.drawPickup.call({reducedMotion:false,glow(...args){glows.push(args);}},c,item,3);
    assert.equal(glows[0][4],side==='top'?'supplyTop':'supplyBottom');
    assert.ok(colors.every(color=>['#fffceb','#ffcf75','#68f5ba'].includes(color)));
    assert.deepEqual(item,{id:83,x:270,y:100,side,type});
  }
});

test('absorbing icons keep their size during travel and draw a bounded tail back along the actual path',()=>{
  for(const type of ['health','change','maintain'])for(const rear of [false,true]) {
    const gradients=[],scales=[];
    const c=new Proxy({createLinearGradient(...points){gradients.push(points);return {addColorStop(){}};},scale(...value){scales.push(value);}},
      {get(target,key){return key in target?target[key]:()=>{};}});
    const item={id:83,x:270,y:200,type,side:type==='health'?undefined:'top',attracting:true,attractTime:.09,
      attractFrom:{x:rear?100:440,y:240}};
    const before=structuredClone(item);
    Renderer.prototype.drawPickup.call({roll:-.2,reducedMotion:false,glow(){}},c,item,3);
    assert.deepEqual(scales,[[1,1]],'the icon remains recognizable halfway through the flight');
    assert.equal(gradients.length,1,'one travel tail replaces the unrelated approach tail');
    const [x,y,tx,ty]=gradients[0];
    assert.deepEqual([x,y],[item.x,item.y]);
    assert.equal(Math.sign(tx-x),rear?-1:1);
    assert.ok(ty>y);
    assert.ok(Math.hypot(tx-x,ty-y)<=120.001);
    assert.deepEqual(item,before,'rendering never advances or collects the item');
  }
});

test('hit clears the tension activation wave but preserves already fired gold shot feedback',()=>{
  const renderer=effects();
  renderer.handleEvents([{type:'tension',x:200,y:300},{type:'shot',x:230,y:300,tension:true,weaponMode:'normal'}]);
  renderer.handleEvents([{type:'tensionEnd',reason:'hit'}]);
  assert.ok(!renderer.flashes.some(f=>f.kind==='tension'));
  assert.equal(renderer.flashes.find(f=>f.kind==='shot').color,'tension');
});
