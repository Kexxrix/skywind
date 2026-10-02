import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,startGame,updateGame,consumeEvents,enemyMuzzles,enemyDeployDocks,PLAYER_HIT_RADIUS} from '../src/game.js';
import {registerMechaManifest,getMechaSpec} from '../src/mecha-art.js';
import {trialDifficulty} from '../src/level.js';

const manifest=()=>JSON.parse(readFileSync(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
function registered(run){registerMechaManifest(manifest());try{return run();}finally{registerMechaManifest({schemaVersion:1,entries:[]});}}
function fixture(victories){const g=createGame(120201);startGame(g);g.mode='playing';g.bossesDefeated=victories;g.difficulty=trialDifficulty(victories);g.nextWaveAt=g.nextPickupAt=Infinity;g.nextBossAt=0;
  // These controlled pose/transfer checks do not establish survival or difficulty.
  g.player.invincible=100;for(let step=0;step<156;step++){updateGame(g,1/120,{});consumeEvents(g);}return g;}

test('the actual carrier transfers both finite payloads at their matching pivots without entry duplicates or first-step movement',()=>registered(()=>{
  const g=fixture(1),e=g.boss;assert.equal(getMechaSpec(e).key,'local-carrier-v2');assert.equal(g.enemies.length,1);
  const transfers=[];let bayCue=false;
  for(let step=0;step<240&&!transfers.length;step++){
    if(enemyDeployDocks(g,e).length===2)bayCue=true;
    updateGame(g,1/120,{});const events=consumeEvents(g);transfers.push(...events.filter(event=>event.type==='payloadDeployed'));
  }
  assert.equal(bayCue,true);assert.equal(transfers.length,2);assert.deepEqual(e.payloadDockOccupied,[false,false]);
  assert.deepEqual(transfers.map(event=>event.dockIndex),[0,1]);assert.equal(transfers[0].toFrame,'phase_100_payload1far');assert.equal(transfers[1].toFrame,'phase_100_payload0');
  for(const transfer of transfers){const child=g.enemies.find(other=>other.id===transfer.childId);
    assert.equal(child.appearanceKey,'local-carrier-child-v2');assert.equal(getMechaSpec(child).key,child.appearanceKey);
    assert.equal(child.x,transfer.x);assert.equal(child.y,transfer.y);assert.equal(child.artAngle,e.artAngle);
    assert.equal(child.score,0);assert.equal(child.canDeploy,false);assert.equal(child.bossRewardEligible,false);
  }
  assert.equal(getMechaSpec(e).payloadCount,0);assert.equal(enemyDeployDocks(g,e).length,0);assert.equal(e.coreVulnerable,false);
  const children=g.enemies.filter(other=>other.summoned),before=children.map(child=>({x:child.x,y:child.y,angle:child.artAngle}));
  updateGame(g,1/120,{});consumeEvents(g);
  children.forEach((child,index)=>{assert.ok(Math.hypot(child.x-before[index].x,child.y-before[index].y)<3);assert.ok(Math.abs(child.artAngle-before[index].angle)<.02);});
  let laterTransfers=0;
  for(let step=0;step<600;step++){updateGame(g,1/120,{});laterTransfers+=consumeEvents(g).filter(event=>event.type==='payloadDeployed').length;}
  assert.equal(laterTransfers,0,'spent docks cannot create another wave even after children leave the playfield');
  assert.deepEqual(e.payloadDockOccupied,[false,false]);
  assert.equal(g.player.radius,PLAYER_HIT_RADIUS);
}));

test('a full enemy budget consumes no carrier payload and one free slot consumes only the matching first dock',()=>registered(()=>{
  for(const free of [0,1]){
    const g=fixture(1),e=g.boss;
    while(g.enemies.length<g.difficulty.maxEnemies-free)g.enemies.push({id:g.nextId++,type:'beetle',x:1200,y:360,baseY:360,radius:2,hp:100,speed:0,age:0,phase:0,fireCooldown:1e6});
    const transfers=[];for(let step=0;step<300;step++){updateGame(g,1/120,{});transfers.push(...consumeEvents(g).filter(event=>event.type==='payloadDeployed'));}
    assert.equal(transfers.length,free);assert.deepEqual(e.payloadDockOccupied,free?[false,true]:[true,true]);
    assert.equal(getMechaSpec(e).payloadCount,free?1:2);assert.ok(g.enemies.length<=g.difficulty.maxEnemies);
  }
}));

test('lancer real releases use the recoil snapshot muzzle and protected closing never leaves a final fire core',()=>registered(()=>{
  const g=fixture(2),e=g.boss;assert.equal(getMechaSpec(e).key,'local-lancer-v2');
  let shot;
  for(let step=0;step<300&&!shot;step++){
    updateGame(g,1/120,{});shot=consumeEvents(g).find(event=>event.type==='enemyShot'&&event.enemyId===e.id&&event.bulletCount>0);
  }
  assert.ok(shot);assert.match(getMechaSpec(e).state,/_fire$/);
  const actual=enemyMuzzles(e);assert.ok(shot.launchMuzzles.every(origin=>actual.some(muzzle=>Math.hypot(origin.x-muzzle.x,origin.y-muzzle.y)<1e-8)));
  const recoil=getMechaSpec(e),neutral=getMechaSpec({...e,artFrame:undefined,fireFlash:0});
  assert.ok(Math.abs(Math.hypot(recoil.runtimeMuzzles[0].x-neutral.runtimeMuzzles[0].x,recoil.runtimeMuzzles[0].y-neutral.runtimeMuzzles[0].y)-38.87854)<.001);
  e.sequence=null;e.locked=false;e.fireCooldown=100;e.coreOpenUntil=0;e.mechanismProgress=1;e.artFrame='phase_100_fire';e.armorOpen=true;e.coreVulnerable=true;
  updateGame(g,1/120,{});consumeEvents(g);assert.ok(e.mechanismProgress<=.75);assert.equal(e.coreVulnerable,false);assert.equal(getMechaSpec(e).coreExposed,false);
  assert.notEqual(getMechaSpec(e).state,'phase_100_fire');
}));
