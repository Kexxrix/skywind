import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, threatNeighborCounts } from '../src/renderer.js';
import { projectileStyle, PROJECTILE_STYLES, PROJECTILE_PALETTES } from '../src/projectile-style.js';
import { registerMechaManifest, getMechaSpec, mechaAnchorWorld, mechaDirectionWorld, MECHA_MANIFEST_PATH } from '../src/mecha-art.js';
import { mechaBodyContact } from '../src/mecha-collision.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

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

test('local composite preserves every original entry and adopts only approved pincer-v2 state images and anchors',async()=>{
  const old=JSON.parse(await readFile(new URL('../assets/art/mecha-8h/manifest.json',import.meta.url),'utf8'));
  const url=new URL('../'+MECHA_MANIFEST_PATH.slice(2),import.meta.url),raw=JSON.parse(await readFile(url,'utf8'));
  assert.equal(old.entries.length,14);assert.equal(raw.entries.length,15);assert.equal(raw.runtimeImageCount,28);
  const original=structuredClone(raw.entries.slice(0,14));
  for(const entry of original)for(const frame of Object.values(entry.frames)) {
    assert.ok(frame.filename.startsWith('mecha-8h/'));
    frame.filename=frame.filename.slice('mecha-8h/'.length);
  }
  assert.deepEqual(original,old.entries,'metadata and PNG hashes remain the original 14 entries');
  const entry=raw.entries[14];assert.equal(entry.key,'local-v2-pincer');assert.deepEqual(entry.roles,['pincer']);
  assert.deepEqual(Object.keys(entry.frames),['idle','charge','fire','recovery']);
  assert.deepEqual(entry.mechanismFrames,[],'authoring frames and axial stroke do not imply opening progress');
  const approved={idle:'7d2ef40c0ebef1527700358ef3a4e95913afc08cd0882ae1c342bad5ec993b6a',
    charge:'7bedce2368690aff87930186701a97cecfbc8ca037e49c1f45a61571ac8d6764',
    fire:'f37ff6ac262ca33e2ec6c4d4791a8bf982697a4079b89b2b742f88c2d01109e9',
    recovery:'027b91013eae3abdda818993d93fb017cefff95a287cee6f4794e5683d50cdf2'};
  try {
    const specs=registerMechaManifest(raw);assert.equal(specs.length,15);
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
