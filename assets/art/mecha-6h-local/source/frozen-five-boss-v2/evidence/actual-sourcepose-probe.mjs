import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import * as engine from '../../speed-tuning-20261003/prototype-16-final/dist/src/game.js';
import * as art from '../../speed-tuning-20261003/prototype-16-final/dist/src/mecha-art.js';
import {bossProfile,trialDifficulty} from '../../speed-tuning-20261003/prototype-16-final/dist/src/level.js';
const folder=path.resolve(process.argv[2]),m=JSON.parse(fs.readFileSync(path.join(folder,'manifest-candidate.json'))),e=m.entries.find(e=>e.roles?.length),role=e.roles[0],index={warden:0,carrier:1,lancer:2,bastion:3,apex:4}[role],DT=1/120;
const dist=path.resolve('.work/speed-tuning-20261003/prototype-16-final/dist'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),receipt=Object.fromEntries(['game.js','mecha-art.js','mecha-collision.js','level.js'].map(n=>[n,sha(fs.readFileSync(path.join(dist,'src',n)))]));
const unique=new Map();for(const [s,f] of Object.entries(e.frames))if(!unique.has(f.filename))unique.set(f.filename,{state:s,frame:f});
const rows=[];for(const {state,frame} of unique.values()){
 const fixed=structuredClone(m),entry=fixed.entries.find(v=>v.key===e.key);entry.mechanismFrames=[{progress:0,state}];delete entry.semanticAliases;
 art.registerMechaManifest(fixed);
 for(const angle of [0,-.035,.035])for(const factor of [-.9,-.72,-.54,-.36,-.18,0,.18,.36,.54,.72,.9]){
  const profile=bossProfile(index),g=engine.createGame(606201);Object.assign(g,{mode:'playing',phase:'boss',nextWaveAt:Infinity,nextBossAt:Infinity,nextPickupAt:Infinity});
  const hp=Math.round(trialDifficulty(index).bossHp*profile.hpMultiplier),isOpen=frame.coreExposed;
  const b={id:90,type:'boss',bossKind:role,x:1000,y:360,radius:profile.radius,hp,maxHp:hp,motion:{x:1000,centerY:360,frequency:0,amplitude:0,bank:angle},angle,artAngle:angle,attack:0,fireCooldown:Infinity,armorOpen:isOpen,coreOpenUntil:isOpen?Infinity:0,mechanismProgress:isOpen?1:frame.mechanismProgress??0,coreVulnerable:isOpen,payloadDockOccupied:frame.payloadVisible};
  g.enemies=[b];g.boss=b;engine.updateGame(g,DT,{});engine.consumeEvents(g);
  const spec=art.getMechaSpec(b);if(spec.state!==state)throw Error('Initial sourcepose mismatch '+state+' got '+spec.state);
  const core=art.mechaAnchorWorld(b,spec.runtimeCore),offset=factor*spec.runtimeCore.radius,muzzle=engine.playerMuzzle(g.player);
  g.bullets.push({id:900,x:muzzle.x+2,y:core.y+offset,vx:1360,vy:0,radius:5,power:1,age:0,weaponMode:'normal'});
  let hit=null;for(let i=0;i<120&&!hit;i++){engine.updateGame(g,DT,{});hit=engine.consumeEvents(g).find(ev=>ev.type==='hit'&&!ev.player&&ev.bulletId===900);}
  const impact=art.getMechaSpec(b);if(impact.state!==state)throw Error('Impact sourcepose mismatch '+state+' got '+impact.state);
  rows.push({state,sourceFilename:frame.filename,progress:frame.mechanismProgress,coreExposed:isOpen,angle,offsetFactor:factor,launchCore:core,impactCore:art.mechaAnchorWorld(b,impact.runtimeCore),impactFrame:impact.state,hit:hit?{coreHit:hit.coreHit,damage:hit.hpBefore-hit.hpAfter,at:hit.simulationAt}:null});
 }
}
const stateSummary=[...unique.values()].map(({state,frame})=>{const rr=rows.filter(v=>v.state===state);return{state,coreExposed:frame.coreExposed,total:rr.length,coreHits:rr.filter(v=>v.hit?.coreHit).length,bodyHits:rr.filter(v=>v.hit&&!v.hit.coreHit).length,missed:rr.filter(v=>!v.hit).length,impactFrameMismatch:rr.filter(v=>v.impactFrame!==state).length}});
const report={at:new Date().toISOString(),bossKind:role,entryKey:e.key,kind:'Explicit immutable source-pose binding fixture; candidate-derived manifest mechanism map contains target source state at progress0; semantic aliases removed only in fixture, authored PNG/anchors/hulls retained. Original engine physics/damage files unchanged. Tests authored poses, not natural boss timing or difficulty.',engineRoot:dist,engineSourceSHA256:receipt,unchangedAfter:Object.entries(receipt).every(([n,h])=>sha(fs.readFileSync(path.join(dist,'src',n)))===h),candidateManifestSHA256:sha(fs.readFileSync(path.join(folder,'manifest-candidate.json'))),rows,stateSummary};
fs.writeFileSync(path.join(folder,'ACTUAL_SOURCEPOSE_REGRESSION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({bossKind:role,rows:rows.length,unchangedAfter:report.unchangedAfter,stateSummary},null,2));
