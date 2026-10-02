import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame, consumeEvents, screenToWorld } from '../src/game.js';
import { combatProfile } from '../src/combat-tuning.js';
import { registerMechaManifest } from '../src/mecha-art.js';
import { mechaBodyContact } from '../src/mecha-collision.js';

const box=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
function game(pace=0){
  const g=createGame(120201);g.mode='playing';g.bossesDefeated=pace;
  g.nextWaveAt=g.nextBossAt=g.nextPickupAt=Infinity;
  Object.assign(g.player,screenToWorld(g,{x:220,y:360}),{invincible:0});
  return g;
}

test('a body rusher observes the same total-family cap as projectile attackers',()=>{
  registerMechaManifest({schemaVersion:1,entries:[]});
  const g=game(2);g.normalTime=16;
  const combat=combatProfile('wasp',2),position=screenToWorld(g,{x:850,y:360});
  const e={id:90,type:'wasp',...position,baseY:position.y,radius:combat.radius,
    hp:combat.hp,maxHp:combat.hp,speed:combat.speed,phase:0,age:0,angle:0,attack:0,fireCooldown:0,combat};
  g.enemies=[e];
  g.enemyBullets=['radial','fan','aim'].map((family,index)=>({id:100+index,
    ...screenToWorld(g,{x:700,y:310+index*50}),vx:1,vy:0,speed:1,radius:1,age:0,family,
    pattern:['halo','petal','snapshot'][index]}));
  updateGame(g,1/120);
  const families=new Set(g.enemyBullets.map(b=>b.family));
  if(['bait','brace','dash'].includes(e.bodyState))families.add('body');
  assert.ok(families.size<=g.encounter.maxAttackFamilies,
    JSON.stringify({families:[...families],cap:g.encounter.maxAttackFamilies,bodyState:e.bodyState}));
});

test('a physical authored armor piece absorbs a shot on a line to an exposed core',()=>{
  registerMechaManifest({schemaVersion:1,entries:[{key:'warden',weakpointEnabled:true,
    canvasWidth:100,canvasHeight:100,displayWidth:100,pivotPixels:{x:50,y:50},
    frames:{idle:{filename:'idle.png'},open:{filename:'open.png',coreExposed:true,
      corePixels:{x:50,y:50,radius:5},bodyHullPixels:[box(10,40,20,20)]}}}]});
  try{
    const g=game();g.phase='boss';const position=screenToWorld(g,{x:1000,y:360});
    const e={id:90,type:'boss',bossKind:'warden',...position,radius:40,hp:100,maxHp:100,
      angle:0,artAngle:0,attack:0,fireCooldown:10,armorOpen:true,coreVulnerable:true,
      motion:{x:1000,centerY:360,amplitude:0,frequency:0,bank:0},chargeDuration:.1,
      sequence:{elapsed:.2,index:0,duration:10,bundles:[{at:10,count:0,pattern:'lunge'}]},
      attackSpec:{openWindow:{delay:0,duration:1.2,enabled:true}}};
    g.boss=e;g.enemies=[e];
    const bullet={id:91,x:e.x-30,y:e.y,vx:920,vy:0,radius:2,power:10,age:0};
    assert.equal(mechaBodyContact(e,bullet),true);
    g.bullets=[bullet];updateGame(g,1/120);
    const hits=consumeEvents(g).filter(event=>event.type==='hit'&&!event.player);
    assert.equal(hits.length,1,JSON.stringify({hp:e.hp,bulletAlive:g.bullets.includes(bullet),physicalBodyHit:mechaBodyContact(e,bullet)}));
    assert.equal(hits[0].coreHit,false);
  }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});

test('a sweep retains contact with the authored body present at the start of a mechanism frame change',()=>{
  registerMechaManifest({schemaVersion:1,entries:[{key:'probe',canvasWidth:100,canvasHeight:100,
    displayWidth:100,pivotPixels:{x:50,y:50},frames:{
      idle:{filename:'closed.png',bodyHullPixels:[box(15,45,10,10)]},
      open:{filename:'open.png',bodyHullPixels:[box(75,45,10,10)]}}}]});
  try{
    const before={type:'probe',x:500,y:300,artAngle:0,artState:'idle'};
    const after={...before,artState:'open'};
    const circle={x:470,y:300,radius:1.85};
    assert.equal(mechaBodyContact(before,circle),true);
    assert.equal(mechaBodyContact(after,circle),false);
    assert.equal(mechaBodyContact(after,circle,circle,before),true);
  }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});
