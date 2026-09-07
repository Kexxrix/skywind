// Presentation timers use their own random source and never consume the game RNG.
// Durations are seconds; shake amplitudes are displayed CSS pixels.
export const PILOT_UI_CONFIG = Object.freeze({
  BLINK_MIN: 3,
  BLINK_MAX: 6,
  BLINK_DURATION: 0.11,
  LOW_HP_THRESHOLD: 0.25,
  HIT_DURATION: 0.76,
  IMPACT_DURATION: 0.22,
  SHAKE_DURATION: 0.42,
  SHAKE_IMPACT_DURATION: 0.12,
  SHAKE_TAIL_STRENGTH: 0.4,
  SHAKE_AMPLITUDE_X: 10,
  SHAKE_AMPLITUDE_Y: 6,
  SHAKE_FREQUENCY_X: 50,
  SHAKE_FREQUENCY_Y: 67,
  SHAKE_PHASE_Y: 0.7,
  SCAN_PERIOD: 2.2,
  REDUCED_HIT_OPACITY: 0.72,
  REDUCED_LOW_HP_OPACITY: 0.62,
  REDUCED_POWERUP_OPACITY: 0.44,
  REDUCED_HIT_TINT_OPACITY: 0.44,
  REDUCED_LOW_HP_TINT_OPACITY: 0.32,
  REDUCED_POWERUP_TINT_OPACITY: 0.16,
  POWERUP_PULSE_PERIOD: 1.8,
  LOW_HP_PULSE_MIN: 0.75,
  LOW_HP_PULSE_MAX: 1.6,
  POWERUP_OPACITY_MIN: 0.34,
  POWERUP_OPACITY_MAX: 0.82,
  LOW_HP_OPACITY_MIN: 0.4,
  LOW_HP_OPACITY_MAX: 1,
  HIT_OPACITY_MIN: 0.36,
  HIT_OPACITY_MAX: 1,
  POWERUP_TINT_MIN: 0.09,
  POWERUP_TINT_MAX: 0.22,
  LOW_HP_TINT_MIN: 0.2,
  LOW_HP_TINT_MAX: 0.56,
  HIT_TINT_MIN: 0.2,
  HIT_TINT_MAX: 0.74,
  HIT_PULSE_PERIOD: 0.3,
  HIT_PULSE_COUNT: 2,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const config = PILOT_UI_CONFIG;

function scheduleBlink(state) {
  state.blink = false;
  state.blinkRemaining = 0;
  state.blinkWait = config.BLINK_MIN + clamp(state.random(), 0, 1) * (config.BLINK_MAX - config.BLINK_MIN);
}

export function resetPilotState(state) {
  Object.assign(state, {
    mode: 'normal', image: 'normal', time: 0, phase: 0, pulsePhase: 0,
    hitAge: Infinity, hitRemaining: 0, hpRatio: 1,
    shakeX: 0, shakeY: 0, overlayOpacity: 0, tintOpacity: 0, impact: 0, warningPeriod: 0,
  });
  scheduleBlink(state);
  return state;
}

export function createPilotState(random = Math.random) {
  return resetPilotState({ random });
}

function advanceBlink(state, seconds) {
  let remaining = seconds;
  while (remaining > 0) {
    const timer = state.blink ? state.blinkRemaining : state.blinkWait;
    // The tolerance keeps a frame landing on a deadline equivalent to one big step.
    if (remaining + 1e-9 < timer) {
      if (state.blink) state.blinkRemaining -= remaining;
      else state.blinkWait -= remaining;
      return;
    }
    remaining = Math.max(0, remaining - timer);
    if (state.blink) scheduleBlink(state);
    else {
      state.blink = true;
      state.blinkWait = 0;
      state.blinkRemaining = config.BLINK_DURATION;
    }
  }
}

export function updatePilotState(state, dtSeconds, player, events = []) {
  const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
  const previousMode = state.mode;
  const previousHitRemaining = state.hitRemaining;
  state.time += dt;
  const hit = events.some(event => event.type === 'hit' && event.player === true && event.damage > 0);
  state.hitAge = hit ? 0 : state.hitAge + dt;
  state.hitRemaining = Math.max(0, config.HIT_DURATION - state.hitAge);
  if (state.hitRemaining < 1e-9) state.hitRemaining = 0;

  const maxHp = Number.isFinite(player.maxHp) && player.maxHp > 0 ? player.maxHp : 1;
  state.hpRatio = clamp(Number.isFinite(player.hp) ? player.hp / maxHp : 1, 0, 1);
  const baseMode = state.hpRatio <= config.LOW_HP_THRESHOLD ? 'low'
    : player.powerTime > 0 || player.droneTime > 0 ? 'powerup' : 'normal';
  state.mode = state.hitRemaining > 0 ? 'hit' : baseMode;

  if (state.mode === 'normal') {
    if (previousMode !== 'normal') scheduleBlink(state);
    // A hit can end partway through a long update. Preserve that remaining time.
    const normalTime = previousMode === 'normal' ? dt
      : previousMode === 'hit' ? Math.max(0, dt - previousHitRemaining) : 0;
    advanceBlink(state, normalTime);
  } else {
    state.blink = false;
    state.blinkRemaining = 0;
    state.blinkWait = 0;
  }
  state.image = state.mode === 'normal' && state.blink ? 'blink' : state.mode;
  state.shakeX = 0;
  state.shakeY = 0;
  state.warningPeriod = 0;
  state.phase = 0;
  state.overlayOpacity = 0;
  state.tintOpacity = 0;
  state.impact = 0;

  if (state.mode === 'hit') {
    state.warningPeriod = config.HIT_PULSE_PERIOD;
    state.phase = (state.hitAge / state.warningPeriod) % 1;
    // Exactly two flashes: an immediate impact and a weaker echo, then no third peak.
    const pulse = state.hitAge < config.HIT_PULSE_PERIOD * (config.HIT_PULSE_COUNT - 0.5)
      ? (1 + Math.cos(state.phase * Math.PI * 2)) / 2 : 0;
    const fade = 1 - state.hitAge / config.HIT_DURATION;
    state.overlayOpacity = config.HIT_OPACITY_MIN + (config.HIT_OPACITY_MAX - config.HIT_OPACITY_MIN) * pulse * fade;
    state.tintOpacity = config.HIT_TINT_MIN + (config.HIT_TINT_MAX - config.HIT_TINT_MIN) * pulse * fade;
    state.impact = Math.max(0, 1 - state.hitAge / config.IMPACT_DURATION) ** 2;
    const shakeFade = state.hitAge < config.SHAKE_IMPACT_DURATION
      ? 1 - (1 - config.SHAKE_TAIL_STRENGTH) * state.hitAge / config.SHAKE_IMPACT_DURATION
      : config.SHAKE_TAIL_STRENGTH * Math.max(0, (config.SHAKE_DURATION - state.hitAge) / (config.SHAKE_DURATION - config.SHAKE_IMPACT_DURATION));
    if (shakeFade > 0) {
      state.shakeX = config.SHAKE_AMPLITUDE_X * shakeFade * Math.cos(state.hitAge * config.SHAKE_FREQUENCY_X);
      state.shakeY = config.SHAKE_AMPLITUDE_Y * shakeFade * Math.sin(state.hitAge * config.SHAKE_FREQUENCY_Y + config.SHAKE_PHASE_Y);
    }
  } else if (state.mode !== 'normal') {
    const low = state.mode === 'low';
    state.warningPeriod = low
      ? config.LOW_HP_PULSE_MIN + (config.LOW_HP_PULSE_MAX - config.LOW_HP_PULSE_MIN) * state.hpRatio / config.LOW_HP_THRESHOLD
      : config.POWERUP_PULSE_PERIOD;
    // Integrate frequency instead of dividing total time by the changing HP period.
    // HP changes can speed the next pulse up without jumping its current brightness.
    const pulseTime = previousMode === 'hit' ? Math.max(0, dt - previousHitRemaining) : dt;
    state.pulsePhase = (state.pulsePhase + pulseTime / state.warningPeriod) % 1;
    state.phase = state.pulsePhase;
    const pulse = (1 - Math.cos(state.phase * Math.PI * 2)) / 2;
    const min = low ? config.LOW_HP_OPACITY_MIN : config.POWERUP_OPACITY_MIN;
    const max = low ? config.LOW_HP_OPACITY_MAX : config.POWERUP_OPACITY_MAX;
    state.overlayOpacity = min + (max - min) * pulse;
    const tintMin = low ? config.LOW_HP_TINT_MIN : config.POWERUP_TINT_MIN;
    const tintMax = low ? config.LOW_HP_TINT_MAX : config.POWERUP_TINT_MAX;
    state.tintOpacity = tintMin + (tintMax - tintMin) * pulse;
  } else state.pulsePhase = 0;
  return state;
}
