import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as engine from '../src/game.js';
import * as art from '../src/mecha-art.js';
import {normalEncounter} from '../src/level.js';

// Controlled engine boundaries, not a natural one-minute pressure witness.
// Start at an authored block and isolate its actual wave. Only the saturation,
// projectile-contact, visibility and phase-transition tests inject that named
// boundary. HP, core, movement, damage, tells and projectile flight stay real.
const DT=1/120;
const clamp=value=>Math.max(-1,Math.min(1,value));
function blockStart(name){
  for(let time=0;time<42;time++)if(normalEncounter(time).blockId==='1:'+name)return time;
  throw new Error('Missing authored block: '+name);
}
function fixture(normalTime=blockStart('ring-introduction'),independentEntry=false){
  art.registerMechaManifest(JSON.parse(readFileSync(new URL('../'+art.MECHA_MANIFEST_PATH.replace(/^\.\//,''),import.meta.url),'utf8')));
  const game=engine.createGame(620261003);
  game.mode='playing';game.normalTime=normalTime;
  game.nextWaveAt=0;game.nextBossAt=game.nextPickupAt=Infinity;
  Object.assign(game.player,engine.screenToWorld(game,{x:225,y:360}),{invincible:0});
  const f={game,events:[],members:[]};step(f);
  f.members=game.enemies.filter(enemy=>enemy.phrase);
  game.nextWaveAt=Infinity;
  assert.ok(f.members.length>=2);
  // Existing atomic-entry regression uses the declared legacy adapter only.
  // null leaves ordinary data intact for the independent-entry tests below.
  if(independentEntry!==null)f.members[0].phrase.independentEntry=independentEntry;
  f.initialDelays=f.members.map(e=>e.phraseDelay);
  assert.equal(f.members[0].phrase.independentRepeats,true,'ordinary data opts into the director');
  assert.equal(game.player.hp,100);
  return f;
}
function step(f){
  const p=engine.worldToScreen(f.game,f.game.player);
  const target=f.target||{x:225,y:360};
  engine.updateGame(f.game,DT,{x:clamp((target.x-p.x)/20),y:clamp((target.y-p.y)/30),shoot:false});
  const events=engine.consumeEvents(f.game);f.events.push(...events);
  assert.ok(f.game.enemyBullets.length+f.game.enemies.reduce((sum,e)=>sum+(e.reservedBullets||0),0)<=f.game.difficulty.maxEnemyBullets,
    JSON.stringify({time:f.game.time,bullets:f.game.enemyBullets.length,cap:f.game.difficulty.maxEnemyBullets,
      sources:f.game.enemies.map(e=>({id:e.id,type:e.type,attack:e.attack,reserved:e.reservedBullets,sequence:e.sequence?.elapsed,pending:Boolean(e.pendingAttackPlan)}))}));
  assert.equal(f.game.player.radius,1.85);
  assert.ok(f.game.enemyBullets.every(b=>Math.hypot(b.vx,b.vy)<=f.game.difficulty.maxBulletSpeed+1e-6));
  return events;
}
function until(f,condition,seconds=8){
  for(let frame=0;frame<seconds/DT&&f.game.mode==='playing'&&!condition();frame++)step(f);
  assert.ok(condition(),'runtime reaches the requested state without HP or invulnerability injection');
}
function admissions(f){return f.events.filter(e=>e.type==='phraseAdmitted'&&e.phraseId===f.members[0].phrase.id);}
function eventFor(f,type,member){return f.events.filter(e=>e.type===type&&e.enemyId===member.id);}
function hullContact(enemy){
  const hull=art.getMechaSpec(enemy)?.runtimeBodyHulls?.[0];assert.ok(hull?.length);
  return art.mechaAnchorWorld(enemy,hull.reduce((p,v)=>({x:p.x+v.x/hull.length,y:p.y+v.y/hull.length}),{x:0,y:0}));
}
function normalContacts(f,enemy,count){
  const point=hullContact(enemy);
  for(let i=0;i<count;i++)f.game.bullets.push({id:f.game.nextId++,x:point.x-10,y:point.y,
    vx:1360,vy:0,radius:5,power:1,pierce:0,hits:[],age:0,weaponMode:'normal'});
}
function bodyCorners(f,enemy){
  const b=art.getMechaSpec(enemy)?.runtimeBodyBounds;assert.ok(b,'actual adopted body bounds exist');
  return [[b.minX,b.minY],[b.minX,b.maxY],[b.maxX,b.minY],[b.maxX,b.maxY]]
    .map(([x,y])=>engine.worldToScreen(f.game,art.mechaAnchorWorld(enemy,{x,y})));
}

test('actual first group stays atomic while a field repeats after its own recovery before the rail is ready',()=>{
  const f=fixture(),field=f.members.find(e=>e.type==='orb'),rail=f.members.find(e=>e.type==='dart');
  assert.ok(field&&rail);
  until(f,()=>eventFor(f,'charge',field).length===2);
  const rows=admissions(f),first=rows[0],repeat=rows.find(e=>e.independent&&e.memberIds.includes(field.id));
  assert.equal(first.independent,false);assert.equal(first.cycleIndex,0);
  assert.deepEqual(first.memberIds,f.members.map(e=>e.id));
  assert.deepEqual(first.memberTiming.map(e=>e.delay),f.initialDelays);
  assert.equal(first.reservedBullets,63,'real trident36 + seed24 + three rail shots reserve together');
  assert.ok(repeat);assert.deepEqual(repeat.memberIds,[field.id]);assert.equal(repeat.cycleIndex,1);
  assert.equal(repeat.memberTiming[0].delay,0,'entry offset is applied only to the first group');
  assert.equal(repeat.reservedBullets,36,'the independent repeat reserves the complete real field plan');
  const fieldEnd=eventFor(f,'attackCompleted',field)[0],railEnd=eventFor(f,'attackCompleted',rail)[0];
  assert.ok(fieldEnd&&railEnd);
  const ownReady=fieldEnd.simulationAt+f.game.difficulty.fireInterval+(field.combat.recoverySeconds||0);
  const railReady=railEnd.simulationAt+f.game.difficulty.fireInterval+rail.combat.recoverySeconds;
  assert.ok(repeat.admittedAt>=ownReady-2*DT);
  assert.ok(repeat.admittedAt>=fieldEnd.simulationAt+.15-DT);
  assert.ok(repeat.admittedAt<railReady,'the field does not wait for the other source recovery');
  assert.ok(repeat.latestReleaseAt+1/60<=repeat.deadlineAt+1e-9);
  until(f,()=>eventFor(f,'enemyShot',field).some(e=>e.simulationAt>repeat.admittedAt));
  for(const member of f.members){
    const charge=eventFor(f,'charge',member)[0],shot=eventFor(f,'enemyShot',member).find(e=>e.bulletCount>0);
    assert.ok(charge&&shot);assert.ok(shot.simulationAt-charge.simulationAt>=charge.duration-DT);
    assert.equal(member.maxHp,member.combat.hp);
  }
  for(const shot of eventFor(f,'enemyShot',rail).flatMap(e=>e.shots)){
    assert.ok(shot.launchedAt-shot.lockAt>=.25-DT);
    const distance=Math.hypot(shot.lockedTarget.x-shot.x,shot.lockedTarget.y-shot.y)-shot.radius-1.85;
    assert.ok(distance/Math.hypot(shot.vx,shot.vy)>=.9);
  }
});

test('saturated independent repeats reserve no partial plan and expire without a delayed burst',()=>{
  const f=fixture();until(f,()=>f.members.every(e=>e.attack===1),5);
  // Stationary capacity fixture replaces the completed first volley only here.
  const committed=f.game.enemies.reduce((sum,e)=>sum+(e.reservedBullets||0),0);
  f.game.enemyBullets=Array.from({length:f.game.difficulty.maxEnemyBullets-committed},(_,i)=>({id:800000+i,
    sourceId:-1,x:600,y:80,vx:0,vy:0,radius:1,power:10,age:0,family:'aim'}));
  until(f,()=>f.members.every(e=>e.withdrawing),8);
  assert.equal(admissions(f).length,1);
  assert.ok(f.events.some(e=>e.type==='attackSkipped'&&e.reason==='bullet-reservation-cap'));
  assert.ok(f.events.some(e=>e.type==='phraseSkipped'&&e.reason==='phrase-deadline'&&e.cycleIndex===1));
  for(const member of f.members){
    assert.equal(member.attack,1);assert.equal(eventFor(f,'charge',member).length,1);
    assert.equal(member.reservedBullets,0);assert.equal(member.sequence,null);
    assert.equal(member.pendingAttackPlan,null);
  }
});

test('actual normal projectile contacts kill the pending second field and release only its unused reservation',()=>{
  const f=fixture(blockStart('window-introduction')),mantis=f.members[1];
  assert.equal(mantis.hp,mantis.combat.hp);
  until(f,()=>admissions(f).length===1&&mantis.pendingAttackPlan);
  assert.equal(mantis.attack,0);assert.equal(eventFor(f,'charge',mantis).length,0);
  const unused=mantis.reservedBullets;assert.ok(unused>0);
  normalContacts(f,mantis,mantis.maxHp);step(f);
  assert.equal(mantis.hp,0);assert.equal(mantis.dead,true);
  const cancellation=eventFor(f,'attackCancelled',mantis).find(e=>e.reason==='emitter-killed');
  assert.ok(cancellation);assert.equal(cancellation.unusedReservation,unused);
  assert.equal(mantis.reservedBullets,0);assert.equal(mantis.pendingAttackPlan,null);
  assert.equal(f.game.enemies.includes(mantis),false);
  until(f,()=>f.members.filter(e=>e!==mantis).every(e=>eventFor(f,'enemyShot',e).some(v=>v.bulletCount>0)),3);
  assert.equal(eventFor(f,'charge',mantis).length,0);assert.equal(eventFor(f,'enemyShot',mantis).length,0);
});

test('a visibility-cancelled first tell never restarts as an independent repeat and eventually departs',()=>{
  const f=fixture(),field=f.members.find(e=>e.type==='orb');
  until(f,()=>field.sequence&&field.locked);
  const holdX=field.holdScreenX;field.holdScreenX=1500;
  step(f);assert.ok(eventFor(f,'attackCancelled',field).some(e=>e.reason==='emitter-visibility'));
  field.holdScreenX=holdX;
  until(f,()=>field.withdrawing,9);
  assert.equal(field.attack,0);assert.equal(eventFor(f,'charge',field).length,1);
  assert.equal(eventFor(f,'enemyShot',field).length,0);
  assert.equal(admissions(f).filter(e=>e.independent&&e.memberIds.includes(field.id)).length,0);
  assert.ok(f.events.some(e=>e.type==='attackSkipped'&&e.enemyId===field.id&&e.reason==='phrase-first-cycle'));
});

test('completed sources keep live hulls and bullets during retreat and free the enemy slot only beyond actual body bounds',()=>{
  const f=fixture(0),field=f.members.find(e=>e.type==='orb');
  // Controlled one-completion boundary; ordinary opening may now author two.
  f.members[0].phrase.maxCycles=1;
  until(f,()=>field.withdrawing,5);
  assert.equal(field.attack,1);assert.equal(field.hp,field.maxHp);
  assert.equal(f.game.enemies.includes(field),true);assert.equal(field.retired,undefined);
  assert.ok(bodyCorners(f,field).some(p=>p.x<=engine.WORLD_WIDTH+120));
  const departing=eventFor(f,'sourceDeparting',field)[0];assert.equal(departing.reason,'cycles-complete');
  assert.equal(departing.hp,field.maxHp);
  const oldBullet=f.game.enemyBullets.find(b=>b.sourceId===field.id);assert.ok(oldBullet);
  const oldX=oldBullet.x,score=f.game.score,pickups=f.game.pickups.length;
  normalContacts(f,field,1);step(f);
  assert.equal(field.hp,field.maxHp-1,'withdrawing actual body remains hittable for normal damage');
  assert.ok(f.game.enemyBullets.includes(oldBullet));assert.notEqual(oldBullet.x,oldX);
  assert.equal(f.game.enemies.includes(field),true);
  let previous=engine.worldToScreen(f.game,field).x;
  for(let frames=0;frames<600&&!field.retired&&f.game.mode==='playing';frames++){
    const fresh=step(f),current=engine.worldToScreen(f.game,field).x;
    assert.ok(current>previous);previous=current;
    if(!field.retired){assert.ok(f.game.enemies.includes(field));assert.ok(bodyCorners(f,field).some(p=>p.x<=engine.WORLD_WIDTH+120));}
    else assert.ok(fresh.some(e=>e.type==='sourceRetired'&&e.enemyId===field.id));
  }
  assert.equal(field.retired,true);assert.equal(f.game.enemies.includes(field),false);
  assert.ok(bodyCorners(f,field).every(p=>p.x>engine.WORLD_WIDTH+120));
  assert.equal(f.game.score,score);assert.equal(f.game.pickups.length,pickups);
  assert.equal(eventFor(f,'explosion',field).length,0);
  assert.equal(eventFor(f,'sourceRetired',field).length,1);
  assert.equal(eventFor(f,'sourceRetired',field)[0].hp,field.maxHp-1);
});

test('boss entry removes an independently committed repeat and prevents old sources from firing later',()=>{
  const f=fixture();until(f,()=>admissions(f).some(e=>e.independent)&&f.members.some(e=>e.sequence));
  assert.ok(f.game.enemyBullets.length>0);
  const ids=f.members.map(e=>e.id);f.game.nextBossAt=f.game.time+DT;
  step(f);assert.equal(f.game.phase,'boss-entry');
  const cleared=f.events.findLast(e=>e.type==='combatClear').simulationAt;
  assert.equal(f.game.enemyBullets.length,0);assert.equal(f.game.enemies.some(e=>ids.includes(e.id)),false);
  for(let i=0;i<300&&f.game.mode==='playing';i++)step(f);
  assert.equal(f.events.filter(e=>e.type==='enemyShot'&&ids.includes(e.enemyId)&&e.simulationAt>=cleared).length,0);
});

function independentFixture(normalTime=blockStart('ring-introduction')){
  const f=fixture(normalTime,null);
  assert.equal(f.members[0].phrase.independentEntry,true,'actual Stage1 data opts into per-source visible first entry');
  return f;
}

test('ordinary independent entry lets each fully visible source own its first tell, release and recovery',()=>{
  const f=independentFixture(),field=f.members.find(e=>e.type==='orb'),rail=f.members.find(e=>e.type==='dart');
  until(f,()=>eventFor(f,'charge',field).length===1,3);
  assert.ok(field.deploymentElapsed>=field.deployment.approachSeconds);
  assert.ok(bodyCorners(f,field).every(p=>p.x>=0&&p.x<=1280&&p.y>=50&&p.y<=670));
  assert.ok(engine.enemyMuzzles(field).map(p=>engine.worldToScreen(f.game,p)).every(p=>p.x>=0&&p.x<=1280&&p.y>=50&&p.y<=670));
  assert.ok(f.members.some(e=>e.phraseAdmissions===undefined),'the ready source starts while another live member is still unadmitted');
  until(f,()=>f.members.every(e=>eventFor(f,'enemyShot',e).some(v=>v.bulletCount>0)),5);
  const firstRows=admissions(f).filter(e=>e.cycleIndex===0);
  assert.equal(firstRows.length,f.members.length);
  for(const member of f.members){
    const row=firstRows.find(e=>e.memberIds.includes(member.id));assert.ok(row);
    assert.equal(row.independent,true);assert.deepEqual(row.memberIds,[member.id]);
    assert.deepEqual(row.suppressedMemberIds,[],'live deferred actors are not reported as dead');
    assert.deepEqual(row.deferredMemberIds,f.members.filter(e=>e!==member).map(e=>e.id));
    assert.equal(row.memberTiming[0].delay,f.initialDelays[f.members.indexOf(member)]);
    const ready=eventFor(f,'deploymentReady',member)[0],charge=eventFor(f,'charge',member)[0],shot=eventFor(f,'enemyShot',member).find(e=>e.bulletCount>0);
    assert.ok(ready&&charge&&shot);assert.ok(row.admittedAt>=ready.simulationAt-DT);
    assert.ok(charge.simulationAt>=row.admittedAt+row.memberTiming[0].delay-DT);
    assert.ok(shot.simulationAt-charge.simulationAt>=charge.duration-DT);
    assert.ok(row.latestReleaseAt+1/60<=row.deadlineAt+1e-9);
  }
  assert.ok(eventFor(f,'charge',field)[0].simulationAt<eventFor(f,'deploymentReady',rail)[0].simulationAt);
  assert.ok(eventFor(f,'enemyShot',field)[0].simulationAt<eventFor(f,'enemyShot',rail)[0].simulationAt);
  until(f,()=>eventFor(f,'charge',field).length===2,6);
  const repeat=admissions(f).find(e=>e.cycleIndex===1&&e.memberIds.includes(field.id));
  const completed=eventFor(f,'attackCompleted',field)[0];assert.ok(completed&&repeat);
  assert.equal(repeat.memberTiming[0].delay,0);
  assert.ok(repeat.admittedAt>=completed.simulationAt+f.game.difficulty.fireInterval+(field.combat.recoverySeconds||0)-2*DT);
  for(const shot of eventFor(f,'enemyShot',rail).flatMap(e=>e.shots)){
    assert.ok(shot.launchedAt-shot.lockAt>=.25-DT);
    assert.ok((Math.hypot(shot.lockedTarget.x-shot.x,shot.lockedTarget.y-shot.y)-shot.radius-1.85)/Math.hypot(shot.vx,shot.vy)>=.9);
  }
});

test('a cancelled committed first actor cannot restart while other unadmitted live members retain their first opportunities',()=>{
  const f=independentFixture(),field=f.members.find(e=>e.type==='orb');
  until(f,()=>field.sequence&&field.locked,3);
  assert.equal(field.phraseAdmissions,1);
  const deferred=f.members.filter(e=>!e.phraseAdmissions);assert.ok(deferred.length);
  const holdX=field.holdScreenX;field.holdScreenX=1500;step(f);field.holdScreenX=holdX;
  assert.ok(eventFor(f,'attackCancelled',field).some(e=>e.reason==='emitter-visibility'));
  until(f,()=>deferred.every(e=>eventFor(f,'enemyShot',e).some(v=>v.bulletCount>0)),5);
  assert.equal(field.attack,0);assert.equal(field.phraseAdmissions,1);
  assert.equal(eventFor(f,'charge',field).length,1);assert.equal(eventFor(f,'enemyShot',field).length,0);
  assert.ok(f.events.some(e=>e.type==='attackSkipped'&&e.enemyId===field.id&&e.reason==='phrase-first-cycle'));
  for(const member of deferred)assert.equal(admissions(f).filter(e=>e.cycleIndex===0&&e.memberIds.includes(member.id)).length,1);
});

test('unadmitted independent members protect their first slots against a controlled already-visible ordinary actor',()=>{
  const f=independentFixture(),ordinary=f.game.enemies.find(e=>!e.phrase&&e.type==='beetle');assert.ok(ordinary);
  // Early visible ordinary arrival isolates the priority boundary; no HP or
  // cooldown injection, source replacement, hidden fire or flight change.
  Object.assign(ordinary,engine.screenToWorld(f.game,{x:800,y:360}));ordinary.baseY=ordinary.y;
  until(f,()=>f.events.some(e=>e.type==='attackSkipped'&&e.enemyId===ordinary.id&&e.reason==='phrase-first-priority'),2);
  assert.equal(eventFor(f,'charge',ordinary).length,0);
  until(f,()=>f.members.every(e=>e.phraseAdmissions>=1),3);
  const lastFirst=Math.max(...admissions(f).filter(e=>e.cycleIndex===0).map(e=>e.admittedAt));
  assert.equal(eventFor(f,'charge',ordinary).filter(e=>e.simulationAt<lastFirst).length,0);
  assert.ok(f.members.every(e=>e.hp===e.maxHp));
});

test('independent first entry admits only a whole plan that fits and preserves remaining members until capacity is available',()=>{
  const f=independentFixture();
  f.game.enemyBullets=Array.from({length:f.game.difficulty.maxEnemyBullets},(_,i)=>({id:900000+i,
    sourceId:-1,x:600,y:80,vx:0,vy:0,radius:1,power:10,age:0,family:'aim'}));
  until(f,()=>f.members.every(e=>e.deploymentElapsed>=e.deployment.approachSeconds),3);
  assert.equal(admissions(f).length,0);assert.equal(f.members.reduce((sum,e)=>sum+(e.reservedBullets||0),0),0);
  assert.ok(f.events.some(e=>e.type==='attackSkipped'&&e.reason==='bullet-reservation-cap'));
  f.game.enemyBullets.splice(0,36);step(f);
  const first=admissions(f)[0];assert.ok(first);assert.equal(first.reservedBullets,36);
  assert.equal(first.memberIds.length,1);assert.equal(first.cycleIndex,0);
  assert.equal(f.members.reduce((sum,e)=>sum+(e.reservedBullets||0),0),36);
  for(const member of f.members.filter(e=>e.id!==first.memberIds[0])){
    assert.equal(member.phraseAdmissions,undefined);assert.equal(member.reservedBullets,0);
    assert.equal(eventFor(f,'charge',member).length,0);
  }
  f.game.enemyBullets=f.game.enemyBullets.filter(b=>b.sourceId!==-1);
  until(f,()=>f.members.every(e=>e.phraseAdmissions>=1),2);
  assert.equal(admissions(f).filter(e=>e.cycleIndex===0).length,f.members.length);
});

test('independent pending first-source death returns its reservation and boss entry leaves no old release',()=>{
  const f=independentFixture(blockStart('window-introduction')),mantis=f.members[1];
  until(f,()=>mantis.pendingAttackPlan&&mantis.phraseAdmissions===1,3);
  const reserved=mantis.reservedBullets;assert.ok(reserved>0);
  normalContacts(f,mantis,mantis.maxHp);step(f);assert.equal(mantis.dead,true);assert.equal(mantis.hp,0);
  assert.ok(eventFor(f,'attackCancelled',mantis).some(e=>e.reason==='emitter-killed'&&e.unusedReservation===reserved));
  assert.equal(mantis.reservedBullets,0);assert.equal(eventFor(f,'charge',mantis).length,0);
  const living=f.members.filter(e=>e!==mantis);
  until(f,()=>living.every(e=>eventFor(f,'enemyShot',e).some(v=>v.bulletCount>0)),4);
  assert.ok(admissions(f).some(e=>e.suppressedMemberIds.includes(mantis.id)),'later actual admission distinguishes the dead actor');
  const ids=f.members.map(e=>e.id);f.game.nextBossAt=f.game.time+DT;step(f);
  assert.equal(f.game.phase,'boss-entry');assert.equal(f.game.enemyBullets.length,0);
  const cleared=f.events.findLast(e=>e.type==='combatClear').simulationAt;
  for(let frame=0;frame<240&&f.game.mode==='playing';frame++)step(f);
  assert.equal(f.events.filter(e=>e.type==='enemyShot'&&ids.includes(e.enemyId)&&e.simulationAt>=cleared).length,0);
});

test('independent first rail still skips a close locked target instead of shortening the minimum flight guard',()=>{
  const f=independentFixture(),rail=f.members.find(e=>e.type==='dart');
  // Isolate the actually spawned rail at a fully visible close emitter plane.
  // The player stays within the real left-third limit. This is the negative
  // release guard fixture, not a claim that the ordinary right-side station is close.
  f.game.enemies=[rail];
  rail.holdScreenX=650;rail.holdScreenY=140;
  rail.deployment=Object.freeze({...rail.deployment,holdX:650,holdY:140});
  Object.assign(rail,engine.screenToWorld(f.game,{x:650,y:140}));
  f.target={x:375,y:140};Object.assign(f.game.player,engine.screenToWorld(f.game,f.target));
  until(f,()=>f.events.some(e=>e.type==='attackSkipped'&&e.enemyId===rail.id&&e.reason==='minimum-flight-time'),4);
  const skip=f.events.find(e=>e.type==='attackSkipped'&&e.enemyId===rail.id&&e.reason==='minimum-flight-time');
  assert.equal(skip.minimumFlightTime,.9);
  assert.ok(skip.distance/skip.speed<.9+skip.releaseStepSeconds||skip.reachableAt<.9+skip.releaseStepSeconds);
  assert.ok(eventFor(f,'charge',rail).length>0);
  assert.ok(eventFor(f,'aimLock',rail).length>0);
  assert.equal(eventFor(f,'enemyShot',rail).length,0);
  assert.equal(f.game.enemyBullets.some(b=>b.sourceId===rail.id),false);
});
