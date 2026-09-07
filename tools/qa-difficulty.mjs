import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const modulePath = resolve(option('--module', 'src/game.js'));
const outputPath = option('--output', null);
const gameModule = await import(pathToFileURL(modulePath).href);
const { createGame, startGame, updateGame, consumeEvents, difficultyAt } = gameModule;
const seed = 74912, duration = 300, dt = 1 / 120;
const checkpoints = [0, 30, 60, 120, 180, 300];
const round = value => Math.round(value * 1000) / 1000;

function replay(invincible) {
  const game = createGame(seed);
  startGame(game);
  consumeEvents(game);
  const snapshots = [], hits = [], pickups = [], firstDrops = {};
  const seenPickups = new Set();
  const upgradeSeconds = { spread: 0, lance: 0, helix: 0, drone: 0 };
  let checkpointIndex = 1;
  let maxima = { enemies: 0, attackSources: 0, firedSourcesPerStep: 0, enemyBullets: 0, bulletSpeed: 0 };
  let totalMaxima = { ...maxima };
  let windowHits = 0, windowSteps = 0, windowEnemies = 0, windowBullets = 0;
  const metrics = () => ({
    enemies: game.enemies.filter(e => !e.dead).length,
    attackSources: game.enemies.filter(e => !e.dead && (e.locked || e.dashTime > 0 || e.attackActiveUntil > game.time)).length,
    enemyBullets: game.enemyBullets.length,
    bulletSpeed: game.enemyBullets.reduce((max, b) => Math.max(max, Math.hypot(b.vx, b.vy)), 0),
  });
  const snapshot = requestedTime => {
    snapshots.push({
      requestedTime, reached: true, simulationTime: round(game.time), mode: game.mode,
      hp: game.player.hp, score: game.score, bossesDefeated: game.bossesDefeated,
      ...metrics(), difficulty: difficultyAt(game.time, game.bossesDefeated),
      hitsTotal: hits.length, hitsInWindow: windowHits,
      windowMax: Object.fromEntries(Object.entries(maxima).map(([key, value]) => [key, round(value)])),
      windowMeanEnemies: windowSteps ? round(windowEnemies / windowSteps) : 0,
      windowMeanEnemyBullets: windowSteps ? round(windowBullets / windowSteps) : 0,
      upgradeSeconds: Object.fromEntries(Object.entries(upgradeSeconds).map(([key, value]) => [key, round(value)])),
      activeWeapon: game.player.powerTime > 0 ? game.player.weaponMode : 'normal',
      weaponRemaining: round(game.player.powerTime), droneRemaining: round(game.player.droneTime),
    });
    maxima = { enemies: 0, attackSources: 0, firedSourcesPerStep: 0, enemyBullets: 0, bulletSpeed: 0 };
    windowHits = 0; windowSteps = 0; windowEnemies = 0; windowBullets = 0;
  };
  snapshot(0);
  for (let step = 0; step < duration / dt && game.mode !== 'gameover'; step += 1) {
    if (invincible) game.player.invincible = 2;
    if (game.player.powerTime > 0) upgradeSeconds[game.player.weaponMode] += dt;
    if (game.player.droneTime > 0) upgradeSeconds.drone += dt;
    // Fixed input is independent of enemies, bullets and pickups; no reactive aiming or dodge logic.
    const input = { x: 0, y: Math.sin(step / 240) * 0.2, shoot: true };
    updateGame(game, dt, input);
    const events = consumeEvents(game);
    const observed = { ...metrics(), firedSourcesPerStep: events.filter(e => e.type === 'enemyShot').length };
    for (const key of Object.keys(maxima)) {
      maxima[key] = Math.max(maxima[key], observed[key]);
      totalMaxima[key] = Math.max(totalMaxima[key], observed[key]);
    }
    windowSteps += 1; windowEnemies += observed.enemies; windowBullets += observed.enemyBullets;
    for (const item of game.pickups) {
      if (seenPickups.has(item.id)) continue;
      seenPickups.add(item.id);
      firstDrops[item.type] ??= round(game.time);
    }
    for (const event of events) {
      if (event.type === 'pickup') pickups.push({ time: round(game.time), type: event.pickupType, weaponMode: event.weaponMode });
      if (event.type === 'hit' && event.player) {
        windowHits += 1;
        hits.push({ time: round(game.time), hpAfter: game.player.hp, damage: event.damage,
          mechanism: [22, 30].includes(event.damage) ? 'body contact' : [12, 17, 19].includes(event.damage) ? 'hostile projectile' : 'unclassified',
          ...observed, sourceX: round(event.sourceX), sourceY: round(event.sourceY), playerX: round(game.player.x), playerY: round(game.player.y) });
      }
    }
    if (checkpointIndex < checkpoints.length && game.time + 1e-7 >= checkpoints[checkpointIndex]) snapshot(checkpoints[checkpointIndex++]);
  }
  if (game.mode === 'gameover') {
    while (checkpointIndex < checkpoints.length) snapshots.push({ requestedTime: checkpoints[checkpointIndex++], reached: false, reason: 'gameover', frozenAt: round(game.time) });
  }
  return {
    purpose: invincible ? 'Invincible load/pattern observation only; not survival or balance evidence.' : 'Normal damage rules with fixed non-reactive input; one reproducible survival observation, not a player skill or balance certification.',
    invincibleOverride: invincible, simulatedUntil: round(game.time), survived300Seconds: game.mode !== 'gameover',
    mode: game.mode, hp: game.player.hp, hitCount: hits.length,
    totalMaxima: Object.fromEntries(Object.entries(totalMaxima).map(([key, value]) => [key, round(value)])),
    firstDrops, firstPowerCollection: pickups.find(p => p.type === 'power')?.time ?? null,
    upgradeSeconds: Object.fromEntries(Object.entries(upgradeSeconds).map(([key, value]) => [key, round(value)])),
    snapshots, hits, pickups,
    deathEvidence: game.mode === 'gameover' ? {
      finalHit: hits.at(-1), priorFiveSecondHits: hits.filter(hit => hit.time >= game.time - 5),
      limitations: 'Damage constants identify contact vs projectile. This headless replay cannot establish cloud occlusion, edge visibility, perceived speed, safe-route readability or slow-kill causation.',
    } : null,
  };
}

const report = {
  seed, durationSeconds: duration, substepSeconds: dt,
  source: modulePath, sourceSha256: createHash('sha256').update(await readFile(modulePath)).digest('hex'),
  fixedInput: '{ x: 0, y: Math.sin(step / 240) * 0.2, shoot: true }, step = 0..35999 at 120 Hz',
  definitions: {
    attackSources: 'Live enemies charging, dashing, or holding the post-shot attack reservation. Before tuning there is no reservation; compare firedSourcesPerStep and active bullets alongside this count.',
    window: 'Since the previous reached checkpoint; maxima sampled each 1/120 s simulation step.',
    enemyCounts: 'All live entities, including bosses and entering/offscreen bodies; not a projected-viewport count.',
    speed: 'Magnitude in gameplay coordinates, px/s; zero when the pool is empty.',
    upgrades: 'Cumulative simulation seconds active, per power mode and drone; not granted duration sums.',
    rendering: 'Node simulation only. No browser rendering, audio listening, FPS or human play measurement.',
  },
  configurationWithoutBossVictories: checkpoints.map(time => ({ time, ...difficultyAt(time) })),
  runs: { invincibleLoad: replay(true), normalDamageFixedInput: replay(false) },
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await writeFile(resolve(outputPath), json);
  console.log(JSON.stringify({ output: outputPath, sourceSha256: report.sourceSha256, runs: Object.fromEntries(Object.entries(report.runs).map(([name, run]) => [name, { time: run.simulatedUntil, hp: run.hp, hits: run.hitCount, firstPowerCollection: run.firstPowerCollection, maxima: run.totalMaxima }])) }, null, 2));
} else console.log(json);
