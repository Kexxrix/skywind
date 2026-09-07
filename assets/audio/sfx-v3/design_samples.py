"""Rebuild SkyWind V3 sample designs from preserved CC0 source recordings.

Requires local ffmpeg and numpy; these are authoring tools, not game dependencies.
Run from this folder or from the repository root. All output stays beside this file.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import wave
import numpy as np

BASE = Path(__file__).resolve().parent
SR = 44100
cache = {}
recipes = []


def read(path):
    if path not in cache:
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(BASE / 'source' / path),
                                       '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'])
        cache[path] = np.frombuffer(raw, dtype='<f4').copy()
    return cache[path].copy()


def layer(path, gain=1, rate=1, duration=None, start=0, high=0, low=0, onset=False):
    x = read(path)[round(start * SR):]
    if onset:
        first = np.flatnonzero(abs(x[:round(.1 * SR)]) > .06)
        if len(first):
            x = x[max(0, first[0] - 32):]
    if rate != 1:
        x = np.interp(np.arange(0, len(x), rate), np.arange(len(x)), x)
    if duration:
        x = x[:round(duration * SR)]
    filters = []
    if high:
        filters.append(f'highpass=f={high}')
    if low:
        filters.append(f'lowpass=f={low}')
    if filters:
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR),
                                       '-ac', '1', '-i', '-', '-af', ','.join(filters),
                                       '-f', 'f32le', '-'], input=x.astype('<f4').tobytes())
        x = np.frombuffer(raw, dtype='<f4').copy()
    x /= max(.001, float(np.max(abs(x))))
    # Preserve the recorded crack; remove only edge discontinuities and long source ambience.
    attack = min(16, len(x))
    release = min(round(.025 * SR), len(x) // 3)
    x[:attack] *= np.linspace(0, 1, attack)
    x[-release:] *= np.linspace(1, 0, release) ** 2
    return x * gain


def save(name, parts, description):
    size = max(round(delay * SR) + len(x) for x, delay in parts)
    out = np.zeros(size, dtype=np.float32)
    for x, delay in parts:
        at = round(delay * SR)
        out[at:at + len(x)] += x
    out -= float(np.mean(out))
    out *= .84 / max(.001, float(np.max(abs(out))))
    out[-min(441, len(out)):] *= np.linspace(1, 0, min(441, len(out)))
    path = BASE / f'{name}.wav'
    with wave.open(str(path), 'wb') as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(SR)
        file.writeframes((np.clip(out, -1, 1) * 32767).astype('<i2').tobytes())
    active = np.flatnonzero(abs(out) > .01)
    spectrum = abs(np.fft.rfft(out)) ** 2
    frequencies = np.fft.rfftfreq(len(out), 1 / SR)
    recipes.append({'file': path.name, 'design': description, 'seconds': round(len(out) / SR, 4),
                    'peak': round(float(max(abs(out))), 4),
                    'rms': round(float(np.sqrt(np.mean(out * out))), 5),
                    'onset_ms': round(float(active[0] / SR * 1000), 3),
                    'energy_below_250hz': round(float(sum(spectrum[frequencies < 250]) / sum(spectrum)), 4),
                    'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return out


def sci(name, **kwargs):
    return layer('sci-fi/Audio/' + name + '.ogg', **kwargs)


def impact(name, **kwargs):
    return layer('impact/Audio/' + name + '.ogg', **kwargs)


def gun(index, gain=1, duration=.22, rate=1):
    return layer('firearms/C_28P.wav', start=[.60, 3.24, 6.01, 9.14][index % 4],
                 onset=True, gain=gain, duration=duration, rate=rate, high=90, low=11500)


for i in range(3):
    save(f'shot-0{i + 1}', [(gun(i, .9, .19), 0),
                           (impact(f'impactMetal_heavy_00{i}', gain=.16, rate=1.3, duration=.12), .008),
                           (sci(f'laserSmall_00{i}', gain=.09, rate=1.6, duration=.16, high=800), 0)],
         f'AK-47 near recorded shot {i + 1}; short metal bolt and quiet high-passed energy texture.')

for i in range(2):
    save(f'spread-0{i + 1}', [(gun(i, .82, .24, .94), 0), (gun(i + 2, .2, .18, 1.05), .014),
                             (sci(f'laserLarge_00{i}', gain=.16, rate=1.5, duration=.25, high=600), 0),
                             (impact(f'impactPunch_heavy_00{i}', gain=.23, rate=1.25, duration=.17, low=650), .008)],
         f'Spread: two recorded cracks 14 ms apart, impact body, restrained energy layer; variation {i + 1}.')
    save(f'lance-0{i + 1}', [(layer('firearms/D_32P.wav', start=[.69, 5.63][i], onset=True,
                                  gain=.9, duration=.31, rate=.86, high=70, low=10500), 0),
                            (sci(f'laserLarge_00{i + 2}', gain=.19, rate=1.1, duration=.38, high=900), .006),
                            (impact(f'impactPlate_heavy_00{i}', gain=.17, rate=.85, duration=.27, low=2000), .015)],
         f'Lance: AR-15 near recorded crack {i + 1}, slower resonant plate and longer energy tail.')
    save(f'helix-0{i + 1}', [(gun(i + 1, .82, .2, 1.12), 0),
                            (sci(f'laserSmall_00{i + 2}', gain=.17, rate=1.32, duration=.27, high=1000), 0),
                            (impact(f'impactMetal_heavy_00{i + 3}', gain=.22, rate=1.5, duration=.13), .028)],
         f'Helix: fast rifle transient with double metallic texture; variation {i + 1}.')
    save(f'enemy-0{i + 1}', [(sci(f'laserSmall_00{i + 3}', gain=.45, rate=.78, duration=.26, low=5500), 0),
                            (impact(f'impactPunch_heavy_00{i + 2}', gain=.65, duration=.18, rate=1.25, low=1500), 0)],
         f'Enemy pulse: lower, softer energy/foley body kept distinct from player weapon; variation {i + 1}.')

for i in range(3):
    save(f'hit-0{i + 1}', [(impact(f'impactMetal_heavy_00{i}', gain=.9, duration=.15, rate=1.18, high=500), 0),
                          (sci(f'impactMetal_00{i}', gain=.24, duration=.18, rate=1.25, high=700), .004)],
         f'Armor hit: recorded metal contact with short metallic resonance; variation {i + 1}.')

save('player-hit', [(impact('impactPlate_heavy_003', gain=.75, rate=.8), 0),
                    (sci('explosionCrunch_000', gain=.38, duration=.43, low=3600), .006),
                    (impact('impactGlass_medium_002', gain=.17, duration=.45, high=1800), .065)],
     'Player damage: heavy hull contact, muffled rupture, delayed glass flecks.')

for i in range(3):
    save(f'explosion-0{i + 1}', [(sci(f'explosionCrunch_00{i}', gain=.74, rate=[.92, 1.09, .95][i], duration=1.25, high=100), 0),
                                (sci('lowFrequency_explosion_001', gain=.28, low=220, duration=1.15, rate=.9), .016),
                                (gun(i, .27, .14, .86), 0),
                                (impact(f'impactPlate_heavy_00{i + 1}', gain=.17, rate=.8, high=600), .07),
                                (impact(f'impactGlass_medium_00{i}', gain=.12, rate=.94, high=2200), .15)],
         f'Explosion: Kenney crunch {i}, recorded gun transient, filtered low blast, offset hull/debris textures.')

save('explosion-heavy', [(sci('explosionCrunch_004', gain=.8, rate=.88, high=180), 0),
                         (sci('lowFrequency_explosion_000', gain=.27, rate=.92, low=220), .018),
                         (gun(3, .36, .22, .72), 0),
                         (sci('explosionCrunch_002', gain=.28, rate=.75, high=450, low=4400), .16),
                         (impact('impactPlate_heavy_004', gain=.22, rate=.72, high=350), .21),
                         (impact('impactGlass_medium_003', gain=.15, rate=.7, high=1700), .39)],
     'Boss/player destruction: filtered long crunch, recorded gun transient and low blast, staggered secondary rupture/fragments.')
save('charge', [(sci('forceField_002', gain=.7, rate=1.7, duration=.55, high=220, low=7800), 0),
                (impact('impactMetal_light_002', gain=.17, rate=1.5, duration=.2), .18)],
     'Pickup equipment energize: compact field sample plus mechanical latch; UI note motif stays separate.')

(BASE / 'sample-analysis.json').write_text(json.dumps(recipes, indent=2), encoding='utf8')
audition = []
for name in ['shot-01', 'shot-02', 'shot-03', 'spread-01', 'lance-01', 'helix-01',
             'enemy-01', 'hit-01', 'player-hit', 'explosion-01', 'explosion-heavy', 'charge']:
    with wave.open(str(BASE / (name + '.wav')), 'rb') as file:
        x = np.frombuffer(file.readframes(file.getnframes()), dtype='<i2').astype(np.float32) / 32768
    audition += [x * .6, np.zeros(round(.4 * SR))]
with wave.open(str(BASE / 'audition.wav'), 'wb') as file:
    file.setnchannels(1)
    file.setsampwidth(2)
    file.setframerate(SR)
    file.writeframes((np.concatenate(audition) * 32767).astype('<i2').tobytes())
print(json.dumps({'samples': len(recipes), 'playback_bytes': sum((BASE / r['file']).stat().st_size for r in recipes),
                  'max_peak': max(r['peak'] for r in recipes), 'max_onset_ms': max(r['onset_ms'] for r in recipes)}))
