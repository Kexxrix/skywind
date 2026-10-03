import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apexAttackPlan} from '../src/barrage.js';
import {bossAttack,bossProfile,trialDifficulty} from '../src/level.js';
import {createGame,updateGame,consumeEvents,enemyMuzzles,playerMuzzle} from '../src/game.js';
import {registerMechaManifest,getMechaSpec,mechaAnchorWorld} from '../src/mecha-art.js';
const DT=1/120;
function registered(run){registerMechaManifest(JSON.parse(readFileSync(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8')));
  try{return run();}finally{registerMechaManifest({schemaVersion:1,entries:[]});}}
function fixture(){const g=createGame(120201);g.mode='playing';g.player.x=220;g.player.y=360;g.player.invincible=100;
  g.bossesDefeated=4;g.stage=5;g.difficulty=trialDifficulty(4);g.nextWaveAt=g.nextPickupAt=Infinity;g.nextBossAt=0;return g;}

test('Apex assigns spatial waves, precision snapshots and a locked rail burst to three distinct physical organs within full reservation caps',()=>{
  assert.deepEqual(bossProfile(4).attackOrder,['loom','rail','petal']);
  for(const victories of [4,9,14])for(const health of [1,.6,.3])for(let index=0;index<6;index++){
    const attack=bossAttack(victories,index,health),d=trialDifficulty(victories),plan=apexAttackPlan(attack.pattern,d.pace,.71);
    assert.deepEqual(plan,apexAttackPlan(attack.pattern,d.pace,.71));assert.ok(plan.total<=d.maxSequenceBullets);
    assert.ok(plan.bundles.every(bundle=>bundle.count<=d.maxPatternBullets&&bundle.speed<=d.maxBulletSpeed));
    assert.equal(attack.openWindow.duration,2.2);assert.equal(attack.openWindow.enabled,true);
    if(attack.pattern==='loom'){
      assert.ok(plan.bundles.filter(bundle=>bundle.family!=='aim').every(bundle=>bundle.port===2&&bundle.motion.kind==='wave'&&bundle.speed>=300&&bundle.speed<=320));
      assert.ok(plan.bundles.filter(bundle=>bundle.family==='aim').every(bundle=>bundle.port===0&&bundle.pattern==='snapshot'&&bundle.speed>=430));
    }else if(attack.pattern==='rail')assert.ok(plan.bundles.every(bundle=>bundle.port===1&&bundle.pattern==='rail'&&bundle.style==='rail'&&bundle.aimLock==='snapshot'));
    else{
      assert.ok(plan.bundles.filter(bundle=>bundle.family!=='aim').every(bundle=>bundle.port===2&&bundle.motion.kind==='curve'));
      assert.ok(plan.bundles.some(bundle=>bundle.port===1&&bundle.pattern==='rail'));
    }
  }
});

test('Apex actually charges and fires all three authored organs with different projectile behavior and immutable rail locks',()=>registered(()=>{
  const g=fixture(),releases=[];let upperCue=false;
  // Isolated unsuppressed boss script; player damage is disabled. Not survival
  // or normal progression evidence; actual HP/attacks/poses remain unchanged.
  for(let step=0;step<2880;step++){
    updateGame(g,DT,{});const events=consumeEvents(g),boss=g.boss;
    for(const event of events){
      if(event.type==='charge'&&event.bossKind==='apex'&&event.attackName==='loom'){
        const upper=enemyMuzzles(boss)[2];upperCue||=event.muzzles.some(point=>Math.hypot(point.x-upper.x,point.y-upper.y)<1e-8);
      }
      if(event.type==='enemyShot'&&event.enemyId===boss?.id&&event.bulletCount>0){
        assert.ok(event.launchPorts.every(port=>port.index>=0&&port.name===getMechaSpec(boss).muzzleNames[port.index]));
        releases.push(event);
      }
    }
  }
  assert.equal(upperCue,true);assert.deepEqual([...new Set(releases.flatMap(event=>event.launchPorts.map(port=>port.index)))].sort(),[0,1,2]);
  const field=releases.find(event=>event.pattern==='loom'),beam=releases.find(event=>event.pattern==='snapshot');
  const rails=releases.filter(event=>event.pattern==='rail');assert.ok(field&&beam&&rails.length>=3);
  assert.equal(field.launchPorts[0].index,2);assert.equal(field.family,'loom');assert.equal(field.shots[0].style,'seed');
  assert.equal(beam.launchPorts[0].index,0);assert.equal(beam.family,'aim');assert.equal(beam.shots[0].style,'needle');
  assert.ok(rails.every(event=>event.launchPorts[0].index===1&&event.shots.every(shot=>shot.style==='rail'&&shot.radius===4.5)));
  const firstBurst=rails.slice(0,3).flatMap(event=>event.shots);assert.ok(firstBurst.every(shot=>JSON.stringify(shot.lockedTarget)===JSON.stringify(firstBurst[0].lockedTarget)));
  assert.equal(g.boss.hp,g.boss.maxHp);assert.equal(g.player.hp,100);
}));

test('Apex settles the visible core long enough for delayed ordinary aim and normal projectile travel, then resumes protected motion',()=>registered(()=>{
  const g=fixture();let seen=null,hit=null,end=null,held=null,openingHp=null;
  for(let step=0;step<960&&!end;step++){
    let input={};
    if(seen&&g.time>=seen.at+.3){input={shoot:true,y:Math.max(-1,Math.min(1,(seen.core.y-playerMuzzle(g.player).y)/100))};}
    updateGame(g,DT,input);const events=consumeEvents(g),boss=g.boss;
    if(!seen&&boss?.coreVulnerable){seen={at:g.time,core:mechaAnchorWorld(boss,getMechaSpec(boss).runtimeCore)};openingHp=boss.hp;}
    if(seen&&boss.coreVulnerable&&boss.exposedOrbitPose){
      const core=mechaAnchorWorld(boss,getMechaSpec(boss).runtimeCore);held??=core;assert.ok(Math.hypot(core.x-held.x,core.y-held.y)<1e-8);
    }
    hit??=events.find(event=>event.type==='hit'&&!event.player&&event.bossKind==='apex'&&event.coreHit);
    if(seen&&!boss.coreVulnerable)end=g.time;
  }
  assert.ok(seen&&held&&end);assert.ok(Math.abs(end-seen.at-1.6)<DT*2);assert.ok(hit,'ordinary300ms reaction and real normal bullet must hit during the first window');
  assert.ok(hit.simulationAt>=seen.at+.3&&hit.simulationAt<=end);assert.equal(hit.weaponMode,'normal');assert.equal(hit.tension,false);
  assert.ok(hit.hpBefore-hit.hpAfter===1.2||Math.abs(hit.hpBefore-hit.hpAfter-1.2)<1e-9);assert.equal(openingHp,g.boss.maxHp);
  assert.equal(getMechaSpec(g.boss).coreExposed,false);assert.equal(g.boss.coreVulnerable,false);
  const protectedPose={x:g.boss.x,y:g.boss.y};updateGame(g,DT,{});consumeEvents(g);
  assert.equal(g.boss.exposedOrbitPose,null);assert.ok(Math.hypot(g.boss.x-protectedPose.x,g.boss.y-protectedPose.y)<3,'return is bounded, not an orbit teleport');
}));
