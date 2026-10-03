import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,startGame,updateGame,consumeEvents,enemyMuzzles} from '../src/game.js';
import {registerMechaManifest,getMechaSpec} from '../src/mecha-art.js';

test('Bastion and Apex actual releases select the authored recoil pose and its physical ports',()=>{
  registerMechaManifest(JSON.parse(readFileSync(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8')));
  try{
    for(const victories of [3,4]){
      const g=createGame(607200+victories);startGame(g);g.mode='playing';g.bossesDefeated=victories;
      g.nextWaveAt=g.nextPickupAt=Infinity;g.nextBossAt=0;g.player.invincible=100;
      let released=false;
      // Direct boss timeline fixture; it does not claim human difficulty or TTK.
      for(let tick=0;tick<1800&&!released;tick++){
        updateGame(g,1/120,{});const events=consumeEvents(g),e=g.boss;if(!e)continue;
        const spec=getMechaSpec(e);
        if(e.coreVulnerable)assert.equal(spec.coreExposed,true,'permission follows the current real frame');
        for(const event of events.filter(event=>event.type==='enemyShot'&&event.enemyId===e.id)){
          const base=spec.mechanismFrames.findLast(frame=>frame.progress<=e.mechanismProgress);
          const expected=Object.entries(spec.semanticAliases?.fireByProgress||{})
            .find(([progress])=>Number(progress)===base.progress)?.[1]||base.state+'_fire';
          assert.equal(spec.state,expected,`${e.bossKind} uses the correct recoil pose, including Apex idle→fire`);
          assert.equal(e.artFrame,expected);
          const ports=enemyMuzzles(e);
          for(const launch of event.launchMuzzles)assert.ok(ports.some(port=>Math.hypot(port.x-launch.x,port.y-launch.y)<1e-7));
          const neutral=getMechaSpec({...e,artFrame:base.state,fireFlash:0});
          assert.ok(spec.runtimeMuzzles.some((port,index)=>Math.hypot(port.x-neutral.runtimeMuzzles[index].x,port.y-neutral.runtimeMuzzles[index].y)>1e-5),
            'the selected recoil snapshot physically moves a declared gun port');
          released=true;
        }
      }
      assert.equal(released,true,'the actual shipped attack releases inside the bounded observation');
    }
  }finally{registerMechaManifest({schemaVersion:1,entries:[]});}
});
