import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,updateGame,consumeEvents,PLAYER_HIT_RADIUS,FLIGHT_CONTROL} from '../src/game.js';
import {registerMechaManifest,getMechaSpec,mechaAnchorWorld} from '../src/mecha-art.js';
import {trialDifficulty} from '../src/level.js';

const DT=1/120,roles=['warden','carrier','lancer','bastion','apex'];
for(const [victories,role]of roles.entries())test(role+' naturally exposes the adopted physical core to an ordinary forward shot',()=>{
  registerMechaManifest(JSON.parse(readFileSync(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8')));
  try{
    const g=createGame(120201);g.mode='playing';g.player.x=220;g.player.y=360;
    g.bossesDefeated=victories;g.difficulty=trialDifficulty(victories);g.stage=victories+1;
    g.nextWaveAt=g.nextPickupAt=Infinity;g.nextBossAt=0;
    // Isolate geometry and natural opening. This skips the normal lead-in and
    // suppresses player damage; Carrier escorts are cleared after real transfer.
    // It is not evidence of survival, supply success, TTK or human difficulty.
    g.player.invincible=100;
    let boss=null,transfers=0,opening=null;
    for(let step=0;step<2400&&!opening;step++){
      updateGame(g,DT,{});const events=consumeEvents(g);boss??=g.boss;
      transfers+=events.filter(event=>event.type==='payloadDeployed').length;
      if(role==='carrier')for(const child of g.enemies)if(child.summoned&&child.parentId===boss?.id)child.dead=true;
      if(boss?.coreVulnerable){
        const spec=getMechaSpec(boss);assert.equal(spec.coreExposed,true);assert.equal(boss.mechanismProgress,1);
        opening={at:g.time,core:mechaAnchorWorld(boss,spec.runtimeCore),hp:boss.hp,state:spec.state};
      }
    }
    assert.ok(opening,role+' actual attack sequence reaches a final exposed pose');
    if(role==='carrier'){assert.equal(transfers,2);assert.deepEqual(boss.payloadDockOccupied,[false,false]);assert.equal(boss.escortShield,false);}
    const bulletId=g.nextId++;
    g.bullets.push({id:bulletId,x:opening.core.x-250,y:opening.core.y,vx:1360,vy:0,radius:5,power:1,age:0,weaponMode:'normal'});
    let hit=null;
    for(let step=0;step<42&&!hit;step++){
      updateGame(g,DT,{});hit=consumeEvents(g).find(event=>event.type==='hit'&&event.enemyId===boss.id&&event.bulletId===bulletId);
    }
    assert.ok(hit,role+' forward normal projectile reaches the natural exposed core');
    assert.equal(hit.coreHit,true);assert.ok(Math.abs(hit.hpBefore-hit.hpAfter-1.2)<1e-9);
    assert.equal(g.player.radius,PLAYER_HIT_RADIUS);assert.equal(PLAYER_HIT_RADIUS,1.85);
    assert.equal(FLIGHT_CONTROL.horizontalSpeed,225);assert.equal(FLIGHT_CONTROL.verticalSpeed,490);
    assert.equal(boss.maxHp,opening.hp,'no HP reduction or forced kill is used');
  }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});
