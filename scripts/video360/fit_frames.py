#!/usr/bin/env python3
"""
360 athlete turn, step 1 of 2 (see make_360_video.sh and README.md).

The athlete stands still facing front; the stage camera orbits round her. This makes that
picture sequence from a turn video:
  1. keep only the frames where the athlete STANDS (both feet flat on the floor); frames where
     she steps or lifts a foot are dropped;
  2. fill the gaps (and every in-between angle) with RIFE frame interpolation between the two
     standing frames around them, so every picture is a standing pose;
  3. lock EVERY frame to the same place: sole line, body height and body centre identical;
  4. frame 0 = Front (0 deg), then one full turn back to Front, evenly spaced: frame k shows
     the athlete at 360 * k / n deg, the angle the stage scenery has when it is on screen.

raw video + marks.json  ->  out/fit/%05d.png       RGBA, locked, one turn
                            out/keyframes/NNN.webp 72 frames, every 5 degrees
                            out/contact.jpg        24 poses (every 15 degrees) with guide lines
                            out/feet.json          the soles of every frame (stage shadows)
                            out/meta.json          incl. the lock check (px spread per frame)

marks.json: from the studio timeline ("Download marks (JSON)"), times in seconds:
  {"start": 0.2, "front": 0.2, "right": 1.13, "back": 3.73, "left": 5.6, "end": 7.5,
   "stills": [{"from": 2.33, "to": 3.6}]}
Front = 0, Right = 90, Back = 180, Left = 270, end = 360 degrees. "stills" (no rotation) are
skipped.

Env (all optional):
  TURN_SEC=60          length of one turn in the output (s)
  FPS=24               output frame rate (60 s x 24 = 1440 pictures per turn)
  CANVAS=714x1680      output size
  RIFE_BIN=rife-ncnn-vulkan   RIFE binary (github.com/nihui/rife-ncnn-vulkan); RIFE_MODEL = its
                       model folder (default: rife-v4.6 next to the binary); RIFE_GPU=-1 = CPU
  STEP_TOL=0.006       the sole line moving this much between two frames = a step -> dropped
  LEG_GUARD=1.8        the legs changing this many times more than the upper body (median of
                       three frame pairs) = a step -> dropped
  BG=rembg             rembg (AI background removal) or colorkey (test only: keys out white)
  REMBG_MODEL=birefnet-general-lite   (isnet-general-use is ~10x faster on a CPU, a bit rougher)
"""
import json, os, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

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


def foot_rules():
    import importlib.util
    spec = importlib.util.spec_from_file_location("foot_baseline", Path(__file__).resolve().parent.parent / "foot-baseline.py")
    fb = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fb)
    return fb


def write_feet(fb, fit, n, dst):
    """feet.json: {"v": 4, "frames": n, "feet": [[toe, [[x0, x1, b], ...]], ...]} per output frame,
    fractions of the frame (= the stage box). See scripts/foot-baseline.py for the rules."""
    r = lambda v: round(v, 4)  # noqa: E731
    feet = []
    for k in range(n):
        m = fb.measure_mask(np.asarray(Image.open(fit / f"{k:05d}.png"))[:, :, 3] >= 128)
        feet.append([r(m["toe"]), [[r(v) for v in sole] for sole in m["soles"]]] if m else feet[-1] if feet else [FIT_TOE, []])
    json.dump({"v": 4, "frames": n, "feet": feet}, open(dst, "w"), separators=(",", ":"))


def in_still(t, stills):
    return any(s["from"] <= t < s["to"] for s in stills)


def angles_for(times, frames, marks):
    """Angle (deg) of every source frame: inside each quarter (between two marks) the angle
    follows the measured movement, so a turn that speeds up and slows down gives even steps."""
    stills = marks.get("stills", [])
    motion, prev = [0.0] * len(times), None
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
                total = sum(motion[j] for j in idx)
                frac = sum(motion[j] for j in idx if times[j] <= t) / total if total > 0 else (t - t0) / max(1e-6, t1 - t0)
                out.append(a0 + (a1 - a0) * min(1.0, frac))
                break
    return out


def cut_out(paths, dst):
    """RGBA cut-outs of `paths` into dst/ (same file names)."""
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


def body(alpha):
    """Top edge, sole edge and centre x of the body in pixels (sub-pixel), or None. An edge is
    where a row holds 3 opaque pixels' worth of alpha, interpolated between rows, so the same
    picture measures the same after any shift or scale. The centre is the middle of the legs
    (hips to ankles): the axis the athlete turns round, at every angle."""
    a = alpha.astype(np.float64) / 255.0
    prof = a.sum(axis=1)
    on = np.where(prof >= 3.0)[0]
    if len(on) == 0:
        return None
    t, b = int(on[0]), int(on[-1])
    top = t - 1 + (3.0 - prof[t - 1]) / (prof[t] - prof[t - 1]) if t > 0 else float(t)
    toe = b + (prof[b] - 3.0) / (prof[b] - prof[b + 1]) if b + 1 < len(prof) else float(b)
    h = toe - top
    legs = a[int(top + h * 0.55) : int(top + h * 0.92)]
    cols = legs.sum(axis=0)
    cx = float((cols * np.arange(len(cols))).sum() / cols.sum()) if cols.sum() else a.shape[1] / 2
    return top, toe, cx


def standing(fb, cuts, step_tol, leg_guard):
    """Which source frames show the athlete standing with both feet flat (True/False each),
    and why the others were dropped. A step shows over time: the sole line moves, or the legs
    change much more than the upper body (over three frame pairs, so one noisy pair does not
    count). A foot lifted to step shows the same way. (Two soles at different heights alone are
    not a lifted foot: the far foot sits higher on screen.)"""
    n = len(cuts)
    info, small = [], []
    for c in cuts:
        im = Image.open(c)
        alpha = np.asarray(im)[:, :, 3]
        info.append((body(alpha), fb.measure_mask(alpha >= 128), alpha.shape[0]))
        small.append(np.asarray(im.resize((96, max(1, round(96 * im.height / im.width)))))[:, :, 3].astype(np.float32))
    ratio, legs = [0.0] * n, [0.0] * n
    for i in range(1, n):
        half = small[i].shape[0] // 2
        legs[i] = float(np.abs(small[i][half:] - small[i - 1][half:]).mean())
        ratio[i] = legs[i] / max(0.3, float(np.abs(small[i][:half] - small[i - 1][:half]).mean()))
    keep, why = [True] * n, [""] * n
    for i, (b, m, hgt) in enumerate(info):
        if not b or not m:
            keep[i], why[i] = False, "no body"
            continue
        h = (b[1] - b[0]) / hgt  # body height, share of the frame
        if any(0 <= j < n and info[j][1] and abs(info[j][1]["toe"] - m["toe"]) > step_tol * h for j in (i - 1, i + 1)):
            keep[i], why[i] = False, "sole line moving (step)"
            continue
        pairs = [j for j in range(max(1, i - 1), min(n, i + 3))]
        if pairs and float(np.median([ratio[j] for j in pairs])) > leg_guard and max(legs[j] for j in pairs) > 1.0:
            keep[i], why[i] = False, "legs moving (step)"
    # A step starts / ends a frame before it shows clearly: drop the direct neighbours too.
    near = [keep[i] and all(keep[j] for j in (i - 1, i + 1) if 0 <= j < n) for i in range(n)]
    for i in range(n):
        if keep[i] and not near[i]:
            why[i] = "next to a step"
    return near, why


class Rife:
    """In-between pictures from rife-ncnn-vulkan (time step t between two frames)."""

    def __init__(self):
        self.bin = env("RIFE_BIN", "rife-ncnn-vulkan")
        found = shutil.which(self.bin) or (self.bin if Path(self.bin).is_file() else None)
        if not found:
            sys.exit(f"RIFE not found ({self.bin}). Install rife-ncnn-vulkan (README.md) or set RIFE_BIN.")
        self.bin = found
        self.model = env("RIFE_MODEL", str(Path(found).resolve().parent / "rife-v4.6"))
        self.gpu = env("RIFE_GPU", "")

    def __call__(self, a, b, t, dst):
        cmd = [self.bin, "-0", str(a), "-1", str(b), "-o", str(dst), "-m", self.model, "-s", f"{t:.5f}"]
        if self.gpu:
            cmd += ["-g", self.gpu]
        run(cmd)


def lock(im, b, cw, ch):
    """Scale and place one frame so its sole edge, body height and centre land exactly on the
    fixed fit lines (sub-pixel). The result is measured once more and the small resampling
    error corrected, so every picture lands within a fraction of a pixel."""
    def place(top, toe, cx):
        k = ((FIT_TOE - FIT_TOP) * ch) / max(1.0, toe - top)
        tx, ty = FIT_CX * cw - cx * k, FIT_TOP * ch - top * k
        return k, im.transform((cw, ch), Image.AFFINE, (1 / k, 0, -tx / k, 0, 1 / k, -ty / k), resample=Image.BICUBIC)

    top, toe, cx = b
    k, out = place(top, toe, cx)
    m = body(np.asarray(out)[:, :, 3])
    if m:  # shift the source measures by the error seen in the result, then place again
        top += (m[0] - FIT_TOP * ch) / k
        toe += (m[1] - FIT_TOE * ch) / k
        cx += (m[2] - FIT_CX * cw) / k
        k, out = place(top, toe, cx)
    return out


def main():
    raw, marks_path, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    turn_sec, fps = float(env("TURN_SEC", "60")), int(env("FPS", "24"))
    cw, ch = (int(v) for v in env("CANVAS", "714x1680").split("x"))
    marks = json.load(open(marks_path))
    order = [marks[k] for k in ("start", "front", "right", "back", "left", "end")]
    assert all(a <= b for a, b in zip(order, order[1:])) and marks["front"] < marks["end"], "marks out of order"
    fb, rife = foot_rules(), Rife()

    tmp = Path(tempfile.mkdtemp())
    src = tmp / "src"
    src.mkdir()
    sfps = source_fps(raw)
    t0 = marks["front"]
    run(["ffmpeg", "-y", "-ss", f"{t0:.3f}", "-to", f"{marks['end']:.3f}", "-i", raw, "-vf", f"fps={sfps}", "-an", str(src / "%05d.png")])
    files = sorted(src.glob("*.png"))
    times = [t0 + i / sfps for i in range(len(files))]

    # Repeated frames (AI video, frame-rate conversions, standing-still bands): keep the first.
    keep, prev = [0], grey_small(files[0])
    for i in range(1, len(files)):
        g = grey_small(files[i])
        if float(np.abs(g - prev).mean()) >= 0.35 and not in_still(times[i], marks.get("stills", [])):
            keep.append(i)
        prev = g
    files, times = [files[i] for i in keep], [times[i] for i in keep]
    angles = angles_for(times, files, marks)

    # 1. Standing frames only.
    cut = tmp / "cut"
    cut_out(files, cut)
    ok, why = standing(fb, [cut / f.name for f in files], float(env("STEP_TOL", "0.006")), float(env("LEG_GUARD", "1.8")))
    stand = [i for i in range(len(files)) if ok[i] and angles[i] < 359.5]
    if not stand or angles[stand[0]] > 1.0:
        stand = [0] + [i for i in stand if i != 0]  # frame 0 is Front (the mark), always kept
    dropped = [(round(angles[i]), why[i]) for i in range(len(files)) if i not in stand and angles[i] < 359.5]
    gaps = sorted(((angles[b] if b else 360 + angles[stand[0]]) - angles[a], round(angles[a]))
                  for a, b in zip(stand, stand[1:] + [None]))[-5:]
    print(f"source: {len(files)} distinct frames at {sfps:g} fps; standing: {len(stand)}; dropped {len(dropped)}")
    print("dropped (deg: reason): " + ", ".join(f"{a}: {w}" for a, w in dropped[:60]) + (" ..." if len(dropped) > 60 else ""))
    print("largest gaps filled by interpolation (deg wide, from deg): " + ", ".join(f"{g:.1f} from {a}" for g, a in reversed(gaps)))

    # 2. One picture per 360/n degrees: the standing frame itself, or RIFE between the two
    # standing frames around that angle (the last one pairs with Front again: seamless loop).
    n = int(round(turn_sec * fps))
    ring = [(angles[i], i) for i in stand] + [(360.0 + angles[stand[0]], stand[0])]
    mid = tmp / "mid"
    mid.mkdir()
    jobs, plan = [], []
    for k in range(n):
        A = 360.0 * k / n
        s = max(j for j in range(len(ring) - 1) if ring[j][0] <= A + 1e-9) if A >= ring[0][0] else 0
        (a0, i0), (a1, i1) = ring[s], ring[s + 1]
        t = 0.0 if a1 <= a0 else (A - a0) / (a1 - a0)
        if t < 0.02 or i0 == i1:
            plan.append(files[i0])
        elif t > 0.98:
            plan.append(files[i1])
        else:
            p = mid / f"m{k:05d}.png"
            jobs.append((files[i0], files[i1], t, p))
            plan.append(p)
    print(f"output: {n} pictures ({360 / n:.3f} deg each, {fps} per s, {turn_sec:g} s per turn); "
          f"{len(jobs)} made by RIFE, {n - len(jobs)} real standing frames")
    with ThreadPoolExecutor(max_workers=int(env("RIFE_JOBS", "2"))) as pool:
        for d, _ in enumerate(pool.map(lambda j: rife(*j), jobs)):
            print(f"  interpolated {d + 1}/{len(jobs)}", end="\r", flush=True)
    print()
    cut_out([p for p in plan if p.parent == mid], cut)

    # 3. Lock every picture to the same sole line, height and centre.
    fit, kf = out / "fit", out / "keyframes"
    fit.mkdir(parents=True, exist_ok=True)
    kf.mkdir(parents=True, exist_ok=True)
    for k, p in enumerate(plan):
        im = Image.open(cut / p.name).convert("RGBA")
        b = body(np.asarray(im)[:, :, 3])
        lock(im, b, cw, ch).save(fit / f"{k:05d}.png")

    # Check the lock on the result itself: spread of sole row, height and centre (px).
    meas = [body(np.asarray(Image.open(fit / f"{k:05d}.png"))[:, :, 3]) for k in range(n)]
    tops, toes, cxs = (np.array([m[j] for m in meas], dtype=float) for j in range(3))
    hs = toes - tops
    jump = lambda v: float(np.abs(np.diff(np.append(v, v[0]))).max())  # noqa: E731  (incl. the loop seam)
    r2 = lambda v: round(float(v), 2)  # noqa: E731
    check = {
        "solePx": [r2(toes.min()), r2(toes.max())], "heightPx": [r2(hs.min()), r2(hs.max())],
        "centreXPx": [r2(cxs.min()), r2(cxs.max())],
        "spreadPx": {"sole": r2(np.ptp(toes)), "height": r2(np.ptp(hs)), "centre": r2(np.ptp(cxs))},
        "maxStepPx": {"sole": r2(jump(toes)), "height": r2(jump(hs)), "centre": r2(jump(cxs))},
    }
    print(f"check lock (target 0-1 px): spread over all pictures sole {check['spreadPx']['sole']}, height "
          f"{check['spreadPx']['height']}, centre {check['spreadPx']['centre']} px; largest change between two pictures "
          f"sole {check['maxStepPx']['sole']}, height {check['maxStepPx']['height']}, centre {check['maxStepPx']['centre']} px")

    keyframes = []
    for q in range(72):
        name = f"{q * 5:03d}.webp"
        Image.open(fit / f"{round(q * n / 72) % n:05d}.png").save(kf / name, "WEBP", quality=88, method=6)
        keyframes.append(name)
    write_feet(fb, fit, n, out / "feet.json")

    # Loop seam: last picture -> first, against an ordinary step.
    def small(k):
        return np.asarray(Image.open(fit / f"{k % n:05d}.png").convert("RGBA").resize((cw // 6, ch // 6))).astype(np.int16)

    near = max(float(np.abs(small(k) - small(k + 1)).mean()) for k in list(range(n - 7, n - 1)) + list(range(0, 6)))
    seam = float(np.abs(small(n - 1) - small(0)).mean())
    print(f"check loop seam: {seam:.2f} vs largest step next to it {near:.2f}"
          + ("  <- WARNING: visible jump; move the 'end' mark a few frames and run again" if seam > 2 * near else "  OK"))

    # Contact sheet: 24 pictures, every 15 degrees, with the lock lines (sole, top, centre).
    tw, th = 180, round(180 * ch / cw)
    sheet = Image.new("RGB", (tw * 12, (th + 22) * 2), (40, 12, 24))
    d = ImageDraw.Draw(sheet)
    for q in range(24):
        x0, y0 = (q % 12) * tw, (q // 12) * (th + 22)
        im = Image.open(fit / f"{round(q * n / 24) % n:05d}.png").resize((tw, th), Image.LANCZOS)
        sheet.paste(im, (x0, y0 + 22), im)
        for yy in (FIT_TOP, FIT_TOE):
            d.line([(x0, y0 + 22 + yy * th), (x0 + tw, y0 + 22 + yy * th)], fill=(0, 220, 255))
        d.line([(x0 + FIT_CX * tw, y0 + 22), (x0 + FIT_CX * tw, y0 + 22 + th)], fill=(0, 220, 255))
        d.text((x0 + 6, y0 + 5), f"{q * 15} deg", fill=(255, 255, 255))
    sheet.save(out / "contact.jpg", quality=88)

    json.dump({"fps": fps, "frames": n, "duration": n / fps, "canvas": [cw, ch], "degPerFrame": 360 / n,
               "keyframes": keyframes, "keyframeDeg": 5, "standingFrames": len(stand), "interpolated": len(jobs),
               "lockCheck": check, "marks": marks}, open(out / "meta.json", "w"), indent=2)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"done: {fit}/ ({n} PNG), {kf}/ (72 WebP), {out / 'contact.jpg'}, {out / 'meta.json'}")


if __name__ == "__main__":
    main()
