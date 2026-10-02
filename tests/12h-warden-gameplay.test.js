import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,startGame,updateGame,consumeEvents,enemyMuzzles,enemyChargeMuzzles,PLAYER_HIT_RADIUS} from '../src/game.js';
import {registerMechaManifest,getMechaSpec} from '../src/mecha-art.js';

const manifest=()=>JSON.parse(readFileSync(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
const advance=(g,seconds)=>{const events=[];for(let time=0;time<seconds-1e-9;time+=1/120){updateGame(g,Math.min(1/120,seconds-time),{});events.push(...consumeEvents(g));}return events;};
function registered(run){registerMechaManifest(manifest());try{return run();}finally{registerMechaManifest({schemaVersion:1,entries:[]});}}

test('the adopted Warden mechanism denies forced early open frames and retracts its real core immediately',()=>registered(()=>{
  const g=createGame(120201);startGame(g);g.mode='playing';g.nextWaveAt=g.nextPickupAt=Infinity;g.nextBossAt=0;
  // This isolated animation/permission fixture is not a difficulty or survival run.
  g.player.invincible=100;advance(g,1.3);
  const e=g.boss;assert.equal(g.phase,'boss');assert.equal(getMechaSpec(e).key,'local-v2-warden');
  e.mechanismProgress=0;e.artFrame='phase_100';
  e.sequence={elapsed:0,index:0,duration:10,bundles:[{at:10,count:0,pattern:'lunge'}]};
  e.attackSpec={openWindow:{delay:0,duration:1.2,enabled:true}};e.chargeDuration=.1;
  advance(g,.59);assert.equal(getMechaSpec(e).state,'phase_75');
  assert.equal(getMechaSpec(e).coreExposed,false);assert.equal(e.coreVulnerable,false);assert.equal(e.artFrame,undefined);
  advance(g,.02);assert.equal(getMechaSpec(e).state,'phase_100');assert.equal(e.coreVulnerable,true);
  e.artFrame='open';advance(g,.61);
  assert.notEqual(getMechaSpec(e).state,'phase_100');assert.notEqual(getMechaSpec(e).state,'open');
  assert.equal(getMechaSpec(e).coreExposed,false);assert.equal(e.coreVulnerable,false);assert.equal(e.artFrame,undefined);
  assert.equal(g.player.radius,PLAYER_HIT_RADIUS);
}));

test('charge ports follow the next actual Warden bundle and its simultaneous peers without changing combat state',()=>registered(()=>{
  const g=createGame(120202),e={type:'boss',bossKind:'warden',x:1000,y:360,radius:92,mechanismProgress:0,safeLane:360,safeDirection:1};
  e.sequence={pattern:'cathedral',index:0,elapsed:-.75,cos:1,sin:0,roll:0,cameraY:0,bundles:[
    {at:0,count:4,port:0,pattern:'cathedral',speed:120},
    {at:.08,count:4,port:1,pattern:'cathedral',speed:120},
    {at:.16,count:4,port:2,pattern:'cathedral',speed:120},
    {at:.16,count:4,port:3,pattern:'cathedral',speed:120},
    {at:3,count:1,port:4,pattern:'snapshot',speed:340},
  ]};
  const muzzles=enemyMuzzles(e);assert.equal(muzzles.length,5);
  const before=JSON.stringify(e),seed=g.seed;
  assert.deepEqual(enemyChargeMuzzles(g,e),[muzzles[0]]);assert.equal(JSON.stringify(e),before);assert.equal(g.seed,seed);
  e.sequence.index=1;assert.deepEqual(enemyChargeMuzzles(g,e),[muzzles[1]]);
  e.sequence.index=2;assert.deepEqual(enemyChargeMuzzles(g,e),[muzzles[2],muzzles[3]]);
  e.sequence.index=4;assert.deepEqual(enemyChargeMuzzles(g,e),[muzzles[4]]);
  e.sequence.index=5;assert.deepEqual(enemyChargeMuzzles(g,e),[]);
}));

test('a fully carved route, body action, deploy action or uncued reservation never fabricates gun charge ports',()=>registered(()=>{
  const g=createGame(120203),e={type:'boss',bossKind:'warden',x:1000,y:360,radius:92,mechanismProgress:0,safeLane:360,safeDirection:1};
  g.difficulty={...g.difficulty,corridorWidth:1400};
  e.sequence={pattern:'B04',index:0,cos:1,sin:0,roll:0,cameraY:0,bundles:[{at:0,count:20,port:0,speed:140}]};
  assert.deepEqual(enemyChargeMuzzles(g,e),[],'the route aperture removes every geometry point');
  for(const pattern of ['deploy','lunge']){e.sequence.pattern=pattern;assert.deepEqual(enemyChargeMuzzles(g,e),[]);}
  e.sequence=null;e.pendingAttackPlan={plan:{}};assert.deepEqual(enemyChargeMuzzles(g,e),[]);
  e.pendingAttackPlan=null;e.muzzles=enemyMuzzles(e);assert.deepEqual(enemyChargeMuzzles(g,e),e.muzzles,'legacy fallback remains explicit');
}));
