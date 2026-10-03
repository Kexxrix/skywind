import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,startGame,updateGame,consumeEvents,screenToWorld,worldToScreen,getPickupEffect} from '../src/game.js';
import {combatProfile} from '../src/combat-tuning.js';
import {trialDifficulty} from '../src/level.js';
import {MECHA_MANIFEST_PATH,registerMechaManifest,getMechaSpec,mechaAnchorWorld} from '../src/mecha-art.js';

const STEP=1/120;
function fixture(type='wasp',x=860,y=360){
  const game=createGame(120201);startGame(game);game.mode='playing';
  game.nextWaveAt=game.nextBossAt=game.nextPickupAt=Infinity;
  game.recoverySpawned=true;game.droneMarked=true;
  Object.assign(game.player,screenToWorld(game,{x:220,y:360}),{invincible:100});
  const combat=combatProfile(type),position=screenToWorld(game,{x,y});
  const enemy={id:game.nextId++,type,...position,baseY:position.y,radius:combat.radius,hp:combat.hp,maxHp:combat.hp,
    speed:combat.speed,score:combat.score,combat,phase:0,age:0,angle:0,attack:0,fireCooldown:0};
  game.enemies=[enemy];consumeEvents(game);return{game,enemy};
}
function step(game,input){
  updateGame(game,STEP,input||{pointer:screenToWorld(game,{x:220,y:360})});return consumeEvents(game);
}
function until(game,predicate,seconds=18,input){
  const events=[];
  for(let elapsed=0;elapsed<seconds&&!predicate();elapsed+=STEP)events.push(...step(game,input));
  assert.ok(predicate(),'expected lifecycle state reached before timeout');return events;
}

test('both body runners complete three real committed dashes and permanently leave without rewards',()=>{
  for(const type of ['wasp','pincer']){
    const{game,enemy}=fixture(type);
    const events=until(game,()=>!game.enemies.includes(enemy));
    assert.equal(events.filter(e=>e.type==='dashStart'&&e.enemyId===enemy.id).length,3,type);
    assert.deepEqual(events.filter(e=>e.type==='dashEnd'&&e.enemyId===enemy.id).map(e=>e.completed),[1,2,3],type);
    assert.equal(events.filter(e=>e.type==='bodyExit'&&e.enemyId===enemy.id).length,1);
    assert.equal(enemy.bodyState,'exit');assert.equal(enemy.bodyAttacksCompleted,3);
    assert.ok(!enemy.dead,'removal is not a kill');
    assert.equal(game.score,0);assert.equal(game.combo,0);assert.equal(game.bossesDefeated,0);assert.equal(game.pickups.length,0);
    assert.ok(!events.some(e=>e.type==='explosion'||e.type==='bossDefeated'));
    assert.equal(game.enemyBullets.length,0);
    const index=events.findIndex(e=>e.type==='bodyExit');
    assert.ok(!events.slice(index+1).some(e=>['dashStart','dashLock','charge'].includes(e.type)&&e.enemyId===enemy.id));
  }
});

test('killing a body runner after one or two completed dashes never counts death as another completion',()=>{
  for(const type of ['wasp','pincer'])for(const completed of [1,2]){
    const{game,enemy}=fixture(type),events=until(game,()=>enemy.bodyAttacksCompleted===completed);
    game.bullets.push({id:game.nextId++,x:enemy.x,y:enemy.y,vx:0,vy:0,radius:30,power:1000,age:0,weaponMode:'normal'});
    events.push(...step(game));
    assert.ok(!game.enemies.includes(enemy));assert.equal(enemy.bodyAttacksCompleted,completed);
    assert.equal(events.filter(e=>e.type==='explosion'&&e.enemyId===enemy.id).length,1);
    assert.ok(!events.some(e=>e.type==='bodyExit'&&e.enemyId===enemy.id));
    assert.equal(game.score,enemy.combat.score);assert.equal(game.bossesDefeated,0);
  }
});

test('pause and resume preserve a pending completion and the exit clock without repeating attacks',()=>{
  for(const type of ['wasp','pincer']){
    const{game,enemy}=fixture(type);until(game,()=>enemy.bodyState==='dash'&&enemy.bodyAttacksCompleted===2);
    game.mode='paused';const paused=structuredClone(game);
    for(let frame=0;frame<30;frame++)updateGame(game,.12,{shoot:true,y:1});
    assert.deepEqual(game,paused);
    game.mode='playing';const events=until(game,()=>enemy.bodyState==='exit');
    assert.equal(events.filter(e=>e.type==='dashEnd').length,1);assert.equal(enemy.bodyAttacksCompleted,3);
    game.mode='paused';const exitClock=enemy.exitTime;updateGame(game,.12);assert.equal(enemy.exitTime,exitClock);
    game.mode='playing';until(game,()=>!game.enemies.includes(enemy),3.2,{y:-1});
  }
});

test('completed runner exits are bounded at both altitude edges, to the right and with zero speed',()=>{
  // Controlled final-dash boundaries, separate from the full three-dash run.
  for(const type of ['wasp','pincer'])for(const y of [40,360,680])for(const direction of [[1,0],[0,1],[0,-1],[0,0]]){
    const{game,enemy}=fixture(type,600,y);
    Object.assign(enemy,{bodyState:'dash',bodyAttacksCompleted:2,dashTime:STEP/2,
      dashVX:direction[0]*enemy.combat.bodyAttack.dashSpeed,dashVY:direction[1]*enemy.combat.bodyAttack.dashSpeed,
      attackAngle:Math.atan2(direction[1],direction[0]),locked:false});
    if(!direction[0]&&!direction[1]){enemy.speed=0;enemy.combat.bodyAttack.dashSpeed=0;}
    const events=step(game);assert.equal(enemy.bodyState,'exit');
    events.push(...until(game,()=>!game.enemies.includes(enemy),3.2,{y:y<360?1:-1}));
    assert.equal(enemy.bodyAttacksCompleted,3);assert.equal(events.filter(e=>e.type==='bodyExit').length,1);
    assert.ok(!events.some(e=>e.type==='dashStart'||e.type==='explosion'));
    assert.equal(game.score,0);assert.equal(game.pickups.length,0);assert.equal(game.bossesDefeated,0);
  }
});

test('an approach blocked by an altitude edge or the quiet period keeps moving instead of camping',()=>{
  for(const type of ['wasp','pincer'])for(const condition of ['upper','lower','quiet']){
    const{game,enemy}=fixture(type,600,condition==='upper'?40:condition==='lower'?680:360);
    if(condition==='quiet'){game.time=42;game.normalTime=42;}
    const startX=enemy.x;for(let frame=0;frame<12;frame++)step(game);
    assert.ok(enemy.x<startX-20,`${type}/${condition}: flyby continues while brace is unavailable`);
    until(game,()=>!game.enemies.includes(enemy),12);
    assert.ok((enemy.bodyAttacksCompleted||0)<=3);
  }
});

test('a real pincer hull that leaves the screen during bait cannot lock an unseen follow-up dash',()=>{
  registerMechaManifest(JSON.parse(readFileSync(MECHA_MANIFEST_PATH,'utf8')));
  try{
    const{game,enemy}=fixture('pincer',50,360);
    Object.assign(enemy,{bodyState:'bait',bodyTimer:enemy.combat.bodyAttack.baitSeconds,
      bodyAttacksCompleted:1,locked:true,artState:'charge'});
    const bounds=getMechaSpec(enemy).runtimeBodyBounds;
    const hullLeft=()=>Math.min(...[[bounds.minX,bounds.minY],[bounds.minX,bounds.maxY],
      [bounds.maxX,bounds.minY],[bounds.maxX,bounds.maxY]]
      .map(([x,y])=>worldToScreen(game,mechaAnchorWorld(enemy,{x,y})).x));
    assert.ok(hullLeft()>0,'the actual charge hull is fully visible when bait begins');
    const events=until(game,()=>enemy.bodyState==='approach',1);
    assert.ok(hullLeft()<0,'bait travel hides part of the actual hull at the lock boundary');
    const cancelled=events.filter(e=>e.type==='bodyAttackCancelled'&&e.enemyId===enemy.id);
    assert.equal(cancelled.length,1);assert.equal(cancelled[0].reason,'offscreen-tell');
    assert.equal(cancelled[0].completed,1);assert.equal(enemy.bodyAttacksCompleted,1);
    assert.equal(enemy.locked,false);assert.equal(enemy.telegraph,0);
    events.push(...until(game,()=>!game.enemies.includes(enemy),8));
    assert.ok(!events.some(e=>['dashLock','dashStart','dashEnd','charge','explosion','bossDefeated'].includes(e.type)));
    assert.equal(enemy.bodyAttacksCompleted,1,'cancelled bait is never a completed dash');
    assert.equal(game.score,0);assert.equal(game.pickups.length,0);assert.equal(game.bossesDefeated,0);
  }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});

test('a boss body dash never enters the normal runner completion or exit budget',()=>{
  const{game}=fixture();game.enemies=[];game.bossesDefeated=2;game.difficulty=trialDifficulty(2);game.nextBossAt=0;
  for(let frame=0;frame<170;frame++)step(game);
  const boss=game.boss;boss.attack=3;boss.fireCooldown=0;
  const events=[];for(let frame=0;frame<1680;frame++)events.push(...step(game));
  assert.ok(events.some(e=>e.type==='dashEnd'&&e.bossKind==='lancer'));
  assert.ok(game.enemies.includes(boss));assert.equal(boss.bodyAttacksCompleted,undefined);
  assert.ok(!events.some(e=>e.type==='bodyExit'&&e.enemyId===boss.id));
});

test('pickup previews are pure and expose the real replacement, extension, growth and capped drone result',()=>{
  const base={hp:93,maxHp:100,weaponMode:'lance',powerTime:0,basicLevel:1,droneTime:0,powerPickups:0};
  const cases=[
    [{...base,powerTime:30},{type:'maintain'},'extend','maintain',45,1,0],
    [{...base,powerTime:45},{type:'maintain'},'extend','maintain',45,1,0],
    [base,{type:'maintain'},'levelUp','maintain',0,2,0],
    [{...base,basicLevel:5},{type:'maintain'},'drone','maintain',0,5,15],
    [{...base,powerTime:40},{type:'change',weaponMode:'helix'},'change','change',18,1,0],
    [base,{type:'power'},'change','change',18,1,0],
  ];
  for(const[player,item,effect,colorGroup,powerTime,basicLevel,droneTime]of cases){
    Object.freeze(player);Object.freeze(item);const before=JSON.stringify({player,item});
    const result=getPickupEffect(player,item);
    assert.equal(result.effect,effect);assert.equal(result.colorGroup,colorGroup);assert.equal(result.action,effect);
    assert.equal(result.powerTime,powerTime);assert.equal(result.basicLevel,basicLevel);assert.equal(result.droneTime,droneTime);
    assert.equal(result.changesWeapon,effect==='change');assert.equal(result.extendsWeapon,effect==='extend');
    assert.equal(JSON.stringify({player,item}),before);
  }
  assert.equal(getPickupEffect({...base,powerTime:45},{type:'maintain'}).powerTimeDelta,0);
  assert.equal(getPickupEffect(base,{type:'power'}).weaponMode,'spread');
  const heal=getPickupEffect(base,{type:'health',healAmount:14});
  assert.equal(heal.action,'heal');assert.equal(heal.colorGroup,'heal');assert.equal(heal.hp,100);assert.equal(heal.rawHeal,14);
});

test('actual pickup application agrees with the preview and re-evaluates an expiring special at collection',()=>{
  for(const type of ['maintain','change','power','drone','health'])for(const powerTime of [0,.0005,30,45]){
    const{game}=fixture();game.enemies=[];Object.assign(game.player,{powerTime,basicLevel:5,droneTime:4,hp:93});
    const item={id:game.nextId++,type,weaponMode:type==='change'?'helix':undefined,healAmount:14,
      x:game.player.x,y:game.player.y,baseY:game.player.y,radius:22,phase:0,attracting:true,
      attractTime:.18,attractFrom:{x:game.player.x,y:game.player.y},attractDistance:0};
    const expected=getPickupEffect({...game.player,powerTime:Math.max(0,powerTime-.001),droneTime:3.999},item);
    const rng=game.rng;game.pickups=[item];updateGame(game,.001);
    const pickup=consumeEvents(game).find(e=>e.type==='pickup');assert.equal(pickup.effect,expected.effect);
    for(const key of ['hp','weaponMode','powerTime','droneTime','basicLevel','powerPickups'])assert.equal(game.player[key],expected[key],`${type}/${powerTime}/${key}`);
    assert.equal(game.rng,rng,'preview and application consume no random values');
  }
});
