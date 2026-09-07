import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Renderer } from '../src/renderer.js';
import { createGame } from '../src/game.js';

const assetRoot = new URL('../assets/art/player/sv01/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', assetRoot), 'utf8'));

test('SV-01 manifest references 21 ordered, distinct 256 RGBA PNGs with a fixed pivot', () => {
  assert.equal(manifest.frames.length, 21);
  const hashes = new Set();
  for (const [index, frame] of manifest.frames.entries()) {
    assert.equal(frame.frame_index, index);
    assert.equal(frame.state, index < 10 ? 'descent' : index === 10 ? 'neutral' : 'ascent');
    assert.equal(frame.angle_deg, Math.round(Math.abs(10 - index) * 74) / 10);
    assert.deepEqual([frame.pivot_x, frame.pivot_y, frame.width, frame.height], [128,128,256,256]);
    const png = readFileSync(new URL(frame.filename, assetRoot));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]], [256,256,8,6]);
    const hash = createHash('sha256').update(png).digest('hex');
    assert.equal(hash, frame.sha256);
    hashes.add(hash);
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
  assert.deepEqual(transforms[1], ['rotate',angle * 2.4]);
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
