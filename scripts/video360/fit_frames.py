#!/usr/bin/env python3
"""
360 athlete video, step 1 of 2 (see make_360_video.sh and README.md).

raw video + marks.json  ->  out/fit/%05d.png       RGBA, one transform for the whole turn,
                                                    even angle steps, exactly one turn
                            out/keyframes/NNN.webp 72 frames, every 5 degrees
                            out/contact.jpg        36 poses (every 10 degrees) to check by eye
                            out/meta.json

marks.json: from the studio timeline ("Download marks (JSON)"), times in seconds:
  {"start": 0.2, "front": 0.2, "right": 1.13, "back": 3.73, "left": 5.6, "end": 7.67,
   "stills": [{"from": 2.33, "to": 3.6}]}
Front = 0, Right = 90, Back = 180, Left = 270, end = 360 degrees. Time inside "stills" counts as
no rotation.

Env (all optional):
  TURN_SEC=24         length of one turn in the output (s)
  FPS=30              output frame rate
  CANVAS=714x1680     output size (about 1.5x the current frames: sharp on Retina / DPR 3)
  SPEED=motion        motion: inside each quarter the angle follows the measured movement, so a
                      turn that speeds up and slows down (common in AI video) still gives even
                      steps; linear: constant speed between two marks
  DEDUPE=1            drop repeated frames (AI video and 24->30 fps conversions repeat frames)
  INTERP=0            make in-between frames before cutting out: 2, 3, 4 = that many times the
                      frame rate (ffmpeg motion interpolation; check contact.jpg, it can warp
                      hands and feet). For short AI clips with too few poses.
  FIT=set             set: one transform for the whole turn (feet stay put when the camera does);
                      frame: fit every frame on its own (camera that zooms or drifts, as AI video
                      can: feet stay on the line, the size may pulse slightly)
  BG=rembg            rembg (AI background removal) or colorkey (test only: keys out white)
  REMBG_MODEL=birefnet-general-lite   ("birefnet-general" is sharper but downloads ~1 GB and needs
                      much more memory)
"""
import json, os, re, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
from PIL import Image

FIT_TOP, FIT_TOE, FIT_CX = 0.066, 0.964, 0.5  # same as VIDEO_360.fit in lib/config.ts
ANCHORS = (("front", 0), ("right", 90), ("back", 180), ("left", 270), ("end", 360))


def env(name, default):
    return os.environ.get(name, default)


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def source_fps(raw):
    """The video's own frame rate (every source frame sampled once, no duplicates)."""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", raw], stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True).stderr
    m = re.search(r"(\d+(?:\.\d+)?) fps", err)
    return float(m.group(1)) if m else 30.0


def grey_small(path, w=96):
    im = Image.open(path).convert("L")
    return np.asarray(im.resize((w, max(1, round(w * im.height / im.width))))).astype(np.float32)


def in_still(t, stills):
    return any(s["from"] <= t < s["to"] for s in stills)


def angles_for(times, frames, marks, speed):
    """Angle (deg) of every kept source frame, from the marks (+ measured movement)."""
    stills = marks.get("stills", [])
    motion = [0.0] * len(times)
    if speed == "motion":
        prev = None
        for i, f in enumerate(frames):
            g = grey_small(f)
            motion[i] = 0.0 if prev is None or in_still(times[i], stills) else float(np.abs(g - prev).mean())
            prev = g
    out = []
    for i, t in enumerate(times):
        if t <= marks["front"]:
            out.append(0.0)
            continue
        for (k0, a0), (k1, a1) in zip(ANCHORS, ANCHORS[1:]):
            t0, t1 = marks[k0], marks[k1]
            if t <= t1 or k1 == "end":
                idx = [j for j, tj in enumerate(times) if t0 < tj <= t1]
                if speed == "motion" and idx and sum(motion[j] for j in idx) > 0:
                    done = sum(motion[j] for j in idx if times[j] <= t)
                    frac = done / sum(motion[j] for j in idx)
                else:
                    span = sum(1 for j in idx if not in_still(times[j], stills)) or 1
                    frac = sum(1 for j in idx if times[j] <= t and not in_still(times[j], stills)) / span
                out.append(a0 + (a1 - a0) * min(1.0, frac))
                break
    return out


def cut_out(paths, dst):
    dst.mkdir(parents=True, exist_ok=True)
    if env("BG", "rembg") == "colorkey":
        for p in paths:
            im = np.asarray(Image.open(p).convert("RGB")).astype(np.int16)
            a = np.clip((np.abs(im - 244).sum(axis=2) - 40) * 4, 0, 255).astype(np.uint8)
            Image.fromarray(np.dstack([im.astype(np.uint8), a]), "RGBA").save(dst / p.name)
        return
    from rembg import new_session, remove  # pip install "rembg[cli]"

    session = new_session(env("REMBG_MODEL", "birefnet-general-lite"))
    for i, p in enumerate(paths):
        remove(Image.open(p), session=session).save(dst / p.name)
        print(f"  background removed {i + 1}/{len(paths)}", end="\r", flush=True)
    print()


def body_box(rgba):
    """Top, sole line and sole centre of the body (fractions of the frame), or None."""
    a = np.asarray(rgba)[:, :, 3] > 128
    rows = np.where(a.any(axis=1))[0]
    if len(rows) == 0:
        return None
    top, toe = rows[0], rows[-1]
    band = a[max(top, toe - max(2, (toe - top) // 30)) : toe + 1]
    xs = np.where(band.any(axis=0))[0]
    h, w = a.shape
    return top / h, toe / h, (xs[0] + xs[-1]) / 2 / w


def fit_one(im, box, cw, ch):
    top, toe, cx = box
    sw, sh = im.size
    k = ((FIT_TOE - FIT_TOP) * ch) / ((toe - top) * sh)
    x, y = FIT_CX * cw - cx * sw * k, FIT_TOE * ch - toe * sh * k
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    small = im.resize((max(1, round(sw * k)), max(1, round(sh * k))), Image.LANCZOS)
    canvas.paste(small, (round(x), round(y)), small)
    return canvas


def main():
    raw, marks_path, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    turn_sec, fps = float(env("TURN_SEC", "24")), int(env("FPS", "30"))
    cw, ch = (int(v) for v in env("CANVAS", "714x1680").split("x"))
    speed, fit_mode, interp = env("SPEED", "motion"), env("FIT", "set"), int(env("INTERP", "0"))
    marks = json.load(open(marks_path))
    order = [marks[k] for k in ("start", "front", "right", "back", "left", "end")]
    assert all(a <= b for a, b in zip(order, order[1:])) and marks["front"] < marks["end"], "marks out of order"

    tmp = Path(tempfile.mkdtemp())
    src = tmp / "src"
    src.mkdir()
    sfps = source_fps(raw)
    vf = f"fps={sfps}"
    if interp > 1:  # in-between frames, before the cutout (the AI model sees whole pictures)
        sfps *= interp
        vf = f"minterpolate=fps={sfps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
    t0 = marks["front"]
    run(["ffmpeg", "-y", "-ss", f"{t0:.3f}", "-to", f"{marks['end']:.3f}", "-i", raw, "-vf", vf, "-an", str(src / "%05d.png")])
    files = sorted(src.glob("*.png"))
    times = [t0 + i / sfps for i in range(len(files))]

    # Repeated frames (AI video, frame-rate conversions): keep the first of each run.
    dropped = 0
    if env("DEDUPE", "1") == "1" and files:
        keep, prev = [0], grey_small(files[0])
        for i in range(1, len(files)):
            g = grey_small(files[i])
            if float(np.abs(g - prev).mean()) >= 0.35:
                keep.append(i)
            prev = g
        dropped = len(files) - len(keep)
        files, times = [files[i] for i in keep], [times[i] for i in keep]

    angles = angles_for(times, files, marks, speed)
    n = int(round(turn_sec * fps))
    pick, j = [], 0
    for k in range(n):  # one output frame per 360/n degrees; frame n would be frame 0 again
        target = 360.0 * k / n
        while j < len(files) - 1 and abs(angles[j + 1] - target) <= abs(angles[j] - target):
            j += 1
        pick.append(j)
    unique = sorted(set(pick))
    print(f"source: {len(files)} distinct frames at {sfps:g} fps ({dropped} repeated frames dropped); "
          f"output {n} frames ({360 / n:.2f} deg each) from {len(unique)} distinct poses; speed={speed}, fit={fit_mode}")
    if len(unique) < 0.6 * n:
        print(f"WARNING: only {len(unique)} distinct poses for {n} output frames: the turn will step. "
              f"Use a slower / longer turn, lower TURN_SEC, or INTERP=2..4.")

    cut = tmp / "cut"
    cut_out([files[i] for i in unique], cut)
    boxes = {i: body_box(Image.open(cut / files[i].name)) for i in unique}
    good = [b for b in boxes.values() if b]
    heights = [b[1] - b[0] for b in good]
    med = tuple(float(np.median([b[k] for b in good])) for k in range(3))
    spread = (np.percentile(heights, 95) - np.percentile(heights, 5)) / float(np.median(heights))
    print(f"body height across the turn varies {spread * 100:.1f}%"
          + ("  <- WARNING: the camera zooms or drifts; consider FIT=frame" if spread > 0.04 and fit_mode == "set" else ""))

    fit, kf = out / "fit", out / "keyframes"
    fit.mkdir(parents=True, exist_ok=True)
    kf.mkdir(parents=True, exist_ok=True)
    colours, done = {}, {}
    for k, i in enumerate(pick):
        if i not in done:
            im = Image.open(cut / files[i].name).convert("RGBA")
            done = {i: fit_one(im, (boxes[i] or med) if fit_mode == "frame" else med, cw, ch)}
            px = np.asarray(done[i])
            body = px[:, :, 3] > 128
            colours[i] = px[:, :, :3][body].mean(axis=0) if body.any() else np.zeros(3)
        done[i].save(fit / f"{k:05d}.png")

    keyframes = []
    for q in range(72):
        name = f"{q * 5:03d}.webp"
        Image.open(fit / f"{round(q * n / 72) % n:05d}.png").save(kf / name, "WEBP", quality=88, method=6)
        keyframes.append(name)

    # Checks: sole line, loop seam, colour consistency (AI video can change clothes / hair at the back).
    def small(k):
        return np.asarray(Image.open(fit / f"{k:05d}.png").convert("RGBA").resize((cw // 6, ch // 6))).astype(np.int16)

    soles = []
    for k in range(0, n, max(1, n // 72)):
        a = np.asarray(Image.open(fit / f"{k:05d}.png"))[:, :, 3] > 128
        rows = np.where(a.any(axis=1))[0]
        if len(rows):
            soles.append(int(rows[-1]))
    steps = [x for x in (float(np.abs(small(k) - small(k + 1)).mean()) for k in range(0, n - 1, max(1, n // 30))) if x > 0.01] or [0.0]
    seam = float(np.abs(small(n - 1) - small(0)).mean())
    cmed = np.median(np.array(list(colours.values())), axis=0)
    odd = sorted({round(angles[i]) for i, c in colours.items() if np.abs(c - cmed).max() > 18})
    print(f"check sole line: target {FIT_TOE * ch:.0f} px, frames p5..p95 {np.percentile(soles, 5):.0f}..{np.percentile(soles, 95):.0f} px")
    print(f"check loop seam: {seam:.2f} vs ordinary step {float(np.median(steps)):.2f}"
          + ("  <- WARNING: visible jump; move the 'end' mark a few frames and run again" if seam > 1.5 * float(np.median(steps)) else "  OK"))
    print("check colours: " + (f"WARNING: body colour differs at about {odd[:12]} deg (clothes / hair changing?) - see contact.jpg" if odd else "consistent"))

    # Contact sheet: 36 poses, every 10 degrees, to check face / clothes / feet by eye.
    tw, th = 120, round(120 * ch / cw)
    sheet = Image.new("RGB", (tw * 12, th * 3), (40, 12, 24))
    for q in range(36):
        im = Image.open(fit / f"{round(q * n / 36) % n:05d}.png").resize((tw, th))
        sheet.paste(im, ((q % 12) * tw, (q // 12) * th), im)
    sheet.save(out / "contact.jpg", quality=85)

    json.dump({"fps": fps, "frames": n, "duration": n / fps, "canvas": [cw, ch], "degPerFrame": 360 / n,
               "keyframes": keyframes, "keyframeDeg": 5, "distinctPoses": len(unique), "speed": speed,
               "fit": fit_mode, "interp": interp, "marks": marks}, open(out / "meta.json", "w"), indent=2)
    print(f"done: {fit}/ ({n} PNG), {kf}/ (72 WebP), {out / 'contact.jpg'}, {out / 'meta.json'}")


if __name__ == "__main__":
    main()
