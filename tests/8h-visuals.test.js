import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, threatNeighborCounts, COMBAT_FX } from '../src/renderer.js';
import { registerMechaManifest, getMechaSpec, mechaAnchorWorld, mechaDirectionWorld, mechaTransform, MECHA_MANIFEST_PATH } from '../src/mecha-art.js';
import { sequenceToWorld } from '../src/game.js';
import { barragePlan, patternGeometry } from '../src/barrage.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { enemyMuzzles } from '../src/game.js';
import { inflateSync } from 'node:zlib';

const context = overrides => new Proxy(overrides || {},{get(target,key){return key in target?target[key]:()=>{};}});
const emptyManifest = () => registerMechaManifest({schemaVersion:1,entries:[]});

// Native RGBA PNG verification uses only Node's existing standard library.
function rgbaPixels(png) {
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20),pieces=[];
  assert.equal(png[24],8);assert.equal(png[25],6);assert.equal(png[28],0);
  for(let offset=8;offset<png.length;) {
    const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);
    if(type==='IDAT')pieces.push(png.subarray(offset+8,offset+8+length));offset+=length+12;
  }
  const filtered=inflateSync(Buffer.concat(pieces)),stride=width*4,pixels=Buffer.alloc(stride*height);
  assert.equal(filtered.length,(stride+1)*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++) {
    const filter=filtered[y*(stride+1)];assert.ok(filter>=0&&filter<=4);
    for(let x=0;x<stride;x++) {
      const index=y*stride+x,a=x>=4?pixels[index-4]:0,b=y>0?pixels[index-stride]:0,c=x>=4&&y>0?pixels[index-stride-4]:0;
      const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      pixels[index]=(filtered[y*(stride+1)+x+1]+predictor)&255;
    }
  }
  return {width,height,pixels};
}

test('density grid preserves exact halo response across cell edges and different physical radii',()=>{
  const bullets=Array.from({length:480},(_,i)=>({x:(i*73)%1380-100,y:(i*97)%820-50,radius:[4,5.5,8,14][i%4]}));
  bullets.push({x:63,y:63,radius:5.5},{x:64,y:64,radius:5.5},{x:102.5,y:63,radius:5.5});
  const before=structuredClone(bullets),expected=bullets.map(bullet=>bullets.filter(other=>other!==bullet&&(other.x-bullet.x)**2+(other.y-bullet.y)**2<Math.max(30,bullet.radius*7)**2).length);
  for(const cellSize of [32,64,96])assert.deepEqual([...threatNeighborCounts(bullets,cellSize).counts],expected);
  assert.deepEqual(bullets,before);
  assert.throws(()=>threatNeighborCounts(bullets,0),/cell size/);
});

test('density grid limits comparisons for a reproducible spread-out hell-sized field',()=>{
  const bullets=Array.from({length:900},(_,i)=>({x:(i%45)*29,y:Math.floor(i/45)*36,radius:5.5}));
  const result=threatNeighborCounts(bullets);
  assert.ok(result.comparisons<bullets.length*(bullets.length-1)*.035,`${result.comparisons} candidate comparisons`);
  const before=structuredClone(bullets),alphas=[];
  Renderer.prototype.drawBullets.call({presentation:{threatVariant:'C'},glow(c,x,y,size,color,alpha){alphas.push(alpha);}},context(),{bullets:[],enemyBullets:bullets});
  assert.equal(alphas[100*2],.88/Math.sqrt(1+result.counts[100]*.35));
  assert.deepEqual(bullets,before);
});

test('enemy danger nucleus covers the full damage radius while the player core remains unchanged',()=>{
  const arcs=[];
  Renderer.prototype.drawCombatCues.call({presentation:{threatVariant:'A'},flashes:[]},context({arc(x,y,r){arcs.push([x,y,r]);}}),{
    mode:'playing',enemies:[],enemyBullets:[{x:500,y:300,vx:-180,vy:0,radius:8}],player:{x:200,y:300}});
  assert.deepEqual(arcs,[[500,300,8],[500,300,2.56],[200,300,3.35],[200,300,1.85]]);
});

test('model pixel anchors share fixed pivot, scale and combat-selected state without clocks',()=>{
  const manifest={schemaVersion:1,entries:[{key:'test-drone',roles:['beetle'],canvasWidth:512,canvasHeight:512,displayWidth:96,pivotPixels:{x:256,y:256},frames:{
    idle:{filename:'runtime/drone-idle.png',muzzlesPixels:[{x:128,y:256}],nozzlesPixels:[{x:400,y:256}]},
    open:{filename:'runtime/drone-open.png',muzzlesPixels:[{x:112,y:240}],corePixels:{x:240,y:256,radius:20}},
  }}]};
  const before=structuredClone(manifest);
  try {
    registerMechaManifest(manifest);
    const enemy={type:'beetle',x:500,y:300,artAngle:Math.PI/2,armorOpen:true},spec=getMechaSpec(enemy);
    assert.equal(spec.displayWidth,96);assert.equal(spec.displayHeight,96);
    assert.deepEqual(spec.pivot,{x:48,y:48});assert.equal(spec.filename,'runtime/drone-open.png');
    assert.deepEqual(spec.runtimeCore,{x:-3,y:0,radius:3.75});
    const muzzle=mechaAnchorWorld(enemy,spec.runtimeMuzzles[0]);
    assert.ok(Math.abs(muzzle.x-503)<1e-10);assert.ok(Math.abs(muzzle.y-273)<1e-10);
    const calls=[];
    Renderer.prototype.drawEnemy.call({mechaFrames:{[spec.filename]:{actual:true}},glow(){}},context({drawImage(...args){calls.push(args);}}),enemy,9999);
    assert.deepEqual(calls[0].slice(1),[-48,-48,96,96]);
    assert.deepEqual(manifest,before);
    assert.equal(getMechaSpec({...enemy,armorOpen:false,telegraph:.8}).filename,'runtime/drone-idle.png','an absent charge frame falls back with the same anchor set');
  } finally {emptyManifest();}
  assert.equal(getMechaSpec({type:'beetle'}),null);
  assert.equal(MECHA_MANIFEST_PATH,'./assets/art/mecha-8h/manifest.json');
});

test('model registration rejects unsafe paths and does not partially overwrite a working registry',()=>{
  const manifest={schemaVersion:1,entries:[{key:'safe',roles:['beetle'],canvasWidth:256,canvasHeight:256,displayWidth:64,pivotPixels:{x:128,y:128},frames:{idle:{filename:'drone.png'}}}]};
  try {
    registerMechaManifest(manifest);
    const invalid=structuredClone(manifest);invalid.entries[0].frames.idle.filename='../private.png';
    assert.throws(()=>registerMechaManifest(invalid),/filename/);
    assert.equal(getMechaSpec({type:'beetle'}).filename,'drone.png');
  } finally {emptyManifest();}
});

test('long high-density event batches bound flashes, labels and particles without changing events',()=>{
  const renderer=Object.assign(Object.create(Renderer.prototype),{flashes:[],labels:[],particles:[],trail:[],exitGhosts:[],impactShake:0,exposure:0,reducedMotion:false});
  const events=Array.from({length:200},(_,i)=>({type:'explosion',x:800,y:300,chain:3,score:100,id:i})),before=structuredClone(events);
  renderer.handleEvents(events);
  assert.equal(renderer.flashes.length,COMBAT_FX.maxFlashes);assert.equal(renderer.labels.length,COMBAT_FX.maxLabels);assert.equal(renderer.particles.length,COMBAT_FX.maxParticles);
  assert.deepEqual(events,before);
});

test('moving-window tells follow the next actual bundle and persist during its travel interval',()=>{
  for(const attackName of ['B04','B05'])for(const safeLane of [155,360,565]) {
    const plan={...barragePlan(attackName,4,.3),roll:-.12,cos:Math.cos(-.12),sin:Math.sin(-.12),cameraY:140,index:1};
    const enemy={x:1000,y:340,radius:80,attackName,telegraph:0,sequence:plan,safeLane,safeDirection:-1,safeWidth:70,
      muzzles:[{x:944,y:300},{x:944,y:380}]};
    const before=structuredClone(enemy),paths=[];let path=[];
    Renderer.prototype.drawThreats.call({glow(){}},context({beginPath(){path=[];},moveTo(x,y){path.push({x,y});},lineTo(x,y){path.push({x,y});},stroke(){paths.push([...path]);}}),{cameraY:-160,enemies:[enemy]});
    const shots=patternGeometry(plan.bundles[plan.index],{pattern:attackName,safeLane,safeDirection:-1});
    assert.ok(shots.length>0);const center=shots[0].windowY;
    assert.deepEqual(paths[0][1],sequenceToWorld(plan,{x:346,y:center-35}));
    assert.deepEqual(paths[1][1],sequenceToWorld(plan,{x:346,y:center+35}));
    assert.deepEqual(enemy,before);
  }
});

test('destroy events briefly boost peripheral flow without changing background or projectile speed',()=>{
  const renderer=Object.assign(Object.create(Renderer.prototype),{flashes:[],labels:[],particles:[],trail:[],exitGhosts:[],impactShake:0,exposure:0,reducedMotion:false});
  renderer.handleEvents([{type:'explosion',x:900,y:300,boss:true}]);
  assert.equal(renderer.flowKick,.2);
  const g={mode:'gameover',backgroundSpeed:4.6,speed:4.6},before=structuredClone(g);
  renderer.updateEffects(g,.2);assert.ok(renderer.flowKick>0&&renderer.flowKick<.05);
  assert.deepEqual(g,before);
  renderer.reset();assert.equal(renderer.flowKick,0);
});

test('visual pressure caps preserve the immediate player-damage and tension signals',()=>{
  const renderer=Object.assign(Object.create(Renderer.prototype),{flashes:[],labels:[],particles:[],trail:[],exitGhosts:[],impactShake:0,exposure:0,reducedMotion:false});
  renderer.handleEvents([{type:'hit',x:200,y:300,player:true},{type:'tension',x:200,y:300},...Array.from({length:300},()=>({type:'shot',x:250,y:300,weaponMode:'normal'}))]);
  assert.equal(renderer.flashes.length,COMBAT_FX.maxFlashes);
  assert.ok(renderer.flashes.some(f=>f.kind==='playerHit'));assert.ok(renderer.flashes.some(f=>f.kind==='tension'));
});

test('multi-port fire, projected core opening and five boss breaks use actual events and distinct geometry',()=>{
  const renderer=Object.assign(Object.create(Renderer.prototype),{flashes:[],labels:[],particles:[],trail:[],exitGhosts:[],impactShake:0,exposure:0,reducedMotion:false,glow(){}});
  const events=[{type:'enemyShot',x:900,y:300,attackName:'B05',launchMuzzles:[{x:900,y:280},{x:900,y:320},{x:900,y:320}]},
    {type:'coreOpen',x:942,y:315,bossKind:'warden'}],before=structuredClone(events);
  renderer.handleEvents(events);
  assert.deepEqual(renderer.flashes.map(f=>[f.kind,f.x,f.y]),[['enemyShot',900,280],['enemyShot',900,320],['coreOpen',942,315]]);
  assert.deepEqual(events,before);
  const geometries=[];
  for(const bossKind of ['warden','carrier','lancer','bastion','apex']) {
    renderer.reset();renderer.handleEvents([{type:'bossDefeated',x:1000,y:350,bossKind}]);
    const points=[];
    renderer.drawEffects(context({moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);}}));
    geometries.push(JSON.stringify(points));
  }
  assert.equal(new Set(geometries).size,5);
});

test('INT01 runtime retains actual source hashes, RGBA canvas and projected attachment anchors',async()=>{
  const native=JSON.parse(await readFile(new URL('../assets/art/mecha-8h/source/int01/manifest.json',import.meta.url),'utf8'));
  const runtime=JSON.parse(await readFile(new URL('../assets/art/mecha-8h/manifest.json',import.meta.url),'utf8'));
  const entry=runtime.entries.find(entry=>entry.key==='int01-wedge'),frame=entry.frames.idle;
  const png=await readFile(new URL('../assets/art/mecha-8h/'+frame.filename,import.meta.url));
  assert.equal(createHash('sha256').update(png).digest('hex'),native.sha256.png);assert.equal(frame.sha256,native.sha256.png);
  assert.equal(png.readUInt32BE(16),384);assert.equal(png.readUInt32BE(20),384);assert.equal(png[25],6,'native 8-bit RGBA frame');
  const decoded=rgbaPixels(png),bbox=[384,384,0,0];let minAlpha=255,maxAlpha=0;
  for(let y=0;y<decoded.height;y++)for(let x=0;x<decoded.width;x++) {
    const alpha=decoded.pixels[(y*decoded.width+x)*4+3];minAlpha=Math.min(minAlpha,alpha);maxAlpha=Math.max(maxAlpha,alpha);
    if(x===0||y===0||x===383||y===383)assert.equal(alpha,0,'every outer-border pixel is fully transparent');
    if(alpha>0){bbox[0]=Math.min(bbox[0],x);bbox[1]=Math.min(bbox[1],y);bbox[2]=Math.max(bbox[2],x+1);bbox[3]=Math.max(bbox[3],y+1);}
  }
  assert.deepEqual([minAlpha,maxAlpha],[0,255]);assert.deepEqual(bbox,[14,108,325,233]);
  for(const [file,key] of [['int01-wedge.blend','blend'],['generator.py','generator']]) {
    const data=await readFile(new URL('../assets/art/mecha-8h/source/int01/'+file,import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'),native.sha256[key]);
  }
  assert.deepEqual(entry.pivotPixels,{x:native.pivotPixels[0],y:native.pivotPixels[1]});
  assert.deepEqual(frame.muzzlesPixels,native.states.neutral.muzzlesPixels.map(([x,y])=>({x,y})));
  assert.deepEqual(frame.nozzlesPixels,native.states.neutral.nozzlesPixels.map(([x,y])=>({x,y})));
  assert.equal(frame.corePixels.radius,native.coreRadiusPixels);
  try {
    registerMechaManifest(runtime);
    const spec=getMechaSpec({type:'beetle',armorOpen:true});
    assert.equal(spec.filename,'runtime/int01-idle.png');assert.equal(spec.state,'idle');assert.equal(spec.weakpointEnabled,false);
    assert.equal(spec.displayWidth,87);assert.equal(spec.displayHeight,87);assert.deepEqual(spec.pivot,{x:43.5,y:43.5});
    const scale=87/384,pixel=native.states.neutral.muzzlesPixels[0],local={x:(pixel[0]-192)*scale,y:(pixel[1]-192)*scale};
    for(const angle of [0,.37,-.5,Math.PI/2]) {
      const enemy={type:'beetle',x:930,y:315,artAngle:angle,angle,pattern:'aim'},actual=enemyMuzzles(enemy)[0];
      const expected={x:enemy.x+local.x*Math.cos(angle)-local.y*Math.sin(angle),y:enemy.y+local.x*Math.sin(angle)+local.y*Math.cos(angle)};
      assert.ok(Math.abs(actual.x-expected.x)<1e-10);assert.ok(Math.abs(actual.y-expected.y)<1e-10);
    }
    const core=spec.runtimeCore;
    assert.ok(Math.hypot(core.x,core.y)+core.radius<28,'the projected neutral attachment is inside the existing beetle body envelope');
  } finally {emptyManifest();}
});

test('carrier escort armor displays only while the actual shield state is active',()=>{
  const art={enemies:{width:512,height:512},'bosses-v2':{width:1536,height:768}},lines=[];
  const c=context({lineTo(x,y){lines.push([x,y]);}}),enemy={type:'boss',bossKind:'carrier',x:1000,y:300,radius:95};
  Renderer.prototype.drawEnemy.call({art,glow(){}},c,enemy,0);
  assert.equal(lines.length,0);
  Renderer.prototype.drawEnemy.call({art,glow(){}},c,{...enemy,escortShield:true},0);
  assert.equal(lines.length,6);
});

test('a visible core marker or missing open render does not grant weakpoint permission',()=>{
  const idle={filename:'idle.png',corePixels:{x:128,y:128,radius:6}};
  const fixture={schemaVersion:1,entries:[{key:'marker',roles:['apex'],canvasWidth:256,canvasHeight:256,displayWidth:200,pivotPixels:{x:128,y:128},
    weakpointEnabled:true,frames:{idle}}]};
  try {
    registerMechaManifest(fixture);
    assert.equal(getMechaSpec({type:'boss',bossKind:'apex',armorOpen:true}).weakpointEnabled,false);
    fixture.entries[0].frames.open={...idle,filename:'open.png'};
    registerMechaManifest(fixture);
    assert.equal(getMechaSpec({type:'boss',bossKind:'apex',armorOpen:true}).weakpointEnabled,true);
    fixture.entries[0].weakpointEnabled=false;registerMechaManifest(fixture);
    assert.equal(getMechaSpec({type:'boss',bossKind:'apex',armorOpen:true}).weakpointEnabled,false);
  } finally {emptyManifest();}
});

test('native family files keep source hashes, unclipped alpha and all adopted display-size anchors',async()=>{
  const sourceRoot='../assets/art/mecha-8h/source/family-revision1/',artRoot='../assets/art/mecha-8h/';
  const native=JSON.parse(await readFile(new URL(sourceRoot+'runtime-export/family-manifest.json',import.meta.url),'utf8'));
  const runtime=JSON.parse(await readFile(new URL(artRoot+'manifest.json',import.meta.url),'utf8'));
  const widths={beetle:87,dragonfly:88,wasp:76,mantis:96,orb:82,claw:108,ray:118,worm:170,needle:112,warden:340,carrier:300,lancer:360,bastion:266,apex:340};
  assert.equal(native.assets.length,14);assert.equal(runtime.entries.length,14);
  assert.deepEqual(runtime.heldRoles,[]);
  let frames=0;
  for(const asset of native.assets) {
    const blend=await readFile(new URL(sourceRoot+'editable-export/family/'+asset.source,import.meta.url));
    assert.equal(createHash('sha256').update(blend).digest('hex'),asset.sha256.blend,asset.id+' source model hash');
    for(const [sourceState,state] of Object.entries(asset.states)) {
      const raw=await readFile(new URL(sourceRoot+'runtime-export/'+state.file,import.meta.url));
      assert.equal(createHash('sha256').update(raw).digest('hex'),state.sha256||asset.sha256.png,asset.id+' '+sourceState);
      const {width,height,pixels}=rgbaPixels(raw);assert.equal(width,384);assert.equal(height,384);
      let visible=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const alpha=pixels[(y*width+x)*4+3];if(alpha)visible++;
        if(x===0||y===0||x===width-1||y===height-1)assert.equal(alpha,0,asset.id+' '+sourceState+' frame clipping');
      }
      assert.ok(visible>0,asset.id+' '+sourceState+' is not empty');
      const entry=runtime.entries.find(entry=>entry.roles.includes(asset.id)),frame=Object.values(entry.frames).find(frame=>frame.sourceState===sourceState);
      assert.equal(entry.displayWidth,widths[asset.id]);assert.deepEqual(entry.pivotPixels,{x:192,y:192});
      assert.deepEqual(frame.muzzlesPixels,state.muzzlesPixels.map(([x,y])=>({x,y})),asset.id+' actual model projection');
      assert.deepEqual(frame.nozzlesPixels,state.nozzlesPixels.map(([x,y])=>({x,y})));
      const adopted=await readFile(new URL(artRoot+frame.filename,import.meta.url));
      assert.equal(createHash('sha256').update(adopted).digest('hex'),frame.sha256);
      frames++;
    }
  }
  assert.equal(frames,24);
  try {
    registerMechaManifest(runtime);
    assert.ok(getMechaSpec({type:'orb'}),'the reviewed corrected orb now has a runtime model');
    for(const entry of runtime.entries) {
      const role=entry.roles[0],boss=native.bossRoles.includes(role),enemy={type:boss?'boss':role,bossKind:boss?role:undefined,x:980,y:330,artAngle:.23};
      const idle=getMechaSpec(enemy),charge=getMechaSpec({...enemy,telegraph:.6});
      assert.equal(charge.filename,idle.filename,'charge deliberately shares neutral geometry and uses code muzzle light');
      assert.equal(charge.state,'charge');assert.equal(entry.stateContracts.charge.dedicatedBodyPNGRequired,false);
      assert.equal(entry.statesComplete,true);
      if(boss) {
        const opened=getMechaSpec({...enemy,armorOpen:true,fireFlash:.12});
        assert.equal(opened.sourceState,'open');assert.equal(opened.state,'open');assert.equal(opened.weakpointEnabled,true);assert.equal(opened.coreExposed,true);
        assert.deepEqual(opened.runtimeCore,idle.runtimeCore,'same physical core before and after opening');
      } else {
        assert.equal(idle.weakpointEnabled,false);
        if(entry.frames.fire) {
          const fired=getMechaSpec({...enemy,fireFlash:.12});assert.equal(fired.state,'fire');assert.equal(fired.sourceState,'open');assert.equal(fired.weakpointEnabled,false);
        }
      }
    }
  } finally {emptyManifest();}
});

test('reflections and body rotation apply identically to sprite, muzzle, nozzle, core and direction',()=>{
  const fixture={schemaVersion:1,entries:[{key:'transform',roles:['beetle'],canvasWidth:200,canvasHeight:200,displayWidth:100,pivotPixels:{x:100,y:100},
    frames:{idle:{filename:'left.png',muzzlesPixels:[{x:60,y:120}],muzzleDirectionsPixels:[{x:40,y:120}],nozzlesPixels:[{x:160,y:90}],corePixels:{x:95,y:105,radius:4}}}}]};
  try {
    registerMechaManifest(fixture);
    for(const artFlipX of [1,-1])for(const artFlipY of [1,-1]) {
      const enemy={type:'beetle',x:800,y:300,artAngle:Math.PI/2,artFlipX,artFlipY},spec=getMechaSpec(enemy),scales=[];
      assert.deepEqual(mechaTransform(enemy),{angle:Math.PI/2,flipX:artFlipX,flipY:artFlipY});
      for(const anchor of [...spec.runtimeMuzzles,...spec.runtimeNozzles,spec.runtimeCore]) {
        const actual=mechaAnchorWorld(enemy,anchor);
        assert.ok(Math.abs(actual.x-(enemy.x-anchor.y*artFlipY))<1e-10);assert.ok(Math.abs(actual.y-(enemy.y+anchor.x*artFlipX))<1e-10);
      }
      const direction=mechaDirectionWorld(enemy,spec.runtimeMuzzleDirections[0]);
      assert.ok(Math.abs(direction.x)<1e-10);assert.ok(Math.abs(direction.y+artFlipX)<1e-10);
      Renderer.prototype.drawEnemy.call({mechaFrames:{'left.png':{}},glow(){}},context({scale(x,y){scales.push([x,y]);}}),enemy,0);
      assert.deepEqual(scales[0],[artFlipX,artFlipY]);
    }
  } finally {emptyManifest();}
});

test('a projected worm middle-port launch remains over the body and foreground at its unchanged anchor',()=>{
  const order=[],paths=[];let path=[];
  const c=context({createLinearGradient(){return {addColorStop(){}};},createRadialGradient(){return {addColorStop(){}};},
    beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},stroke(){paths.push([...path]);order.push('cue');}});
  const renderer={art:{},ctx:c,canvas:{width:1280,height:720},scale:1,offsetX:0,offsetY:0,reducedMotion:true,impactShake:0,exposure:0,
    flashes:[{kind:'enemyShot',x:976,y:315,life:.12,max:.18}],presentation:{threatVariant:'C'},
    environment:{update(){},drawBack(){},drawFront(){order.push('foreground');}},drawEnemy(){order.push('hull');},
    drawEffects(){order.push('rear-effects');},drawCombatCues(ctx,g){Renderer.prototype.drawCombatCues.call(this,ctx,g);}};
  for(const method of ['drawAtmosphere','updateEffects','drawExitGhosts','drawTrail','drawPickup','drawBullets','drawPlayer','drawSpeedLines','drawThreats','drawTension','drawLight'])renderer[method]=()=>{};
  const g={mode:'playing',sceneTime:0,altitude:.5,daylight:1,time:0,shake:0,player:{x:200,y:300,hp:100,powerTime:0},enemies:[{type:'worm',x:980,y:315}],pickups:[],enemyBullets:[]};
  Renderer.prototype.draw.call(renderer,g,0);
  assert.ok(order.indexOf('hull')<order.indexOf('foreground'));assert.ok(order.indexOf('foreground')<order.indexOf('cue'));
  assert.deepEqual(paths[0],[[969,311],[979,315],[969,319]]);
  assert.deepEqual(renderer.flashes[0],{kind:'enemyShot',x:976,y:315,life:.12,max:.18});
});
