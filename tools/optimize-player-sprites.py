"""Rebuild SV-01 runtime WebP derivatives without altering the approved PNGs.

Requires Python and Pillow with WebP support, only when regenerating artwork.
The game itself has no Python or Pillow dependency.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, features


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/art/player/sv01"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def resize_rgba(image, size):
    # Resize premultiplied colors so transparent RGB cannot tint the outline.
    return image.convert("RGBa").resize(
        (size, size), Image.Resampling.LANCZOS
    ).convert("RGBA")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--size", type=int, choices=(128, 160, 192), default=192)
    parser.add_argument("--output", type=Path, default=SOURCE / "webp")
    parser.add_argument("--report", type=Path,
                        default=ROOT / ".work/sv01-webp-qa/asset-results.json")
    args = parser.parse_args()
    if not features.check("webp"):
        raise RuntimeError("Pillow must include WebP support")
    manifest_bytes = (SOURCE / "source-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    args.output.mkdir(parents=True, exist_ok=True)
    records = []
    for frame in manifest["frames"]:
        source = SOURCE / frame["filename"]
        original = source.read_bytes()
        if sha256(original) != frame["sha256"]:
            raise RuntimeError(f"Approved source hash changed: {source.name}")
        with Image.open(source) as image:
            image.load()
            if image.mode != "RGBA" or image.size != (256, 256):
                raise RuntimeError(f"Unexpected source dimensions/mode: {source.name}")
            resized = resize_rgba(image, args.size)
        encoded = io.BytesIO()
        resized.save(encoded, format="WEBP", lossless=True, quality=100,
                     method=6, exact=True)
        output_bytes = encoded.getvalue()
        with Image.open(io.BytesIO(output_bytes)) as decoded:
            if decoded.convert("RGBA").tobytes() != resized.tobytes():
                raise RuntimeError(f"Lossless round-trip failed: {source.name}")
        output = args.output / f"{source.stem}.webp"
        output.write_bytes(output_bytes)
        records.append({
            "frame_index": frame["frame_index"],
            "source": source.relative_to(ROOT).as_posix(),
            "source_sha256": sha256(original),
            "source_bytes": len(original),
            "filename": output.name,
            "sha256": sha256(output_bytes),
            "bytes": len(output_bytes),
            "width": args.size,
            "height": args.size,
            "pivot_x": frame["pivot_x"] * args.size / frame["width"],
            "pivot_y": frame["pivot_y"] * args.size / frame["height"],
            "alpha_bbox": resized.getchannel("A").getbbox(),
            "lossless_round_trip": True,
        })
    source_bytes = sum(frame["source_bytes"] for frame in records)
    output_bytes = sum(frame["bytes"] for frame in records)
    report = {
        "source_manifest_sha256": sha256(manifest_bytes),
        "format": "lossless WebP RGBA",
        "resize": "Pillow premultiplied-alpha RGBa Lanczos; no crop or recenter",
        "frame_count": len(records),
        "size": [args.size, args.size],
        "pivot_normalized": manifest["pivot_normalized"],
        "display_size_game_units": manifest["display_size_game_units"],
        "source_total_bytes": source_bytes,
        "output_total_bytes": output_bytes,
        "transfer_reduction_percent": (1 - output_bytes / source_bytes) * 100,
        "source_decoded_rgba_bytes": len(records) * 256 * 256 * 4,
        "output_decoded_rgba_bytes": len(records) * args.size * args.size * 4,
        "frames": records,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "frames"}))


if __name__ == "__main__":
    main()
