import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,updateGame,consumeEvents,screenToWorld,worldToScreen,bodyCoreContact,PLAYER_HIT_RADIUS} from '../src/game.js';
import {combatProfile} from '../src/combat-tuning.js';
import {trialDifficulty} from '../src/level.js';
import {registerMechaManifest,getMechaSpec} from '../src/mecha-art.js';

// Isolated authored fixtures verify real updateGame connections, not human play.
function fixture(pace=0){
  const g=createGame(120201);startGame(g);g.mode='playing';g.bossesDefeated=pace;g.difficulty=trialDifficulty(pace);
  Object.assign(g.player,screenToWorld(g,{x:220,y:360}),{invincible:0});
  g.nextWaveAt=g.nextBossAt=g.nextPickupAt=Infinity;consumeEvents(g);return g;
}
function advance(g,seconds,input={}){const events=[];for(let t=0;t<seconds-1e-9;t+=1/120){updateGame(g,Math.min(1/120,seconds-t),input);events.push(...consumeEvents(g));}return events;}
function actor(g,type,x=860,y=360){const combat=combatProfile(type,g.difficulty.pace),position=screenToWorld(g,{x,y});
  return {id:g.nextId++,type,...position,baseY:position.y,radius:combat.radius,hp:combat.hp,maxHp:combat.hp,
    speed:combat.speed,phase:0,age:0,angle:0,attack:0,fireCooldown:0,combat};}

test('both actual body roles enter a committed dash without fabricating a projectile',()=>{
  for(const type of ['wasp','pincer']){
    const g=fixture(),enemy=actor(g,type);g.enemies=[enemy];
    let events=[],lock,dash;
    for(let t=0;t<2&&!dash;t+=1/120){events.push(...advance(g,1/120));lock=events.find(e=>e.type==='dashLock');dash=events.find(e=>e.type==='dashStart');}
    assert.ok(lock&&dash,type);assert.equal(g.enemyBullets.length,0);assert.equal(enemy.muzzles.length,0);
    assert.deepEqual(dash.lockedTarget,lock.lockedTarget);assert.equal(dash.retarget,false);
    const vx=enemy.dashVX,vy=enemy.dashVY;
    advance(g,.35,{y:1});assert.equal(enemy.dashVX,vx);assert.equal(enemy.dashVY,vy);
    assert.notEqual(g.player.y,lock.lockedTarget.y);
  }
});

test('rail bursts keep the target captured before the first release through later player movement',()=>{
  const g=fixture(1),enemy=actor(g,'dart',980,360);enemy.speed=0;g.enemies=[enemy];
  let events=[],lock;
  for(let t=0;t<2&&!lock;t+=1/120){events.push(...advance(g,1/120));lock=events.find(e=>e.type==='aimLock');}
  assert.ok(lock);events.push(...advance(g,.8,{y:1}));
  const shots=events.filter(e=>e.type==='enemyShot'&&e.pattern==='rail').flatMap(e=>e.shots);
  assert.equal(shots.length,3);for(const shot of shots){assert.deepEqual(shot.lockedTarget,lock.lockedTarget);assert.ok(shot.lockAt<shot.launchedAt);}
  assert.notEqual(g.player.y,lock.lockedTarget.y);assert.equal(g.player.radius,PLAYER_HIT_RADIUS);
});

test('deployers have bounded zero-score nonrecursive children and cannot queue a blocked wave',()=>{
  const g=fixture(2),enemy=actor(g,'scarab',980,360);enemy.speed=0;enemy.pattern='deploy';enemy.holdUntil=100;g.enemies=[enemy];
  const events=advance(g,16),children=g.enemies.filter(e=>e.summoned&&e.parentId===enemy.id);
  assert.ok(events.some(e=>e.type==='escortDeployed'&&e.count>0));assert.ok(children.length<=4);
  assert.ok(children.every(e=>e.score===0&&e.canDeploy===false&&e.dropHealth===false&&e.bossRewardEligible===false));
  assert.ok(!g.pickups.some(p=>p.spawnReason==='summoned-enemy'));assert.ok(g.enemies.length<=g.difficulty.maxEnemies);
});

test('killing a summoned child cannot farm score, combo lifetime or a marked reward',()=>{
  const g=fixture(),enemy=actor(g,'dragonfly',800,360);
  Object.assign(enemy,{summoned:true,markedDrone:true,score:200,speed:0,hp:1});g.enemies=[enemy];
  g.combo=7;g.comboTime=2;g.score=100;
  g.bullets=[{x:enemy.x,y:enemy.y,vx:0,vy:0,radius:6,power:99}];
  const death=advance(g,.01).find(e=>e.type==='explosion'&&e.enemyId===enemy.id);
  assert.ok(death);assert.equal(death.score,0);assert.equal(g.score,100);assert.equal(g.combo,7);
  assert.ok(g.comboTime<2);assert.equal(g.pickups.length,0);
});

test('health telemetry separates nominal, effective and overflow healing at a fixed spawn amount',()=>{
  const g=fixture(2);g.player.hp=93;
  g.pickups=[{id:80,type:'health',x:g.player.x,y:g.player.y,baseY:g.player.y,radius:22,phase:0,
    healAmount:14,spawnReason:'normal-recovery',attracting:true,attractTime:.18,attractFrom:{x:g.player.x,y:g.player.y},attractDistance:0}];
  const pickup=advance(g,.01).find(e=>e.type==='pickup');
  assert.equal(pickup.hpBefore,93);assert.equal(pickup.hpAfter,100);assert.equal(pickup.rawHeal,14);
  assert.equal(pickup.effectiveHeal,7);assert.equal(pickup.overflowHeal,7);assert.equal(pickup.spawnReason,'normal-recovery');
});

test('final mechanism frame alone grants the core and retraction immediately restores protection',()=>{
  const frames={idle:{filename:'p0.png',coreExposed:false}};
  for(let index=0;index<5;index++)frames['p'+index]={filename:'p'+index+'.png',mechanismProgress:index/4,
    coreExposed:index===4,corePixels:{x:50,y:50,radius:5}};
  registerMechaManifest({schemaVersion:1,entries:[{key:'warden',weakpointEnabled:true,canvasWidth:100,canvasHeight:100,
    displayWidth:100,pivotPixels:{x:50,y:50},frames}]});
  try{
    const g=fixture();g.phase='boss';
    const e={...actor(g,'beetle',1000,360),type:'boss',bossKind:'warden',hp:100,maxHp:100,combat:undefined,
      motion:{x:1000,centerY:360,amplitude:0,frequency:0,bank:0},chargeDuration:.1,
      sequence:{elapsed:0,index:0,duration:10,bundles:[{at:10,count:0,pattern:'lunge'}]},
      attackSpec:{openWindow:{delay:0,duration:1.2,enabled:true}}};g.boss=e;g.enemies=[e];
    advance(g,.59);assert.equal(getMechaSpec(e).state,'p3');assert.equal(e.coreVulnerable,false);
    advance(g,.02);assert.equal(getMechaSpec(e).state,'p4');assert.equal(e.coreVulnerable,true);
    advance(g,.61);assert.notEqual(getMechaSpec(e).state,'p4');assert.equal(e.coreVulnerable,false);
  }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});

test('observation body helper shares the real strict swept fallback used for player damage',()=>{
  const enemy={type:'unregistered',x:600,y:300,radius:20};
  assert.equal(bodyCoreContact({x:700,y:300,radius:1.85},enemy,{x:500,y:300,radius:1.85}),true);
  assert.equal(bodyCoreContact({x:700,y:315.85,radius:1.85},enemy,{x:500,y:315.85,radius:1.85}),false);
});

test('a committed lancer crossing the firing boundary finishes once and reaches its next attack',()=>{
  const g=fixture(2);g.nextBossAt=0;g.player.invincible=100; // Controlled movement fixture, not a survival run.
  advance(g,1.3);g.boss.attack=3;g.boss.fireCooldown=0;
  const events=advance(g,14);
  assert.ok(events.some(e=>e.type==='dashStart'&&e.bossKind==='lancer'));
  assert.ok(events.some(e=>e.type==='dashEnd'&&e.bossKind==='lancer'));
  assert.ok(events.some(e=>e.type==='attackCompleted'&&e.pattern==='lunge'));
  assert.ok(events.some(e=>e.type==='enemyShot'&&e.pattern==='zipper'));
  assert.ok(!events.some(e=>e.type==='attackCancelled'&&e.pattern==='lunge'));
});

test('a held emitter stays at its authored screen column during camera roll and altitude follow',()=>{
  const g=fixture(2);g.altitude=.9;g.cameraY=120;
  const enemy=actor(g,'dart',1120,220);
  Object.assign(enemy,{pattern:'rail',holdUntil:100,holdScreenX:1120,holdScreenY:220,fireCooldown:10});
  g.enemies=[enemy];
  for(let step=0;step<120;step++){
    advance(g,1/120,{y:-.2});
    const screen=worldToScreen(g,enemy);
    assert.ok(Math.abs(screen.x-1120)<1e-6);
    assert.ok(Math.abs(screen.y-220)<1e-6);
  }
  assert.equal(enemy.firstShotAt,undefined);
  assert.ok(enemy.fireCooldown>8);
});
