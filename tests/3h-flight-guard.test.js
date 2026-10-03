import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,startGame,updateGame,consumeEvents,screenToWorld,PLAYER_HIT_RADIUS} from '../src/game.js';
import {combatProfile} from '../src/combat-tuning.js';
import {registerMechaManifest,MECHA_MANIFEST_PATH} from '../src/mecha-art.js';

function rail(sourceX,playerX){
  const game=createGame(310032);startGame(game);game.mode='playing';
  game.nextWaveAt=game.nextBossAt=game.nextPickupAt=Infinity;game.recoverySpawned=true;
  Object.assign(game.player,screenToWorld(game,{x:playerX,y:360}),{invincible:100});
  const combat=combatProfile('dart'),position=screenToWorld(game,{x:sourceX,y:360});
  const enemy={id:game.nextId++,type:'dart',...position,baseY:position.y,radius:combat.radius,hp:combat.hp,maxHp:combat.hp,
    combat,speed:0,age:0,phase:0,angle:0,attack:0,fireCooldown:0,pattern:'rail',holdUntil:100,holdScreenX:sourceX,holdScreenY:360};
  game.enemies=[enemy];consumeEvents(game);const events=[];
  for(let frame=0;frame<360;frame++){
    updateGame(game,1/120,{pointer:screenToWorld(game,{x:playerX,y:360})});events.push(...consumeEvents(game));
  }
  return{game,enemy,events};
}

test('a close Stage1 rail skips unsafe releases while a distant rail fires320 with the original lock and minimum flight',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../'+MECHA_MANIFEST_PATH.replace(/^\.\//,''),import.meta.url),'utf8'));
  registerMechaManifest(manifest);
  try{
    const near=rail(860,380),far=rail(1120,90);
    const skipped=near.events.filter(e=>e.type==='attackSkipped'&&e.pattern==='rail'&&e.reason==='minimum-flight-time');
    assert.ok(skipped.length>=3,'all three physically unsafe shots are skipped, not deferred to burst later');
    assert.ok(skipped.every(e=>e.minimumFlightTime===.9&&e.speed===320));
    assert.ok(skipped.some(e=>e.reachableAt<.9),'the bounded player approach is guarded even beyond static distance');
    assert.equal(near.events.filter(e=>e.type==='enemyShot'&&e.pattern==='rail').length,0);
    assert.equal(near.game.enemyBullets.length,0);
    const shots=far.events.filter(e=>e.type==='enemyShot'&&e.pattern==='rail').flatMap(e=>e.shots);
    assert.ok(shots.length>=3);
    for(const shot of shots){
      const speed=Math.hypot(shot.vx,shot.vy),distance=Math.hypot(shot.lockedTarget.x-shot.x,shot.lockedTarget.y-shot.y)-shot.radius-PLAYER_HIT_RADIUS;
      assert.ok(Math.abs(speed-320)<1e-7);assert.ok(distance/speed>=.9);
      assert.ok(shot.launchedAt-shot.lockAt>=.25-1/120);
      assert.deepEqual(shot.lockedTarget,shots[0].lockedTarget);
    }
  }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});
