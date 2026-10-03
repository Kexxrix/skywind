import test from 'node:test';
import assert from 'node:assert/strict';
import {HOSTILE_DAMAGE,hostileDamageSpec,grazeOuterRadius} from '../src/combat-damage.js';
import {createGame,startGame,updateGame,consumeEvents,screenToWorld,PLAYER_HIT_RADIUS} from '../src/game.js';
import {combatProfile} from '../src/combat-tuning.js';
import {LEVEL_RULES} from '../src/level.js';
import {barragePlan} from '../src/barrage.js';
import {registerMechaManifest} from '../src/mecha-art.js';

const STEP=1/120;
function fixture(){
  registerMechaManifest({schemaVersion:1,entries:[]});
  const game=createGame(610032);startGame(game);game.mode='playing';
  game.nextWaveAt=game.nextBossAt=game.nextPickupAt=Infinity;
  game.recoverySpawned=true;game.droneMarked=true;
  Object.assign(game.player,screenToWorld(game,{x:90,y:360}),{invincible:0});
  consumeEvents(game);return game;
}
function collect(game,input={}){updateGame(game,STEP,input);return consumeEvents(game);}
function launch(pattern,type='claw'){
  const game=fixture(),combat=combatProfile(type),position=screenToWorld(game,{x:1120,y:360});
  const enemy={id:game.nextId++,type,...position,baseY:position.y,radius:combat.radius,hp:combat.hp,maxHp:combat.hp,
    combat,speed:combat.speed,score:combat.score,age:0,phase:0,angle:0,attack:0,fireCooldown:0,pattern,
    holdUntil:100,holdScreenX:1120,holdScreenY:360};
  game.enemies=[enemy];const events=[];
  for(let frame=0;frame<720&&!game.enemyBullets.length;frame++)events.push(...collect(game));
  assert.ok(game.enemyBullets.length,`${pattern} must use its actual production release path`);
  return{game,enemy,bullet:game.enemyBullets[0],events};
}
function contact(game,bullet){
  game.enemies=[];game.enemyBullets=[bullet];
  Object.assign(bullet,{x:game.player.x,y:game.player.y,vx:0,vy:0,arming:0,motion:undefined,dead:false});
  return collect(game).find(e=>e.type==='hit'&&e.player);
}
function recoverInvulnerability(game){
  game.enemyBullets=[];
  for(let frame=0;frame<240&&game.player.invincible>0;frame++)collect(game);
  assert.equal(game.player.invincible,0,'separate contacts wait through the real post-hit invulnerability');
}

test('authored projectile taxonomy distinguishes normal beads, fixed straight shots and field layers without color inference',()=>{
  assert.deepEqual(HOSTILE_DAMAGE,{'normal-pink':25,pattern:33,direct:10});
  assert.deepEqual(hostileDamageSpec({pattern:'aim',family:'aim'}),{damageClass:'normal-pink',power:25});
  for(const pattern of ['rail','snapshot'])assert.deepEqual(hostileDamageSpec({pattern,family:'aim'}),{damageClass:'direct',power:10});
  assert.deepEqual(hostileDamageSpec({pattern:'future-fixed-shot',family:'aim'}),{damageClass:'direct',power:10});
  for(const pattern of ['B01','B02','B03','B04','B05','halo','petal','trident','seed','zipper','loom','cathedral','jaws'])
    assert.deepEqual(hostileDamageSpec({pattern}),{damageClass:'pattern',power:33});
  for(const family of ['fan','radial','curve','loom','weave','gate'])
    assert.deepEqual(hostileDamageSpec({pattern:'authored-layer',family}),{damageClass:'pattern',power:33});
  for(const data of [{color:'#ff99cc',palette:'pink',style:'bead',speed:150},
    {pattern:'unclassified',power:12},{pattern:'lunge',family:'body'},{pattern:'deploy',family:'deploy'}])
    assert.equal(hostileDamageSpec(data),null);
  const metadata=Object.freeze({pattern:'snapshot',family:'aim',color:'#ff99cc'});
  hostileDamageSpec(metadata);assert.deepEqual(metadata,{pattern:'snapshot',family:'aim',color:'#ff99cc'});
});

test('mixed authored plans classify each actual bundle separately instead of inheriting the parent field name',()=>{
  const plan=barragePlan('halo',2,.4);
  assert.ok(plan.bundles.some(bundle=>bundle.family==='aim'));
  assert.ok(plan.bundles.some(bundle=>bundle.family==='radial'));
  for(const bundle of plan.bundles){
    const spec=hostileDamageSpec({pattern:bundle.pattern||plan.pattern,family:bundle.family});
    assert.equal(spec.damageClass,bundle.family==='aim'?'direct':'pattern');
    assert.equal(spec.power,bundle.family==='aim'?10:33);
  }
});

test('graze doubles the full former outer radius while the physical collision core stays1.85',()=>{
  assert.equal(LEVEL_RULES.grazeMargin,12,'the stored former margin is not itself doubled');
  for(const bulletRadius of [4.5,5.5,7]){
    const hitRadius=PLAYER_HIT_RADIUS+bulletRadius,oldOuter=hitRadius+12;
    assert.equal(grazeOuterRadius(hitRadius,12),oldOuter*2);
    assert.ok(grazeOuterRadius(hitRadius,12)>hitRadius+24);
    assert.equal(PLAYER_HIT_RADIUS,1.85);
  }
  for(const invalid of [NaN,Infinity,-1])assert.throws(()=>grazeOuterRadius(invalid),RangeError);
});

test('real normal, field and rail births retain damageClass and power through source and visual changes',()=>{
  for(const[pattern,type,damageClass,power]of [['aim','beetle','normal-pink',25],['B01','claw','pattern',33],['rail','dart','direct',10]]){
    const{game,enemy,bullet,events}=launch(pattern,type);
    assert.equal(bullet.damageClass,damageClass);assert.equal(bullet.power,power);
    const shot=events.filter(e=>e.type==='enemyShot').flatMap(e=>e.shots).find(e=>e.id===bullet.id);
    assert.equal(shot.damageClass,damageClass);assert.equal(shot.power,power);
    Object.assign(enemy,{type:'boss',attackName:'rail'});
    Object.assign(bullet,{pattern:'changed-after-birth',family:'changed-after-birth',color:'#abcdef',palette:'other'});
    const hit=contact(game,bullet);
    assert.ok(hit);assert.equal(hit.damage,power);assert.equal(hit.damageClass,damageClass);
    assert.equal(game.player.hp,100-power);
  }
});

test('one actual boss field sequence births33 field bullets and10 embedded snapshots with separate immutable classes',()=>{
  const game=fixture();game.phase='boss';
  const enemy={id:90,type:'boss',bossKind:'warden',x:1120,y:360,baseY:360,radius:92,hp:420,maxHp:420,
    speed:0,age:0,phase:0,angle:0,attack:2,fireCooldown:0,
    motion:{x:1120,centerY:360,amplitude:0,frequency:0,bank:0}};
  game.boss=enemy;game.enemies=[enemy];const shots=[];
  for(let frame=0;frame<720&&!shots.some(shot=>shot.damageClass==='direct');frame++)
    shots.push(...collect(game).filter(e=>e.type==='enemyShot').flatMap(e=>e.shots));
  assert.ok(shots.some(shot=>shot.damageClass==='pattern'));
  assert.ok(shots.some(shot=>shot.damageClass==='direct'));
  assert.ok(shots.every(shot=>shot.power===(shot.damageClass==='pattern'?33:10)));
  assert.ok(game.enemyBullets.some(bullet=>bullet.pattern==='snapshot'&&bullet.damageClass==='direct'&&bullet.power===10));
  assert.ok(game.enemyBullets.some(bullet=>bullet.pattern==='halo'&&bullet.damageClass==='pattern'&&bullet.power===33));
});

test('separate real projectile contacts preserve three33→HP1, four25→death, ten10→death and mixed remainders',()=>{
  for(const[pattern,type,power,count,remaining]of [['B01','claw',33,3,1],['B01','claw',33,4,0],
    ['aim','beetle',25,4,0],['rail','dart',10,10,0]]){
    const{game,bullet}=launch(pattern,type);game.enemies=[];
    for(let index=0;index<count;index++){
      recoverInvulnerability(game);
      const hit=contact(game,{...bullet,id:game.nextId++});
      assert.ok(hit);assert.equal(hit.damage,power);assert.equal(game.player.hp,Math.max(0,100-power*(index+1)));
    }
    assert.equal(game.player.hp,remaining);assert.equal(game.mode,remaining?'playing':'gameover');
  }
  const pool=[launch('B01').bullet,launch('aim','beetle').bullet,launch('rail','dart').bullet];
  const game=fixture();
  for(const bullet of [pool[0],pool[1],pool[2],pool[1]]){recoverInvulnerability(game);contact(game,{...bullet,id:game.nextId++});}
  assert.equal(game.player.hp,7);assert.equal(game.mode,'playing');
  const lethalMix=fixture();
  for(const bullet of [pool[0],pool[1],pool[0],pool[2]]){recoverInvulnerability(lethalMix);contact(lethalMix,{...bullet,id:lethalMix.nextId++});}
  assert.equal(lethalMix.player.hp,0);assert.equal(lethalMix.mode,'gameover');
});

test('normal and boss body contact retain22 and30 damage independently of projectile classes',()=>{
  for(const[type,damage]of [['beetle',22],['boss',30]]){
    const game=fixture(),position={x:game.player.x,y:game.player.y};
    const enemy={id:90,type,...position,baseY:position.y,radius:type==='boss'?92:28,hp:1000,maxHp:1000,
      speed:0,age:0,phase:0,angle:0,attack:0,fireCooldown:Infinity};
    if(type==='boss'){
      game.phase='boss';game.boss=enemy;
      enemy.bossKind='warden';enemy.motion={x:90,centerY:360,amplitude:0,frequency:0,bank:0};
    }
    game.enemies=[enemy];const hit=collect(game).find(e=>e.type==='hit'&&e.player);
    assert.ok(hit);assert.equal(hit.sourceKind,'body');assert.equal(hit.damage,damage);
    assert.equal(game.player.hp,100-damage);
  }
});

test('explicit manual legacy power and unclassified fallback retain their existing damage',()=>{
  for(const[power,damage]of [[12,12],[17,17],[undefined,13]]){
    const game=fixture(),bullet={id:90,radius:5.5,power,age:0,type:'orb'};
    assert.equal(contact(game,bullet).damage,damage);assert.equal(game.player.hp,100-damage);
  }
});

test('simultaneous projectile damage still uses one invulnerability gate and suppresses same-step graze rewards',()=>{
  for(const reverse of [false,true]){
    const game=fixture(),normal=launch('aim','beetle').bullet,pattern=launch('B01').bullet;
    const pair=[{...normal},{...pattern}];if(reverse)pair.reverse();
    game.enemyBullets=pair.map((bullet,index)=>({...bullet,id:90+index,x:game.player.x,y:game.player.y,vx:0,vy:0,motion:undefined}));
    game.enemyBullets.push({id:93,x:game.player.x,y:game.player.y+30,vx:0,vy:0,radius:5.5,power:12,age:0});
    const events=collect(game),hits=events.filter(e=>e.type==='hit'&&e.player);
    assert.equal(hits.length,1);assert.equal(game.player.hp,100-(reverse?33:25));
    assert.ok(game.player.invincible>0);assert.equal(game.tensionTime,0);
    assert.ok(!events.some(e=>e.type==='tension'));
  }
});

test('the expanded graze boundary remains closed and never expands strict physical hit detection',()=>{
  for(const frame of [1/30,1/60,1/144])for(const bulletRadius of [4.5,5.5,7]){
    const hitRadius=PLAYER_HIT_RADIUS+bulletRadius,outer=grazeOuterRadius(hitRadius,12);
    for(const[distance,damage,tension]of [[hitRadius-.01,12,false],[hitRadius,0,true],
      [hitRadius+12.01,0,true],[outer,0,true],[outer+.01,0,false]]){
      const game=fixture();game.enemyBullets=[{id:90,x:game.player.x,y:game.player.y+distance,vx:0,vy:0,radius:bulletRadius,power:12,age:0}];
      updateGame(game,frame);assert.equal(game.player.hp,100-damage);
      assert.equal(game.tensionTime>0,tension,`${frame}/${bulletRadius}/${distance}`);
      assert.equal(game.player.radius,1.85);
    }
  }
});

test('new outer-band fast crossings reward one swept graze under moving ordinary input at30/60/144Hz',()=>{
  for(const frame of [1/30,1/60,1/144]){
    const game=fixture(),bullet={id:90,x:game.player.x+80,y:game.player.y+30,vx:-4000,vy:0,radius:5.5,power:12,age:0};
    game.enemyBullets=[bullet];const events=[];
    for(let elapsed=0;elapsed<.1;elapsed+=frame){updateGame(game,frame,{x:1});events.push(...consumeEvents(game));}
    assert.equal(game.player.hp,100);assert.equal(events.filter(e=>e.type==='tension').length,1);
    assert.equal(bullet.grazed,true);assert.ok(game.tensionTime>0);
  }
});

test('expanded grazes still reward each bullet once and exclude invulnerable or unarmed crossings',()=>{
  const game=fixture(),bullet={id:90,x:game.player.x,y:game.player.y+30,vx:0,vy:0,radius:5.5,power:12,age:0};
  game.enemyBullets=[bullet];assert.equal(collect(game).filter(e=>e.type==='tension').length,1);
  assert.equal(bullet.grazed,true);
  for(let frame=0;frame<30;frame++)assert.ok(!collect(game).some(e=>e.type==='tension'));
  assert.ok(game.tensionTime<2);
  game.enemyBullets.push({...bullet,id:91,grazed:false,x:game.player.x,y:game.player.y+30});
  const refresh=collect(game).find(e=>e.type==='tension');assert.equal(refresh.refresh,true);
  assert.equal(game.tensionTime,2,'another graze refreshes rather than stacking time');
  for(const[invisible,arming]of [[1,0],[0,1]]){
    const blocked=fixture();blocked.player.invincible=invisible;
    blocked.enemyBullets=[{...bullet,grazed:false,arming,x:blocked.player.x,y:blocked.player.y+30}];
    collect(blocked);assert.equal(blocked.tensionTime,0);assert.equal(blocked.enemyBullets[0].grazed,false);
  }
  startGame(game,610033);assert.equal(game.player.hp,100);assert.equal(game.tensionTime,0);
  assert.equal(game.enemyBullets.length,0);assert.equal(game.player.radius,1.85);
});

test('new projectile losses preserve the authored one-time recovery opportunity and restart ledger',()=>{
  const{game,bullet}=launch('B01');contact(game,bullet);assert.equal(game.player.hp,67);
  game.enemyBullets=[];game.recoverySpawned=false;game.normalTime=24-STEP;
  collect(game);
  const health=game.pickups.filter(item=>item.type==='health');
  assert.equal(health.length,1);assert.equal(health[0].healAmount,24);
  assert.equal(health[0].spawnReason,'normal-recovery');assert.equal(game.recoverySpawned,true);
  for(let frame=0;frame<120;frame++)collect(game);
  assert.equal(game.pickups.filter(item=>item.type==='health').length,1,'no extra heal is introduced by the higher losses');
  Object.assign(health[0],{x:game.player.x,y:game.player.y,baseY:game.player.y,attracting:true,attractTime:.18,
    attractFrom:{x:game.player.x,y:game.player.y},attractDistance:0});
  collect(game);assert.equal(game.player.hp,91);
  startGame(game,610034);assert.equal(game.player.hp,100);assert.equal(game.player.maxHp,100);
  assert.equal(game.recoverySpawned,false);assert.equal(game.pickups.length,0);assert.equal(game.enemyBullets.length,0);
});

test('real graze telemetry identifies one start batch and a separate refresh without rewarding the same bullets again',()=>{
  const{game}=launch('B01'),bullets=game.enemyBullets.slice(0,3);
  assert.equal(bullets.length,3);game.enemies=[];game.enemyBullets=bullets;
  for(const[index,bullet]of bullets.entries())Object.assign(bullet,{x:game.player.x,
    y:game.player.y+(index<2?(index?30:-30):180),vx:0,vy:0,motion:undefined});
  const rng=game.rng,startEvents=collect(game),start=startEvents.find(e=>e.type==='tension');
  assert.ok(start);assert.equal(start.refresh,false);assert.equal(start.count,2);
  assert.deepEqual(start.bulletIds,bullets.slice(0,2).map(bullet=>bullet.id));
  assert.equal(start.remainingBefore,0);assert.equal(start.remainingAfter,2);assert.equal(start.remaining,2);
  assert.equal(start.simulationAt,game.time);
  for(let frame=0;frame<30;frame++)assert.ok(!collect(game).some(e=>e.type==='tension'));
  const previous=game.tensionTime;
  Object.assign(bullets[2],{x:game.player.x,y:game.player.y+30});
  const refresh=collect(game).find(e=>e.type==='tension');
  assert.ok(refresh);assert.equal(refresh.refresh,true);assert.equal(refresh.count,1);
  assert.deepEqual(refresh.bulletIds,[bullets[2].id]);
  assert.ok(Math.abs(refresh.remainingBefore-(previous-STEP))<1e-7);
  assert.equal(refresh.remainingAfter,2);assert.equal(refresh.remaining,2);assert.equal(game.tensionTime,2);
  assert.ok(bullets.every(bullet=>bullet.grazed));assert.equal(game.rng,rng);
});

test('a real graze expires once with exact remaining telemetry and pause never consumes its clock',()=>{
  const{game,bullet}=launch('aim','beetle');game.enemies=[];game.enemyBullets=[bullet];
  Object.assign(bullet,{x:game.player.x,y:game.player.y+30,vx:0,vy:0,motion:undefined});
  assert.ok(collect(game).some(e=>e.type==='tension'));assert.equal(game.tensionTime,2);
  game.mode='paused';const paused=structuredClone(game);updateGame(game,.12,{shoot:true,y:1});
  assert.deepEqual(game,paused);game.mode='playing';const events=[];
  for(let frame=0;frame<300;frame++)events.push(...collect(game));
  const expiry=events.filter(e=>e.type==='tensionEnd');assert.equal(expiry.length,1);
  assert.equal(expiry[0].reason,'expired');assert.ok(expiry[0].remainingBefore>0);
  assert.ok(expiry[0].remainingBefore<=STEP+1e-7);assert.equal(expiry[0].remainingAfter,0);
  assert.equal(game.tensionTime,0);assert.ok(!events.some(e=>e.type==='tension'));
});

test('real projectile damage clears active graze once and reports the cleared time while suppressing a new same-step graze',()=>{
  const{game}=launch('B01'),[grazer,nextGrazer]=game.enemyBullets;
  const hitBullet=launch('aim','beetle').bullet;game.enemies=[];game.enemyBullets=[grazer];
  Object.assign(grazer,{x:game.player.x,y:game.player.y+30,vx:0,vy:0,motion:undefined});
  assert.ok(collect(game).some(e=>e.type==='tension'));const previous=game.tensionTime;
  Object.assign(nextGrazer,{x:game.player.x,y:game.player.y-30,vx:0,vy:0,motion:undefined});
  Object.assign(hitBullet,{id:game.nextId++,x:game.player.x,y:game.player.y,vx:0,vy:0,motion:undefined});
  game.enemyBullets=[nextGrazer,hitBullet,grazer];const events=collect(game);
  const ended=events.filter(e=>e.type==='tensionEnd');assert.equal(ended.length,1);
  assert.equal(ended[0].reason,'hit');assert.ok(Math.abs(ended[0].remainingBefore-(previous-STEP))<1e-7);
  assert.equal(ended[0].remainingAfter,0);assert.equal(game.tensionTime,0);assert.equal(game.player.hp,75);
  assert.ok(!events.some(e=>e.type==='tension'));assert.ok(!nextGrazer.grazed);
  for(let frame=0;frame<30;frame++)assert.ok(!collect(game).some(e=>e.type==='tensionEnd'));
});
