import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {barragePlan,fieldOnlyPlan,patternGeometry}from'../src/barrage.js';import {normalEncounter}from'../src/level.js';
import {createGame,updateGame,consumeEvents,enemyChargeMuzzles}from'../src/game.js';import {registerMechaManifest}from'../src/mecha-art.js';import {Renderer}from'../src/renderer.js';
test('only the second Stage3 phrase bends its unchanged60-shot field budget; generic and boss plans stay untouched',()=>{
 const source=barragePlan('halo',2,.37),before=structuredClone(source),curve=fieldOnlyPlan(source,{shape:'curve-arc'});
 assert.equal(curve.total,60);assert.equal(curve.bundles.length,2);assert.equal(curve.duration,.58);
 assert.deepEqual(curve.bundles.map(b=>b.motion),[{kind:'curve',turnRate:.09,turnSeconds:2},{kind:'curve',turnRate:-.09,turnSeconds:2}]);
 for(const bundle of curve.bundles){const p=patternGeometry(bundle);assert.equal(p.length,30);assert.ok(p.every(p=>p.speed===260&&p.targetX===240));assert.equal(p[0].targetY,40);assert.equal(p.at(-1).targetY,680);}
 assert.deepEqual(source,before);assert.equal(fieldOnlyPlan(source).total,64);
 for(let pace=0;pace<6;pace++)for(const time of [0,8,17,27,35,39]){
  const roles=normalEncounter(time,pace).roles.filter(r=>r.fieldShape==='curve-arc');assert.equal(roles.length,pace===2&&time===8?1:0);
 }
 const phase=normalEncounter(8,2);assert.ok(phase.roles.some(r=>r.pattern==='rail'));assert.ok(phase.roles.some(r=>r.pattern==='zipper'));
});
test('the naturally scheduled curved field keeps both ports and its next real turn cue through independent immutable rail release',()=>{
 registerMechaManifest(JSON.parse(fs.readFileSync(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8')));
 try{
  const g=createGame(120201);g.mode='playing';g.bossesDefeated=2;g.normalTime=8;g.nextBossAt=g.nextPickupAt=Infinity;g.player.invincible=100;
  updateGame(g,1/120,{});consumeEvents(g);g.nextWaveAt=Infinity;const field=g.enemies.find(e=>e.fieldShape==='curve-arc');assert.ok(field);
  const sniper=g.enemies.find(e=>e.pattern==='rail');assert.ok(sniper);
  const shots=[],locks=[],skips=[];let cues=0;
  for(let n=0;n<1200;n++){
   updateGame(g,1/120,{});for(const e of consumeEvents(g)){if(e.type==='enemyShot')shots.push(e);if(e.type==='aimLock')locks.push(e);if(e.type==='phraseSkipped')skips.push(e);}
   const bundle=field.sequence?.bundles.slice(field.sequence.index||0).find(b=>!b.released&&b.motion?.kind==='curve');if(!bundle)continue;
   const before=JSON.stringify(field),paths=[],glows=[],c=new Proxy({}, {get:(o,k)=>k in o?o[k]:(...args)=>paths.push([k,...args])});
   Renderer.prototype.drawThreats.call({glow(c,x,y){glows.push({x,y});}},c,{...g,enemies:[field]});
   assert.equal(JSON.stringify(field),before);assert.deepEqual(glows,enemyChargeMuzzles(g,field));
   const sign=bundle.motion.turnRate>0?-1:1;assert.ok(paths.some(p=>p[0]==='quadraticCurveTo'&&p[4]===sign*20));cues++;
  }
  assert.ok(cues);const curved=shots.filter(e=>e.enemyId===field.id);
  assert.deepEqual([...new Set(curved.map(e=>e.attackIndex))],[0,1]);
  for(const cycle of [0,1]){
   const rows=curved.filter(e=>e.attackIndex===cycle);
   assert.equal(rows.reduce((s,e)=>s+e.bulletCount,0),60,'each independent cycle preserves the authored field budget');
   assert.deepEqual(rows.flatMap(e=>e.launchPorts.map(p=>p.index)),[0,1]);
  }
  const rail=shots.filter(e=>e.pattern==='rail');
  assert.deepEqual([...new Set(rail.map(e=>e.attackIndex))],[0]);
  assert.equal(rail.reduce((s,e)=>s+e.bulletCount,0),3);
  assert.equal(sniper.attack,1);assert.equal(sniper.phraseExpired,true);
  assert.ok(skips.some(e=>e.phraseId===sniper.phrase.id&&e.cycleIndex===1&&e.reason==='phrase-deadline'
    &&e.latestReleaseAt+1/60>e.deadlineAt),'the independent field repeat never forces a late second sniper burst');
  for(const s of rail.flatMap(e=>e.shots)){const lock=locks.find(e=>e.enemyId===s.sourceId&&Math.abs(e.lockAt-s.lockAt)<1e-9)||locks.find(e=>Math.abs(e.lockAt-s.lockAt)<1e-9);assert.ok(lock);assert.deepEqual(s.lockedTarget,lock.lockedTarget);}
 }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});
