import test from 'node:test';
import assert from 'node:assert/strict';
import { sweptCircleAgainstHulls,mechaBodyContact } from '../src/mecha-collision.js';
import { registerMechaManifest } from '../src/mecha-art.js';
const box=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const hulls=[box(-30,-30,60,10),box(-30,20,60,10),box(20,-30,10,60)];
const before={type:'probe',x:500,y:300,artAngle:0,artState:'idle'};
const frame=(name,pieces)=>({filename:`${name}.png`,bodyHullPixels:pieces});
const changingFrames=()=>({idle:frame('closed',[box(15,45,10,10)]),
  middle:frame('middle',[box(45,45,10,10)]),open:frame('open',[box(75,45,10,10)])});
const mechanismFrames=[{state:'idle',progress:0},{state:'middle',progress:.5},{state:'open',progress:1}];
function withFrames(frames,run,mechanism) {
  registerMechaManifest({schemaVersion:1,entries:[{key:'probe',canvasWidth:100,canvasHeight:100,
    displayWidth:100,pivotPixels:{x:50,y:50},frames,...(mechanism?{mechanismFrames:mechanism}:{})}]});
  try { run(); } finally { registerMechaManifest({schemaVersion:1,entries:[]}); }
}
test('compound crescent retains open center and entry corridor',()=>{
  assert.equal(sweptCircleAgainstHulls({x:-100,y:0},{x:0,y:0},1.85,hulls),false);
  assert.equal(sweptCircleAgainstHulls({x:-100,y:25},{x:0,y:25},1.85,hulls),true);
  assert.equal(sweptCircleAgainstHulls({x:0,y:0},{x:40,y:0},1.85,hulls),true);
});
test('fast relative crossing hits small body; exact tangent remains a graze',()=>{
  assert.equal(sweptCircleAgainstHulls({x:-100,y:0},{x:100,y:0},1.85,[box(-2,-2,4,4)]),true);
  assert.equal(sweptCircleAgainstHulls({x:-100,y:3.85},{x:100,y:3.85},1.85,[box(-2,-2,4,4)]),false);
});
test('body follows sprite rotation and flips without filling its alpha hole',()=>{
  registerMechaManifest({schemaVersion:1,entries:[{key:'probe',canvasWidth:100,canvasHeight:100,displayWidth:100,
    pivotPixels:{x:50,y:50},frames:{idle:{filename:'probe.png',bodyHullPixels:[box(70,45,10,10)],
      bodyBoundsPixels:{minX:70,minY:45,maxX:80,maxY:55}}}}]});
  const enemy={type:'probe',x:500,y:300,artAngle:Math.PI/2,artFlipX:-1};
  assert.equal(mechaBodyContact(enemy,{x:500,y:275,radius:1.85}),true);
  assert.equal(mechaBodyContact(enemy,{x:500,y:325,radius:1.85}),false);
  assert.equal(mechaBodyContact({...enemy,type:'missing'},{x:500,y:275,radius:1.85}),null);
  registerMechaManifest({schemaVersion:1,entries:[]});
});

test('independent idle-to-open regression retains the previously authored body',()=>{
  withFrames(changingFrames(),()=>{
    const after={...before,artState:'open'},circle={x:470,y:300,radius:1.85};
    assert.equal(mechaBodyContact(before,circle),true);
    assert.equal(mechaBodyContact(after,circle),false);
    assert.equal(mechaBodyContact(after,circle,circle,before),true);
  });
});

test('a discrete new frame neither reaches backward through time nor vanishes at the endpoint',()=>{
  withFrames(changingFrames(),()=>{
    const after={...before,artState:'open'};
    const start={x:530,y:300,radius:1.85},end={x:570,y:300,radius:1.85};
    assert.equal(mechaBodyContact(after,end,start,before),false);
    assert.equal(mechaBodyContact(after,start,start,before),true);
    assert.equal(mechaBodyContact(after,start,start,before,1),true);
    assert.equal(mechaBodyContact(after,{x:470,y:300,radius:1.85},undefined,before,1),false);
  });
});

test('arming or expired invulnerability restricts contact to the active part of a state-changing sweep',()=>{
  withFrames(changingFrames(),()=>{
    const after={...before,artState:'open'};
    const start={x:450,y:300,radius:1.85},end={x:500,y:300,radius:1.85};
    assert.equal(mechaBodyContact(after,end,start,before,.3),true);
    assert.equal(mechaBodyContact(after,end,start,before,.8),false);
    assert.equal(mechaBodyContact(after,end,start,before,1),false);
  });
});

test('continuous mechanism progress visits intermediate geometry absent from both endpoint frames',()=>{
  withFrames(changingFrames(),()=>{
    const start={...before,mechanismProgress:0},after={...before,mechanismProgress:1};
    const circle={x:500,y:300,radius:1.85};
    assert.equal(mechaBodyContact(start,circle),false);
    assert.equal(mechaBodyContact(after,circle),false);
    assert.equal(mechaBodyContact(after,circle,circle,start),true);
  },mechanismFrames);
});

test('a progress floor boundary uses each authored frame only in its actual interval',()=>{
  withFrames(changingFrames(),()=>{
    const start={...before,mechanismProgress:0},after={...before,mechanismProgress:1};
    const left={x:470,y:300,radius:1.85};
    assert.equal(mechaBodyContact(after,left,left,start,.49),true);
    assert.equal(mechaBodyContact(after,left,left,start,.5),false);
    const from={x:530,y:300,radius:1.85},to={x:570,y:300,radius:1.85};
    assert.equal(mechaBodyContact(after,to,from,start),false);
  },mechanismFrames);
});

test('closing progress retains the exact floor-selected boundary without granting a later contact',()=>{
  withFrames(changingFrames(),()=>{
    const start={...before,mechanismProgress:1},after={...before,mechanismProgress:0};
    const circle={x:500,y:300,radius:1.85};
    assert.equal(mechaBodyContact(after,circle,circle,start,.5),true);
    assert.equal(mechaBodyContact(after,circle,circle,start,.500001),false);
  },mechanismFrames);
});

test('non-binary progress boundaries snap to the authored threshold despite floating-point interpolation',()=>{
  withFrames(changingFrames(),()=>{
    const start={...before,mechanismProgress:.71},after={...before,mechanismProgress:.23};
    const atBoundary=(.4-.71)/(.23-.71),circle={x:500,y:300,radius:1.85};
    assert.equal(mechaBodyContact(after,circle,circle,start,atBoundary),true);
    assert.equal(mechaBodyContact(after,circle,circle,start,atBoundary+1e-6),false);
  },[{state:'idle',progress:0},{state:'middle',progress:.4},{state:'open',progress:1}]);
});

test('an explicit artFrame remains discrete even when progress changes underneath it',()=>{
  withFrames(changingFrames(),()=>{
    const start={...before,artFrame:'idle',mechanismProgress:0};
    const after={...before,artFrame:'open',mechanismProgress:1};
    const circle={x:500,y:300,radius:1.85};
    assert.equal(mechaBodyContact(after,circle,circle,start),false);
    assert.equal(mechaBodyContact(after,circle,circle,{...start,artFrame:undefined}),true);
  },mechanismFrames);
});

test('rotation and old reflection are preserved through a discrete state boundary',()=>{
  withFrames({idle:frame('closed',[box(70,45,10,10)]),open:frame('open',[box(100,45,10,10)])},()=>{
    const start={...before,artFlipX:-1};
    const after={...start,artState:'open',artAngle:Math.PI/2,artFlipX:1};
    const circle={x:500-25/Math.sqrt(2),y:300-25/Math.sqrt(2),radius:1.85};
    assert.equal(mechaBodyContact(start,circle),false);
    assert.equal(mechaBodyContact(after,circle),false);
    assert.equal(mechaBodyContact(after,circle,circle,start),true);
    assert.equal(mechaBodyContact(after,{x:500,y:300,radius:1.85},undefined,start),false);
  });
});

test('geometry selection can change without any body translation and without making a union',()=>{
  withFrames({idle:frame('closed',[box(70,45,10,10)])},()=>{
    const start={...before,artFlipX:-1},after={...before,artFlipX:1};
    const from={x:530,y:300,radius:1.85},to={x:570,y:300,radius:1.85};
    assert.equal(mechaBodyContact(after,to,from,start),false);
    assert.equal(mechaBodyContact(after,{x:470,y:300,radius:1.85},undefined,start),true);
    assert.equal(mechaBodyContact(after,{x:470,y:300,radius:1.85},undefined,start,1),false);
  });
});

test('many authored pieces retain their gaps and use actual vertices for broad phase',()=>{
  const pieces=Array.from({length:154},(_,i)=>box(100+(i%14)*3,30+Math.floor(i/14)*3,2,2));
  withFrames({idle:{...frame('grid',pieces),bodyBoundsPixels:{minX:100,minY:30,maxX:101,maxY:31}}},()=>{
    // Intentionally narrower metadata cannot reject actual hull vertices.
    assert.equal(mechaBodyContact(before,{x:570,y:302,radius:.4}),true);
    assert.equal(mechaBodyContact(before,{x:500,y:300,radius:1.85}),false);
    assert.equal(mechaBodyContact(before,{x:550+2.5,y:280+1,radius:.4}),false);
  });
});

test('a short rotation catches real grazing penetration that a single local chord misses',()=>{
  registerMechaManifest({schemaVersion:1,entries:[{key:'arc',canvasWidth:1024,canvasHeight:1024,
    displayWidth:1024,pivotPixels:{x:512,y:512},frames:{idle:frame('arc',[box(813.84,511,5,2)])}}]});
  try {
    const start={type:'arc',x:0,y:0,artAngle:-.012},after={...start,artAngle:.012};
    const circle={x:300,y:0,radius:1.85};
    assert.equal(mechaBodyContact(start,circle),false);
    assert.equal(mechaBodyContact(after,circle),false);
    assert.equal(mechaBodyContact(after,circle,circle,start),true);
    let partitioned=false;
    for(let index=0;index<8;index++) {
      const left={...start,artAngle:-.012+index*.003},right={...start,artAngle:-.012+(index+1)*.003};
      partitioned ||= mechaBodyContact(right,circle,circle,left);
    }
    assert.equal(partitioned,true);
  } finally { registerMechaManifest({schemaVersion:1,entries:[]}); }
});

test('an exact tangent during rotation remains a graze rather than an expanded-radius hit',()=>{
  registerMechaManifest({schemaVersion:1,entries:[{key:'arc',canvasWidth:1024,canvasHeight:1024,
    displayWidth:1024,pivotPixels:{x:512,y:512},frames:{idle:frame('arc',[box(813.85,511,5,2)])}}]});
  try {
    const start={type:'arc',x:0,y:0,artAngle:-.012},after={...start,artAngle:.012};
    const circle={x:300,y:0,radius:1.85};
    assert.equal(mechaBodyContact(after,circle,circle,start),false);
  } finally { registerMechaManifest({schemaVersion:1,entries:[]}); }
});
