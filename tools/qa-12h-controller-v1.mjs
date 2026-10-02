// Limited observation controller. Real runs receive only normal updateGame inputs.
// The forecast uses the imported engine and observed current trajectories, never
// the original enemy sequence, motion metadata, scheduled waves or future RNG.
export const CONTROLLER_POLICY = Object.freeze({
  name: 'visible-current-trajectory-300ms-10Hz-v1', decisionSeconds: .1,
  reactionSeconds: .3, forecastSeconds: 1.05, forecastStep: 1 / 30,
  observation: 'Exact runtime camera projection; viewport-intersecting bullet/body/pickup positions and visible exposed core. Bullet/body velocities estimated from successive 10Hz position observations. Player control/camera pose is copied for the imported-engine forecast. No hidden enemies, attack sequence, projectile motion metadata, future waves or RNG are exposed.',
  caveats: ['Accelerated Node simulation; no renderer, native input, audio, human skill or fun evidence.',
    'Viewport intersection approximates visibility; foreground/cloud occlusion and visual recognition are unmeasured.',
    'Forecast linearly extrapolates observed current bullets. Curves/acceleration and unseen future attacks are not predicted.',
    'Exact player velocity and camera state are internal control/geometry inputs; this is not a pixel-only vision model.'],
});
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const intersects = (p, radius = 0) => p.x + radius >= 0 && p.x - radius <= 1280 && p.y + radius >= 0 && p.y - radius <= 720;
const choices = [0, -.55, .55, -1, 1].flatMap(y => [0, -1, 1].map(x => ({ x, y })));

export function createVisibleController(engine, art, relativeMinimumDistance) {
  const { updateGame, worldToScreen, mechaAnchorWorld } = { ...engine, ...art };
  let previous = null, nextDecision = 0, pending = [], current = { x: 0, y: 0 }, decisions = 0;
  let firstForced = null, forced = 0, noSafeForecast = 0;
  const decisionHashRows = [];
  function observation(game) {
    const project = entity => ({ id: entity.id, world: { x: entity.x, y: entity.y }, ...worldToScreen(game, entity), radius: entity.radius || 0 });
    const measured = (entity, prior) => {
      const point = project(entity), old = prior?.get(entity.id), elapsed = game.time - (previous?.time ?? game.time);
      return { ...point, vx: old && elapsed > 0 ? (point.world.x - old.world.x) / elapsed : 0,
        vy: old && elapsed > 0 ? (point.world.y - old.world.y) / elapsed : 0 };
    };
    const bullets = new Map(), bodies = new Map(), pickups = [];
    for (const entity of game.enemyBullets) {
      const point = measured(entity, previous?.bullets);
      if (intersects(point, point.radius)) bullets.set(entity.id, point);
    }
    for (const entity of game.enemies) {
      if (entity.dead) continue;
      const point = measured(entity, previous?.bodies);
      if (!intersects(point, point.radius)) continue;
      point.type = entity.type;
      if (entity.type === 'boss') {
        const spec = art.getMechaSpec(entity);
        const exposed = entity.coreVulnerable && spec?.coreExposed && spec.runtimeCore;
        point.target = exposed ? mechaAnchorWorld(entity, spec.runtimeCore) : point.world;
      }
      bodies.set(entity.id, point);
    }
    for (const entity of game.pickups) {
      const point = project(entity);
      if (intersects(point, point.radius)) pickups.push({ ...point, type: entity.type });
    }
    return { time: game.time, bullets, bodies, pickups };
  }
  function goal(game, seen) {
    const ship = worldToScreen(game, game.player);
    const health = seen.pickups.filter(p => p.type === 'health' && game.player.hp < 85 && p.x < 850).sort((a, b) => a.x - b.x)[0];
    const supply = seen.pickups.filter(p => ['maintain', 'change'].includes(p.type) && p.x < 560).sort((a, b) => Math.hypot(a.x - ship.x, a.y - ship.y) - Math.hypot(b.x - ship.x, b.y - ship.y))[0];
    const boss = [...seen.bodies.values()].find(b => b.type === 'boss');
    const point = health || supply;
    if (point) return { x: clamp(point.x - 70, 120, 340), y: clamp(point.y, 90, 630), reason: point.type };
    if (boss) return { x: 235, y: clamp(worldToScreen(game, boss.target).y, 110, 610), reason: 'visible-boss-alignment' };
    return { x: 225, y: 360, reason: 'central-default' };
  }
  function forecast(game, seen, action, target) {
    // Scrub before simulation: no original entity behavior, future attack state,
    // source sequence, item effect, new spawn or original projectile velocity.
    const model = { ...game, player: { ...game.player, hp: 100, invincible: 0, fireCooldown: Infinity, droneCooldown: Infinity },
      enemies: [], bullets: [], enemyBullets: [], pickups: [], events: [], boss: null,
      nextWaveAt: Infinity, nextBossAt: Infinity, nextPickupAt: Infinity,
      recoverySpawned: true, supply: null, normalTime: 0, phase: 'normal', tensionTime: 0 };
    // Bullet radius/power are declared observation assumptions. Damage magnitude
    // is a danger penalty only and cannot change the original game's damage.
    model.enemyBullets = [...seen.bullets.values()].map(b => ({ id: b.id, sourceId: 0, ...b.world,
      vx: b.vx, vy: b.vy, radius: b.radius, power: 12, age: 0, arming: 0 }));
    let pressure = 0, minimum = 160, bodyPressure = 0;
    for (let elapsed = 0; elapsed < CONTROLLER_POLICY.forecastSeconds - 1e-8; elapsed += CONTROLLER_POLICY.forecastStep) {
      const queued = pending.filter(row => row.at <= game.time + elapsed + 1e-9).at(-1)?.input || current;
      updateGame(model, CONTROLLER_POLICY.forecastStep, { ...(elapsed < CONTROLLER_POLICY.reactionSeconds ? queued : action), shoot: false });
      if (model.mode === 'gameover') break;
      for (const bullet of model.enemyBullets) {
        const margin = Math.hypot(bullet.x - model.player.x, bullet.y - model.player.y) - bullet.radius - model.player.radius;
        minimum = Math.min(minimum, margin);
        pressure += Math.max(0, 22 - margin);
      }
      for (const body of seen.bodies.values()) {
        const margin = Math.hypot(body.world.x + body.vx * elapsed - model.player.x,
          body.world.y + body.vy * elapsed - model.player.y) - body.radius - model.player.radius;
        bodyPressure += Math.max(0, 32 - margin);
      }
      model.events = [];
    }
    const screen = worldToScreen(model, model.player), damage = 100 - model.player.hp;
    const score = -damage * 10000 - pressure * 6 - bodyPressure * 15 + Math.min(minimum, 50)
      - Math.abs(screen.y - target.y) * .18 - Math.abs(screen.x - target.x) * .09
      - (action.x === current.x && action.y === current.y ? 0 : .5);
    return { score, damage, pressure, bodyPressure, minimum };
  }
  function choose(game, seen) {
    const target = goal(game, seen), ship = worldToScreen(game, game.player);
    const ordinary = { x: clamp((target.x - ship.x) / 90, -1, 1), y: clamp((target.y - ship.y) / 100, -1, 1) };
    const candidates = [...choices, ordinary];
    let selected = candidates[0], best = null;
    for (const candidate of candidates) {
      const result = forecast(game, seen, candidate, target);
      if (!best || result.score > best.score) { best = result; selected = candidate; }
    }
    const stationary = forecast(game, seen, { x: 0, y: 0 }, target);
    const force = stationary.damage > 0 && best.damage < stationary.damage;
    if (force) { forced++; firstForced ??= game.time; }
    if (best.damage > 0) noSafeForecast++;
    decisions++;
    decisionHashRows.push([Math.round(game.time * 120), +selected.x.toFixed(5), +selected.y.toFixed(5)]);
    return { input: selected, force, targetReason: target.reason };
  }
  return {
    input(game) {
      if (game.mode === 'playing' && game.time >= nextDecision - 1e-8) {
        const seen = observation(game), selected = choose(game, seen);
        pending.push({ at: game.time + CONTROLLER_POLICY.reactionSeconds, input: selected.input });
        previous = seen; nextDecision += CONTROLLER_POLICY.decisionSeconds;
      }
      while (pending.length && pending[0].at <= game.time + 1e-8) current = pending.shift().input;
      return { ...current, shoot: true };
    },
    summary() { return { decisions, forcedDecisionCount: forced, firstForcedDecisionAt: firstForced,
      noSafeCurrentBulletForecastDecisions: noSafeForecast, decisionHashRows }; },
  };
}
