import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../src/game.js';
import * as art from '../src/mecha-art.js';

const DT = 1 / 120;
function fixture(pace = 0, normalTime = 0, continuous = false, shoot = false, independentRepeats = false) {
  art.registerMechaManifest(JSON.parse(readFileSync(new URL('../' + art.MECHA_MANIFEST_PATH.replace(/^\.\//, ''), import.meta.url), 'utf8')));
  const game = engine.createGame(620261003);
  game.mode = 'playing'; game.bossesDefeated = pace; game.normalTime = normalTime;
  game.nextWaveAt = 0; game.nextBossAt = game.nextPickupAt = Infinity;
  Object.assign(game.player, engine.screenToWorld(game, { x: 225, y: 360 }), { invincible: 0 });
  const f = { game, events: [], members: [], shoot };
  step(f);
  f.members = game.enemies.filter(enemy => enemy.phrase);
  // Keep the legacy whole-group recovery/cap/phase boundaries as an explicit
  // adapter mode. The new ordinary director's independent repeats have their
  // own runtime contract tests rather than weakening these assertions.
  for (const [index, member] of f.members.entries()) {
    member.phrase.independentRepeats = independentRepeats;
    member.phrase.independentEntry = false;
    if (pace === 0 && normalTime === 0) {
      member.phrase.maxCycles = 1;
      // Preserve the old pre-admission slot-priority race explicitly: the new
      // short entry otherwise completes before the next ordinary wave arrives.
      member.deployment = Object.freeze({ ...member.deployment,
        approachSeconds: 1.35 + index * .25, attackOffset: index * .45 });
      member.phraseDelay = index * .45;
    }
  }
  if (!continuous) game.nextWaveAt = Infinity;
  return f;
}
function step(f) {
  const p = engine.worldToScreen(f.game, f.game.player);
  engine.updateGame(f.game, DT, { x: Math.max(-1, Math.min(1, (225 - p.x) / 20)),
    y: Math.max(-1, Math.min(1, (360 - p.y) / 30)), shoot: f.shoot });
  const fresh = engine.consumeEvents(f.game); f.events.push(...fresh);
  assert.ok(f.game.enemyBullets.length + f.game.enemies.reduce((n, e) => n + (e.reservedBullets || 0), 0) <= f.game.difficulty.maxEnemyBullets);
  assert.ok(f.game.enemyBullets.every(b => Math.hypot(b.vx, b.vy) <= f.game.difficulty.maxBulletSpeed + 1e-6));
  assert.equal(f.game.player.radius, 1.85);
  return fresh;
}
function until(f, condition, seconds = 10) {
  for (let i = 0; i < seconds / DT && f.game.mode === 'playing' && !condition(); i++) step(f);
  assert.ok(condition(), 'actual runtime reaches the requested state');
}
const admissions = f => f.events.filter(event => event.type === 'phraseAdmitted' && event.phraseId === f.members[0].phrase.id);

test('explicit legacy atomic one-cycle opening gives three real releases while ordinary waves continue', () => {
  const f = fixture(0, 0, true, true, true), ids = f.members.map(e => e.id);
  until(f, () => ids.every(id => f.events.some(e => e.type === 'enemyShot' && e.enemyId === id && e.bulletCount > 0)), 5.5);
  assert.ok(f.game.waveIndex > 1, 'later normal waves remain enabled during this witness');
  assert.equal(admissions(f).length, 1); assert.equal(admissions(f)[0].cycleIndex, 0);
  assert.equal(f.members[0].phrase.maxCycles, 1);
  assert.ok(f.events.some(e => e.type === 'attackSkipped' && e.reason === 'phrase-first-priority'));
  for (const member of f.members) {
    const charge = f.events.find(e => e.type === 'charge' && e.enemyId === member.id);
    const shot = f.events.find(e => e.type === 'enemyShot' && e.enemyId === member.id && e.bulletCount);
    assert.ok(charge && shot); assert.ok(shot.simulationAt < member.phrase.deadlineAt);
    assert.ok(shot.simulationAt - charge.simulationAt >= charge.duration - DT);
    assert.equal(member.maxHp, member.combat.hp);
  }
  const rail = f.events.filter(e => e.type === 'enemyShot' && e.pattern === 'rail').flatMap(e => e.shots);
  assert.ok(rail.length > 0);
  for (const shot of rail) {
    assert.ok(shot.launchedAt - shot.lockAt >= .25 - DT);
    const flight = (Math.hypot(shot.lockedTarget.x - shot.x, shot.lockedTarget.y - shot.y) - shot.radius - 1.85) / Math.hypot(shot.vx, shot.vy);
    assert.ok(flight >= .9);
  }
});

test('a later real wave reserves exactly two cycles after every surviving member completes its normal recovery', () => {
  const f = fixture(1, 8);
  until(f, () => f.members.every(e => e.attack === 2), 9.9);
  const rows = admissions(f); assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.cycleIndex), [0, 1]);
  assert.equal(rows[1].firstAdmittedAt, rows[0].admittedAt);
  assert.equal(rows[1].reservedBullets, rows[0].reservedBullets);
  assert.deepEqual(rows[1].memberIds, rows[0].memberIds);
  for (const member of f.members) {
    const completed = f.events.filter(e => e.type === 'attackCompleted' && e.enemyId === member.id);
    assert.equal(completed.length, 2);
    assert.ok(rows[1].admittedAt >= completed[0].simulationAt + f.game.difficulty.fireInterval + (member.combat.recoverySeconds || 0) - 2 * DT);
    assert.ok(rows[1].admittedAt >= completed[0].simulationAt + .15 - DT);
    assert.equal(f.events.filter(e => e.type === 'charge' && e.enemyId === member.id).length, 2);
    assert.equal(member.reservedBullets, 0);
  }
  assert.ok(rows[1].latestReleaseAt + 1 / 60 <= rows[1].deadlineAt + 1e-9);
  while (f.game.time < 9.9 && f.game.mode === 'playing') step(f);
  assert.equal(admissions(f).length, 2, 'a third cycle is never admitted');
});

test('second-cycle saturation preserves the whole reservation and expires without a partial tell or catch-up', () => {
  const f = fixture(1, 8);
  until(f, () => f.members.every(e => e.attack === 1), 5);
  const firstCounts = f.members.map(e => f.events.filter(v => v.type === 'charge' && v.enemyId === e.id).length);
  const missing = f.game.difficulty.maxEnemyBullets - f.game.enemyBullets.length;
  f.game.enemyBullets.push(...Array.from({ length: missing }, (_, i) => ({ id: 800000 + i,
    sourceId: -1, x: 600, y: 80, vx: 0, vy: 0, radius: 1, power: 10, age: 0, family: 'aim' })));
  until(f, () => f.events.some(e => e.type === 'phraseSkipped' && e.cycleIndex === 1), 8);
  assert.equal(admissions(f).length, 1);
  assert.ok(f.events.some(e => e.type === 'attackSkipped' && e.reason === 'bullet-reservation-cap'));
  for (const [i, member] of f.members.entries()) {
    assert.equal(f.events.filter(e => e.type === 'charge' && e.enemyId === member.id).length, firstCounts[i]);
    assert.equal(member.attack, 1); assert.equal(member.reservedBullets, 0);
    assert.equal(member.pendingAttackPlan, null); assert.equal(member.sequence, null);
  }
});

test('boss entry clears the second cycle including pending members and launched projectiles', () => {
  const f = fixture(1, 8);
  until(f, () => admissions(f).length === 2 && f.members.some(e => e.sequence) && f.members.some(e => e.pendingAttackPlan), 8);
  assert.ok(f.members.some(e => e.sequence) && f.members.some(e => e.pendingAttackPlan));
  assert.ok(f.game.enemyBullets.length > 0);
  const ids = f.members.map(e => e.id); f.game.nextBossAt = f.game.time + DT;
  step(f); assert.equal(f.game.phase, 'boss-entry');
  const cleared = f.events.findLast(e => e.type === 'combatClear').simulationAt;
  assert.equal(f.game.enemyBullets.length, 0);
  assert.equal(f.game.enemies.filter(e => e.phrase).length, 0);
  for (let i = 0; i < 360 && f.game.mode === 'playing'; i++) step(f);
  assert.equal(f.events.filter(e => e.type === 'enemyShot' && ids.includes(e.enemyId) && e.simulationAt >= cleared).length, 0);
});

test('a pending new group preserves a previously committed nonphrase aim tell and real release', () => {
  const f = fixture(2, 27);
  let owner;
  until(f, () => Boolean(owner = f.game.enemies.find(e => !e.phrase && e.sequence?.families.includes('aim'))), 6);
  const sequence = owner.sequence, chargeAt = f.events.findLast(e => e.type === 'charge' && e.enemyId === owner.id).simulationAt;
  // Controlled transition fixture: the engine spawns the next actual wave while
  // the already committed ordinary tell is in progress; product state is not reset.
  f.game.normalTime = 17; f.game.nextWaveAt = 0;
  step(f); f.game.nextWaveAt = Infinity;
  assert.equal(owner.sequence, sequence, 'first-cycle priority must not replace an existing tell');
  until(f, () => f.events.some(e => e.type === 'enemyShot' && e.enemyId === owner.id && e.simulationAt > chargeAt && e.bulletCount), 2);
  assert.equal(f.events.filter(e => e.type === 'attackCancelled' && e.enemyId === owner.id).length, 0);
});

test('a pending new group preserves a previously locked runner brace and dash target', () => {
  const f = fixture(2, 27);
  let runner;
  until(f, () => Boolean(runner = f.game.enemies.find(e => e.bodyState === 'brace' && e.type === 'pincer')), 6);
  const target = { ...runner.dashLockedTarget }, lockAt = runner.dashLockAt;
  f.game.normalTime = 35; f.game.nextWaveAt = 0;
  step(f); f.game.nextWaveAt = Infinity;
  until(f, () => f.events.some(e => e.type === 'dashStart' && e.enemyId === runner.id), 1);
  assert.deepEqual(runner.dashLockedTarget, target); assert.equal(runner.dashLockAt, lockAt);
  assert.equal(f.events.filter(e => e.type === 'attackCancelled' && e.enemyId === runner.id).length, 0);
});
