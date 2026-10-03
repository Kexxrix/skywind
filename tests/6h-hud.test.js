import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gameViewport,hudLayout,pilotClearance,healthPresentation,weaponPresentation,supplyPresentation,SUPPLY_COLORS} from '../src/presentation.js';
import {createGame,screenToWorld} from '../src/game.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);

function clearanceFixture(point={x:207.93589801537127,y:48}) {
  const game=createGame(60603);game.mode='playing';game.time=35.950033333331795;
  Object.assign(game.player,screenToWorld(game,point));return game;
}

test('the observed sixth-build top core gets a fully transparent portrait window',()=>{
  const game=clearanceFixture(),clear=pilotClearance(game,1280,720);
  assert.equal(clear.occluded,true);assert.equal(clear.coreClear,true);
  near(clear.x,207.93589801537127);near(clear.y,48-720*32/1080);
  near(clear.inner,80);assert.ok(clear.outer>clear.inner);
  const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
  assert.match(css,/#game-ui #pilot-hud\[data-occluded=true\]\{opacity:\.12\}/);
  assert.match(css,/#game-ui #pilot-hud\[data-core-clear=true\]\{mask-image:radial-gradient/);
  assert.match(css,/transparent var\(--pilot-clear-inner\),#000 var\(--pilot-clear-outer\)/);
  assert.match(css,/-webkit-mask-image:radial-gradient/);
});

test('portrait clearance follows the shared camera projection in day/night and actual letterboxes',()=>{
  for(const [width,height] of [[320,640],[360,640],[390,844],[844,390],[800,450],[1280,720],[1920,1080]]) {
    for(const night of [0,1]) {
      const game=clearanceFixture();game.night=night;game.daylight=1-night;
      game.cameraY=night?140:-70;game.flightAltitude=night?.8:.2;
      Object.assign(game.player,screenToWorld(game,{x:207.93589801537127,y:48}));
      const before=JSON.stringify(game),view=gameViewport(width,height),clear=pilotClearance(game,width,height);
      assert.equal(clear.coreClear,true);near(clear.x,207.93589801537127*view.width/1280);
      near(clear.y,48*view.width/1280-hudLayout(width,height).top);
      assert.equal(JSON.stringify(game),before,'HUD must not change clock/RNG/player/HP');
      Object.assign(game.player,screenToWorld(game,{x:600,y:360}));
      assert.equal(pilotClearance(game,width,height).occluded,false,'middle flight restores the original portrait');
    }
  }
});

test('live bullets including arming previews fade the portrait; expired/offscreen bullets do not',()=>{
  const game=clearanceFixture({x:600,y:360});
  const bullet=(point,extra={})=>({...screenToWorld(game,point),radius:4,life:1,arming:3,...extra});
  game.enemyBullets=[bullet({x:70,y:48})];
  const clear=pilotClearance(game,390,844);
  assert.equal(clear.occluded,true);assert.equal(clear.threatClear,true);assert.equal(clear.coreClear,false);
  for(const b of [bullet({x:70,y:48},{dead:true}),bullet({x:70,y:48},{life:0}),
    bullet({x:-50,y:48}),bullet({x:70,y:800})]) {
    game.enemyBullets=[b];assert.equal(pilotClearance(game,390,844).occluded,false);
  }
  const right=hudLayout(1280,720).pilotWidth;
  game.enemyBullets=[bullet({x:right+4,y:48})];assert.equal(pilotClearance(game,1280,720).threatClear,true);
  game.enemyBullets=[bullet({x:right+4.00001,y:48})];assert.equal(pilotClearance(game,1280,720).threatClear,false);
});

test('title/gameover restore the pilot and HUD clearance keeps HP and supply meaning unchanged',()=>{
  const game=clearanceFixture();game.player.hp=1;game.player.powerTime=4.4;game.player.weaponMode='helix';
  const health=healthPresentation(game.player),weapon=weaponPresentation(game.player);
  const item={id:1,type:'maintain',side:'bottom',status:'active',remaining:1};
  const supply=supplyPresentation(item,game.player),before=JSON.stringify(game);
  pilotClearance(game,1280,720);
  assert.deepEqual(healthPresentation(game.player),health);assert.deepEqual(weaponPresentation(game.player),weapon);
  assert.deepEqual(supplyPresentation(item,game.player),supply);assert.equal(JSON.stringify(game),before);
  for(const mode of ['title','gameover']){game.mode=mode;assert.equal(pilotClearance(game,1280,720).occluded,false);}
});

// A narrow stylesheet-cascade contract for the #hud element. This inspects
// actual legacy/media/current rules; it does not simulate fonts or browser DOM.
function hudPositionStyles(viewportWidth,view,source=readFileSync(new URL('../style.css',import.meta.url),'utf8')) {
  const css=source.replace(/\/\*[\s\S]*?\*\//g,'');
  const frames=[],styles=new Map();let pending='',order=0;
  const attributes={'data-size':view.size,'data-compact':String(view.compact)};
  for(const token of css.split(/([{}])/)) {
    if(token==='{') {
      const header=pending.trim(),maximum=header.match(/@media.*max-width\s*:\s*([\d.]+)px/);
      frames.push({header,enabled:(frames.at(-1)?.enabled??true)&&(!maximum||viewportWidth<=Number(maximum[1]))});
      pending='';
    } else if(token==='}') {
      const frame=frames.pop(),body=pending;pending='';
      if(!frame?.enabled||frame.header.startsWith('@'))continue;
      for(const selector of frame.header.split(',').map(value=>value.trim())) {
        if(!selector.endsWith('#hud')||selector.includes('::'))continue;
        const ids=[...selector.matchAll(/#([\w-]+)/g)].map(match=>match[1]);
        if(ids.some(id=>!['game-ui','status-group','hud'].includes(id)))continue;
        const attrs=[...selector.matchAll(/\[([\w-]+)(?:=([^\]]+))?\]/g)];
        if(attrs.some(([,key,value])=>!(key in attributes)||(value!==undefined&&attributes[key]!==value.replace(/['"]/g,''))))continue;
        const priority=[ids.length,attrs.length,order++];
        for(const declaration of body.split(';')) {
          const separator=declaration.indexOf(':');if(separator<0)continue;
          const property=declaration.slice(0,separator).trim(),value=declaration.slice(separator+1).trim();
          const entries=property==='inset'?['top','right','bottom','left'].map(key=>[key,value]):[[property,value]];
          for(const [key,result] of entries) {
            const previous=styles.get(key)?.priority;
            if(!previous||priority[0]>previous[0]||priority[0]===previous[0]&&
              (priority[1]>previous[1]||priority[1]===previous[1]&&priority[2]>=previous[2]))styles.set(key,{value:result,priority});
          }
        }
      }
    } else pending+=token;
  }
  return Object.fromEntries([...styles].map(([key,{value}])=>[key,value]));
}

test('the stylesheet regression contract exposes the portrait offset when the reset is removed',()=>{
  const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
  const stale=css.replace('inset:auto;left:0;top:0;transform:none;','');
  const view=gameViewport(390,844),styles=hudPositionStyles(390,view,stale);
  assert.equal(styles.position,'relative');assert.equal(styles.left,'50%');assert.equal(styles.top,'11px');
  const layout=hudLayout(390,844),wrongRight=layout.left+layout.width/2+layout.width;
  assert.ok(wrongRight>view.width,'the pre-fix stylesheet cuts off the actual timer edge');
});

test('production CSS keeps the inner HUD at its parent origin despite the old centering and media rules',()=>{
  for(const [width,height] of [[320,640],[360,640],[390,844],[639,359.4375],[640,360],
    [800,450],[844,390],[1024,768],[1280,720],[1920,1080]]) {
    const view=gameViewport(width,height),layout=hudLayout(width,height),styles=hudPositionStyles(width,view);
    const offset=(value,extent)=>value.endsWith('%')?parseFloat(value)*extent/100:parseFloat(value)||0;
    const localLeft=styles.position==='static'?0:offset(styles.left,layout.width);
    const localTop=styles.position==='static'?0:offset(styles.top,view.height);
    near(localLeft,0);near(localTop,0);
    assert.equal(styles.transform,'none','old translateX must not move the inner frame');
    const absoluteRight=view.left+layout.left+localLeft+layout.width;
    assert.ok(absoluteRight<=view.left+view.width,'weapon and tension edge remain inside the game rect');
    near(view.left+layout.left+localLeft,view.left+layout.left);
  }
});

test('pilot-adjacent HUD leaves the portrait and the 44px pause target separate at small widths',()=>{
  for(const width of [320,360,390,480,639]) {
    const layout=hudLayout(width,width*9/16);
    assert.ok(layout.left>=layout.pilotWidth+8);
    assert.ok(layout.width<=230);
    assert.ok(layout.left+layout.width<=width-50);
    const pauseLeft=width-4-44;
    assert.ok(layout.left+layout.width<pauseLeft,'HUD must stop before the existing pause target');
    const weaponNameSpace=layout.width-layout.healthWidth-layout.gap-layout.iconWidth-layout.timerWidth-6;
    assert.ok(weaponNameSpace>=36,'SPREAD and the separate clock retain distinct slots');
  }
});

test('HUD layout uses the real game rectangle through portrait and fullscreen letterboxes',()=>{
  for(const [width,height] of [[390,844],[360,640],[1024,768],[844,390],[2560,1080]]) {
    const view=gameViewport(width,height);
    const outer=hudLayout(width,height),inner=hudLayout(view.width,view.height);
    for(const key of Object.keys(inner))near(outer[key],inner[key]);
    assert.ok(outer.left+outer.width<=view.width);
    near(outer.top,view.height*32/1080);
    assert.ok(view.left+outer.left>=view.left+outer.pilotWidth);
  }
});

test('layout stays beside the unchanged pilot at the existing 640/800/1280 boundaries',()=>{
  for(const width of [639,640,799,800,1279,1280,1920,2560]) {
    const view=gameViewport(width,width*9/16),layout=hudLayout(width,width*9/16);
    near(layout.pilotWidth,Math.min(362,Math.max(96,width*362/1920)));
    near(layout.left,layout.pilotWidth+(view.compact?8:12));
    assert.ok(layout.width>0&&layout.width<=294);
    assert.ok(layout.left+layout.width<width);
  }
  near(hudLayout(360,202.5).width,206);
  near(hudLayout(390,219.375).width,230);
  near(hudLayout(800,450).left,162.83333333333334);
  near(hudLayout(1280,720).left,253.33333333333334);
});

test('transparent HUD composition does not change HP, weapon expiry or the yellow/blue choice outcome',()=>{
  const base=createGame(60603).player;
  for(const [powerTime,basicLevel] of [[.001,4],[0,4],[0,5],[35,5],[45,5]]) {
    const player=Object.freeze({...base,hp:30,weaponMode:'helix',powerTime,basicLevel,droneTime:.001});
    const before=JSON.stringify(player);
    for(const [width,height] of [[360,202.5],[800,450],[1280,720]]) {
      hudLayout(width,height);
      assert.equal(healthPresentation(player).state,'critical');
      assert.equal(weaponPresentation(player).special,powerTime>0);
      assert.equal(weaponPresentation(player).drone.time,'0.1s');
      for(const side of ['top','bottom']) {
        const maintain=supplyPresentation({id:1,type:'maintain',side,status:'active',remaining:1},player);
        const change=supplyPresentation({id:2,type:'change',weaponMode:'lance',side,status:'preview',remaining:1},player);
        assert.equal(maintain.color,SUPPLY_COLORS.maintain);
        assert.equal(change.color,SUPPLY_COLORS.change);
        assert.equal(change.effect,'SWAP · LANCE 18s');
        assert.equal(maintain.action,powerTime>0?'extend':basicLevel<5?'levelUp':'drone');
      }
    }
    assert.equal(JSON.stringify(player),before);
  }
});
