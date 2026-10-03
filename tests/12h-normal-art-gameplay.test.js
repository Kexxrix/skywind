import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,updateGame,consumeEvents,enemyMuzzles,enemyDeployDocks} from '../src/game.js';
import {registerMechaManifest,getMechaSpec} from '../src/mecha-art.js';
import {Renderer} from '../src/renderer.js';
const DT=1/120;
function registered(run){registerMechaManifest(JSON.parse(readFileSync(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8')));try{return run();}finally{registerMechaManifest({schemaVersion:1,entries:[]});}}
function fixture(victories=0,time=0){const g=createGame(120201);g.mode='playing';g.bossesDefeated=victories;g.normalTime=time;
 g.player.invincible=100;g.nextBossAt=g.nextPickupAt=Infinity;return g;}

test('ten adopted normal roles use their approved scale, physical ports and protected compound hulls',()=>registered(()=>{
 for(const [role,width,ports]of [['dragonfly',88,1],['wasp',76,0],['ray',118,2],['worm',170,3],['dart',96,1],['scarab',144,0],
   ['mantis',96,2],['orb',82,3],['claw',108,2],['needle',112,1]]){
  const spec=getMechaSpec({type:role});assert.ok(spec);assert.equal(spec.displayWidth,width);assert.equal(spec.runtimeMuzzles.length,ports);
  assert.ok(spec.runtimeBodyHulls.length>0);assert.equal(spec.runtimeCore,null);assert.equal(spec.coreExposed,false);assert.equal(spec.weakpointEnabled,false);
 }
}));

test('Needle aliases expose a real coil tell and immutable lock guide without changing combat state',()=>registered(()=>{
 const g=fixture(1,8);updateGame(g,DT,{});consumeEvents(g);g.nextWaveAt=Infinity;
 const needle=g.enemies.find(e=>e.type==='needle');assert.ok(needle);
 const idle=getMechaSpec({type:'needle'});
 for(const state of ['charge','locked','fire','recovery'])assert.equal(getMechaSpec({type:'needle',artState:state}).filename,idle.filename);
 assert.ok(needle.combat.firstTell>=.65);let charged=false,locked=false,shot=null;const locks=[];
 for(let n=0;n<1200&&!shot;n++){
  updateGame(g,DT,locked?{y:1}:{});
  for(const e of consumeEvents(g)){
   if(e.type==='aimLock'&&e.enemyId===needle.id)locks.push(e);
   if(e.type==='enemyShot'&&e.enemyId===needle.id)shot=e;
  }
  if(!(needle.telegraph>0))continue;
  const before=JSON.stringify(needle),paths=[],glows=[],target=needle.sequence?.bundles.slice(needle.sequence.index||0).find(b=>!b.released&&b.lockedTarget)?.lockedTarget;
  const c=new Proxy({}, {get:(o,k)=>k in o?o[k]:(...args)=>paths.push([k,...args])});
  Renderer.prototype.drawThreats.call({glow(c,x,y){glows.push({x,y});}},c,{...g,enemies:[needle]});
  assert.equal(JSON.stringify(needle),before,'presentation does not alter lock/timing/projectiles/RNG');
  assert.ok(paths.filter(p=>p[0]==='ellipse').length>=3,'coil glyph surrounds the physical gun');
  assert.deepEqual(glows,enemyMuzzles(needle));
  if(target){locked=true;assert.ok(paths.some(p=>p[0]==='lineTo'&&p[1]===target.x&&p[2]===target.y),'guide ends at the actual immutable lock');}
  else charged=true;
 }
 assert.ok(charged&&locked&&locks.length&&shot);
 for(const s of shot.shots){const lock=locks.find(e=>Math.abs(e.lockAt-s.lockAt)<1e-9);assert.ok(lock);assert.deepEqual(s.lockedTarget,lock.lockedTarget);}
 assert.equal(shot.launchPorts.length,1);assert.equal(shot.launchPorts[0].index,0);
}));

test('Dart naturally enters the Stage3 contact phrase and fires all three immutable-lock rounds from its single physical port',()=>registered(()=>{
 const g=fixture(2),events=[];updateGame(g,DT,{});events.push(...consumeEvents(g));g.nextWaveAt=Infinity;
 const dart=g.enemies.find(e=>e.type==='dart');assert.ok(dart);assert.equal(getMechaSpec(dart).key,'local-dart-representative-v1');
 for(let n=0;n<960;n++){updateGame(g,DT,{});events.push(...consumeEvents(g));}
 const releases=events.filter(e=>e.type==='enemyShot'&&e.enemyId===dart.id);assert.equal(releases.length,6);
 const shots=releases.flatMap(e=>e.shots),locks=events.filter(e=>e.type==='aimLock'&&e.enemyId===dart.id);
 assert.equal(locks.length,2);assert.equal(shots.length,6);assert.ok(shots.every(s=>s.style==='rail'&&s.lockAt<s.launchedAt));
 assert.deepEqual([...new Set(releases.map(e=>e.attackIndex))],[0,1]);
 for(const cycle of [0,1]){
  const burst=releases.filter(e=>e.attackIndex===cycle).flatMap(e=>e.shots);assert.equal(burst.length,3);
  for(const s of burst){const lock=locks.find(e=>Math.abs(e.lockAt-s.lockAt)<1e-9);assert.ok(lock);assert.deepEqual(s.lockedTarget,lock.lockedTarget);}
  assert.ok(Math.abs(burst[1].launchedAt-burst[0].launchedAt-.12)<DT*2);assert.ok(Math.abs(burst[2].launchedAt-burst[1].launchedAt-.12)<DT*2);
 }
 assert.ok(releases.every(e=>e.launchPorts.length===1&&e.launchPorts[0].index===0));
 assert.equal(enemyMuzzles(dart).length,1);
}));

test('Scarab transfers exactly two matching dragonflies from occupied physical docks and keeps spent semantic hulls empty',()=>registered(()=>{
 const g=fixture(2,35),events=[],births=new Map();updateGame(g,DT,{});consumeEvents(g);
 const scarab=g.enemies.find(e=>e.type==='scarab');assert.ok(scarab);g.enemies=[scarab];g.nextWaveAt=Infinity;
 // Natural normal-script spawn, then an isolated unsuppressed nofire/immortal
 // fixture for finite payload handoff; not normal survival or tempo evidence.
 let charge=false,fire=false,dockTell=false;
 for(let n=0;n<600;n++){
  updateGame(g,DT,{});const current=consumeEvents(g);events.push(...current);const spec=getMechaSpec(scarab);
  for(const event of current.filter(e=>e.type==='payloadDeployed')){
    const child=g.enemies.find(e=>e.id===event.childId);assert.ok(child);
    assert.ok(Math.hypot(child.x-event.x,child.y-event.y)<1e-8,'first-frame physical pivot equals the released dock');
    births.set(child.id,{...child,spec:getMechaSpec(child),ports:enemyMuzzles(child)});
  }
  charge||=spec.state.startsWith('charge_');fire||=spec.state.startsWith('fire_');dockTell||=enemyDeployDocks(g,scarab).length===2;
 }
 assert.ok(charge&&fire&&dockTell);const deployments=events.filter(e=>e.type==='payloadDeployed'&&e.enemyId===scarab.id);assert.equal(deployments.length,2);
 assert.deepEqual(deployments.map(e=>e.dockIndex),[0,1]);assert.deepEqual(deployments.map(e=>e.payloadRemaining),[1,0]);
 assert.deepEqual(scarab.payloadDockOccupied,[false,false]);const spec=getMechaSpec(scarab);
 assert.equal(spec.state,'idle_payload0');assert.equal(spec.payloadCount,0);assert.deepEqual(spec.payloadVisible,[false,false]);assert.equal(enemyMuzzles(scarab).length,0);
 for(const deployment of deployments){
  const child=births.get(deployment.childId);assert.ok(child);assert.equal(child.type,'dragonfly');assert.equal(child.appearanceKey,'local-scarab-child-v2');
  assert.equal(child.score,0);assert.equal(child.canDeploy,false);assert.equal(child.dropHealth,false);assert.equal(child.bossRewardEligible,false);
  assert.equal(child.spec.displayWidth,144);assert.equal(child.ports.length,1);
  const release=events.find(e=>e.type==='enemyShot'&&e.enemyId===child.id);assert.ok(release);assert.equal(release.launchPorts[0].index,0);
 }
}));
