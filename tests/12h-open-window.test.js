import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,startGame,updateGame,consumeEvents,PLAYER_HIT_RADIUS,playerMuzzle} from '../src/game.js';
import {bossAttack,trialDifficulty} from '../src/level.js';
import {registerMechaManifest,getMechaSpec,mechaAnchorWorld} from '../src/mecha-art.js';

test('each boss reserves physical opening plus its usable role-specific exposed hold',()=>{
  for(const victories of [0,5,10])for(const index of [0,1,2,3,4])for(const health of [1,.6,.3]){
    const attack=bossAttack(victories,index,health);
    assert.equal(attack.openWindow.duration,1.8);
    assert.equal(attack.openWindow.enabled,true);
  }
  assert.equal(bossAttack(1,0).openWindow.enabled,false,'Carrier deploy retains its shield contract');
  assert.equal(bossAttack(1,1).openWindow.duration,2);
  assert.equal(bossAttack(2,0).openWindow.duration,1.9);
  assert.equal(bossAttack(3,0).openWindow.duration,2.1);
  assert.equal(bossAttack(4,0).openWindow.duration,2.2);
});

test('Carrier Lancer and Bastion first natural windows accept a delayed visible-core response and actual ordinary projectile',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
 registerMechaManifest(manifest);
 try{
  for(const [kind,victories,fullSeconds]of [['carrier',1,1.4],['lancer',2,1.3],['bastion',3,1.5]]){
   const g=createGame(120201);g.mode='playing';g.bossesDefeated=victories;g.stage=victories+1;g.difficulty=trialDifficulty(victories);
   g.nextWaveAt=g.nextPickupAt=Infinity;g.nextBossAt=0;Object.assign(g.player,{x:220,y:360,invincible:100});
   // Mechanics fixture, with stage/initial position/invincibility overrides.
   // Observations are100ms apart and ordinary inputs arrive300ms later.
   let opened=null,closed=null,hit=null,held={};const pending=[],poses=[];
   for(let n=0;n<3600&&!closed;n++){
    if(n%12===0&&opened&&g.boss?.coreVulnerable){
     const core=mechaAnchorWorld(g.boss,getMechaSpec(g.boss).runtimeCore),muzzle=playerMuzzle(g.player);
     pending.push({at:g.time+.3,input:{shoot:true,y:Math.max(-1,Math.min(1,(core.y-muzzle.y)/30))}});
    }
    while(pending.length&&pending[0].at<=g.time+1e-9)held=pending.shift().input;
    updateGame(g,1/120,held);
    for(const e of consumeEvents(g))if(e.type==='hit'&&!e.player&&e.coreHit)hit??=e;
    if(!opened&&g.boss?.coreVulnerable)opened=g.time;
    if(opened&&g.boss?.coreVulnerable)poses.push({x:g.boss.x,y:g.boss.y,angle:g.boss.artAngle});
    if(opened&&!g.boss?.coreVulnerable)closed=g.time;
   }
   assert.ok(hit,kind+' real first-window core hit');assert.ok(Math.abs(hit.hpBefore-hit.hpAfter-1.2)<1e-8);
   assert.ok(Math.abs(closed-opened-fullSeconds)<1/120+1e-8,kind+' actual full exposure');
   assert.ok(hit.simulationAt>opened+.3&&hit.simulationAt<closed);
   if(kind==='bastion'){
    assert.ok(Math.max(...poses.map(p=>p.x))-Math.min(...poses.map(p=>p.x))>10,'crescent continues horizontal sweep');
    assert.ok(Math.max(...poses.map(p=>p.y))-Math.min(...poses.map(p=>p.y))<1e-8,'opened aperture holds world height');
    assert.ok(poses.every(p=>Math.abs(p.angle)<1e-8),'mechanical opening completes forward aperture alignment');
   }
  }
 }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});

test('a natural Warden sequence holds the final core pose for 1.2 seconds and withdraws permission on recovery',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
  registerMechaManifest(manifest);
  try{
    const g=createGame(606201);startGame(g);g.mode='playing';g.nextWaveAt=g.nextPickupAt=Infinity;g.nextBossAt=0;
    // This is an actual sequence/pose fixture, not a survival or difficulty run.
    g.player.invincible=100;
    let firstOpen=null,withdrawn=null,completed=null,firstHp;
    for(let index=0;index<1200;index++){
      updateGame(g,1/120,{});
      const e=g.boss,events=consumeEvents(g);
      if(!e)continue;
      firstHp??=e.hp;
      if(e.coreVulnerable&&firstOpen===null){firstOpen=g.time;assert.equal(getMechaSpec(e).coreExposed,true);}
      if(firstOpen!==null&&withdrawn===null){
        if(e.coreVulnerable)assert.equal(getMechaSpec(e).coreExposed,true,'permission matches the selected real pose');
        else{withdrawn=g.time;assert.equal(getMechaSpec(e).coreExposed,false);}
      }
      if(events.some(event=>event.type==='attackCompleted'&&event.enemyId===e.id))completed??=g.time;
      assert.equal(e.hp,firstHp,'opening never adds a forced kill or hidden damage');
      if(withdrawn!==null&&completed!==null)break;
    }
    assert.notEqual(firstOpen,null);assert.notEqual(withdrawn,null);assert.notEqual(completed,null);
    assert.ok(Math.abs(withdrawn-firstOpen-1.2)<=1/120+1e-8,`actual exposure ${withdrawn-firstOpen}`);
    assert.equal(withdrawn,completed,'recovery and permission withdrawal share the simulation step');
    assert.equal(g.player.radius,PLAYER_HIT_RADIUS);
  }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});
