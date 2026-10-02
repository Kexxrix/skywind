// Pair only registered seed/policy windows; an unavailable late window stays unavailable.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const argv = process.argv.slice(2), option = (key, fallback = null) => argv.includes(key) ? argv[argv.indexOf(key) + 1] : fallback;
const baselinePath = option('--baseline'), candidatePath = option('--candidate'), output = option('--output');
if (!baselinePath || !candidatePath) throw new Error('Supply exact --baseline and --candidate metrics files.');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')), candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
const samePolicy = JSON.stringify(baseline.controllerPolicy) === JSON.stringify(candidate.controllerPolicy);
const sameSeeds = JSON.stringify(baseline.seeds) === JSON.stringify(candidate.seeds);
const controllerHash = report => report.harnessHashes?.find(row => row.name === 'qa-12h-controller.mjs')?.sha256;
const sameControllerSource = Boolean(controllerHash(baseline) && controllerHash(baseline) === controllerHash(candidate));
const unchanged = baseline.sourceUnchanged && candidate.sourceUnchanged && baseline.harnessUnchanged !== false && candidate.harnessUnchanged !== false;
const invariants = report => report.invariantDeclarations.normalDuration === 45 && report.invariantDeclarations.playerHitRadius === 1.85
  && report.invariantDeclarations.flightControl.horizontalSpeed === 225 && report.invariantDeclarations.flightControl.verticalSpeed === 490;
const invariantPass = invariants(baseline) && invariants(candidate);
const rows = baseline.runs.map(prior => {
  const next = candidate.runs.find(run => run.seed === prior.seed);
  const a = prior.comparisonWindows.find(row => row.start === 360 && row.end === 420);
  const b = next?.comparisonWindows.find(row => row.start === 120 && row.end === 180);
  const available = Boolean(samePolicy && sameControllerSource && sameSeeds && unchanged && invariantPass && next && a?.complete && b?.complete && prior.hpLedger.pass && next.hpLedger.pass);
  return { seed: prior.seed, available, reason: available ? null : [!samePolicy && 'controller-policy-mismatch', !sameControllerSource && 'controller-source-mismatch', !sameSeeds && 'seed-set-mismatch', !unchanged && 'source-or-harness-changed-during-run',
    !invariantPass && 'declared-invariant-mismatch', !next && 'same-seed-candidate-missing', !a?.complete && 'baseline360-420-not-complete', !b?.complete && 'candidate120-180-not-complete',
    !prior.hpLedger.pass && 'baseline-hp-ledger-failed', next && !next.hpLedger.pass && 'candidate-hp-ledger-failed'].filter(Boolean),
    baseline: { until: prior.simulatedUntil, bossesDefeated: prior.bossesDefeated, firstHit: prior.firstHit, window: a },
    candidate: next ? { until: next.simulatedUntil, bossesDefeated: next.bossesDefeated, firstHit: next.firstHit, window: b } : null,
    differences: available ? Object.fromEntries([...new Set([...Object.keys(a.metrics), ...Object.keys(b.metrics)])].map(key => [key,
      Number.isFinite(a.metrics[key]) && Number.isFinite(b.metrics[key]) ? +(b.metrics[key] - a.metrics[key]).toFixed(6) : null])) : null };
});
const report = { at: new Date().toISOString(), schema: 'skywind-12h-paired-window-v1', baselineFile: resolve(baselinePath), candidateFile: resolve(candidatePath),
  baselineSource: baseline.sourceBefore.aggregateSha256, candidateSource: candidate.sourceBefore.aggregateSha256,
  samePolicy, sameControllerSource, sameSeeds, unchanged, invariantPass, rows, allWindowsAvailable: rows.every(row => row.available),
  candidateLifecycle: argv.includes('--candidate-frozen') ? 'caller-declared-frozen-candidate' : 'prototype-hash-stable-within-run-only',
  interpretation: 'Quantitative normal-rule accelerated model observations only. Availability means matched measurements exist; it is not a human7→3 difficulty/fun approval or a complete game/renderer/native-input gate.',
  unavailablePolicySubstitution: false, performanceGate: 'Overall update medians from different progression windows are not an equal-workload renderer/FPS performance comparison.' };
if (output) { mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify(report));
if (!samePolicy || !sameControllerSource || !sameSeeds || !unchanged || !invariantPass) process.exitCode = 1;
