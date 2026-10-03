import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, threatNeighborCounts } from '../src/renderer.js';
import { projectileStyle, PROJECTILE_STYLES, PROJECTILE_PALETTES } from '../src/projectile-style.js';
import { registerMechaManifest, getMechaSpec, mechaAnchorWorld, mechaDirectionWorld, MECHA_MANIFEST_PATH } from '../src/mecha-art.js';
import { mechaBodyContact, sweptCircleAgainstHulls } from '../src/mecha-collision.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { createGame, enemyMuzzles, enemyDeployDocks } from '../src/game.js';
import { barragePlan } from '../src/barrage.js';

const context = overrides => new Proxy(overrides||{}, {get(target,key){return key in target?target[key]:()=>{};}});
const bossEntry=(raw,role)=>{
  const entries=raw.entries.filter(entry=>entry.roles?.includes(role));assert.equal(entries.length,1);return entries[0];
};
const sourcePoint=(entry,p)=>{
  const scale=entry.displayWidth/entry.canvasWidth;
  return {x:((p.x??p[0])-entry.pivotPixels.x)*scale,y:((p.y??p[1])-entry.pivotPixels.y)*scale};
};
const fireState=(entry,progress)=>Object.entries(entry.semanticAliases.fireByProgress).find(([value])=>Number(value)===progress)[1];
function assertSourcePose(spec,entry,frame) {
  const project=p=>sourcePoint(entry,p),scale=entry.displayWidth/entry.canvasWidth,bounds=frame.bodyBoundsPixels;
  assert.equal(spec.key,entry.key);assert.equal(spec.filename,frame.filename);assert.equal(spec.coreExposed,frame.coreExposed);
  assert.deepEqual(spec.runtimeBodyHulls,frame.bodyHullPixels.map(hull=>hull.map(project)),'all source convex pieces remain separate');
  assert.deepEqual(spec.runtimeBodyBounds,{minX:(bounds.minX-entry.pivotPixels.x)*scale,minY:(bounds.minY-entry.pivotPixels.y)*scale,
    maxX:(bounds.maxX-entry.pivotPixels.x)*scale,maxY:(bounds.maxY-entry.pivotPixels.y)*scale});
  assert.deepEqual(spec.runtimeMuzzles,frame.muzzlesPixels.map(project));
  assert.deepEqual(spec.runtimeMuzzleDirections,frame.muzzleDirectionsPixels.map((p,index)=>{
    const muzzle=frame.muzzlesPixels[index],dx=p.x-muzzle.x,dy=p.y-muzzle.y,length=Math.hypot(dx,dy);return {x:dx/length,y:dy/length};
  }));
  assert.deepEqual(spec.runtimeNozzles,frame.nozzlesPixels.map(project));
  assert.deepEqual(spec.runtimeCore,frame.corePixels?{...project(frame.corePixels),radius:frame.corePixels.radius*scale}:null);
  if(frame.muzzleNames)assert.deepEqual(spec.muzzleNames,frame.muzzleNames);
}
const rgbaCache=new Map();
async function sourceRGBA(url,entry,frame) {
  if(rgbaCache.has(frame.filename)){const cached=rgbaCache.get(frame.filename);assert.equal(cached.sha256,frame.sha256);return cached;}
  const png=await readFile(new URL(frame.filename,url));assert.equal(createHash('sha256').update(png).digest('hex'),frame.sha256);
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20),parts=[];
  assert.equal(width,entry.canvasWidth);assert.equal(height,entry.canvasHeight);assert.equal(png[24],8);assert.equal(png[25],6);
  for(let offset=8;offset<png.length;) {const length=png.readUInt32BE(offset);if(png.toString('ascii',offset+4,offset+8)==='IDAT')parts.push(png.subarray(offset+8,offset+8+length));offset+=length+12;}
  const filtered=inflateSync(Buffer.concat(parts)),stride=width*4,pixels=new Uint8Array(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++)for(let x=0;x<stride;x++) {
    const index=y*stride+x,a=x>=4?pixels[index-4]:0,b=y?pixels[index-stride]:0,c=y&&x>=4?pixels[index-stride-4]:0;
    const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filtered[y*(stride+1)]];pixels[index]=(filtered[y*(stride+1)+x+1]+predictor)&255;
  }
  const result={width,height,pixels,sha256:frame.sha256};rgbaCache.set(frame.filename,result);return result;
}
function transparentSourceGap(image,entry,center,extent=14,bounds) {
  const radius=1.85*entry.canvasWidth/entry.displayWidth+1.5,candidates=[];
  for(let y=Math.floor(center.y-extent);y<=center.y+extent;y++)for(let x=Math.floor(center.x-extent);x<=center.x+extent;x++)
    candidates.push({x,y,distance:(x-center.x)**2+(y-center.y)**2});
  candidates.sort((a,b)=>a.distance-b.distance);
  for(const point of candidates) {
    if(bounds&&(point.x<=bounds.minX||point.x>=bounds.maxX||point.y<=bounds.minY||point.y>=bounds.maxY))continue;
    let clear=true;
    for(let y=Math.floor(point.y-radius);y<=point.y+radius&&clear;y++)for(let x=Math.floor(point.x-radius);x<=point.x+radius;x++) {
      if((x-point.x)**2+(y-point.y)**2>radius*radius)continue;
      if(x<0||y<0||x>=image.width||y>=image.height||image.pixels[(y*image.width+x)*4+3]!==0){clear=false;break;}
    }
    if(clear)return {x:point.x,y:point.y};
  }
  assert.fail('the authored source region has no player-size transparent gap: '+JSON.stringify({center,extent,bounds}));
}
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
  Renderer.prototype.drawBullets.call({presentation:{threatVariant:'C'},glow(c,x,y,size,color,alpha){glows.push({color,alpha});}},context(),{bullets:[],enemyBullets:bullets});
  assert.equal(glows.length,bullets.length,'one bounded outer halo replaces each former stretched pair');
  bullets.forEach((bullet,index)=>{
    assert.equal(glows[index].color,PROJECTILE_PALETTES[bullet.palette].glow);
    assert.ok(glows[index].alpha>0&&glows[index].alpha<=(bullet.arming>0?.22:.66));
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

test('final art decoded RGBA budget matches unique PNG header dimensions',async()=>{
  const url=new URL('../'+MECHA_MANIFEST_PATH.slice(2),import.meta.url),raw=JSON.parse(await readFile(url,'utf8'));
  const dimensions=new Map();
  for(const entry of raw.entries)for(const frame of Object.values(entry.frames)) {
    const expected=[entry.canvasWidth,entry.canvasHeight];
    if(dimensions.has(frame.filename)) {
      assert.deepEqual(dimensions.get(frame.filename),expected,'aliases share the same source dimensions');
      continue;
    }
    const png=await readFile(new URL(frame.filename,url));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(png.toString('ascii',12,16),'IHDR');
    assert.equal(png[24],8);assert.equal(png[25],6,'authored PNG uses RGBA pixels');
    const actual=[png.readUInt32BE(16),png.readUInt32BE(20)];
    assert.deepEqual(actual,expected,'budget uses actual PNG dimensions');
    dimensions.set(frame.filename,actual);
  }
  assert.equal(raw.runtimeImageCount,dimensions.size,'semantic aliases do not add decoded images');
  const actualBytes=[...dimensions.values()].reduce((sum,[width,height])=>sum+width*height*4,0);
  assert.equal(raw.decodedRGBABytes,actualBytes,'declared budget accounts for every unique runtime PNG');
});

test('final art composite preserves original Beetle geometry and hashes, and approved Pincer semantics',async()=>{
  const old=JSON.parse(await readFile(new URL('../assets/art/mecha-8h/manifest.json',import.meta.url),'utf8'));
  const url=new URL('../'+MECHA_MANIFEST_PATH.slice(2),import.meta.url),raw=JSON.parse(await readFile(url,'utf8'));
  assert.equal(old.entries.length,14);assert.equal(raw.entries.length,19);
  assert.equal(raw.runtimeImageCount,new Set(raw.entries.flatMap(entry=>Object.values(entry.frames).map(frame=>frame.filename))).size);
  const beetle=raw.entries[0],original=old.entries[0];
  for(const field of ['canvasWidth','canvasHeight','displayWidth','pivotPixels','facing','weakpointEnabled'])
    assert.deepEqual(beetle[field],original[field],'original Beetle '+field);
  for(const [state,frame]of Object.entries(original.frames)) {
    const adopted=beetle.frames[state];
    for(const field of ['muzzlesPixels','muzzleDirectionsPixels','nozzlesPixels','corePixels','coreExposed','bodyHullPixels','bodyBoundsPixels'])
      assert.deepEqual(adopted[field],frame[field],'original Beetle '+state+'/'+field);
    assert.equal(createHash('sha256').update(await readFile(new URL(adopted.filename,url))).digest('hex'),frame.sha256);
  }
  const entry=raw.entries[14];assert.equal(entry.key,'local-v2-pincer');assert.deepEqual(entry.roles,['pincer']);
  assert.deepEqual(Object.keys(entry.frames),['idle','charge','fire','recovery','locked']);
  assert.deepEqual(entry.mechanismFrames,[],'authoring frames and axial stroke do not imply opening progress');
  const approved={idle:'7d2ef40c0ebef1527700358ef3a4e95913afc08cd0882ae1c342bad5ec993b6a',
    charge:'7bedce2368690aff87930186701a97cecfbc8ca037e49c1f45a61571ac8d6764',
    fire:'f37ff6ac262ca33e2ec6c4d4791a8bf982697a4079b89b2b742f88c2d01109e9',
    recovery:'027b91013eae3abdda818993d93fb017cefff95a287cee6f4794e5683d50cdf2',
    locked:'7bedce2368690aff87930186701a97cecfbc8ca037e49c1f45a61571ac8d6764'};
  try {
    const specs=registerMechaManifest(raw);assert.equal(specs.length,19);
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

test('adopted Warden keeps five neutral and fire source poses with ordered physical ports and exact exposure overrides',async()=>{
  const url=new URL('../assets/art/mecha-12h-local.json',import.meta.url),raw=JSON.parse(await readFile(url,'utf8')),entry=bossEntry(raw,'warden');
  assert.strictEqual(entry,raw.entries[9]);assert.equal(entry.displayWidth,380);
  const names=['tower_-1_0','tower_-1_1','tower_1_0','tower_1_1','center_lance'],files=new Set();
  try {
    registerMechaManifest(raw);assert.deepEqual(entry.mechanismFrames.map(frame=>frame.progress),[0,.25,.5,.75,1]);
    for(const phase of entry.mechanismFrames)for(const state of [phase.state,fireState(entry,phase.progress)]) {
      const frame=entry.frames[state],spec=getMechaSpec({type:'boss',bossKind:'warden',artFrame:state,mechanismProgress:phase.progress,artState:'damaged',fireFlash:.12});
      assert.equal(spec.state,state);assertSourcePose(spec,entry,frame);assert.deepEqual(spec.muzzleNames,names);
      assert.equal(spec.coreExposed,phase.progress===1);assert.equal(frame.physicalInterlockClosed,phase.progress<1);
      assert.ok(spec.weakpointEnabled&&spec.runtimeCore);await sourceRGBA(url,entry,frame);files.add(frame.filename);
    }
    assert.equal(files.size,10);
    for(const progress of [0,.249999,.25,.5,.75,.999,1]) {
      const expected=entry.mechanismFrames.findLast(frame=>frame.progress<=progress);
      const spec=getMechaSpec({type:'boss',bossKind:'warden',mechanismProgress:progress,artState:'open',armorOpen:true,coreVulnerable:true});
      assert.equal(spec.state,expected.state);assert.equal(spec.coreExposed,progress===1);
    }
    for(const artFrame of [entry.mechanismFrames[4].state,fireState(entry,1),'open']) {
      const spec=getMechaSpec({type:'boss',bossKind:'warden',artFrame,mechanismProgress:.999});
      assert.equal(spec.state,artFrame);assert.equal(spec.coreExposed,true,'explicit authored overrides remain game-synchronized');
    }
    assert.equal(getMechaSpec({type:'boss',bossKind:'warden',mechanismProgress:.999,artFrame:'missing'}).coreExposed,false);
    for(const [role,count] of Object.entries({beetle:1,dragonfly:1,wasp:0,mantis:2,orb:3,claw:2,ray:2,worm:3,needle:1}))
      assert.equal(getMechaSpec({type:role}).runtimeMuzzles.length,count,'original '+role+' art port count');
    const claw=barragePlan('snapshot',0,.5);assert.equal(claw.total,1);assert.equal(claw.bundles[0].port,0,'Stage1 claw stays one actual snapshot');
  } finally {reset();}
});

test('Bastion and Apex keep five neutral and fire snapshots at the same protected or exposed mechanism floor',async()=>{
  const url=new URL('../assets/art/mecha-12h-local.json',import.meta.url),raw=JSON.parse(await readFile(url,'utf8'));
  try {
    registerMechaManifest(raw);
    for(const [role,index,names] of [['bastion',12,['upper_beam','lower_fan_a','lower_fan_b']],
      ['apex',13,['wrist_precision_beam','lower_siege_rail','upper_tracking']]]) {
      const entries=raw.entries.filter(entry=>entry.roles?.includes(role));assert.equal(entries.length,1);
      const entry=entries[0];assert.strictEqual(entry,raw.entries[index],'approved role retains its manifest slot');
      assert.equal(getMechaSpec({type:'boss',bossKind:role}).key,entry.key);
      assert.deepEqual(entry.mechanismFrames.map(phase=>phase.progress),[0,.25,.5,.75,1]);
      const files=new Set(),states=new Set(),scale=entry.displayWidth/entry.canvasWidth;
      const project=p=>({x:(p.x-entry.pivotPixels.x)*scale,y:(p.y-entry.pivotPixels.y)*scale});
      for(const phase of entry.mechanismFrames) {
        const aliases=entry.semanticAliases?.fireByProgress;
        const fire=aliases?Object.entries(aliases).find(([progress])=>Number(progress)===phase.progress)[1]:phase.state+'_fire';
        for(const state of [phase.state,fire]) {
          const enemy={type:'boss',bossKind:role,artFrame:state,mechanismProgress:phase.progress,artState:'damaged',fireFlash:.12,x:950,y:340};
          const spec=getMechaSpec(enemy),frame=entry.frames[state];assert.equal(spec.state,state);assert.equal(spec.coreExposed,phase.progress===1);
          assertSourcePose(spec,entry,frame);
          assert.equal(frame.coreExposed,phase.progress===1);assert.equal(spec.filename,frame.filename);
          assert.equal(spec.weakpointEnabled,true);assert.ok(frame.bodyHullPixels.length>0);
          assert.deepEqual(spec.runtimeBodyHulls,frame.bodyHullPixels.map(hull=>hull.map(project)),'every separated hull uses the selected physical pose');
          const bounds=frame.bodyBoundsPixels;
          assert.deepEqual(spec.runtimeBodyBounds,{minX:(bounds.minX-entry.pivotPixels.x)*scale,minY:(bounds.minY-entry.pivotPixels.y)*scale,
            maxX:(bounds.maxX-entry.pivotPixels.x)*scale,maxY:(bounds.maxY-entry.pivotPixels.y)*scale});
          assert.deepEqual(spec.runtimeCore,{...project(frame.corePixels),radius:frame.corePixels.radius*scale});
          assert.deepEqual(spec.muzzleNames,names);assert.ok(Object.isFrozen(spec.muzzleNames));assert.equal(spec.runtimeMuzzles.length,3);
          assert.deepEqual(spec.runtimeMuzzles,frame.muzzlesPixels.map(project));
          assert.deepEqual(spec.runtimeMuzzleDirections,frame.muzzleDirectionsPixels.map((p,port)=>{
            const muzzle=frame.muzzlesPixels[port],dx=p.x-muzzle.x,dy=p.y-muzzle.y,length=Math.hypot(dx,dy);
            return {x:dx/length,y:dy/length};
          }));
          const png=await readFile(new URL(frame.filename,url));assert.equal(createHash('sha256').update(png).digest('hex'),frame.sha256);
          files.add(frame.filename);states.add(state);
        }
      }
      assert.equal(files.size,10);assert.equal(states.size,10,'five neutral and five fire poses remain distinct');
      const partial=getMechaSpec({type:'boss',bossKind:role,mechanismProgress:.999,artState:'open'});
      assert.equal(partial.state,entry.mechanismFrames[3].state);assert.equal(partial.coreExposed,false);
      assert.strictEqual(partial.runtimeBodyHulls,getMechaSpec({type:'boss',bossKind:role,artFrame:entry.mechanismFrames[3].state}).runtimeBodyHulls);
      assert.equal(getMechaSpec({type:'boss',bossKind:role,mechanismProgress:1}).coreExposed,true);
      const stable=getMechaSpec({type:'boss',bossKind:role}),bad=structuredClone(raw);
      const aliasKey=Object.keys(bad.entries[index].semanticAliases.fireByProgress).find(progress=>Number(progress)===.75);
      bad.entries[index].semanticAliases.fireByProgress[aliasKey]='missing-pose';
      assert.throws(()=>registerMechaManifest(bad),/semantic/);assert.strictEqual(getMechaSpec({type:'boss',bossKind:role}),stable,'invalid semantic metadata leaves the complete registry unchanged');
    }
    const apex=getMechaSpec({type:'boss',bossKind:'apex'});
    assert.equal(apex.semanticAliases.fireByProgress['0'],'fire');assert.ok(Object.isFrozen(apex.semanticAliases.fireByProgress));
  } finally {reset();}
});

test('all five adopted boss open and recoil bodies clear the ordinary forward pre-core path while protected floors block it',async()=>{
  const raw=JSON.parse(await readFile(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8'));
  try {
    registerMechaManifest(raw);
    for(const role of ['warden','carrier','lancer','bastion','apex']) {
      const entry=bossEntry(raw,role);
      for(const phase of entry.mechanismFrames)for(const fired of [false,true]) {
        let state=fired?fireState(entry,phase.progress):phase.state;
        if(role==='carrier')state=state.replace('payload2','payload0');
        const spec=getMechaSpec({type:'boss',bossKind:role,artFrame:state,mechanismProgress:phase.progress}),core=spec.runtimeCore;
        const from={x:-220,y:core.y},to={x:core.x-core.radius-5-.1,y:core.y};
        assert.equal(sweptCircleAgainstHulls(from,to,5,spec.runtimeBodyHulls),phase.progress<1,role+'/'+state+' actual 5px projectile pre-core path');
        assert.equal(core.radius,entry.frames[state].corePixels.radius*(entry.displayWidth/entry.canvasWidth));
        assert.equal(spec.coreExposed,phase.progress===1);
      }
      assert.equal(getMechaSpec({type:'boss',bossKind:role,mechanismProgress:.999,artState:'open'}).coreExposed,false);
    }
  } finally {reset();}
});

test('source-transparent Warden gun gaps remain empty in every neutral and fire pose under rotation, reflection and sweeps',async t=>{
  const url=new URL('../assets/art/mecha-12h-local.json',import.meta.url),raw=JSON.parse(await readFile(url,'utf8')),entry=bossEntry(raw,'warden');
  try {
    registerMechaManifest(raw);let probes=0;const sourceProbes=[];
    for(const phase of entry.mechanismFrames)for(const state of [phase.state,fireState(entry,phase.progress)]) {
      const frame=entry.frames[state],image=await sourceRGBA(url,entry,frame);
      for(const [a,b] of [[0,1],[2,3]]) {
        // Select from actual transparent source pixels between the two authored
        // gun tips; a newly solid casting is never assumed to be empty air.
        const p=frame.muzzlesPixels,region={...frame.bodyBoundsPixels,minY:Math.min(p[a].y,p[b].y)+3,maxY:Math.max(p[a].y,p[b].y)-3};
        const source=transparentSourceGap(image,entry,{x:(p[a].x+p[b].x)/2,y:(p[a].y+p[b].y)/2},32,region);probes++;
        sourceProbes.push({state,ports:[a,b],sourcePixels:source});
        const local=sourcePoint(entry,source);
        for(const [angle,flipX,flipY] of [[0,1,1],[.67,-1,1],[-Math.PI/2,1,-1]]) {
          const enemy={type:'boss',bossKind:'warden',artFrame:state,x:950,y:340,artAngle:angle,artFlipX:flipX,artFlipY:flipY};
          const point=mechaAnchorWorld(enemy,local),start={...mechaAnchorWorld(enemy,{x:local.x-1,y:local.y}),radius:1.85};
          const end={...mechaAnchorWorld(enemy,{x:local.x+1,y:local.y}),radius:1.85};
          assert.equal(mechaBodyContact(enemy,{...point,radius:1.85}),false,state+' source-transparent gun gap');
          assert.equal(mechaBodyContact(enemy,end,start,enemy),false,state+' source-transparent gap sweep');
        }
      }
    }
    assert.equal(probes,20,'two real gun gaps times ten physical poses, without alias duplication');
    t.diagnostic('Warden source-transparent probes '+JSON.stringify(sourceProbes));
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

test('all forty Carrier payload and recoil poses preserve source geometry, finite docks, empty arches and the exact matching child',async t=>{
  const url=new URL('../assets/art/mecha-12h-local.json',import.meta.url),raw=JSON.parse(await readFile(url,'utf8')),entry=bossEntry(raw,'carrier');
  const variants={payload2:[true,true],payload1near:[true,false],payload1far:[false,true],payload0:[false,false]};
  const childEntry=raw.entries.find(candidate=>candidate.key===entry.matchingChild.entryKey);assert.strictEqual(childEntry,raw.entries[15]);assert.deepEqual(childEntry.roles,[]);
  try {
    const specs=registerMechaManifest(raw),base=getMechaSpec({type:'boss',bossKind:'carrier'});
    assert.deepEqual(base.matchingChild.runtimeDockCenters,entry.matchingChild.dockCentersPixels.map(p=>sourcePoint(entry,p)));
    assert.equal(base.payloadMechanismSelection.frameTemplate,entry.payloadMechanismSelection.frameTemplate);
    assert.equal(base.payloadMechanismSelection.fireFrameTemplate,entry.payloadMechanismSelection.fireFrameTemplate);
    assert.ok(Object.isFrozen(base.matchingChild)&&Object.isFrozen(base.matchingChild.runtimeDockCenters)&&Object.isFrozen(base.payloadMechanismSelection));
    const child=getMechaSpec({type:'dragonfly',appearanceKey:entry.matchingChild.entryKey}),files=new Set(),sourceProbes=[];let poses=0;
    assertSourcePose(child,childEntry,childEntry.frames.idle);assert.equal(child.key,entry.matchingChild.entryKey);
    assert.equal(child.runtimeCore,null);assert.equal(child.weakpointEnabled,false);assert.equal(child.runtimeMuzzles.length,1);
    assert.equal(getMechaSpec({type:entry.matchingChild.entryKey}),null,'matching art never becomes a combat role');
    assert.ok(specs.flatMap(spec=>Object.values(spec.states)).some(frame=>frame.filename===childEntry.frames.idle.filename));
    await sourceRGBA(url,childEntry,childEntry.frames.idle);
    for(const phase of entry.mechanismFrames)for(const fired of [false,true]) {
      const selected={};
      for(const [variant,visible] of Object.entries(variants)) {
        const state=(fired?fireState(entry,phase.progress):phase.state).replace('payload2',variant),frame=entry.frames[state];
        const enemy={type:'boss',bossKind:'carrier',artFrame:state,artState:'damaged',phase:4,fireFlash:.12,flash:.1,
          mechanismProgress:phase.progress,x:900,y:340,artAngle:.42,artFlipX:-1},spec=getMechaSpec(enemy);
        selected[variant]=spec;poses++;assert.equal(spec.state,state);assertSourcePose(spec,entry,frame);
        assert.deepEqual(spec.muzzleNames,['defence_upper','defence_keel']);
        assert.deepEqual(spec.payloadVisible,visible);assert.equal(spec.payloadCount,visible.filter(Boolean).length);assert.equal(spec.payloadVariant,variant);
        assert.ok(Object.isFrozen(spec.payloadVisible)&&Object.isFrozen(spec.runtimeDockCenters));
        assert.deepEqual(spec.runtimeDockCenters,frame.dockCentersPixels.map(p=>sourcePoint(entry,p)));
        assert.equal(spec.coreExposed,phase.progress===1);await sourceRGBA(url,entry,frame);files.add(frame.filename);
      }
      const pieces=spec=>new Set(spec.runtimeBodyHulls.map(hull=>JSON.stringify(hull)));
      const full=pieces(selected.payload2),near=pieces(selected.payload1near),far=pieces(selected.payload1far),empty=pieces(selected.payload0);
      for(const set of [near,far,empty])assert.ok([...set].every(piece=>full.has(piece)),'removing payload never invents extra collision pieces');
      assert.equal(full.size-near.size,child.runtimeBodyHulls.length);assert.equal(full.size-far.size,child.runtimeBodyHulls.length);
      assert.equal(near.size-empty.size,child.runtimeBodyHulls.length);assert.equal(far.size-empty.size,child.runtimeBodyHulls.length);
      if(phase.progress===1)for(const dock of entry.matchingChild.dockCentersPixels) {
        const state=selected.payload0.state,frame=entry.frames[state],image=await sourceRGBA(url,entry,frame);
        const source=transparentSourceGap(image,entry,dock,22,frame.bodyBoundsPixels),local=sourcePoint(entry,source);
        sourceProbes.push({state,dockPixels:dock,sourcePixels:source});
        for(const [angle,flipX,flipY] of [[0,1,1],[.42,-1,1],[-Math.PI/2,1,-1]]) {
          const enemy={type:'boss',bossKind:'carrier',artFrame:state,x:900,y:340,artAngle:angle,artFlipX:flipX,artFlipY:flipY};
          const point={...mechaAnchorWorld(enemy,local),radius:1.85};assert.equal(mechaBodyContact(enemy,point),false,'actual emptied cargo arch does not become a union hull');
          const start={...mechaAnchorWorld(enemy,{x:local.x-1,y:local.y}),radius:1.85};
          const end={...mechaAnchorWorld(enemy,{x:local.x+1,y:local.y}),radius:1.85};
          assert.equal(mechaBodyContact(enemy,end,start,enemy),false,'actual cargo arch stays empty through a swept reflected pose');
        }
      }
    }
    assert.equal(poses,40);assert.equal(files.size,40);
    t.diagnostic('Carrier empty-arch source-transparent probes '+JSON.stringify(sourceProbes));
    const preview=getMechaSpec({type:'boss',bossKind:'carrier',mechanismProgress:.999,artState:'fire',fireFlash:.12});
    assert.equal(preview.state,entry.mechanismFrames[3].state);assert.equal(preview.coreExposed,false);
  } finally {reset();}
});

test('all ten Lancer neutral and recoil snapshots use the exact source ports, hulls, nozzles and fixed canvas',async()=>{
  const url=new URL('../assets/art/mecha-12h-local.json',import.meta.url),raw=JSON.parse(await readFile(url,'utf8')),entry=bossEntry(raw,'lancer');
  assert.strictEqual(entry,raw.entries[11]);
  try {
    registerMechaManifest(raw);const files=new Set();
    for(const phase of entry.mechanismFrames) {
      const before={type:'boss',bossKind:'lancer',mechanismProgress:phase.progress,artFrame:phase.state,x:900,y:340,artAngle:.41,artFlipX:-1};
      const after={...before,artFrame:fireState(entry,phase.progress),fireFlash:.12,artState:'damaged',flash:.1};
      const neutral=getMechaSpec(before),recoil=getMechaSpec(after);
      const sourceDelta={x:sourcePoint(entry,entry.frames[after.artFrame].muzzlesPixels[0]).x-sourcePoint(entry,entry.frames[before.artFrame].muzzlesPixels[0]).x,
        y:sourcePoint(entry,entry.frames[after.artFrame].muzzlesPixels[0]).y-sourcePoint(entry,entry.frames[before.artFrame].muzzlesPixels[0]).y};
      assert.deepEqual({x:recoil.runtimeMuzzles[0].x-neutral.runtimeMuzzles[0].x,y:recoil.runtimeMuzzles[0].y-neutral.runtimeMuzzles[0].y},sourceDelta);
      assert.ok(Math.hypot(sourceDelta.x,sourceDelta.y)>0,'the authored main gun actually recoils');
      const a=mechaAnchorWorld(before,neutral.runtimeMuzzles[0]),b=mechaAnchorWorld(after,recoil.runtimeMuzzles[0]);
      assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(sourceDelta.x,sourceDelta.y))<1e-8);
      for(const [enemy,spec] of [[before,neutral],[after,recoil]]) {
        const frame=entry.frames[spec.state];assertSourcePose(spec,entry,frame);assert.equal(spec.coreExposed,phase.progress===1);
        assert.deepEqual(spec.muzzleNames,['siege_lance','offset_suppressor']);await sourceRGBA(url,entry,frame);files.add(spec.filename);
        const calls=[];Renderer.prototype.drawEnemy.call({mechaFrames:{[spec.filename]:{}},glow(){}},context({drawImage(...args){calls.push(args);}}),enemy,1000);
        assert.deepEqual(calls[0].slice(1),[-spec.pivot.x,-spec.pivot.y,spec.displayWidth,spec.displayHeight]);
      }
    }
    assert.equal(files.size,10);
    const partial=getMechaSpec({type:'boss',bossKind:'lancer',mechanismProgress:.999,fireFlash:.12,artState:'fire'});
    assert.equal(partial.state,entry.mechanismFrames[3].state);assert.equal(partial.coreExposed,false);
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
      assert.equal(carrier.matchingChild.entryKey,bossEntry(raw,'carrier').matchingChild.entryKey);assert.deepEqual(carrier.payloadVisible,[true,true]);
      const childKey=bossEntry(raw,'carrier').matchingChild.entryKey;assert.equal(getMechaSpec({type:'dragonfly',appearanceKey:childKey}).key,childKey);
      assert.equal(getMechaSpec({type:'invented-child-combat'}),null);
    }
  } finally {reset();}
});

test('invalid actual boss pose geometry, ports, cores and semantic maps leave every role and matching appearance atomically unchanged',async()=>{
  const raw=JSON.parse(await readFile(new URL('../assets/art/mecha-12h-local.json',import.meta.url),'utf8')),roles=['warden','carrier','lancer','bastion','apex'];
  try {
    registerMechaManifest(raw);
    const stable=roles.map(role=>getMechaSpec({type:'boss',bossKind:role}));
    const childKey=bossEntry(raw,'carrier').matchingChild.entryKey,child=getMechaSpec({type:'dragonfly',appearanceKey:childKey});
    for(const role of roles)for(const mutation of ['hull','direction','core','nozzle','semantic']) {
      const invalid=structuredClone(raw),entry=bossEntry(invalid,role),frame=entry.frames[entry.mechanismFrames[0].state];
      if(mutation==='hull')frame.bodyHullPixels[0]=frame.bodyHullPixels[0].slice(0,2);
      if(mutation==='direction')frame.muzzleDirectionsPixels[0]={...frame.muzzlesPixels[0]};
      if(mutation==='core')frame.corePixels.radius=0;
      if(mutation==='nozzle')frame.nozzlesPixels[0].x=NaN;
      if(mutation==='semantic') {
        const key=Object.keys(entry.semanticAliases.fireByProgress).find(value=>Number(value)===.75);entry.semanticAliases.fireByProgress[key]='missing-actual-pose';
      }
      assert.throws(()=>registerMechaManifest(invalid),/mecha/,role+'/'+mutation);
      roles.forEach((candidate,index)=>assert.strictEqual(getMechaSpec({type:'boss',bossKind:candidate}),stable[index]));
      assert.strictEqual(getMechaSpec({type:'dragonfly',appearanceKey:childKey}),child);
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
