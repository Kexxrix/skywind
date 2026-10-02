import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, threatNeighborCounts } from '../src/renderer.js';
import { projectileStyle, PROJECTILE_STYLES, PROJECTILE_PALETTES } from '../src/projectile-style.js';
import { registerMechaManifest, getMechaSpec, mechaAnchorWorld, mechaDirectionWorld, MECHA_MANIFEST_PATH } from '../src/mecha-art.js';
import { mechaBodyContact } from '../src/mecha-collision.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGame, enemyMuzzles, enemyDeployDocks } from '../src/game.js';
import { barragePlan } from '../src/barrage.js';

const context = overrides => new Proxy(overrides||{}, {get(target,key){return key in target?target[key]:()=>{};}});
const reset = () => registerMechaManifest({schemaVersion:1,entries:[]});
const manifest = () => ({schemaVersion:1,entries:[{
  key:'native-states',roles:['pincer','warden'],canvasWidth:384,canvasHeight:384,displayWidth:96,
  pivotPixels:{x:192,y:192},facing:'left',weakpointEnabled:true,
  frames:Object.fromEntries(['idle','charge','fire','open','damaged'].map((state,index)=>[state,{
    filename:`runtime/native-${state}.png`,sourceState:`phase${index+1}`,
    muzzlesPixels:[],nozzlesPixels:[{x:275,y:192}],
    corePixels:{x:188,y:193,radius:8},coreExposed:state==='open',
    bodyHullPixels:[[{x:100,y:120},{x:165,y:120},{x:165,y:260},{x:100,y:260}],
      [{x:220,y:120},{x:284,y:120},{x:284,y:260},{x:220,y:260}]],
    bodyBoundsPixels:{minX:100,minY:120,maxX:284,maxY:260},
  }]))
}]});

test('enemy projectile families remain distinguishable when their palette is identical',()=>{
  const geometry=[];
  for(const style of Object.keys(PROJECTILE_STYLES)) {
    const paths=[],filled=[];
    const c=context(Object.fromEntries(['moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc'].map(method=>[method,(...args)=>paths.push([method,...args])])));
    c.fill=()=>filled.push({color:c.fillStyle,path:paths.at(-1)});
    const bullet={x:500,y:300,vx:-240,vy:30,radius:5.5,style,palette:'magenta'},before=structuredClone(bullet);
    Renderer.prototype.drawCombatCues.call({presentation:{threatVariant:'A'},flashes:[]},c,
      {mode:'gameover',enemies:[],enemyBullets:[bullet],sceneTime:4});
    assert.ok(filled.some(fill=>fill.color===PROJECTILE_PALETTES.magenta.color&&
      JSON.stringify(fill.path)===JSON.stringify(['arc',500,300,5.5,0,Math.PI*2])),style+' shows complete physical nucleus');
    assert.deepEqual(bullet,before,style+' presentation preserves combat fields');
    geometry.push(JSON.stringify(paths));
  }
  assert.equal(new Set(geometry).size,6,'all six silhouettes differ without relying on hue');
});

test('style aliases and unknown metadata return immutable presentation without combat parameters',()=>{
  for(const [alias,id] of [['slowbead','bead'],['fastneedle','needle'],['curvepetal','petal']])
    assert.strictEqual(projectileStyle(alias),projectileStyle(id));
  assert.strictEqual(projectileStyle('unknown','missing'),projectileStyle('bead'));
  assert.strictEqual(projectileStyle('toString','constructor'),projectileStyle('bead'));
  const view=projectileStyle('rail','cyan');
  assert.equal(view.palette.id,'cyan');assert.equal(view.shape,'rail');
  assert.ok(Object.isFrozen(view)&&Object.isFrozen(view.palette));
  assert.equal(view.radius,undefined);assert.equal(view.motion,undefined);assert.equal(view.speed,undefined);
});

test('dense mixed shapes preserve palette and halo response without changing damage radii',()=>{
  const bullets=Object.keys(PROJECTILE_STYLES).flatMap((style,index)=>[
    {x:500+index*4,y:300,radius:5.5,vx:-200,vy:0,style,palette:'violet'},
    {x:500+index*4,y:302,radius:7,vx:-400,vy:0,style,palette:'scarlet',arming:.4},
  ]),before=structuredClone(bullets),glows=[];
  const counts=threatNeighborCounts(bullets).counts;
  Renderer.prototype.drawBullets.call({presentation:{threatVariant:'C'},glow(c,x,y,size,color,alpha){glows.push({color,alpha});}},context(),{bullets:[],enemyBullets:bullets});
  bullets.forEach((bullet,index)=>{
    assert.equal(glows[index*2].color,PROJECTILE_PALETTES[bullet.palette].glow);
    assert.equal(glows[index*2].alpha,(bullet.arming>0?.3:.88)/Math.sqrt(1+counts[index]*.35));
  });
  assert.deepEqual(bullets,before);
});

test('all five authored art states override fallback signals independently of boss HP phase',()=>{
  const raw=manifest(),before=structuredClone(raw);
  try {
    registerMechaManifest(raw);
    assert.equal(getMechaSpec({type:'pincer'}).mechanismFrames.length,0,'semantic frames do not imply a mechanical progression');
    for(const artState of ['idle','charge','fire','open','damaged'])for(const phase of [0,1,4]) {
      const enemy={type:'boss',bossKind:'warden',artState,phase,telegraph:.8,fireFlash:.1,armorOpen:true};
      const spec=getMechaSpec(enemy);
      assert.equal(spec.state,artState);assert.equal(spec.filename,`runtime/native-${artState}.png`);
      assert.equal(spec.coreExposed,artState==='open');assert.equal(spec.runtimeMuzzles.length,0);
      assert.deepEqual(spec.pivot,{x:48,y:48});
    }
    assert.equal(getMechaSpec({type:'pincer',artState:'missing',fireFlash:.1}).state,'fire');
    assert.equal(getMechaSpec({type:'pincer',armorOpen:true}).state,'open');
    assert.equal(getMechaSpec({type:'pincer',telegraph:.8}).state,'charge');
    assert.deepEqual(raw,before);
  } finally {reset();}
});

test('state-projected separated body pieces keep a crescent gap after scaling and reflection',()=>{
  try {
    const raw=manifest();registerMechaManifest(raw);
    const enemy={type:'pincer',artState:'damaged',x:800,y:300,artAngle:Math.PI/2,artFlipX:-1,artFlipY:1};
    const spec=getMechaSpec(enemy);
    assert.equal(spec.runtimeBodyHulls.length,2);
    assert.deepEqual(spec.runtimeBodyBounds,{minX:-23,minY:-18,maxX:23,maxY:17});
    assert.equal(spec.runtimeBodyHulls[0][1].x,-6.75);
    assert.equal(spec.runtimeBodyHulls[1][0].x,7);
    assert.ok(spec.runtimeBodyHulls[0].every(point=>point.x<0)&&spec.runtimeBodyHulls[1].every(point=>point.x>0),'empty center was not bridged');
    for(const hull of spec.runtimeBodyHulls)for(const local of hull) {
      const world=mechaAnchorWorld(enemy,local);
      assert.ok(Math.abs(world.x-(800-local.y))<1e-10);assert.ok(Math.abs(world.y-(300-local.x))<1e-10);
    }
    assert.ok(Object.isFrozen(spec.runtimeBodyHulls)&&Object.isFrozen(spec.runtimeBodyHulls[0])&&Object.isFrozen(spec.runtimeBodyBounds));
    const direction=mechaDirectionWorld(enemy,{x:-1,y:0});assert.ok(Math.abs(direction.y-1)<1e-10);
  } finally {reset();}
});

test('mechanism progression floors five physical frames without conflating semantic states or HP phase',()=>{
  const raw=manifest(),entry=raw.entries[0];
  entry.mechanismFrames=[0,.25,.5,.75,1].map((progress,index)=>({progress,state:`phase${index+1}`}));
  for(const {progress,state} of entry.mechanismFrames)entry.frames[state]={
    ...entry.frames.idle,filename:`runtime/mechanism-${state}.png`,sourceState:state,
    coreExposed:progress===1,muzzlesPixels:[{x:100+progress*20,y:190}],
  };
  try {
    registerMechaManifest(raw);
    assert.equal(getMechaSpec({type:'pincer'}).mechanismFrames.length,5);
    for(const [mechanismProgress,state] of [[-1,'phase1'],[0,'phase1'],[.249,'phase1'],[.25,'phase2'],
      [.499,'phase2'],[.5,'phase3'],[.75,'phase4'],[.999,'phase4'],[1,'phase5'],[2,'phase5']]) {
      const enemy={type:'boss',bossKind:'warden',mechanismProgress,artState:'damaged',armorOpen:true,phase:4};
      const spec=getMechaSpec(enemy);
      assert.equal(spec.state,state);assert.equal(spec.coreExposed,state==='phase5');
      assert.equal(spec.runtimeMuzzles[0].x,(100+Math.max(0,Math.min(1,Math.floor(mechanismProgress*4)/4))*20-192)/4);
    }
    assert.equal(getMechaSpec({type:'pincer',artFrame:'phase2',mechanismProgress:1,artState:'open'}).state,'phase2','explicit authored frame wins');
    assert.equal(getMechaSpec({type:'pincer',artFrame:'toString',artState:'constructor'}).state,'idle','unknown inherited names do not select a frame');
    assert.equal(getMechaSpec({type:'pincer',artState:'damaged'}).state,'damaged','semantic state remains a separate selector');
    assert.equal(getMechaSpec({type:'pincer',mechanismProgress:.75,artState:'open'}).coreExposed,false,'closing immediately returns to a protected image');
  } finally {reset();}
});

test('frame-level mechanism metadata accepts exact boundaries and rejects ambiguous or missing progress references atomically',()=>{
  const raw=manifest();
  raw.entries[0].frames.idle.mechanismProgress=0;
  raw.entries[0].frames.open.mechanismProgress=1;
  try {
    registerMechaManifest(raw);
    assert.equal(getMechaSpec({type:'pincer',mechanismProgress:.999,artState:'open'}).state,'idle');
    assert.equal(getMechaSpec({type:'pincer',mechanismProgress:1}).state,'open');
    for(const mechanismFrames of [[{progress:.25,state:'idle'}],[{progress:0,state:'absent'}],
      [{progress:0,state:'idle'},{progress:0,state:'open'}],[{progress:0,state:'idle'},{progress:1.01,state:'open'}]]) {
      const changed=structuredClone(raw);changed.entries[0].mechanismFrames=mechanismFrames;
      assert.throws(()=>registerMechaManifest(changed),/mechanism/);
      assert.equal(getMechaSpec({type:'pincer',mechanismProgress:1}).state,'open');
    }
  } finally {reset();}
});

test('a final mechanism core registers without semantic open while protected marker coordinates grant no exposure',()=>{
  const raw=manifest(),entry=raw.entries[0],closed={...entry.frames.idle,coreExposed:false};
  entry.mechanismFrames=[0,.25,.5,.75,1].map((progress,index)=>({progress,state:`phase${index+1}`}));
  entry.frames={idle:closed,...Object.fromEntries(entry.mechanismFrames.map(({progress,state})=>[state,{
    ...closed,filename:`runtime/${state}.png`,coreExposed:progress===1,
  }]))};
  try {
    registerMechaManifest(raw);
    const protectedView=getMechaSpec({type:'boss',bossKind:'warden',mechanismProgress:.999});
    assert.equal(protectedView.weakpointEnabled,true,'entry has an authored final exposed core');
    assert.equal(protectedView.coreExposed,false);assert.ok(protectedView.runtimeCore,'protected coordinate remains available without granting exposure');
    const finalView=getMechaSpec({type:'boss',bossKind:'warden',mechanismProgress:1});
    assert.equal(finalView.weakpointEnabled,true);assert.equal(finalView.coreExposed,true);assert.ok(finalView.runtimeCore);
    entry.frames.phase5.coreExposed=false;registerMechaManifest(raw);
    assert.equal(getMechaSpec({type:'boss',bossKind:'warden',mechanismProgress:1}).weakpointEnabled,false,'all marker-only frames disable the entry weakpoint');
    entry.frames.phase5.coreExposed=true;delete entry.frames.phase5.corePixels;registerMechaManifest(raw);
    assert.equal(getMechaSpec({type:'boss',bossKind:'warden',mechanismProgress:1}).weakpointEnabled,false,'exposure without a projected core has no permission');
  } finally {reset();}
});

test('sixty-four projected cell rectangles register separately and preserve their center gap',()=>{
  const raw=manifest(),hulls=[];
  for(let row=0;row<8;row++)for(let column=0;column<10;column++) {
    if(column===4||column===5)continue;
    const x=132+column*12,y=144+row*12;
    hulls.push([{x,y},{x:x+12,y},{x:x+12,y:y+12},{x,y:y+12}]);
  }
  for(const frame of Object.values(raw.entries[0].frames)) {
    frame.bodyHullPixels=hulls;frame.bodyBoundsPixels={minX:132,minY:144,maxX:252,maxY:240};
  }
  try {
    registerMechaManifest(raw);
    const spec=getMechaSpec({type:'pincer',artState:'charge'});
    assert.equal(spec.runtimeBodyHulls.length,64);
    assert.ok(spec.runtimeBodyHulls.every(hull=>hull.length===4));
    assert.ok(spec.runtimeBodyHulls.every(hull=>hull.every(point=>point.x<=-3)||hull.every(point=>point.x>=3)),'the alpha-grid gap is preserved after registration');
    assert.deepEqual(spec.runtimeBodyBounds,{minX:-15,minY:-12,maxX:15,maxY:12});
  } finally {reset();}
});

test('invalid body geometry rejects atomically and absent geometry does not manufacture a collision proxy',()=>{
  try {
    const raw=manifest();registerMechaManifest(raw);
    for(const invalid of [
      [{x:0,y:0},{x:10,y:0},{x:5,y:2},{x:10,y:10},{x:0,y:10}],
      [{x:0,y:0},{x:10,y:0},{x:10,y:0}],
      [{x:0,y:0},{x:10,y:0},{x:20,y:0}],
    ]) {
      const changed=structuredClone(raw);changed.entries[0].frames.idle.bodyHullPixels=invalid;
      assert.throws(()=>registerMechaManifest(changed),/body hull/);
      assert.equal(getMechaSpec({type:'pincer'}).runtimeBodyHulls.length,2);
    }
    const invalidBounds=structuredClone(raw);invalidBounds.entries[0].frames.idle.bodyBoundsPixels.maxX=99;
    assert.throws(()=>registerMechaManifest(invalidBounds),/body bounds/);
    const plain=manifest();for(const frame of Object.values(plain.entries[0].frames)) {
      delete frame.bodyHullPixels;delete frame.bodyBoundsPixels;
    }
    registerMechaManifest(plain);
    assert.deepEqual(getMechaSpec({type:'pincer'}).runtimeBodyHulls,[]);
    assert.equal(getMechaSpec({type:'pincer'}).runtimeBodyBounds,null);
  } finally {reset();}
});

test('projectile-free pincer warning identifies a body charge without fabricating muzzle glows',()=>{
  const paths=[],glows=[];let path=[];
  const c=context({beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},stroke(){paths.push([...path]);}});
  try {
    registerMechaManifest(manifest());
    const enemy={type:'pincer',x:900,y:350,radius:20,artState:'charge',telegraph:.8,attackAngle:Math.PI,muzzles:[]},before=structuredClone(enemy);
    Renderer.prototype.drawThreats.call({glow(...args){glows.push(args);}},c,{enemies:[enemy]});
    assert.equal(glows.length,0);assert.equal(paths.length,1);assert.ok(paths[0].length>=10,'body bracket and charge chevrons are visible');
    assert.deepEqual(enemy,before);
  } finally {reset();}
});

test('wasp body warnings use the locked charge direction and remaining dash path without muzzle cues or retargeting',()=>{
  const measure=enemy=>{
    const paths=[],angles=[],glows=[];let path=[];
    const c=context({rotate(angle){angles.push(angle);},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},
      lineTo(x,y){path.push([x,y]);},stroke(){paths.push([...path]);}});
    const g={enemies:[enemy],player:{x:160,y:140}},before=structuredClone(g);
    Renderer.prototype.drawThreats.call({glow(...args){glows.push(args);}},c,g);
    assert.deepEqual(g,before);assert.equal(glows.length,0);
    return {paths,angles};
  };
  const base={type:'wasp',x:800,y:350,radius:22,artAngle:-.8,attackAngle:2.9,dashLockedTarget:{x:220,y:492},
    aimTarget:{x:160,y:140},combat:{bodyAttack:{projectiles:false,dashSpeed:660,dashSeconds:.9}},muzzles:[]};
  const brace=measure({...base,bodyState:'brace',telegraph:.8});
  assert.deepEqual(brace.angles,[2.9]);assert.deepEqual(brace.paths.at(-1),[[67,0],[594,0]]);
  assert.deepEqual(brace,measure({...base,aimTarget:{x:500,y:600},bodyState:'brace',telegraph:.8}),'later target movement does not rotate the tell');
  const dash=measure({...base,bodyState:'dash',dashTime:.4,telegraph:0});
  assert.deepEqual(dash.angles,[2.9]);assert.deepEqual(dash.paths.at(-1),[[67,0],[264,0]]);
  const missingAngle=measure({...base,attackAngle:undefined,bodyState:'brace',telegraph:.8});
  assert.equal(missingAngle.angles[0],Math.atan2(142,-580),'authored locked target is the only direction fallback');
  const bait=measure({...base,bodyState:'bait',telegraph:.03});
  assert.equal(bait.paths.length,1);assert.equal(bait.paths[0].length,6,'bait brackets the body without promising a locked path');
  assert.equal(measure({...base,bodyState:'recover',telegraph:0}).paths.length,0);
});

test('art-only entries join the loader list without becoming combat roles and valid appearance keys win role lookup',()=>{
  const raw=manifest(),helper=structuredClone(raw.entries[0]);
  helper.key='art-only-helper';helper.roles=[];helper.weakpointEnabled=false;
  for(const [state,frame] of Object.entries(helper.frames))frame.filename=`runtime/helper-${state}.png`;
  raw.entries.push(helper);
  const before=structuredClone(raw);
  try {
    const specs=registerMechaManifest(raw);
    assert.equal(specs.length,2);assert.ok(Object.isFrozen(specs));
    assert.equal(getMechaSpec({type:'art-only-helper'}),null,'helper key does not become a type or combat role');
    const selected=getMechaSpec({type:'pincer',appearanceKey:'art-only-helper',artState:'fire'});
    assert.equal(selected.key,'art-only-helper');assert.equal(selected.filename,'runtime/helper-fire.png');
    assert.equal(selected.weakpointEnabled,false);
    assert.equal(getMechaSpec({type:'boss',bossKind:'warden',appearanceKey:'art-only-helper'}).key,'art-only-helper');
    assert.equal(getMechaSpec({type:'pincer',appearanceKey:'absent',artState:'charge'}).filename,'runtime/native-charge.png','unknown appearance preserves existing role fallback');
    assert.equal(getMechaSpec({type:'pincer',appearanceKey:null}).key,'native-states');
    assert.equal(getMechaSpec({type:'missing',appearanceKey:'absent'}),null);
    const files=[...new Set(specs.flatMap(spec=>Object.values(spec.states).map(state=>state.filename)))];
    assert.ok(files.includes('runtime/helper-idle.png')&&files.includes('runtime/helper-damaged.png'),'renderer loader sees art-only state images');
    assert.deepEqual(raw,before);
  } finally {reset();}
});

test('appearance-selected mechanism and semantic states retain the existing exact-frame precedence',()=>{
  const raw=manifest(),helper=structuredClone(raw.entries[0]);
  helper.key='mechanism-helper';helper.roles=[];helper.weakpointEnabled=false;
  helper.mechanismFrames=[{progress:0,state:'idle'},{progress:.75,state:'charge'},{progress:1,state:'open'}];
  raw.entries.push(helper);
  try {
    registerMechaManifest(raw);
    const base={type:'pincer',appearanceKey:'mechanism-helper'};
    assert.equal(getMechaSpec({...base,artFrame:'fire',mechanismProgress:1,artState:'damaged'}).state,'fire');
    assert.equal(getMechaSpec({...base,mechanismProgress:.999,artState:'open'}).state,'charge');
    assert.equal(getMechaSpec({...base,mechanismProgress:1,artState:'damaged'}).state,'open');
    assert.equal(getMechaSpec({...base,artState:'damaged',fireFlash:.2,armorOpen:true}).state,'damaged');
    assert.equal(getMechaSpec({...base,fireFlash:.2,armorOpen:true}).state,'fire');
    assert.equal(getMechaSpec({...base,armorOpen:true}).state,'open');
    assert.equal(getMechaSpec({...base,telegraph:.2}).state,'charge');
  } finally {reset();}
});

test('duplicate or invalid entry keys reject atomically without damaging either appearance or role registries',()=>{
  const raw=manifest(),helper=structuredClone(raw.entries[0]);
  helper.key='safe-helper';helper.roles=[];raw.entries.push(helper);
  try {
    registerMechaManifest(raw);
    for(const key of ['native-states','',null,3]) {
      const changed=structuredClone(raw);changed.entries[1].key=key;
      assert.throws(()=>registerMechaManifest(changed),/mecha key/);
      assert.equal(getMechaSpec({type:'pincer'}).key,'native-states');
      assert.equal(getMechaSpec({type:'pincer',appearanceKey:'safe-helper'}).key,'safe-helper');
    }
    const duplicatedRole=structuredClone(raw);duplicatedRole.entries[1].roles=['pincer'];
    assert.throws(()=>registerMechaManifest(duplicatedRole),/mecha role/);
    assert.equal(getMechaSpec({type:'pincer',appearanceKey:'safe-helper'}).key,'safe-helper');
    registerMechaManifest({schemaVersion:1,entries:[]});
    assert.equal(getMechaSpec({type:'pincer',appearanceKey:'safe-helper'}),null,'clear replaces both registries together');
  } finally {reset();}
});

test('local composite preserves original entries outside approved boss overrides and pincer-v2 state images and anchors',async()=>{
  const old=JSON.parse(await readFile(new URL('../assets/art/mecha-8h/manifest.json',import.meta.url),'utf8'));
  const url=new URL('../'+MECHA_MANIFEST_PATH.slice(2),import.meta.url),raw=JSON.parse(await readFile(url,'utf8'));
  assert.equal(old.entries.length,14);assert.equal(raw.entries.length,16);assert.equal(raw.runtimeImageCount,62);
  const original=structuredClone(raw.entries.slice(0,14).filter((_,index)=>![9,10,11].includes(index)));
  for(const entry of original)for(const frame of Object.values(entry.frames)) {
    assert.ok(frame.filename.startsWith('mecha-8h/'));
    frame.filename=frame.filename.slice('mecha-8h/'.length);
  }
  assert.deepEqual(original,old.entries.filter((_,index)=>![9,10,11].includes(index)),'metadata and PNG hashes outside approved Warden/Carrier/Lancer replacements remain original');
  const entry=raw.entries[14];assert.equal(entry.key,'local-v2-pincer');assert.deepEqual(entry.roles,['pincer']);
  assert.deepEqual(Object.keys(entry.frames),['idle','charge','fire','recovery']);
  assert.deepEqual(entry.mechanismFrames,[],'authoring frames and axial stroke do not imply opening progress');
  const approved={idle:'7d2ef40c0ebef1527700358ef3a4e95913afc08cd0882ae1c342bad5ec993b6a',
    charge:'7bedce2368690aff87930186701a97cecfbc8ca037e49c1f45a61571ac8d6764',
    fire:'f37ff6ac262ca33e2ec6c4d4791a8bf982697a4079b89b2b742f88c2d01109e9',
    recovery:'027b91013eae3abdda818993d93fb017cefff95a287cee6f4794e5683d50cdf2'};
  try {
    const specs=registerMechaManifest(raw);assert.equal(specs.length,16);
    for(const [state,frame] of Object.entries(entry.frames)) {
      const png=await readFile(new URL(frame.filename,url));
      assert.equal(createHash('sha256').update(png).digest('hex'),approved[state]);assert.equal(frame.sha256,approved[state]);
      assert.equal(png.readUInt32BE(16),384);assert.equal(png.readUInt32BE(20),384);
      assert.equal(png[24],8);assert.equal(png[25],6);
      const enemy={type:'pincer',artState:state,fireFlash:.2,telegraph:.8,armorOpen:true,mechanismProgress:1,x:800,y:300},spec=getMechaSpec(enemy);
      assert.equal(spec.state,state);assert.equal(spec.filename,frame.filename);
      assert.equal(spec.displayWidth,96);assert.deepEqual(spec.pivot,{x:48,y:48});
      assert.deepEqual(spec.runtimeMuzzles,[]);assert.deepEqual(spec.runtimeMuzzleDirections,[]);
      assert.equal(spec.runtimeCore,null);assert.equal(spec.coreExposed,false);assert.equal(spec.weakpointEnabled,false);
      assert.equal(spec.runtimeBodyHulls.length,16);assert.equal(spec.runtimeNozzles.length,1);
      for(let index=0;index<16;index++)assert.deepEqual(spec.runtimeBodyHulls[index],frame.bodyHullPixels[index].map(p=>({x:(p.x-192)*.25,y:(p.y-192)*.25})));
      const draws=[],glows=[];
      Renderer.prototype.drawEnemy.call({mechaFrames:{[frame.filename]:{actual:true}},glow(...args){glows.push(args);}},context({drawImage(...args){draws.push(args);}}),enemy,100);
      assert.deepEqual(draws[0].slice(1),[-48,-48,96,96]);assert.equal(glows.length,1,'only the authored rear nozzle emits a glow');
    }
  } finally {reset();}
});

test('approved Warden images preserve five ordered state-specific ports, protected physical phases and exact open override',async()=>{
  const url=new URL('../assets/art/mecha-12h-local.json',import.meta.url),raw=JSON.parse(await readFile(url,'utf8')),entry=raw.entries[9];
  assert.equal(entry.key,'local-v2-warden');assert.deepEqual(entry.roles,['warden']);assert.equal(entry.displayWidth,380);
  assert.deepEqual(entry.pivotPixels,{x:192,y:192});assert.equal(entry.facing,'left');
  assert.deepEqual(entry.mechanismFrames,[{state:'phase_0',progress:0},{state:'phase_25',progress:.25},
    {state:'phase_50',progress:.5},{state:'phase_75',progress:.75},{state:'phase_100',progress:1}]);
  const approved={idle:'9378c53b6df2a0e8a9e2e970c3525d0a4ae57f2184eb6c6680c58384ea332c07',
    charge:'42bf2f8751a3494172817b310ce52f499412a9c7feb9ce238fa3f95ec829ccea',
    fire:'2c52c1333a4a4a65b4e2f3943ae5c2d112a3771cba09b95f368edaacbf5f080f',
    open:'6f3994fec65858c4c513d04e6a7dc38159eeed482ce9005f323c1d17d497f202',
    phase_0:'34ff1253a76a7094ac476d1bc0850b9c20c3d8689c6df03963f55869fbc91c3f',
    phase_25:'0f2c7231a619749a248325d022c0f376f38603685a5258dcb9863109eeba97bb',
    phase_50:'8ef73e110917639c983cd8dc4138027273020aa5819bc351c289c58d85876c57',
    phase_75:'4a11cdb2c4ad9899b72e6df33984686612411f9471d6c8720e7689288e75eed8',
    phase_100:'e3c7f9990300bbcbc5f3aa93bd8bfa8c0dbfaeecd5e25118f6961891af0f15e8'};
  try {
    registerMechaManifest(raw);
    for(const [state,frame] of Object.entries(entry.frames)) {
      const png=await readFile(new URL(frame.filename,url));assert.equal(createHash('sha256').update(png).digest('hex'),approved[state]);
      assert.equal(frame.sha256,approved[state]);assert.equal(png.readUInt32BE(16),384);assert.equal(png.readUInt32BE(20),384);
      const spec=getMechaSpec({type:'boss',bossKind:'warden',artState:state}),exposed=['open','phase_100'].includes(state);
      assert.equal(spec.state,state);assert.equal(spec.coreExposed,exposed);assert.equal(frame.physicalInterlockClosed,!exposed);
      assert.equal(spec.runtimeBodyHulls.length,exposed?27:26);assert.equal(spec.runtimeMuzzles.length,5);assert.equal(spec.runtimeNozzles.length,2);
      assert.ok(spec.runtimeCore&&spec.weakpointEnabled,'protected frames retain the authored core coordinate without exposing it');
      // Ordered lower pair, upper pair, then central lance: no per-frame resort.
      const p=frame.muzzlesPixels;assert.ok(p[0].y>p[1].y&&p[1].y>p[4].y&&p[4].y>p[2].y&&p[2].y>p[3].y);
      assert.ok(p[4].x<p[0].x);assert.equal(p[0].x,p[1].x);assert.equal(p[2].x,p[3].x);
      for(let index=0;index<5;index++) {
        assert.deepEqual(spec.runtimeMuzzles[index],{x:(p[index].x-192)*(380/384),y:(p[index].y-192)*(380/384)});
        assert.deepEqual(spec.runtimeMuzzleDirections[index],{x:-1,y:0});
      }
    }
    for(const [progress,state] of [[0,'phase_0'],[.249999,'phase_0'],[.25,'phase_25'],[.5,'phase_50'],[.75,'phase_75'],[.999,'phase_75'],[1,'phase_100']]) {
      const spec=getMechaSpec({type:'boss',bossKind:'warden',mechanismProgress:progress,artState:'open',armorOpen:true,coreVulnerable:true});
      assert.equal(spec.state,state);assert.equal(spec.coreExposed,progress===1);
    }
    for(const artFrame of ['open','phase_100']) {
      const spec=getMechaSpec({type:'boss',bossKind:'warden',artFrame,mechanismProgress:.999});
      assert.equal(spec.state,artFrame);assert.equal(spec.coreExposed,true,'exact override remains explicit and must be synchronized by the game');
    }
    assert.equal(getMechaSpec({type:'boss',bossKind:'warden',mechanismProgress:.999,artFrame:'missing'}).coreExposed,false);
    for(const [role,count] of Object.entries({beetle:1,dragonfly:1,wasp:1,mantis:2,orb:3,claw:2,ray:2,worm:3,needle:1}))
      assert.equal(getMechaSpec({type:role}).runtimeMuzzles.length,count,'original '+role+' art port count');
    const claw=barragePlan('snapshot',0,.5);assert.equal(claw.total,1);assert.equal(claw.bundles[0].port,0,'Stage1 claw remains one snapshot at port0');
  } finally {reset();}
});

test('all eighteen Warden inter-barrel probes stay empty through state projection, reflection and player-radius sweeps',async()=>{
  const raw=JSON.parse(await readFile(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
  try {
    registerMechaManifest(raw);let sourceProbes=0;
    for(const [state,frame] of Object.entries(raw.entries[9].frames)) {
      for(const [a,b] of [[0,1],[2,3]]) {
        const source={x:frame.muzzlesPixels[a].x,y:(frame.muzzlesPixels[a].y+frame.muzzlesPixels[b].y)/2};sourceProbes++;
        for(const [angle,flipX,flipY] of [[0,1,1],[.67,-1,1],[-Math.PI/2,1,-1]]) {
          const enemy={type:'boss',bossKind:'warden',artFrame:state,x:950,y:340,artAngle:angle,artFlipX:flipX,artFlipY:flipY};
          const local={x:(source.x-192)*380/384,y:(source.y-192)*380/384},point=mechaAnchorWorld(enemy,local);
          assert.equal(mechaBodyContact(enemy,{...point,radius:1.85}),false,state+' does not fill between tower guns');
          const start={...mechaAnchorWorld(enemy,{x:local.x-4,y:local.y}),radius:1.85};
          const end={...mechaAnchorWorld(enemy,{x:local.x+4,y:local.y}),radius:1.85};
          assert.equal(mechaBodyContact(enemy,end,start,enemy),false,state+' gap also stays empty during travel');
        }
      }
    }
    assert.equal(sourceProbes,18);
  } finally {reset();}
});

test('Warden reward marker requires both game permission and an actually exposed selected core',async()=>{
  const raw=JSON.parse(await readFile(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
  const draw=enemy=>{
    const paths=[];let path=[];
    const c=context({beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},stroke(){paths.push([...path]);}});
    const before=structuredClone(enemy);
    Renderer.prototype.drawCombatCues.call({presentation:{threatVariant:'A'},flashes:[]},c,{mode:'title',enemies:[enemy],enemyBullets:[]});
    assert.deepEqual(enemy,before);return paths;
  };
  try {
    registerMechaManifest(raw);
    const base={type:'boss',bossKind:'warden',x:950,y:340,armorOpen:true,coreVulnerable:true};
    for(const mechanismProgress of [0,.25,.5,.75,.999])assert.deepEqual(draw({...base,mechanismProgress}),[],'protected coordinates never produce a reward marker');
    assert.equal(draw({...base,mechanismProgress:1}).length,1);
    assert.deepEqual(draw({...base,mechanismProgress:1,armorOpen:false}),[]);
    assert.deepEqual(draw({...base,mechanismProgress:1,coreVulnerable:false}),[]);
    assert.deepEqual(draw({...base,mechanismProgress:.75,artFrame:'phase_100',armorOpen:false,coreVulnerable:false}),[],'revoked game permission blocks a stale exposed override marker');
  } finally {reset();}
});

test('Warden charge illuminates only the next actual tower or lance while fire illuminates only actual launch positions',async()=>{
  const raw=JSON.parse(await readFile(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
  try {
    registerMechaManifest(raw);
    const g=createGame(20261002),plan={...barragePlan('cathedral',0,.5),cos:1,sin:0,roll:0,cameraY:0,index:0};
    const enemy={type:'boss',bossKind:'warden',x:950,y:340,radius:80,mechanismProgress:.5,artAngle:.37,artFlipX:-1,
      telegraph:.8,attackName:'cathedral',safeLane:240,safeDirection:1,sequence:plan,muzzles:[{x:-999,y:-999}]};
    g.enemies=[enemy];const ports=enemyMuzzles(enemy);
    for(let index=0;index<5;index++) {
      plan.index=index;const glows=[],before=structuredClone(g);
      Renderer.prototype.drawThreats.call({glow(c,x,y){glows.push({x,y});}},context(),g);
      assert.deepEqual(glows,[ports[plan.bundles[index].port]],'only upcoming authored port '+plan.bundles[index].port+' glows');
      assert.deepEqual(g,before,'cue selection consumes no RNG or sequence state');
    }
    plan.index=plan.bundles.length;const none=[];
    Renderer.prototype.drawThreats.call({glow(...args){none.push(args);}},context(),g);assert.deepEqual(none,[],'finished sequence has no fabricated source');
    const renderer=Object.assign(Object.create(Renderer.prototype),{flashes:[],labels:[],particles:[],trail:[],exitGhosts:[],impactShake:0,exposure:0});
    const event={type:'enemyShot',x:-999,y:-999,boss:true,bossKind:'warden',attackName:'cathedral',launchMuzzles:[ports[0],ports[2],ports[0]]},before=structuredClone(event);
    renderer.handleEvents([event]);assert.deepEqual(renderer.flashes.map(f=>({x:f.x,y:f.y})),[ports[0],ports[2]]);
    assert.deepEqual(event,before,'actual launch positions are copied without changing the event');
  } finally {reset();}
});

test('actual pincer poses share rotated collision projection, preserve piston gaps and sweep the dash without joining hulls',async()=>{
  const raw=JSON.parse(await readFile(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
  try {
    registerMechaManifest(raw);
    for(const state of ['idle','charge','fire','recovery'])for(const [angle,flipX,flipY] of [[0,1,1],[.71,-1,1],[-Math.PI/2,1,-1]]) {
      const enemy={type:'pincer',artState:state,x:800,y:300,artAngle:angle,artFlipX:flipX,artFlipY:flipY},spec=getMechaSpec(enemy);
      const circle=local=>({...mechaAnchorWorld(enemy,local),radius:1.85});
      const front=spec.runtimeBodyBounds.minX;
      assert.equal(mechaBodyContact(enemy,circle({x:front-1.85-.2,y:0})),false,state+' outside the real front plate');
      assert.equal(mechaBodyContact(enemy,circle({x:front-1.85+.2,y:0})),true,state+' reaches the real front plate');
      assert.equal(mechaBodyContact(enemy,circle({x:0,y:0})),true,state+' retains the load-bearing axis');
    }
    const fire={type:'pincer',artState:'fire',x:800,y:300,artAngle:.71,artFlipX:-1},circle=local=>({...mechaAnchorWorld(fire,local),radius:1.85});
    // Source (82..132,150) is the visible empty space between the extended
    // front plate and upper body, inside the aggregate box of the 16 pieces.
    const gapStart=circle({x:(82-192)*.25,y:(150-192)*.25}),gapEnd=circle({x:(132-192)*.25,y:(150-192)*.25});
    assert.equal(mechaBodyContact(fire,gapStart),false);assert.equal(mechaBodyContact(fire,gapEnd),false);
    assert.equal(mechaBodyContact(fire,gapEnd,gapStart,fire),false,'a sweep through the piston gap remains empty');
    const bodyStart=circle({x:-70,y:0}),bodyEnd=circle({x:70,y:0});
    assert.equal(mechaBodyContact(fire,bodyStart),false);assert.equal(mechaBodyContact(fire,bodyEnd),false);
    assert.equal(mechaBodyContact(fire,bodyEnd,bodyStart,fire),true,'fast relative travel cannot tunnel through the authored body');
    const moving={type:'pincer',artState:'fire',x:650,y:300},previous={...moving,x:800},stationary={x:725,y:300,radius:1.85};
    assert.equal(mechaBodyContact(previous,stationary),false);assert.equal(mechaBodyContact(moving,stationary),false);
    assert.equal(mechaBodyContact(moving,stationary,stationary,previous),true,'a moving ram also sweeps between clear endpoints');
    const charge=getMechaSpec({type:'pincer',artState:'charge'}),extended=getMechaSpec({type:'pincer',artState:'fire'});
    assert.ok(Math.abs(charge.runtimeBodyBounds.minX-extended.runtimeBodyBounds.minX-30.545475)<1e-10);
    const pose={type:'pincer',x:800,y:300},extendedPlate={...mechaAnchorWorld(pose,{x:(25-192)*.25,y:0}),radius:1.85};
    assert.equal(mechaBodyContact({...pose,artState:'fire'},extendedPlate),true);
    assert.equal(mechaBodyContact({...pose,artState:'recovery'},extendedPlate),false,'recovery never retains the fire plate reach');
  } finally {reset();}
});

test('all twenty Carrier payload poses retain exact dock metadata, separate removed components and protected phase floors',async()=>{
  const url=new URL('../assets/art/mecha-12h-local.json',import.meta.url),raw=JSON.parse(await readFile(url,'utf8'));
  const entry=raw.entries[10],variants={payload2:[true,true],payload1near:[true,false],payload1far:[false,true],payload0:[false,false]};
  assert.equal(entry.key,'local-carrier-v2');assert.equal(raw.entries[15].key,'local-carrier-child-v2');
  assert.deepEqual(raw.entries[15].roles,[]);assert.equal(entry.matchingChild.entryKey,'local-carrier-child-v2');
  try {
    const specs=registerMechaManifest(raw);assert.equal(specs.length,16);
    const base=getMechaSpec({type:'boss',bossKind:'carrier'}),scale=448/384;
    assert.deepEqual(base.matchingChild.runtimeDockCenters,[{x:(122.5143-192)*scale,y:(245.7479-192)*scale},
      {x:(202.24-192)*scale,y:(245.7479-192)*scale}]);
    assert.equal(base.payloadMechanismSelection.frameTemplate,entry.payloadMechanismSelection.frameTemplate);
    assert.equal(base.payloadMechanismSelection.nearDockIndex,0);assert.equal(base.payloadMechanismSelection.farDockIndex,1);
    assert.ok(Object.isFrozen(base.matchingChild)&&Object.isFrozen(base.matchingChild.runtimeDockCenters)&&Object.isFrozen(base.payloadMechanismSelection));
    const uniqueFiles=new Set();let states=0;
    for(const [phase,progress] of [['000',0],['025',.25],['050',.5],['075',.75],['100',1]]) {
      const selected={};
      for(const [variant,visible] of Object.entries(variants)) {
        const state=`phase_${phase}_${variant}`,enemy={type:'boss',bossKind:'carrier',artFrame:state,artState:'damaged',
          phase:4,fireFlash:.12,flash:.1,mechanismProgress:progress,x:900,y:340,artAngle:.42,artFlipX:-1},spec=getMechaSpec(enemy);
        selected[variant]=spec;states++;assert.equal(spec.state,state,'damage retains the exact current mechanism and payload pose');
        assert.deepEqual(spec.payloadVisible,visible);assert.equal(spec.payloadCount,visible.filter(Boolean).length);assert.equal(spec.payloadVariant,variant);
        assert.ok(Object.isFrozen(spec.payloadVisible)&&Object.isFrozen(spec.runtimeDockCenters));
        assert.deepEqual(spec.runtimeDockCenters,base.matchingChild.runtimeDockCenters);
        assert.equal(spec.coreExposed,progress===1);assert.equal(spec.runtimeBodyHulls.length,(progress===1?22:21)+spec.payloadCount*6);
        for(const [x,y] of [[165,208],[190,215]]) {
          const point=mechaAnchorWorld(enemy,{x:(x-192)*scale,y:(y-192)*scale});
          assert.equal(mechaBodyContact(enemy,{...point,radius:1.85}),false,'actual empty bay probes stay empty after reflection');
        }
        const frame=entry.frames[state];uniqueFiles.add(frame.filename);
        const png=await readFile(new URL(frame.filename,url));assert.equal(createHash('sha256').update(png).digest('hex'),frame.sha256);
      }
      const pieces=spec=>new Set(spec.runtimeBodyHulls.map(hull=>JSON.stringify(hull)));
      const full=pieces(selected.payload2),near=pieces(selected.payload1near),far=pieces(selected.payload1far),empty=pieces(selected.payload0);
      assert.equal([...full].filter(piece=>!near.has(piece)).length,6);assert.equal([...full].filter(piece=>!far.has(piece)).length,6);
      assert.equal([...near].filter(piece=>!empty.has(piece)).length,6);assert.equal([...far].filter(piece=>!empty.has(piece)).length,6);
    }
    assert.equal(states,20);assert.equal(uniqueFiles.size,20);
    const preview=getMechaSpec({type:'boss',bossKind:'carrier',mechanismProgress:.999,artState:'fire',fireFlash:.12});
    assert.equal(preview.state,'phase_075_payload2');assert.equal(preview.coreExposed,false);
    const child=getMechaSpec({type:'dragonfly',appearanceKey:base.matchingChild.entryKey});
    assert.equal(child.key,'local-carrier-child-v2');assert.equal(child.displayWidth,448);assert.equal(child.runtimeBodyHulls.length,6);
    assert.equal(child.runtimeMuzzles.length,1);assert.equal(child.runtimeCore,null);assert.equal(child.weakpointEnabled,false);
    assert.equal(getMechaSpec({type:'local-carrier-child-v2'}),null,'appearance helper is never a combat type');
    assert.ok(specs.flatMap(spec=>Object.values(spec.states)).some(frame=>frame.filename.endsWith('/carrier-child.png')),'loader includes the exact matching child');
  } finally {reset();}
});

test('all ten Lancer neutral and recoil snapshots move only the main port with the same selected hull and core permission',async()=>{
  const url=new URL('../assets/art/mecha-12h-local.json',import.meta.url),raw=JSON.parse(await readFile(url,'utf8')),entry=raw.entries[11];
  assert.equal(entry.key,'local-lancer-v2');
  try {
    registerMechaManifest(raw);const files=new Set();
    for(const [phase,progress] of [['000',0],['025',.25],['050',.5],['075',.75],['100',1]]) {
      const before={type:'boss',bossKind:'lancer',mechanismProgress:progress,artFrame:`phase_${phase}`,x:900,y:340,artAngle:.41,artFlipX:-1};
      const neutral=getMechaSpec(before),after={...before,artFrame:`phase_${phase}_fire`,fireFlash:.12,artState:'damaged',flash:.1},recoil=getMechaSpec(after);
      assert.ok(Math.abs(recoil.runtimeMuzzles[0].x-neutral.runtimeMuzzles[0].x-38.87854)<1e-5);
      assert.deepEqual(recoil.runtimeMuzzles[1],neutral.runtimeMuzzles[1],'secondary port does not inherit the main gun recoil');
      assert.equal(recoil.runtimeMuzzles[0].y,neutral.runtimeMuzzles[0].y);
      assert.deepEqual(recoil.runtimeMuzzleDirections,neutral.runtimeMuzzleDirections);
      const a=mechaAnchorWorld(before,neutral.runtimeMuzzles[0]),b=mechaAnchorWorld(after,recoil.runtimeMuzzles[0]);
      assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-38.87854)<1e-5);
      for(const spec of [neutral,recoil]) {
        assert.equal(spec.coreExposed,progress===1);assert.equal(spec.runtimeBodyHulls.length,progress===1?24:23);
        const png=await readFile(new URL(spec.filename,url)),frame=entry.frames[spec.state];files.add(spec.filename);
        assert.equal(createHash('sha256').update(png).digest('hex'),frame.sha256);
        const calls=[];Renderer.prototype.drawEnemy.call({mechaFrames:{[spec.filename]:{}},glow(){}},context({drawImage(...args){calls.push(args);}}),spec===neutral?before:after,1000);
        assert.deepEqual(calls[0].slice(1),[-200,-200,400,400],'recoil and damage never crop or shift the fixed source canvas');
      }
    }
    assert.equal(files.size,10);
    const partial=getMechaSpec({type:'boss',bossKind:'lancer',mechanismProgress:.999,fireFlash:.12,artState:'fire'});
    assert.equal(partial.state,'phase_075');assert.equal(partial.coreExposed,false,'game owns the explicit same-floor recoil suffix');
  } finally {reset();}
});

test('invalid dock, payload and matching-child contracts reject atomically and preserve the previous complete registry',async()=>{
  const raw=JSON.parse(await readFile(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
  const mutations=[
    m=>{m.entries[10].matchingChild.entryKey='missing-child';},
    m=>{m.entries[15].roles=['invented-child-combat'];},
    m=>{m.entries[15].displayWidth=100;},
    m=>{m.entries[10].matchingChild.dockCentersPixels=[];},
    m=>{m.entries[10].payloadMechanismSelection.nearDockIndex=2;},
    m=>{m.entries[10].payloadMechanismSelection.frameTemplate='';},
    m=>{m.entries[10].frames.idle.dockCentersPixels[0].x=NaN;},
    m=>{m.entries[10].frames.idle.payloadVisible=[1,true];},
    m=>{m.entries[10].frames.idle.payloadCount=1;},
    m=>{m.entries[10].frames.idle.payloadVariant='payload1far';},
  ];
  try {
    registerMechaManifest(raw);
    for(const mutate of mutations) {
      const invalid=structuredClone(raw);mutate(invalid);assert.throws(()=>registerMechaManifest(invalid),/mecha/);
      const carrier=getMechaSpec({type:'boss',bossKind:'carrier'});
      assert.equal(carrier.matchingChild.entryKey,'local-carrier-child-v2');assert.deepEqual(carrier.payloadVisible,[true,true]);
      assert.equal(getMechaSpec({type:'dragonfly',appearanceKey:'local-carrier-child-v2'}).key,'local-carrier-child-v2');
      assert.equal(getMechaSpec({type:'invented-child-combat'}),null);
    }
  } finally {reset();}
});

test('Carrier bay warnings use only actual remaining deploy docks without fabricating gun glows',async()=>{
  const raw=JSON.parse(await readFile(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
  try {
    registerMechaManifest(raw);
    const g=createGame(20261002),enemy={id:30,type:'boss',bossKind:'carrier',x:950,y:340,radius:95,artFrame:'phase_075_payload1far',
      mechanismProgress:.75,payloadDockOccupied:[false,true],telegraph:.8,attackName:'deploy',artAngle:.3,artFlipX:-1,
      sequence:{...barragePlan('deploy',0,.5),index:0},attackSpec:{action:{count:2,childLimit:4}}};
    assert.equal(enemy.sequence.bundles[0].count,0,'deploy reserves zero projectiles while action.count requests actual children');
    g.enemies=[enemy];const expected=enemyDeployDocks(g,enemy),translations=[],glows=[],before=structuredClone(g);
    assert.equal(expected.length,1);
    Renderer.prototype.drawThreats.call({glow(...args){glows.push(args);}},context({translate(x,y){translations.push({x,y});}}),g);
    assert.deepEqual(translations,expected);assert.deepEqual(glows,[],'the launch bay never receives a fake muzzle flash');
    assert.deepEqual(g,before);
    enemy.attackSpec.action.count=0;assert.deepEqual(enemyDeployDocks(g,enemy),[],'an explicitly zero child action has no bay warning');
    enemy.attackSpec.action.count=2;
    enemy.payloadDockOccupied=[false,false];const empty=[];
    Renderer.prototype.drawThreats.call({glow(...args){glows.push(args);}},context({translate(x,y){empty.push({x,y});}}),g);
    assert.deepEqual(empty,[],'consumed docks stop emitting bay warnings');
  } finally {reset();}
});
