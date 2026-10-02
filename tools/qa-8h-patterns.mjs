// Internal-coordinate model-predictive route observation. This is not a human difficulty or fun rating.
// Every accepted path uses updateGame's normal capped/accelerated inputs and real damage/camera/sweeps.
import { createGame, startGame, updateGame, consumeEvents, worldToScreen, screenToWorld } from '../src/game.js';
import { trialDifficulty } from '../src/level.js';
import { MECHA_MANIFEST_PATH, registerMechaManifest } from '../src/mecha-art.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = new Set(process.argv.slice(2));
const quick = args.has('--quick'), matrix = args.has('--matrix'), validation = args.has('--validation');
const seed = validation ? 48271 : 9317; // Deliberately separate tuning and validation seeds.
const manifestPath = MECHA_MANIFEST_PATH?.replace(/^\//, '') || null;
if (manifestPath) {
  if (!/^assets\/[\w./-]+$/.test(manifestPath) || manifestPath.split('/').includes('..')) throw new Error('QA manifest must be an existing workspace asset');
  registerMechaManifest(JSON.parse(readFileSync(new URL(`../${manifestPath}`, import.meta.url), 'utf8')));
}
const sourceVersion = () => ({ ...Object.fromEntries(['game.js', 'level.js', 'barrage.js', 'mecha-art.js'].map(name => [name,
  createHash('sha256').update(readFileSync(new URL(`../src/${name}`, import.meta.url))).digest('hex')])),
  ...(manifestPath ? { manifest: createHash('sha256').update(readFileSync(new URL(`../${manifestPath}`, import.meta.url))).digest('hex') } : {}) });
const startedVersion = sourceVersion();
const stages = quick ? [0, 3, 5] : [0, 1, 2, 3, 4, 5];
const patterns = quick ? ['B01', 'B04', 'B05'] : ['B01', 'B02', 'B03', 'B04', 'B05'];
const starts = matrix ? [120, 360, 600] : [360], xs = matrix ? [90, 240] : [240];
const FRAME = 1 / 60, DECISION = .15, DELAY = .2, HORIZON = 1.3;
const actions = [0, -.4, .4, -1, 1].flatMap(y => [0, -1, 1].map(x => ({ x, y })));

function emitter(id, type, pattern, lane = 360) {
  return { id, type, pattern, holdScreenY: lane, holdUntil: 30, x: 1000, y: lane, baseY: lane,
    radius: 28, hp: 999, maxHp: 999, speed: 0, phase: 0, age: 0, fireCooldown: 0, attack: 0,
    attackAngle: Math.PI, telegraph: 0, chargeTime: 0, locked: false, dashTime: 0, dead: false };
}
function setup(stage, pattern, y, x, caseSeed = seed) {
  const g = createGame(caseSeed); startGame(g); g.mode = 'playing';
  g.bossesDefeated = stage; g.difficulty = trialDifficulty(stage);
  g.nextWaveAt = g.nextBossAt = g.nextPickupAt = Infinity;
  // Choose the matching authored block so unrelated early-block restrictions do not hide this test's pattern.
  const times = { B01: stage === 0 ? 7 : stage === 1 || stage === 5 ? 10 : 1,
    B02: stage === 0 ? 16 : stage === 3 ? 35 : 10,
    B03: stage === 0 ? 24 : stage === 1 ? 22 : stage === 2 ? 35 : 10,
    B04: stage === 0 ? 32 : stage === 1 ? 34 : stage === 2 ? 22 : stage === 3 ? 22 : 34,
    B05: stage === 3 ? 10 : 22 };
  g.normalTime = times[pattern];
  Object.assign(g.player, screenToWorld(g, { x, y }), { invincible: 0 });
  const types = { B01: 'orb', B02: 'claw', B03: 'worm', B04: 'ray', B05: 'ray' };
  g.enemies = [emitter(90, types[pattern], pattern)];
  if (!['B04', 'B05'].includes(pattern)) {
    g.enemies.push(Object.assign(emitter(91, 'beetle', null, 240), { x: 1100, attack: 1 }));
    if (stage) g.enemies.push(Object.assign(emitter(92, 'beetle', null, 480), { x: 1080, attack: 2 }));
  }
  consumeEvents(g); return g;
}
function marginAt(g) {
  let margin = 200;
  for (const b of g.enemyBullets) {
    if (b.arming > 0) continue;
    margin = Math.min(margin, Math.hypot(b.x - g.player.x, b.y - g.player.y) - b.radius - g.player.radius);
  }
  return margin;
}
function choose(g, current, goalY, queued, elapsed, shoot = false) {
  let best = actions[0], bestScore = -Infinity;
  for (const candidate of actions) {
    const future = structuredClone(g); future.events = [];
    if (args.has('--reactive')) {
      // A second observation policy predicts currently released trajectories, not future enemy attacks.
      future.nextWaveAt = future.nextBossAt = Infinity;
      for (const enemy of future.enemies) {
        enemy.sequence = null; enemy.locked = false; enemy.fireCooldown = Infinity;
        enemy.attackActiveUntil = Infinity; enemy.reservedBullets = 0;
      }
    }
    let smallest = 200, pressure = 0, prior = current, queueIndex = 0;
    for (let t = 0; t < HORIZON; t += 1 / 30) {
      while (queueIndex < queued.length && queued[queueIndex].at <= elapsed + t + 1e-9) prior = queued[queueIndex++].input;
      updateGame(future, 1 / 30, { ...(t < DELAY ? prior : candidate), shoot });
      const margin = marginAt(future);
      smallest = Math.min(smallest, margin);
      pressure += Math.max(0, 22 - margin);
    }
    const screen = worldToScreen(future, future.player);
    const loss = g.player.hp - future.player.hp;
    const score = -loss * 100000 - pressure * 4 + Math.min(smallest, 70)
      - Math.abs(screen.y - goalY) * .035 - Math.abs(screen.x - 240) * .015
      - (candidate.y === current.y && candidate.x === current.x ? 0 : .35);
    if (score > bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}
function observe(g, { stage, pattern, y, x, supplyApproach = false, seconds = 8, shoot = false, scenario = 'isolated-pattern' }) {
  const queue = [], observedPatterns = new Set(), blocks = new Set(), pickups = [];
  let current = actions[0], nextDecision = 0, travelled = 0, shots = 0, aimedShots = 0, maxBullets = 0, maxEnemies = 0, minMargin = 200;
  for (let t = 0; t < seconds; t += FRAME) {
    // Reaction delay is a real input queue, including the initial tell. No teleport or invulnerability is used.
    if (t >= nextDecision - 1e-9) {
      const goalY = supplyApproach ? (t < 5.3 ? 48 : 672) : Math.max(120, Math.min(600, y));
      queue.push({ at: t + DELAY, input: choose(g, current, goalY, queue, t, shoot) });
      nextDecision += DECISION;
    }
    while (queue.length && queue[0].at <= t + 1e-9) current = queue.shift().input;
    const old = { x: g.player.x, y: g.player.y };
    updateGame(g, FRAME, { ...current, shoot });
    travelled += Math.hypot(g.player.x - old.x, g.player.y - old.y);
    minMargin = Math.min(minMargin, marginAt(g));
    maxBullets = Math.max(maxBullets, g.enemyBullets.length);
    maxEnemies = Math.max(maxEnemies, g.enemies.length);
    for (const event of consumeEvents(g)) {
      if (event.type === 'enemyShot') {
        observedPatterns.add(event.pattern);
        if (!pattern || event.pattern === pattern) shots++;
        if (event.pattern === 'aim') aimedShots++;
      }
      if (event.type === 'wave' && event.blockId) blocks.add(event.blockId);
      if (event.type === 'pickup' && event.side) pickups.push(event.side);
    }
    if (g.mode === 'gameover') break;
  }
  return { scenario, stage: stage + 1, pattern, bossKind: g.boss?.bossKind, start: { x, y }, seed: g.seed, supplyApproach, seconds, shoot,
    hp: g.player.hp, shots, aimedShots, observedPatterns: [...observedPatterns], blocks: [...blocks], pickups,
    travelled: Math.round(travelled), maxBullets, maxEnemies,
    minMargin: +minMargin.toFixed(2), pass: g.player.hp === 100 && shots >= 2 && maxBullets <= trialDifficulty(stage).maxEnemyBullets };
}
function run(stage, pattern, y, x, supplyApproach = false) {
  const g = setup(stage, pattern, y, x);
  if (supplyApproach) g.nextPickupAt = 6;
  return observe(g, { stage, pattern, y, x, supplyApproach,
    scenario: supplyApproach ? 'pattern-with-scheduled-supply' : 'isolated-pattern' });
}
const results = [];
if (!args.has('--integrated') && !args.has('--bosses')) {
  for (const stage of stages) for (const pattern of patterns) for (const y of starts) for (const x of xs) {
    const row = run(stage, pattern, y, x); results.push(row);
    if (!row.pass) console.log(JSON.stringify({ failed: row }));
    if (results.length % 12 === 0) console.log(JSON.stringify({ progress: results.length, at: new Date().toISOString() }));
  }
}
if (args.has('--supply')) for (const stage of stages) {
  const row = run(stage, stage >= 3 ? 'B05' : 'B04', 360, 240, true); results.push(row);
  if (!row.pass) console.log(JSON.stringify({ failed: row }));
}
if (args.has('--integrated')) for (const [caseSeed, y] of [[9317, 120], [48271, 360], [13371337, 600]]) {
  const g = createGame(caseSeed); startGame(g); g.mode = 'playing'; g.bossesDefeated = 5;
  Object.assign(g.player, screenToWorld(g, { x: 240, y }), { invincible: 0 });
  const row = observe(g, { stage: 5, pattern: null, y, x: 240, seconds: 45, shoot: true, scenario: 'integrated-hell-normal' });
  results.push(row); if (!row.pass) console.log(JSON.stringify({ failed: row }));
  console.log(JSON.stringify({ progress: results.length, scenario: row.scenario, hp: row.hp, at: new Date().toISOString() }));
}
if (args.has('--bosses')) for (let stage = 0; stage < 6; stage++) {
  const g = createGame(seed); startGame(g); g.mode = 'playing'; g.bossesDefeated = stage;
  g.nextBossAt = 0; g.nextWaveAt = g.nextPickupAt = Infinity;
  Object.assign(g.player, screenToWorld(g, { x: 240, y: 360 }), { invincible: 0 });
  const row = observe(g, { stage, pattern: null, y: 360, x: 240, seconds: 32, scenario: 'integrated-boss-with-escorts' });
  results.push(row); if (!row.pass) console.log(JSON.stringify({ failed: row }));
  console.log(JSON.stringify({ progress: results.length, scenario: row.scenario, bossKind: row.bossKind, hp: row.hp, at: new Date().toISOString() }));
}
const endedVersion = sourceVersion(), sourceUnchanged = JSON.stringify(startedVersion) === JSON.stringify(endedVersion);
console.log(JSON.stringify({ at: new Date().toISOString(), type: 'internal-coordinate-normal-input-path-observation',
  caveat: 'Uses internal trajectories and forward simulation. Proves only these sampled normal-input routes; does not prove human fairness, fun, all seeds or infinite survival.',
  controller: args.has('--reactive') ? 'current-trajectories-without-future-attacks' : 'predictive-including-enemy-attack-state',
  manifestPath, runtimeAnchors: manifestPath ? 'registered-model-manifest' : 'existing-legacy-anchors',
  frames: 60, fixedSubstep: 120, inputDelay: DELAY, seedPurpose: validation ? 'validation' : 'tuning',
  cases: results.length, passed: results.filter(row => row.pass).length,
  failed: results.filter(row => !row.pass).length, sourceUnchanged, startedVersion, endedVersion,
  maxBullets: Math.max(...results.map(row => row.maxBullets)),
  scenarios: results.filter(row => row.scenario !== 'isolated-pattern'),
  results: args.has('--summary') ? results.filter(row => !row.pass) : results }));
process.exitCode = results.some(row => !row.pass) || !sourceUnchanged ? 1 : 0;
