import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { CONTROLLER_POLICY, createVisibleController } from './qa-12h-controller.mjs';

const argv = process.argv.slice(2), option = (key, fallback) => argv.includes(key) ? argv[argv.indexOf(key) + 1] : fallback;
const root = resolve(option('--root', '.'));
const output = option('--output', null), seconds = Number(option('--seconds', 420));
const seeds = option('--seeds', '120201,120202,120203').split(',').map(Number);
const policy = option('--policy', 'visible');
if (!seeds.every(seed => [120201, 120202, 120203].includes(seed))) throw new Error('Only registered comparison seeds are permitted; holdouts remain reserved.');
if (!(seconds > 0 && seconds <= 480) || !['visible', 'fixed'].includes(policy)) throw new Error('Invalid bounded run options');
const round = value => Number.isFinite(value) ? +value.toFixed(6) : null;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fileRow = filename => { const bytes = readFileSync(filename); return { path: relative(root, filename).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha(bytes) }; };
function filesAt(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesAt(join(directory, entry.name)) : [join(directory, entry.name)]);
}
function identity() {
  const filenames = [...filesAt(join(root, 'src')).filter(path => path.endsWith('.js'))];
  for (const name of ['index.html', 'style.css', 'package.json']) if (statExists(join(root, name))) filenames.push(join(root, name));
  const artSource = readFileSync(join(root, 'src', 'mecha-art.js'), 'utf8');
  const manifestRelative = artSource.match(/MECHA_MANIFEST_PATH\s*=\s*['"](.+?)['"]/)?.[1];
  if (manifestRelative) {
    const manifestPath = resolve(root, manifestRelative), manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    filenames.push(manifestPath);
    for (const entry of manifest.entries) for (const frame of Object.values(entry.frames)) filenames.push(resolve(dirname(manifestPath), frame.filename));
  }
  const rows = [...new Set(filenames)].sort().map(fileRow);
  return { root, files: rows.length, bytes: rows.reduce((n, row) => n + row.bytes, 0),
    aggregateSha256: sha(rows.map(row => `${row.path}\t${row.bytes}\t${row.sha256}\n`).join('')), rows };
}
function statExists(path) { try { return statSync(path).isFile(); } catch { return false; } }
const before = identity();
const harnessBefore = ['qa-12h-metrics.mjs', 'qa-12h-controller.mjs'].map(name => ({ name, sha256: sha(readFileSync(new URL(name, import.meta.url))) }));
const engine = await import(pathToFileURL(join(root, 'src', 'game.js')).href);
const art = await import(pathToFileURL(join(root, 'src', 'mecha-art.js')).href);
const barrage = await import(pathToFileURL(join(root, 'src', 'barrage.js')).href);
const level = await import(pathToFileURL(join(root, 'src', 'level.js')).href);
let manifest = null;
const missingRuntimeRoles = [];
if (art.MECHA_MANIFEST_PATH) {
  manifest = JSON.parse(readFileSync(resolve(root, art.MECHA_MANIFEST_PATH), 'utf8'));
  art.registerMechaManifest(manifest);
  for (const role of [...engine.ENEMY_TYPES, ...engine.BOSS_KINDS]) {
    if (!art.getMechaSpec(engine.BOSS_KINDS.includes(role) ? { type: 'boss', bossKind: role } : { type: role })) missingRuntimeRoles.push(role);
  }
}
const prototypeMissingRoleOverride = argv.includes('--allow-prototype-missing-roles');
if (missingRuntimeRoles.length && !prototypeMissingRoleOverride) throw new Error(`Missing registered runtime roles: ${missingRuntimeRoles.join(', ')}. A labelled prototype requires explicit --allow-prototype-missing-roles; final model/art validation remains unavailable.`);
const legacyHealth = readFileSync(join(root, 'src', 'game.js'), 'utf8').match(/if \(item\.type === 'health'\) p\.hp = Math\.min\(p\.maxHp, p\.hp \+ (\d+)\)/);
const legacyRawHeal = legacyHealth ? Number(legacyHealth[1]) : null;
const dt = 1 / 120;
const intervalRow = from => ({ from, to: from + 30, observedSeconds: 0, hpAtStart: null, hpAtEnd: null, stageAtStart: null, stageAtEnd: null,
  damageRaw: 0, damageEffective: 0, healingRaw: 0, healingEffective: 0, healingOverflow: 0, hitCount: 0,
  bulletNearSeconds: 0, bulletLinearRiskSeconds: 0, bodyCircleProxyNearSeconds: 0, actualBodyExpandedProbeSeconds: 0, actualBodySweptContactSeconds: 0, iframeSeconds: 0,
  postHitIframeSeconds: 0, tensionSeconds: 0, tensionEvents: 0, enemyShotBundles: 0, enemyShotBullets: 0,
  maxEnemies: 0, maxEnemyBullets: 0, maxAttackSources: 0, maxBulletSpeed: 0, multiPatternNearSeconds: 0, slowFastNearSeconds: 0,
  slowFastArrivalBandSeconds: 0, travelled: 0 });

function run(seed, replay = false) {
  const game = engine.createGame(seed); engine.startGame(game); engine.consumeEvents(game);
  const controller = createVisibleController(engine, art, barrage.relativeMinimumDistance);
  const windows = Array.from({ length: Math.ceil(seconds / 30) }, (_, index) => intervalRow(index * 30));
  const sources = new Map(), bullets = new Map(), arrivals = [], shots = [], hits = [], pickups = [], bossPeriods = [], dash = [], aimLocks = [], lockFailures = [];
  const skips = {}, eventCounts = {}, roleCounts = {}, attractionReasons = {}, perf = [];
  const healthSpawns = new Map(), enemyShotIds = new Set();
  let ledgerHP = game.player.hp, rawDamage = 0, effectiveDamage = 0, rawHeal = 0, effectiveHeal = 0, overflowHeal = 0;
  let hpLedgerPass = true, firstHit = null, firstThreat = null, postHit = false, currentBoss = null;
  let firstShotKills = 0, knownKills = 0, ambiguousKills = 0, unclassifiedHits = 0, projectileKills = 0, projectilePreShotKills = 0, bodyKills = 0, bodyPreAttackKills = 0;
  let straightAimDirectionDeviations = 0, lockedTargetChanges = 0;
  let sourceShotSerial = 0, maxSequenceReserved = 0, capViolationFrames = 0, speedCapViolationFrames = 0, coreInvariantViolationFrames = 0, frames = 0;
  const digest = createHash('sha256');
  function seeSource(enemy, at) {
    if (sources.has(enemy.id)) return;
    sources.set(enemy.id, { id: enemy.id, type: enemy.type, bossKind: enemy.bossKind || null,
      firstObservedAt: round(at), stage: game.stage, attackMode: enemy.combat?.attackMode ?? null,
      projectileKillEligible: !['body-dash', 'deploy'].includes(enemy.combat?.attackMode), firstAttackAt: enemy.firstAttackAt ?? null,
      firstChargeAt: null, firstShotAt: null, firstChargeToReleaseSeconds: null, bundles: 0, bullets: 0, chargeCount: 0,
      skipReasons: {}, killedAt: null, firstShotBeforeKill: null });
    roleCounts[enemy.type === 'boss' ? enemy.bossKind : enemy.type] = (roleCounts[enemy.type === 'boss' ? enemy.bossKind : enemy.type] || 0) + 1;
  }
  while (game.time < seconds - 1e-8 && game.mode !== 'gameover' && frames < (seconds + 2) / dt) {
    const oldTime = game.time, oldPlayer = { x: game.player.x, y: game.player.y }, oldIframe = game.player.invincible, wasPostHit = postHit;
    const oldEnemies = game.enemies.map(e => ({ ...e }));
    const oldBulletIds = new Set(game.enemyBullets.map(b => b.id)), oldPickups = new Set(game.pickups.map(item => item.id));
    const input = policy === 'visible' ? controller.input(game) : { x: 0, y: 0, shoot: true };
    const started = performance.now(); engine.updateGame(game, dt, input); const elapsedMs = performance.now() - started;
    if (!replay) perf.push(elapsedMs);
    const events = engine.consumeEvents(game), progressed = game.time - oldTime;
    for (const enemy of game.enemies) seeSource(enemy, game.time);
    const row = windows[Math.min(windows.length - 1, Math.floor((oldTime + 1e-7) / 30))];
    if (progressed > 0) { row.observedSeconds += progressed; row.hpAtStart ??= ledgerHP; row.hpAtEnd = game.player.hp; row.stageAtStart ??= game.stage; row.stageAtEnd = game.stage; }
    for (const item of game.pickups) if (!oldPickups.has(item.id) && item.type === 'health') {
      healthSpawns.set(item.id, { id: item.id, at: round(game.time), reason: item.spawnReason ||
        (events.some(event => event.type === 'bossDefeated') ? 'legacy-boss-defeat-inferred' : 'legacy-normal24-inferred'), x: round(item.x), y: round(item.y) });
    }
    for (const event of events) {
      const at = event.simulationAt ?? game.time; eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
      if (event.type === 'enemyShot') {
        const source = sources.get(event.enemyId); if (source) { if (event.bulletCount > 0) { source.firstShotAt ??= round(at); source.firstAttackAt ??= round(at); if (source.firstChargeAt !== null) source.firstChargeToReleaseSeconds ??= round(at - source.firstChargeAt); } source.bundles++; source.bullets += event.bulletCount; }
        if (event.bulletCount > 0) enemyShotIds.add(event.enemyId); row.enemyShotBundles++; row.enemyShotBullets += event.bulletCount;
        const shotId = event.shotId ?? `${event.enemyId}:${++sourceShotSerial}`;
        const declared = Array.isArray(event.shots) ? event.shots : game.enemyBullets.filter(b => b.sourceId === event.enemyId && !oldBulletIds.has(b.id));
        for (const bullet of declared) {
          const target = bullet.lockedTarget ?? bullet.aimedAt ?? null;
          const runtimeBullet = game.enemyBullets.find(other => other.id === bullet.id);
          const record = { id: bullet.id, shotId, sourceId: event.enemyId, enemyType: event.enemyType,
            bossKind: event.bossKind || null, pattern: event.pattern, releaseAt: round(at),
            launch: { x: round(bullet.x), y: round(bullet.y) }, speed: round(bullet.speed ?? Math.hypot(bullet.vx, bullet.vy)),
            radius: bullet.radius, stage: game.stage, lockAt: bullet.lockAt ?? event.lockAt ?? null,
            lockedTarget: target ? { x: target.x, y: target.y } : null,
            family: event.family ?? (event.pattern === 'aim' ? 'aim' : null), motionKind: runtimeBullet?.motion?.kind ?? 'linear',
            releaseDirection: Math.atan2(bullet.vy, bullet.vx), maximumDirectionChange: 0, targetChangeReported: false, directionChangeReported: false,
            arming: bullet.armedAfter ?? bullet.arming ?? 0, style: bullet.style ?? null,
            launchPrecision: Array.isArray(event.shots) ? 'declared-release-state' : 'legacy-post-step-position<=1/120sec',
            firstPlayerXBandAt: null, minimumCoreMargin: 1e9, bandMinimumCoreMargin: 1e9, lastX: null };
          bullets.set(bullet.id, record);
          if (shots.length < 48 && record.pattern === 'aim') shots.push({ ...record, lastX: undefined });
        }
      }
      if (event.type === 'attackSkipped') {
        skips[event.reason] = (skips[event.reason] || 0) + 1;
        const source = sources.get(event.enemyId); if (source) source.skipReasons[event.reason] = (source.skipReasons[event.reason] || 0) + 1;
      }
      if (event.type === 'charge') { const source = sources.get(event.enemyId); if (source) { source.chargeCount++; source.firstChargeAt ??= round(at); } }
      if (event.type === 'aimLock' && aimLocks.length < 64) aimLocks.push({ at: round(at), sourceId: event.enemyId, pattern: event.pattern,
        lockAt: event.lockAt, lockedTarget: event.lockedTarget ? { ...event.lockedTarget } : null, remainingToRelease: event.duration });
      if (event.type === 'tension') row.tensionEvents++;
      if (event.type === 'hit' && event.player) {
        const beforeHP = event.hpBefore ?? ledgerHP, afterHP = event.hpAfter ?? Math.max(0, beforeHP - event.damage);
        const effective = beforeHP - afterHP;
        ledgerHP = afterHP; rawDamage += event.damage; effectiveDamage += effective;
        row.damageRaw += event.damage; row.damageEffective += effective; row.hitCount++;
        firstHit ??= round(at); postHit = true;
        let sourceKind = event.sourceKind ?? null;
        if (!sourceKind) { sourceKind = [22, 30].includes(event.damage) ? 'legacy-body-damage-constant-inferred' : [12, 17].includes(event.damage) ? 'legacy-projectile-damage-constant-inferred' : 'unclassified'; if (sourceKind === 'unclassified') unclassifiedHits++; }
        hits.push({ at: round(at), rawDamage: event.damage, effectiveDamage: effective, hpBefore: beforeHP, hpAfter: afterHP,
          sourceKind, sourceId: event.sourceId ?? null, bulletId: event.bulletId ?? null, sourceX: round(event.sourceX), sourceY: round(event.sourceY) });
      }
      if (event.type === 'pickup') {
        const health = event.pickupType === 'health', amount = event.rawHeal ?? (health ? legacyRawHeal : 0);
        if (health && amount === null) throw new Error('Health magnitude missing from runtime event and exact source; ledger cannot assume a value.');
        const beforeHP = event.hpBefore ?? ledgerHP, applied = event.effectiveHeal ?? Math.min(game.player.maxHp - beforeHP, amount);
        const overflow = event.overflowHeal ?? amount - applied;
        ledgerHP = event.hpAfter ?? beforeHP + applied;
        rawHeal += amount; effectiveHeal += applied; overflowHeal += overflow;
        row.healingRaw += amount; row.healingEffective += applied; row.healingOverflow += overflow;
        pickups.push({ at: round(at), type: event.pickupType, effect: event.effect, side: event.side ?? null,
          rawHeal: amount, effectiveHeal: applied, overflowHeal: overflow, hpBefore: beforeHP, hpAfter: ledgerHP,
          spawnReason: event.spawnReason ?? null, attractionReason: event.attractionReason ?? null,
          precision: event.rawHeal !== undefined ? 'runtime-declared' : 'legacy-event-sequence-and-source-constant' });
      }
      if (event.type === 'pickupAttract') { const reason = event.attractionReason ?? 'legacy-radius-or-rear-circle-unclassified'; attractionReasons[reason] = (attractionReasons[reason] || 0) + 1; }
      if (event.type === 'boss') { currentBoss = { kind: event.bossKind, start: round(at), end: null, duration: null }; bossPeriods.push(currentBoss); }
      if (event.type === 'bossDefeated' && currentBoss) { currentBoss.end = round(at); currentBoss.duration = round(at - currentBoss.start); currentBoss = null; }
      if (['dashLock', 'dashStart', 'dashEnd'].includes(event.type)) {
        dash.push({ at: round(at), type: event.type, sourceId: event.enemyId ?? event.sourceId ?? null,
          lockedTarget: event.lockedTarget ? { ...event.lockedTarget } : null, lockAt: event.lockAt ?? null, duration: event.duration ?? null,
          x: event.x ?? null, y: event.y ?? null, vx: event.vx ?? null, vy: event.vy ?? null, reason: event.reason ?? null });
        if (event.type === 'dashStart') { const source = sources.get(event.enemyId ?? event.sourceId); if (source) source.firstAttackAt ??= round(at); }
      }
      if (event.type === 'explosion' && event.enemyType) {
        const candidates = oldEnemies.filter(e => e.type === event.enemyType && !game.enemies.some(now => now.id === e.id))
          .map(e => ({ e, distance: Math.hypot(e.x - event.x, e.y - event.y) })).sort((a, b) => a.distance - b.distance);
        const selected = event.enemyId ? { e: { id: event.enemyId }, distance: 0 } : candidates[0];
        if (selected && selected.distance < 12 && (event.enemyId || !candidates[1] || candidates[1].distance - selected.distance > 2)) {
          const source = sources.get(selected.e.id);
          if (source) {
            source.attackMode = event.attackMode ?? source.attackMode;
            source.projectileKillEligible = !['body-dash', 'deploy'].includes(source.attackMode);
            source.firstShotAt = event.firstShotAt ?? source.firstShotAt;
            source.firstAttackAt = event.firstAttackAt ?? source.firstAttackAt;
            source.killedAt = round(at); source.firstShotBeforeKill = event.shotsReleased !== undefined ? event.shotsReleased > 0 : enemyShotIds.has(selected.e.id);
            knownKills++; if (!source.firstShotBeforeKill) firstShotKills++;
            if (source.projectileKillEligible) { projectileKills++; if (!source.firstShotBeforeKill) projectilePreShotKills++; }
            if (source.attackMode === 'body-dash') { bodyKills++; if (source.firstAttackAt === null) bodyPreAttackKills++; }
          }
        } else ambiguousKills++;
      }
    }
    if (Math.abs(ledgerHP - game.player.hp) > 1e-7) hpLedgerPass = false;
    let near = false, linearRisk = false, circleBodyNear = false, actualBodyNear = false, actualBodyContact = false, slowNear = false, fastNear = false, slowBand = false, fastBand = false;
    const nearPatterns = new Set(), playerScreen = engine.worldToScreen(game, game.player);
    for (const bullet of game.enemyBullets) {
      const screen = engine.worldToScreen(game, bullet), active = !(bullet.arming > 0);
      const margin = Math.hypot(bullet.x - game.player.x, bullet.y - game.player.y) - bullet.radius - game.player.radius;
      const speed = Math.hypot(bullet.vx, bullet.vy), record = bullets.get(bullet.id);
      if (record) {
        if (record.family === 'aim' && record.motionKind === 'linear' && speed > 1e-8) {
          const direction = Math.atan2(bullet.vy, bullet.vx), difference = Math.abs(Math.atan2(Math.sin(direction - record.releaseDirection), Math.cos(direction - record.releaseDirection)));
          record.maximumDirectionChange = Math.max(record.maximumDirectionChange, difference);
          if (difference > 1e-7 && !record.directionChangeReported) { record.directionChangeReported = true; straightAimDirectionDeviations++; if (lockFailures.length < 16) lockFailures.push({ type: 'straight-aim-direction-changed', at: round(game.time), bulletId: bullet.id, sourceId: bullet.sourceId, difference }); }
        }
        if (record.lockedTarget && bullet.aimedAt && (Math.abs(record.lockedTarget.x - bullet.aimedAt.x) > 1e-7 || Math.abs(record.lockedTarget.y - bullet.aimedAt.y) > 1e-7) && !record.targetChangeReported) {
          record.targetChangeReported = true; lockedTargetChanges++; if (lockFailures.length < 16) lockFailures.push({ type: 'released-target-changed', at: round(game.time), bulletId: bullet.id, sourceId: bullet.sourceId, before: record.lockedTarget, after: { ...bullet.aimedAt } });
        }
        record.minimumCoreMargin = Math.min(record.minimumCoreMargin, margin);
        const x = screen.x - playerScreen.x;
        if (Math.abs(x) <= 48) {
          if (record.firstPlayerXBandAt === null) {
            record.firstPlayerXBandAt = round(game.time);
            record.playerAtBandArrival = { x: round(game.player.x), y: round(game.player.y) };
          }
          record.bandMinimumCoreMargin = Math.min(record.bandMinimumCoreMargin, margin);
          if (active && margin < 32) { slowBand ||= speed < 200; fastBand ||= speed >= 300; }
        }
        record.lastX = x;
      }
      if (!active) continue;
      if (margin < 24) { near = true; nearPatterns.add(bullet.pattern); slowNear ||= speed < 200; fastNear ||= speed >= 300; }
      const from = { x: bullet.x - game.player.x, y: bullet.y - game.player.y };
      const to = { x: from.x + (bullet.vx - game.player.vx) * .8, y: from.y + (bullet.vy - game.player.vy) * .8 };
      if (barrage.relativeMinimumDistance(from, to) - bullet.radius - game.player.radius < 10) linearRisk = true;
    }
    for (const enemy of game.enemies) {
      if (Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) - enemy.radius * .7 - game.player.radius < 24) circleBodyNear = true;
      const prior = oldEnemies.find(old => old.id === enemy.id);
      if (typeof engine.bodyCoreContact === 'function') {
        actualBodyNear ||= engine.bodyCoreContact({ ...game.player, radius: game.player.radius + 24 }, enemy);
        if (prior) actualBodyContact ||= engine.bodyCoreContact(game.player, enemy, oldPlayer, prior);
      }
      if ((enemy.dashTime || 0) > 0 && !(prior?.dashTime > 0) && !events.some(e => e.type === 'dashStart' && (e.enemyId === enemy.id || e.sourceId === enemy.id))) dash.push({ at: round(game.time), type: 'dashStart-state-observation', sourceId: enemy.id, lockedTarget: null });
    }
    if (near || linearRisk || circleBodyNear) firstThreat ??= round(game.time);
    if (progressed > 0) {
      if (near) row.bulletNearSeconds += progressed;
      if (linearRisk) row.bulletLinearRiskSeconds += progressed;
      if (circleBodyNear) row.bodyCircleProxyNearSeconds += progressed;
      if (actualBodyNear) row.actualBodyExpandedProbeSeconds += progressed;
      if (actualBodyContact) row.actualBodySweptContactSeconds += progressed;
      if (nearPatterns.size >= 2) row.multiPatternNearSeconds += progressed;
      if (slowNear && fastNear) row.slowFastNearSeconds += progressed;
      if (slowBand && fastBand) row.slowFastArrivalBandSeconds += progressed;
      const activeIframe = Math.min(progressed, Math.max(0, oldIframe));
      row.iframeSeconds += activeIframe; if (wasPostHit) row.postHitIframeSeconds += activeIframe;
      if (game.tensionTime > 0) row.tensionSeconds += progressed;
      row.travelled += Math.hypot(game.player.x - oldPlayer.x, game.player.y - oldPlayer.y);
      row.maxEnemies = Math.max(row.maxEnemies, game.enemies.length); row.maxEnemyBullets = Math.max(row.maxEnemyBullets, game.enemyBullets.length);
      row.maxAttackSources = Math.max(row.maxAttackSources, game.enemies.filter(e => e.locked || e.sequence || e.attackActiveUntil > game.time || e.dashTime > 0).length);
      const maxSpeed = game.enemyBullets.reduce((maximum, bullet) => Math.max(maximum, Math.hypot(bullet.vx, bullet.vy)), 0);
      row.maxBulletSpeed = Math.max(row.maxBulletSpeed, maxSpeed);
      if (maxSpeed > Math.min(engine.MAX_ENEMY_BULLET_SPEED, game.difficulty.maxBulletSpeed) + 1e-7) speedCapViolationFrames++;
      if (game.player.radius !== 1.85) coreInvariantViolationFrames++;
      const reserved = game.enemies.reduce((sum, e) => sum + (e.reservedBullets || 0), 0); maxSequenceReserved = Math.max(maxSequenceReserved, reserved);
      if (game.enemies.length > game.difficulty.maxEnemies || game.enemyBullets.length + reserved > game.difficulty.maxEnemyBullets) capViolationFrames++;
    }
    if (frames % 12 === 0) digest.update(JSON.stringify([round(game.time), game.rng, round(game.player.x), round(game.player.y), game.player.hp, game.bossesDefeated,
      game.enemyBullets.map(b => [b.id, round(b.x), round(b.y), round(b.vx), round(b.vy)]), events]));
    frames++;
  }
  const arrived = [...bullets.values()].filter(record => record.firstPlayerXBandAt !== null);
  const groups = new Set();
  for (const record of arrived) {
    const key = `${record.stage}:${record.pattern}:${record.speed < 200 ? 'slow' : record.speed >= 300 ? 'fast' : 'middle'}`;
    if (!groups.has(key) && arrivals.length < 60) { groups.add(key); arrivals.push(record); }
  }
  for (const record of arrived.sort((a, b) => a.bandMinimumCoreMargin - b.bandMinimumCoreMargin)) if (!arrivals.includes(record) && arrivals.length < 180) arrivals.push(record);
  const sourceByRoleAndStage = {};
  for (const source of sources.values()) {
    const key = `${source.stage}:${source.bossKind || source.type}`, group = sourceByRoleAndStage[key] ||= { observed: 0, killed: 0, killedBeforeFirstShot: 0, projectileEligibleKilled: 0, projectileEligiblePreShotKilled: 0, bodyKilled: 0, bodyPreAttackKilled: 0, firstReleaseDelaySamples: [] };
    group.observed++;
    if (source.killedAt !== null) {
      group.killed++; if (!source.firstShotBeforeKill) group.killedBeforeFirstShot++;
      if (source.projectileKillEligible) { group.projectileEligibleKilled++; if (!source.firstShotBeforeKill) group.projectileEligiblePreShotKilled++; }
      if (source.attackMode === 'body-dash') { group.bodyKilled++; if (source.firstAttackAt === null) group.bodyPreAttackKilled++; }
    }
    if (source.firstChargeToReleaseSeconds !== null) group.firstReleaseDelaySamples.push(source.firstChargeToReleaseSeconds);
  }
  const controllerResult = controller.summary(), decisionSha256 = sha(JSON.stringify(controllerResult.decisionHashRows));
  delete controllerResult.decisionHashRows;
  const percentile = q => { perf.sort((a, b) => a - b); return round(perf[Math.min(perf.length - 1, Math.floor(perf.length * q))]); };
  const window = (start, end) => {
    const rows = windows.filter(row => row.from >= start && row.to <= end), observed = rows.reduce((sum, row) => sum + row.observedSeconds, 0);
    return { start, end, complete: observed >= end - start - 1e-6, observedSeconds: round(observed), stages: [...new Set(rows.flatMap(row => [row.stageAtStart, row.stageAtEnd]).filter(value => value !== null))], reason: observed < end - start - 1e-6 ? 'same-policy-run-ended-or-window-not-requested' : null,
      metrics: Object.fromEntries(['damageRaw', 'damageEffective', 'healingEffective', 'healingOverflow', 'hitCount', 'bulletNearSeconds', 'bulletLinearRiskSeconds', 'bodyCircleProxyNearSeconds', 'actualBodyExpandedProbeSeconds', 'actualBodySweptContactSeconds', 'postHitIframeSeconds', 'tensionSeconds', 'tensionEvents', 'slowFastNearSeconds', 'slowFastArrivalBandSeconds', 'travelled'].map(key => [key,
        key.startsWith('actualBody') && typeof engine.bodyCoreContact !== 'function' ? null : round(rows.reduce((sum, row) => sum + row[key], 0))])) };
  };
  return { seed, policy: policy === 'visible' ? CONTROLLER_POLICY.name : 'fixed-left-center-shoot', accelerated: true, stateOverridesInOriginalRun: [],
    simulatedUntil: round(game.time), mode: game.mode, hp: game.player.hp, stagesReached: game.stage, bossesDefeated: game.bossesDefeated,
    firstHit, firstThreat, damageRaw: rawDamage, damageEffective: effectiveDamage, healingRaw: rawHeal, healingEffective: effectiveHeal, healingOverflow: overflowHeal,
    hpLedger: { pass: hpLedgerPass && Math.abs(100 - effectiveDamage + effectiveHeal - game.player.hp) < 1e-7, expectedHP: 100 - effectiveDamage + effectiveHeal, actualHP: game.player.hp },
    unclassifiedHits, controller: { ...controllerResult, decisionSha256 }, deterministicDigest: digest.digest('hex'),
    sourceCounts: { observed: sources.size, killed: knownKills, killedBeforeFirstShot: firstShotKills, ambiguousKillAssociation: ambiguousKills,
      projectileEligibleKilled: projectileKills, projectileEligiblePreShotKilled: projectilePreShotKills, bodyKilled: bodyKills, bodyPreAttackKilled: bodyPreAttackKills },
    bodyCollisionObserver: typeof engine.bodyCoreContact === 'function' ? 'actual-imported-bodyCoreContact' : 'unavailable-legacy-circle-proxy-only',
    projectileLockObserver: { straightAimDirectionDeviations, lockedTargetChanges, failures: lockFailures, sampledAimLocks: aimLocks },
    roleCounts, sourceByRoleAndStage, attackSkippedReasons: skips, eventCounts, attractionReasons, healthSpawns: [...healthSpawns.values()],
    bossPeriods, dash, caps: { violationFrames: capViolationFrames, speedCapViolationFrames, coreInvariantViolationFrames, maxSequenceReserved },
    simulationPerformance: replay ? null : { sampleCount: perf.length, medianUpdateMs: percentile(.5), p95UpdateMs: percentile(.95), caveat: 'Node engine update CPU only; controller/metrics overhead excluded, no renderer/FPS/GPU result.' },
    comparisonWindows: [window(120, 180), window(360, 420)],
    windows: windows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
      key.startsWith('actualBody') && typeof engine.bodyCoreContact !== 'function' ? null : typeof value === 'number' ? round(value) : value]))),
    hits, pickups, sourceSummary: [...sources.values()], sampledAimReleases: shots,
    sampledPlayerBandArrivals: arrivals.map(record => ({ ...record, lastX: undefined, minimumCoreMargin: round(record.minimumCoreMargin), bandMinimumCoreMargin: round(record.bandMinimumCoreMargin) })) };
}
const runs = [];
for (const seed of seeds) {
  const result = run(seed); runs.push(result);
  console.log(JSON.stringify({ progress: runs.length, seed, simulatedUntil: result.simulatedUntil, hp: result.hp, bosses: result.bossesDefeated, ledger: result.hpLedger.pass, firstHit: result.firstHit, at: new Date().toISOString() }));
}
let replayCheck = null;
if (argv.includes('--replay-check')) {
  const repeated = run(seeds[0], true), first = runs[0];
  replayCheck = { seed: seeds[0], pass: first.deterministicDigest === repeated.deterministicDigest && first.controller.decisionSha256 === repeated.controller.decisionSha256,
    firstDigest: first.deterministicDigest, repeatDigest: repeated.deterministicDigest,
    decisionPass: first.controller.decisionSha256 === repeated.controller.decisionSha256, hpLedgerPass: repeated.hpLedger.pass };
}
const after = identity(), sourceUnchanged = before.aggregateSha256 === after.aggregateSha256;
const harnessAfter = ['qa-12h-metrics.mjs', 'qa-12h-controller.mjs'].map(name => ({ name, sha256: sha(readFileSync(new URL(name, import.meta.url))) }));
const harnessUnchanged = JSON.stringify(harnessBefore) === JSON.stringify(harnessAfter);
const report = { schema: 'skywind-12h-simulation-metrics-v1', at: new Date().toISOString(), requestedSeconds: seconds,
  kind: 'actual-import-normal-rule-accelerated-simulation', originalRunStateInjection: false, captures: 0, recordFrames: false,
  seeds, reservedHoldoutsUnused: [120211, 120212, 120213], controllerPolicy: policy === 'visible' ? CONTROLLER_POLICY : { name: 'fixed-left-center-shoot' },
  definitions: { damage: 'Raw event damage and HP-effective loss are separate; death overkill is excluded from effective loss.',
    healing: 'Raw/effective/overflow use declared events; legacy health magnitude is parsed from exact hashed source, never assumed across revisions.',
    playerXBand: 'Actual projected bullet x minus current projected player x within48px, sampled1/120sec; first observed crossing and world core margin are recorded. Launch simultaneity is not arrival overlap.',
    danger: 'Current active bullet core margin<24; separate0.8sec linear internal-velocity relative-path margin<10. This observer never changes controller input.',
    body: 'Legacy circle radius*0.7 proxy remains separate. When available, actual imported bodyCoreContact checks the current core expanded by24 for a proximity probe, and the previous→current real core/body poses for actual swept contact. No body collision physics is copied.',
    forcedMovement: 'A current-visible-bullet forecast damages neutral input while a chosen bounded action predicts less damage; a model decision indicator, not proof all routes are blocked.',
    kills: 'Legacy kill IDs inferred only from unambiguous matching type/nearby disappearing source; unresolved associations are counted. Projectile-eligible counts exclude body-dash/deploy roles; body kills before actual firstAttack are separate. Zero-bullet releases are not first shots.',
    skips: 'Only emitted attackSkipped reasons; silent legacy return gates remain unobserved.',
    sampleBudget: 'Bounded48 aimed release examples/180 first band-arrival examples per run; per-source summaries and30sec aggregate windows. No full-frame recording.' },
  sourceUnchanged, harnessUnchanged, sourceBefore: before, sourceAfterAggregateSha256: after.aggregateSha256,
  harnessHashes: harnessBefore,
  runtimeManifest: art.MECHA_MANIFEST_PATH, registeredManifestEntries: manifest?.entries.length ?? 0,
  missingRuntimeRoles, prototypeMissingRoleOverride,
  runtimeModelLimitations: missingRuntimeRoles.length ? 'Explicit prototype only: missing authored role models/ports/hulls. Engine fallback behavior is measured, not adopted as completed model/art/collision quality.' : null,
  invariantDeclarations: { normalDuration: level.LEVEL_RULES.normalDuration, playerHitRadius: engine.PLAYER_HIT_RADIUS, flightControl: engine.FLIGHT_CONTROL },
  replayCheck, runs };
if (output) { mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify({ output, sourceUnchanged, sourceAggregate: before.aggregateSha256, replayCheck, runs: runs.map(run => ({ seed: run.seed, time: run.simulatedUntil, hp: run.hp, damage: run.damageRaw, heal: run.healingEffective, comparisonWindows: run.comparisonWindows })) }));
if (!sourceUnchanged || !harnessUnchanged || runs.some(run => !run.hpLedger.pass || run.caps.violationFrames > 0 || run.caps.speedCapViolationFrames > 0 || run.caps.coreInvariantViolationFrames > 0 || run.projectileLockObserver.straightAimDirectionDeviations > 0 || run.projectileLockObserver.lockedTargetChanges > 0) || replayCheck?.pass === false) process.exitCode = 1;
