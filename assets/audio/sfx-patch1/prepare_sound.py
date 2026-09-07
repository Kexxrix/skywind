"""Reproducibly edit supplied candidates into one-event local SkyWind SFX.

Requires the existing FFmpeg executable and NumPy. Never writes source audio.
All outputs are candidate edits: technical validation is not human listening or
permission to publish. No supplied repeated-fire demo is loaded or copied.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import subprocess
import wave

import numpy as np

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source"
OUTPUT = ROOT / "edited"
RATE = 48000
SOURCE_CACHE = {}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_source(name):
    if name not in SOURCE_CACHE:
        # FFmpeg sniffs the content: some supplied .wav files contain MPEG audio.
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(SOURCE / name),
             "-f", "f32le", "-ac", "1", "-ar", str(RATE), "pipe:1"],
            check=True, capture_output=True,
        )
        SOURCE_CACHE[name] = np.frombuffer(result.stdout, dtype="<f4").astype(np.float64)
    return SOURCE_CACHE[name]


def filtered_crop(name, start, duration, highpass=0, lowpass=0):
    samples = read_source(name)
    first, length = round(start * RATE), round(duration * RATE)
    if first + length > len(samples) + 1:
        raise ValueError(f"Crop outside source: {name}")
    clip = samples[first:first + length].copy()
    # Deterministic one-pole filters; gain staging is applied after editing.
    if highpass:
        a = math.exp(-2 * math.pi * highpass / RATE)
        previous_input = previous_output = 0.0
        for i, current in enumerate(clip):
            previous_output = a * (previous_output + current - previous_input)
            previous_input = current
            clip[i] = previous_output
    if lowpass:
        a = 1.0 - math.exp(-2 * math.pi * lowpass / RATE)
        previous = 0.0
        for i, current in enumerate(clip):
            previous += a * (current - previous)
            clip[i] = previous
    return clip


def envelope(samples, fade_in_ms, fade_out_ms, decay=0, tremolo_hz=0, tremolo_depth=0):
    clip = samples.copy()
    if decay:
        clip *= np.exp(-decay * np.linspace(0, 1, len(clip)))
    if tremolo_hz:
        t = np.arange(len(clip)) / RATE
        clip *= (1 - tremolo_depth) + tremolo_depth * .5 * (1 + np.cos(2 * np.pi * tremolo_hz * t))
    attack = min(len(clip), max(2, round(fade_in_ms * RATE / 1000)))
    release = min(len(clip), max(2, round(fade_out_ms * RATE / 1000)))
    clip[:attack] *= np.sin(np.linspace(0, math.pi / 2, attack)) ** 2
    clip[-release:] *= np.cos(np.linspace(0, math.pi / 2, release)) ** 2
    clip[0] = clip[-1] = 0.0
    return clip


def measure(samples):
    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(samples ** 2)))
    # Spectrum describes the edits and does not identify audible quality.
    weighted = np.abs(np.fft.rfft(samples * np.hanning(len(samples)))) ** 2
    hz = np.fft.rfftfreq(len(samples), 1 / RATE)
    centroid = float(np.sum(hz * weighted) / max(np.sum(weighted), 1e-16))
    return {
        "durationSeconds": round(len(samples) / RATE, 6),
        "peakDbFS": round(20 * math.log10(max(peak, 1e-12)), 3),
        "rmsDbFS": round(20 * math.log10(max(rms, 1e-12)), 3),
        "spectralPowerCentroidHz": round(centroid, 1),
        "dcOffset": round(float(np.mean(samples)), 8),
        "firstSample": float(samples[0]), "lastSample": float(samples[-1]),
        "clippedSamples": int(np.count_nonzero(np.abs(samples) >= 1)),
    }


def create(name, role, layers, peak_db, rms_db=None, fade_in_ms=.75,
           fade_out_ms=12, decay=0, tremolo_hz=0, tremolo_depth=0):
    processed = []
    for layer in layers:
        processed.append(filtered_crop(layer["source"], layer["startSeconds"],
                                       layer["durationSeconds"],
                                       layer.get("highpassHz", 0), layer.get("lowpassHz", 0))
                         * layer.get("mixWeight", 1))
    samples = np.zeros(max(map(len, processed)))
    for layer in processed:
        samples[:len(layer)] += layer
    samples = envelope(samples, fade_in_ms, fade_out_ms, decay, tremolo_hz, tremolo_depth)
    peak = np.max(np.abs(samples))
    gain = 10 ** (peak_db / 20) / peak
    if rms_db is not None:
        gain = min(gain, 10 ** (rms_db / 20) / np.sqrt(np.mean(samples ** 2)))
    samples *= gain
    pcm = np.rint(samples * 32767).astype("<i2")
    with wave.open(str(OUTPUT / name), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(pcm.tobytes())
    measurements = measure(pcm.astype(np.float64) / 32768)
    assert measurements["clippedSamples"] == 0
    assert measurements["firstSample"] == measurements["lastSample"] == 0
    assert measurements["durationSeconds"] < .4
    return {
        "file": f"edited/{name}", "role": role,
        "oneEvent": True, "loop": False,
        "publicationApproved": False, "humanListeningVerified": False,
        "format": {"codec": "PCM signed 16-bit little endian", "channels": 1, "sampleRateHz": RATE},
        "sourceLayers": [dict(layer, sourceSha256=sha(SOURCE / layer["source"])) for layer in layers],
        "envelope": {"fadeInMs": fade_in_ms, "fadeOutMs": fade_out_ms,
                     "exponentialDecay": decay, "tremoloHz": tremolo_hz, "tremoloDepth": tremolo_depth},
        "normalization": {"peakCeilingDbFS": peak_db, "targetRmsDbFS": rms_db,
                          "appliedGainDb": round(20 * math.log10(gain), 5)},
        "sha256": sha(OUTPUT / name), "measurements": measurements,
    }


def layer(source, start, duration, highpass=0, lowpass=0, weight=1):
    return {"source": source, "startSeconds": start, "durationSeconds": duration,
            "highpassHz": highpass, "lowpassHz": lowpass, "mixWeight": weight}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    all_sources_before = {p.name: sha(p) for p in sorted(SOURCE.glob("*.wav"))}
    if len(all_sources_before) != 67:
        raise ValueError(f"Expected 67 unchanged supplied sources, found {len(all_sources_before)}")
    edits = []
    for index in range(1, 4):
        source = f"gun{index}.wav"
        duration = len(read_source(source)) / RATE
        edits.append(create(f"shot-normal-{index:02}.wav", "normal single volley",
                            [layer(source, 0, duration, 100, 11000)], -8, -19.5,
                            fade_in_ms=.35, fade_out_ms=7))
    for index, (source, start) in enumerate([("planegunlight.wav", 0),
                                            ("planegunmedium.wav", .100),
                                            ("planegunheavy.wav", 0)], 1):
        # Extract one <100 ms period, never replay the source's built-in burst.
        edits.append(create(f"shot-spread-{index:02}.wav", "spread single volley",
                            [layer(source, start, .084, 90, 8000)], -8, -19,
                            fade_in_ms=.45, fade_out_ms=14, decay=1.15))
    for index, (source, start, duration) in enumerate([
            ("so_com_hllcrshr_zaps_a.wav", .022, .125),
            ("so_com_hllcrshr_zaps_b.wav", .025, .135),
            ("so_com_hllcrshr_zaps_a.wav", .140, .130)], 1):
        edits.append(create(f"shot-lance-{index:02}.wav", "lance single pulse",
                            [layer(source, start, duration, 800, 11500)], -10, -23,
                            fade_in_ms=.55, fade_out_ms=26, decay=2.3))
    for index, (source, start) in enumerate([
            ("so_com_hllcrshr_zaps_b.wav", .265),
            ("so_com_hllcrshr_zaps_a.wav", .310),
            ("so_com_hllcrshr_zaps_b.wav", .385)], 1):
        edits.append(create(f"shot-helix-{index:02}.wav", "helix single volley",
                            [layer(source, start, .145, 340, 5500)], -10, -23,
                            fade_in_ms=.8, fade_out_ms=30, decay=1.8,
                            tremolo_hz=42, tremolo_depth=.22))
    for index in range(1, 4):
        edits.append(create(f"shot-drone-{index:02}.wav", "drone single volley",
                            [layer(f"gun{index}.wav", 0, .068, 1650, 11000)], -13, -25,
                            fade_in_ms=.35, fade_out_ms=13, decay=1.7))

    hit_weapons = [
        ("normal", layer("gun3.wav", 0, .045, 900, 8000), 3, 0),
        ("spread", layer("planegunheavy.wav", 0, .074, 350, 5200), 3.8, 0),
        ("lance", layer("so_com_hllcrshr_zaps_a.wav", .190, .100, 1600, 11000), 3, 0),
        ("helix", layer("so_com_hllcrshr_zaps_b.wav", .255, .120, 600, 6400), 2.5, 39),
        ("drone", layer("gun2.wav", .005, .045, 2200, 9500), 3.5, 0),
    ]
    for weapon, source, decay, modulation in hit_weapons:
        edits.append(create(f"hit-weapon-{weapon}.wav", f"enemy impact weapon layer: {weapon}",
                            [source], -15, -29, fade_in_ms=.4, fade_out_ms=12,
                            decay=decay, tremolo_hz=modulation, tremolo_depth=.22 if modulation else 0))
    for index, source in enumerate(["planerico1.wav", "planerico3.wav"], 1):
        edits.append(create(f"hit-target-light-{index:02}.wav", "enemy target layer: light aircraft",
                            [layer(source, 0, .175, 420, 8400)], -13, -25,
                            fade_in_ms=.6, fade_out_ms=38, decay=1.6))
    for index in range(1, 4):
        edits.append(create(f"hit-target-armored-{index:02}.wav", "enemy target layer: armored",
                            [layer(f"rico{index}.wav", 0, .180, 250, 5800)], -13, -25,
                            fade_in_ms=.6, fade_out_ms=38, decay=1.8))
    for index, source in enumerate(["so_com_hllcrshr_zaps_a.wav", "so_com_hllcrshr_zaps_b.wav"], 1):
        edits.append(create(f"hit-target-special-{index:02}.wav", "enemy target layer: existing special energy craft",
                            [layer(source, .400 if index == 1 else .390, .110, 1100, 7000)], -13, -25,
                            fade_in_ms=.6, fade_out_ms=28, decay=2.8))
    edits.append(create("player-damage-fixed.wav", "fixed player HP loss cue only",
                        [layer("planemetalscrew.wav", 0, .300, 140, 8400, .68),
                         layer("planerico2.wav", 0, .300, 240, 10000, .42)],
                        -7.5, fade_in_ms=.6, fade_out_ms=62, decay=.35))
    edits.append(create("weapon-change.wav", "weapon acquired or changed once",
                        [layer("so_com_get_boost_a.wav", .025, .360, 120, 10500)],
                        -10.5, fade_in_ms=3, fade_out_ms=90, decay=.7))
    edits.append(create("weapon-expire.wav", "weapon expiry once",
                        [layer("so_com_get_boost_b.wav", .210, .280, 180, 4900)],
                        -11.5, fade_in_ms=2, fade_out_ms=80, decay=2.0))

    all_sources_after = {p.name: sha(p) for p in sorted(SOURCE.glob("*.wav"))}
    assert all_sources_before == all_sources_after
    assert len(edits) == 30
    assert len({entry["sha256"] for entry in edits}) == 30
    manifest = {
        "schemaVersion": 1, "label": "SkyWind patch 1 local candidate sound edits",
        "publicationApproved": False, "licenseStatus": "No license or provenance document supplied; public distribution not approved",
        "humanListeningVerified": False,
        "verificationScope": "Decoded signal, duration, finite samples, envelope endpoints, peak headroom, output hashes and preservation of all 67 original byte streams. Not human sound-quality approval.",
        "method": "One-event crops from supplied originals; deterministic filters and envelope; float decode before gain staging; mono PCM16 48000 Hz. No demo files, loops or gameplay timing changes.",
        "generator": "prepare_sound.py", "generatorSha256": sha(Path(__file__)),
        "sourceRootRelativeToDesignArchive": "audio/original",
        "sourceRootRelativeToGenerator": "source", "rightsEvidence": "",
        "originalFilesVerifiedUnchanged": 67, "originalHashes": all_sources_before,
        "editedCount": len(edits), "edits": edits,
    }
    (ROOT / "provenance.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# SkyWind 패치 1 사운드 편집 근거", "",
             "원본 67개는 수정하지 않았습니다. 아래 30개는 각각 한 발사·명중·알림 이벤트이며, 연사 데모나 원본 반복 구간 전체를 재생하지 않습니다.", "",
             "**청음 미검증 / 공개 배포 권한 미확인.** 표는 기술 측정값이며 타격감·음질·재질 의미의 승인을 뜻하지 않습니다.", "",
             "편집본은 모노 PCM16 48 kHz입니다. 시작/끝 샘플은 모두 0, 클리핑 샘플은 0입니다. 무기별 소리는 소스·편집 구간·주파수 필터·엔벌로프로 구분하며 피치만 바꾼 파일이 아닙니다.", "",
             "`player-damage-fixed.wav`에만 planemetalscrew와 planerico2를 사용했습니다. 고정 재생속도·중앙 패닝·고정 gain은 런타임에서 유지해야 합니다. 폭발·적 발사·음악은 이 제작에 포함하지 않았습니다.", "",
             "| 편집본 | 원본 구간(초) | 길이 ms | Peak dBFS | RMS dBFS |", "|---|---|---:|---:|---:|"]
    for entry in edits:
        sources = " + ".join(f"{s['source']} {s['startSeconds']:.3f}–{s['startSeconds'] + s['durationSeconds']:.3f}" for s in entry["sourceLayers"])
        m = entry["measurements"]
        lines.append(f"| `{entry['file']}` | {sources} | {m['durationSeconds'] * 1000:.2f} | {m['peakDbFS']:.2f} | {m['rmsDbFS']:.2f} |")
    lines += ["", "재현: 이 스크립트 옆 `source/`의 보존 원본 67개를 입력으로 `python prepare_sound.py`를 실행하면 `edited/`와 `provenance.json`을 생성합니다. 상세 source/output SHA-256, trim, 필터, envelope, gain은 `provenance.json`에 있습니다.",
              "", "남은 조정: 실제 혼합 청음으로 샘플 계열감, 무기·대상 구분, 반복 피로도와 UI 큐 의미를 평가해야 합니다. 소스 간 peak와 RMS를 기술적으로 제한했지만 청감 음량의 일치를 주장하지 않습니다."]
    (ROOT / "SOUND_EDIT_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"editedCount": len(edits), "originalsUnchanged": len(all_sources_before),
                      "totalBytes": sum((OUTPUT / Path(e["file"]).name).stat().st_size for e in edits),
                      "maxPeakDbFS": max(e["measurements"]["peakDbFS"] for e in edits),
                      "maxDurationSeconds": max(e["measurements"]["durationSeconds"] for e in edits)}, indent=2))


if __name__ == "__main__":
    main()
