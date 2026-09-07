import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Renderer } from '../src/renderer.js';
import { createGame, playerHeading, playerMuzzle, worldToScreen } from '../src/game.js';

const assetRoot = new URL('../assets/art/player/sv01/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', assetRoot), 'utf8'));
const sourceManifest = JSON.parse(readFileSync(new URL('source-manifest.json', assetRoot), 'utf8'));

test('SV-01 runtime uses 21 ordered lossless WebP frames with a fixed pivot and preserved PNG originals', () => {
  assert.equal(manifest.format, 'WebP');
  assert.equal(manifest.lossless, true);
  assert.equal(manifest.frames.length, 21);
  const hashes = new Set();
  for (const [index, frame] of manifest.frames.entries()) {
    assert.equal(frame.frame_index, index);
    assert.equal(frame.state, index < 10 ? 'descent' : index === 10 ? 'neutral' : 'ascent');
    assert.equal(frame.angle_deg, Math.round(Math.abs(10 - index) * 74) / 10);
    assert.deepEqual([frame.pivot_x, frame.pivot_y, frame.width, frame.height], [96,96,192,192]);
    assert.match(frame.filename, /^webp\/sv01_bank_.*\.webp$/);
    const webp = readFileSync(new URL(frame.filename, assetRoot));
    assert.equal(webp.toString('ascii',0,4), 'RIFF');
    assert.equal(webp.toString('ascii',8,12), 'WEBP');
    let dimensions;
    for (let offset=12;offset+8<=webp.length;) {
      const size=webp.readUInt32LE(offset+4),data=offset+8;
      if(webp.toString('ascii',offset,offset+4)==='VP8L') {
        assert.equal(webp[data],0x2f);
        const bits=webp.readUInt32LE(data+1);
        dimensions=[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];
      }
      offset=data+size+(size%2);
    }
    assert.deepEqual(dimensions,[192,192]);
    const hash = createHash('sha256').update(webp).digest('hex');
    assert.equal(hash, frame.sha256);
    hashes.add(hash);
    const source=sourceManifest.frames[index];
    assert.equal(frame.source_png,source.filename);
    assert.equal(frame.source_sha256,source.sha256);
    assert.equal(createHash('sha256').update(readFileSync(new URL(source.filename,assetRoot))).digest('hex'),source.sha256);
  }
  assert.equal(hashes.size, 21);
});

function draw(angle, drones = false) {
  const game = createGame(74912);
  game.mode = 'playing';
  Object.assign(game.player, { angle, invincible:0, powerTime:0, droneTime:drones ? 1 : 0 });
  const before = structuredClone(game);
  const images = [], transforms = [];
  const context = {
    save() {}, restore() {}, translate(...args) { transforms.push(['translate',...args]); },
    rotate(...args) { transforms.push(['rotate',...args]); },
    drawImage(...args) { images.push(args); },
  };
  const renderer = { playerFrames:manifest.frames.map(frame => frame.filename), art:{player:'legacy-drone'}, glow() {} };
  Renderer.prototype.drawPlayer.call(renderer, context, game, 0);
  assert.deepEqual(game, before, 'Sprite selection must not mutate game state');
  assert.deepEqual(transforms[0], ['translate',game.player.x,game.player.y]);
  assert.deepEqual(transforms[1], ['rotate',playerHeading(game.player)]);
  assert.deepEqual(images[0].slice(1), [-53,-53,106,106]);
  return images;
}

test('movement sign selects descent, neutral and ascent without changing placement or rotation', () => {
  for (const [angle, index] of [[.48,0],[.24,5],[0,10],[-.24,15],[-.48,20],[1,0],[-1,20],[.01,10],[-.01,10]]) {
    assert.equal(draw(angle)[0][0], manifest.frames[index].filename);
  }
});

test('existing drone artwork and draw size stay separate from the new player body', () => {
  const images = draw(0, true);
  assert.equal(images.length, 3);
  assert.deepEqual(images.slice(1), [['legacy-drone',-19,-19,38,38],['legacy-drone',-19,-19,38,38]]);
});

test('nose and muzzle share a gentle six-degree limit relative to the volley through camera motion', () => {
  for (const angle of [-1,-.48,-.24,0,.24,.48,1]) {
    const game = createGame(74912);
    game.player.angle = angle;
    const heading = playerHeading(game.player);
    assert.ok(Math.abs(heading) <= Math.PI / 30 + 1e-12);
    assert.equal(Math.sign(heading), Math.sign(angle));
    if (Math.abs(angle) >= .48) assert.ok(Math.abs(Math.abs(heading) - Math.PI / 30) < 1e-12);
    // The local gun point (30,-4) must rotate with the actual body heading.
    const muzzle = playerMuzzle(game.player);
    assert.ok(Math.abs((muzzle.x-game.player.x)*Math.cos(heading)+(muzzle.y-game.player.y)*Math.sin(heading)-30) < 1e-9);
    assert.ok(Math.abs(-(muzzle.x-game.player.x)*Math.sin(heading)+(muzzle.y-game.player.y)*Math.cos(heading)+4) < 1e-9);
    for (const [altitude,cameraY,sceneTime] of [[0,156,0],[.5,0,17],[1,-156,36]]) {
      Object.assign(game,{altitude,cameraY,sceneTime});
      const origin = worldToScreen(game,game.player);
      const nose = worldToScreen(game,{x:game.player.x+Math.cos(heading),y:game.player.y+Math.sin(heading)});
      const volley = worldToScreen(game,{x:game.player.x+1,y:game.player.y});
      const difference = Math.atan2(nose.y-origin.y,nose.x-origin.x)-Math.atan2(volley.y-origin.y,volley.x-origin.x);
      assert.ok(Math.abs(difference-heading) < 1e-9);
    }
  }
});
