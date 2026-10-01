#!/usr/bin/env python3
"""
360 athlete turn, step 1 of 2 (see make_360_video.sh and README.md).

The athlete stands still facing front; the stage camera orbits round her. This makes that
picture sequence from a turn video:
  1. cut out every ORIGINAL frame and keep only the frames where the athlete STANDS (a step
     shows as the sole line moving or the legs changing much more than the upper body);
  2. fill every gap between standing frames:
     - GAP_FILL=mirror (default): a gap wider than 10 deg is filled with the frames of the
       other side flipped (left side for the right and back), spliced in and out where the
       flipped frames look most like the real ones, so the turn always moves one way;
     - then RIFE frame interpolation between neighbouring frames, through "anchor" frames
       (the frames nearest to standing, of the same side) wherever a gap is still wider than
       6 deg, so RIFE never bridges a wide gap;
  3. make the body 100% solid (small holes filled, faint remains outside the body removed);
  4. check every picture (see-through areas, shape jumps against its neighbours, in the body
     and in the shoes) and replace a picture that fails: its shoes from the nearest real frame,
     or the whole picture by the nearest real frame;
  5. lock EVERY picture to the same place: sole edge, body height and leg centre identical
     (sub-pixel);
  6. frame 0 = Front (0 deg), one full turn back to Front, evenly spaced: picture k shows the
     athlete at 360 * k / n deg, the angle the stage scenery has when it is on screen.

raw video + marks.json  ->  out/fit/%05d.png       RGBA, locked, one turn
                            out/keyframes/NNN.webp 72 frames, every 5 degrees
                            out/contact.jpg        24 pictures (every 15 degrees), full size,
                                                   with the lock lines
                            out/feet.json          the soles of every frame (stage shadows)
                            out/meta.json          incl. the lock check and the quality check

marks.json: from the studio timeline ("Download marks (JSON)"), times in seconds:
  {"start": 0.2, "front": 0.2, "right": 1.13, "back": 3.73, "left": 5.6, "end": 7.5,
   "stills": [{"from": 2.33, "to": 3.6}]}
Front = 0, Right = 90, Back = 180, Left = 270, end = 360 degrees. "stills" (no rotation) are
skipped.

Env (all optional):
  TURN_SEC=60          length of one turn in the output (s)
  FPS=24               output frame rate (60 s x 24 = 1440 pictures per turn)
  CANVAS=714x1680      output size
  GAP_FILL=mirror      mirror | anchor (no flipped frames) | rife (standing frames only)
  RIFE_BIN=rife-ncnn-vulkan   RIFE binary (github.com/nihui/rife-ncnn-vulkan); RIFE_MODEL = its
                       model folder (default: rife-v4.6 next to the binary); RIFE_GPU=-1 = CPU
  STEP_TOL=0.006       the sole line moving this much between two frames = a step
  LEG_GUARD=1.8        the legs changing this many times more than the upper body (median of
                       three frame pairs) = a step
  SHARPEN=0            light unsharp mask on the colour (0 = off, 0.3..0.6 = mild)
  BG=rembg             rembg (AI background removal) or colorkey (test only: keys out white)
  REMBG_MODEL=birefnet-general-lite   (isnet-general-use is ~10x faster on a CPU, a bit rougher)
"""
import json, os, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage as ndi

FIT_TOP, FIT_TOE, FIT_CX = 0.066, 0.964, 0.5  # same as VIDEO_360.fit in lib/config.ts
ANCHORS = (("front", 0), ("right", 90), ("back", 180), ("left", 270), ("end", 360))
MAX_GAP, BIG_GAP = 6.0, 10.0  # deg: RIFE never bridges more than MAX_GAP; mirror for gaps > BIG_GAP
FEET = 0.09  # shoe band: this share of the body height above the sole edge


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


class Cutter:
    """Background removal (one model session for the whole run)."""

    def __init__(self):
        self.mode, self.session = env("BG", "rembg"), None

    def __call__(self, im):
        if self.mode == "colorkey":
            px = np.asarray(im.convert("RGB")).astype(np.int16)
            a = np.clip((np.abs(px - 244).sum(axis=2) - 40) * 4, 0, 255).astype(np.uint8)
            return Image.fromarray(np.dstack([px.astype(np.uint8), a]), "RGBA")
        from rembg import new_session, remove  # pip install "rembg[cli]"

        if self.session is None:
            self.session = new_session(env("REMBG_MODEL", "birefnet-general-lite"))
        return remove(im, session=self.session).convert("RGBA")


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


def lock(im, b, cw, ch):
    """Scale and place one picture so its sole edge, body height and centre land exactly on the
    fixed fit lines (sub-pixel). The result is measured once more and the small resampling
    error corrected, so every picture lands within a fraction of a pixel."""
    def place(top, toe, cx):
        k = ((FIT_TOE - FIT_TOP) * ch) / max(1.0, toe - top)
        tx, ty = FIT_CX * cw - cx * k, FIT_TOP * ch - top * k
        return k, im.transform((cw, ch), Image.AFFINE, (1 / k, 0, -tx / k, 0, 1 / k, -ty / k), resample=Image.BICUBIC)

    top, toe, cx = b
    k, out = place(top, toe, cx)
    m = body(np.asarray(out)[:, :, 3])
    if m:  # move the source measures by the error seen in the result, then place again
        top += (m[0] - FIT_TOP * ch) / k
        toe += (m[1] - FIT_TOE * ch) / k
        cx += (m[2] - FIT_CX * cw) / k
        k, out = place(top, toe, cx)
    return out


def solid(alpha):
    """Body 100% solid: small holes filled (the gaps between legs / arms stay open), opaque
    from 2 px inside the edge, faint remains more than 2 px outside the body removed. Returns
    the alpha and the see-through areas found before (alpha 30..225 farther than 3 px from the
    body edge)."""
    core = alpha >= 128
    holes = ndi.binary_fill_holes(core) & ~core
    lab, n = ndi.label(holes)
    if n:
        sizes = ndi.sum(holes, lab, range(1, n + 1))
        core = core | np.isin(lab, [k + 1 for k, s in enumerate(sizes) if s < 0.002 * core.sum()])
    din, dout = ndi.distance_transform_edt(core), ndi.distance_transform_edt(~core)
    see = (alpha > 30) & (alpha < 225) & ((din > 3) | (dout > 3))
    a = alpha.copy()
    a[core & (din > 2)] = 255
    a[~core & (dout > 2)] = 0
    return a, see


def standing(fb, cuts, step_tol, leg_guard):
    """Which source frames show the athlete standing with both feet flat (True/False each),
    why the others were dropped, and a step score per frame (lower = closer to standing).
    A step shows over time: the sole line moves, or the legs change much more than the upper
    body (over three frame pairs, so one noisy pair does not count). A foot lifted to step
    shows the same way. (Two soles at different heights alone are not a lifted foot: the far
    foot sits higher on screen.)"""
    n = len(cuts)
    info, small = [], []
    for c in cuts:
        alpha = np.asarray(c)[:, :, 3]
        info.append((body(alpha), fb.measure_mask(alpha >= 128), alpha.shape[0]))
        small.append(np.asarray(c.resize((96, max(1, round(96 * c.height / c.width)))))[:, :, 3].astype(np.float32))
    ratio, legs = [0.0] * n, [0.0] * n
    for i in range(1, n):
        half = small[i].shape[0] // 2
        legs[i] = float(np.abs(small[i][half:] - small[i - 1][half:]).mean())
        ratio[i] = legs[i] / max(0.3, float(np.abs(small[i][:half] - small[i - 1][:half]).mean()))
    keep, why, score = [True] * n, [""] * n, [0.0] * n
    for i, (b, m, hgt) in enumerate(info):
        pairs = list(range(max(1, i - 1), min(n, i + 3)))
        score[i] = float(np.median([ratio[j] for j in pairs])) if pairs else 0.0
        if not b or not m:
            keep[i], why[i] = False, "no body"
            continue
        h = (b[1] - b[0]) / hgt
        if any(0 <= j < n and info[j][1] and abs(info[j][1]["toe"] - m["toe"]) > step_tol * h for j in (i - 1, i + 1)):
            keep[i], why[i] = False, "sole line moving (step)"
        elif pairs and score[i] > leg_guard and max(legs[j] for j in pairs) > 1.0:
            keep[i], why[i] = False, "legs moving (step)"
    # A step starts / ends a frame before it shows clearly: drop the direct neighbours too.
    near = [keep[i] and all(keep[j] for j in (i - 1, i + 1) if 0 <= j < n) for i in range(n)]
    for i in range(n):
        if keep[i] and not near[i]:
            why[i] = "next to a step"
    return near, why, score


class Src:
    """One source picture of the turn: a real frame, or a flipped one (mirror), at an angle."""

    def __init__(self, i, ang, kind, mirrored=False):
        self.i, self.ang, self.kind, self.mirrored = i, ang, kind, mirrored

    def __repr__(self):
        return f"{self.kind}{'(mirror)' if self.mirrored else ''}@{self.ang:.1f}"


def plan(ang, ok, score, masks, mmasks, mode, log):
    """The source pictures of the turn, by angle (see the module doc, step 2)."""
    n = len(ang)
    iou = lambda a, b: float((a & b).sum()) / max(1, (a | b).sum())  # noqa: E731
    real = [i for i in range(n) if ok[i] and ang[i] < 359.5]
    ring = [Src(i, ang[i], "real") for i in real]
    mir, mir_anchor = [], []
    if mode == "mirror":
        nom = lambda j: (360 - ang[j]) % 360  # noqa: E731  (a flipped frame shows about 360 - its angle)
        within = lambda x, lo, hi: lo <= (x if x >= lo else x + 360) <= hi  # noqa: E731
        for a, b in zip(real, real[1:] + real[:1]):
            a0, a1 = ang[a], ang[b] + (360 if b == real[0] else 0)
            if a1 - a0 <= BIG_GAP:
                continue
            cand = [j for j in range(n) if ang[j] < 359.5 and within(nom(j), a0 - 25, a1 + 25)]
            if not cand:
                continue
            jin = max([j for j in cand if within(nom(j), a0 - 25, a0 + 25)] or cand, key=lambda j: iou(masks[a], mmasks[j]))
            jout = max([j for j in cand if within(nom(j), a1 - 25, a1 + 25)] or cand, key=lambda j: iou(masks[b], mmasks[j]))
            seg = sorted([j for j in cand if ang[jout] <= ang[j] <= ang[jin]], key=lambda j: -ang[j])
            st = [j for j in seg if ok[j]]
            if len(seg) < 2 or not st:
                continue
            v = sorted(ang[j] for j in [seg[0]] + st + [seg[-1]])
            if max(y - x for x, y in zip(v, v[1:])) >= a1 - a0:
                continue  # the flipped frames do not cover this gap better than RIFE alone
            span = ang[seg[0]] - ang[seg[-1]] or 1.0
            for j in seg:  # angles spread over the gap by the flipped frames' own spacing
                A = a0 + (a1 - a0) * (ang[seg[0]] - ang[j]) / span
                if a0 < A < a1:
                    (mir if ok[j] else mir_anchor).append(Src(j, A % 360, "standing" if ok[j] else "anchor", True))
            log(f"  gap {a0:.1f}->{a1:.1f} deg: flipped frames of {360 - ang[seg[0]]:.0f}..{360 - ang[seg[-1]]:.0f} deg "
                f"(splice match in {iou(masks[a], mmasks[jin]):.2f}, out {iou(masks[b], mmasks[jout]):.2f}), {len(st)} standing")
        if mir:  # one source per stretch: real frames inside a flipped stretch are left out
            spans = []
            for a, b in zip(real, real[1:] + real[:1]):
                a0, a1 = ang[a], ang[b] + (360 if b == real[0] else 0)
                inn = [s.ang if s.ang >= a0 else s.ang + 360 for s in mir if a0 < s.ang < a1 or a0 < s.ang + 360 < a1]
                if inn:
                    spans.append((min(inn), max(inn)))
            ring = [s for s in ring if not any(lo < s.ang < hi or lo < s.ang + 360 < hi for lo, hi in spans)] + mir
    ring.sort(key=lambda s: s.ang)
    if mode in ("mirror", "anchor"):  # anchors where a gap is still wider than MAX_GAP
        real_anchor = [Src(i, ang[i], "anchor") for i in range(n) if not ok[i] and ang[i] < 359.5]
        angs, add = [s.ang for s in ring] + [ring[0].ang + 360], []
        for k, (a0, a1) in enumerate(zip(angs, angs[1:])):
            if a1 - a0 <= MAX_GAP:
                continue
            pool = mir_anchor if ring[k].mirrored or ring[(k + 1) % len(ring)].mirrored else real_anchor
            parts = int(np.ceil((a1 - a0) / MAX_GAP))
            for q in range(1, parts):
                target = (a0 + (a1 - a0) * q / parts) % 360
                cand = [s for s in pool if abs(((s.ang - target + 180) % 360) - 180) <= (a1 - a0) / (2 * parts)]
                if cand:
                    add.append(min(cand, key=lambda s: score[s.i]))
        ring += list({id(s): s for s in add}.values())
        ring.sort(key=lambda s: s.ang)
    return ring


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


def main():
    raw, marks_path, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    turn_sec, fps = float(env("TURN_SEC", "60")), int(env("FPS", "24"))
    cw, ch = (int(v) for v in env("CANVAS", "714x1680").split("x"))
    mode, sharpen = env("GAP_FILL", "mirror"), float(env("SHARPEN", "0"))
    marks = json.load(open(marks_path))
    order = [marks[k] for k in ("start", "front", "right", "back", "left", "end")]
    assert all(a <= b for a, b in zip(order, order[1:])) and marks["front"] < marks["end"], "marks out of order"
    assert mode in ("mirror", "anchor", "rife"), "GAP_FILL must be mirror, anchor or rife"
    fb, rife, cutter = foot_rules(), Rife(), Cutter()

    tmp = Path(tempfile.mkdtemp())
    src, mid = tmp / "src", tmp / "mid"
    src.mkdir()
    mid.mkdir()
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

    # 1. Cut out the ORIGINAL frames (and their flipped copies); standing frames only.
    cuts = []
    for i, f in enumerate(files):
        cuts.append(cutter(Image.open(f)))
        print(f"  background removed {i + 1}/{len(files)}", end="\r", flush=True)
    print()
    ok, why, score = standing(fb, cuts, float(env("STEP_TOL", "0.006")), float(env("LEG_GUARD", "1.8")))
    if not ok[0]:
        ok[0], why[0] = True, ""  # frame 0 is Front (the mark), always kept
    raws = {(i, False): f for i, f in enumerate(files)}
    for i, f in enumerate(files):  # flipped copies (the mirror fill and its RIFE input)
        p = tmp / "src" / f"{f.stem}-m.png"
        Image.open(f).transpose(Image.FLIP_LEFT_RIGHT).save(p)
        raws[(i, True)] = p
    cut_of = lambda s: cuts[s.i].transpose(Image.FLIP_LEFT_RIGHT) if s.mirrored else cuts[s.i]  # noqa: E731
    small = lambda im: np.asarray(lock(im, body(np.asarray(im)[:, :, 3]), cw, ch).resize((cw // 6, ch // 6)))[:, :, 3] >= 128  # noqa: E731
    masks = {i: small(c) for i, c in enumerate(cuts)}
    mmasks = {i: small(c.transpose(Image.FLIP_LEFT_RIGHT)) for i, c in enumerate(cuts)} if mode == "mirror" else {}
    stood = [i for i in range(len(files)) if ok[i] and angles[i] < 359.5]
    dropped = [(round(angles[i]), why[i]) for i in range(len(files)) if not ok[i] and angles[i] < 359.5]
    print(f"source: {len(files)} distinct frames at {sfps:g} fps; standing: {len(stood)}; dropped {len(dropped)}")
    print("dropped (deg: reason): " + ", ".join(f"{a}: {w}" for a, w in dropped[:60]) + (" ..." if len(dropped) > 60 else ""))

    # 2. Sources of the turn; one picture per 360/n degrees from them.
    ring = plan(angles, ok, score, masks, mmasks, mode, print)
    angs = [s.ang for s in ring] + [ring[0].ang + 360]
    gaps = sorted(((b - a, a) for a, b in zip(angs, angs[1:])), reverse=True)[:4]
    kinds = {k: sum(1 for s in ring if (s.kind, s.mirrored) == k) for k in {(s.kind, s.mirrored) for s in ring}}
    print(f"sources: {len(ring)} ({', '.join(f'{v} {k[0]}' + (' flipped' if k[1] else '') for k, v in sorted(kinds.items()))}); "
          f"widest RIFE gaps: " + ", ".join(f"{g:.1f} deg from {a:.0f}" for g, a in gaps))
    n = int(round(turn_sec * fps))
    srcs, jobs, made = ring + ring[:1], [], []
    for k in range(n):
        A = 360.0 * k / n
        j = max(q for q in range(len(ring)) if angs[q] <= A + 1e-9) if A >= angs[0] else len(ring) - 1
        a0, a1 = (angs[j], angs[j + 1]) if A >= angs[0] else (angs[-2] - 360, angs[0])
        s0, s1 = (srcs[j], srcs[j + 1]) if A >= angs[0] else (ring[-1], ring[0])
        t = 0.0 if a1 <= a0 else (A - a0) / (a1 - a0)
        near = s0 if t < 0.5 else s1
        if t < 0.02 or t > 0.98 or (s0.i, s0.mirrored) == (s1.i, s1.mirrored):
            made.append({"src": near, "t": t, "from": (s0, s1), "file": None})
        else:
            p = mid / f"m{k:05d}.png"
            jobs.append((raws[(s0.i, s0.mirrored)], raws[(s1.i, s1.mirrored)], t, p))
            made.append({"src": near, "t": t, "from": (s0, s1), "file": p})
    print(f"output: {n} pictures ({360 / n:.3f} deg each, {fps} per s, {turn_sec:g} s per turn); "
          f"{len(jobs)} made by RIFE, {n - len(jobs)} source pictures")
    with ThreadPoolExecutor(max_workers=int(env("RIFE_JOBS", "2"))) as pool:
        for d, _ in enumerate(pool.map(lambda j: rife(*j), jobs)):
            print(f"  interpolated {d + 1}/{len(jobs)}", end="\r", flush=True)
    print()

    # 3.-5. Cut out, make solid, lock; measure each picture for the quality check.
    fit, kf = out / "fit", out / "keyframes"
    fit.mkdir(parents=True, exist_ok=True)
    kf.mkdir(parents=True, exist_ok=True)
    locked_src = {}

    def picture(m):
        im = cut_of(m["src"]) if m["file"] is None else cutter(Image.open(m["file"]))
        px = np.asarray(im)
        a, see = solid(px[:, :, 3])
        if sharpen > 0:
            rgb = Image.fromarray(px[:, :, :3]).filter(ImageFilter.UnsharpMask(radius=1.2, percent=int(sharpen * 100), threshold=2))
            px = np.dstack([np.asarray(rgb), px[:, :, 3]])
        im = Image.fromarray(np.dstack([px[:, :, :3], a]), "RGBA")
        return lock(im, body(a), cw, ch), float(see.sum()) / max(1, int((a >= 128).sum()))

    def source_picture(s):
        key = (s.i, s.mirrored)
        if key not in locked_src:
            locked_src[key] = picture({"src": s, "file": None})[0]
        return locked_src[key]

    feet_row = int((FIT_TOE - FEET * (FIT_TOE - FIT_TOP)) * ch)
    qa = []
    for k, m in enumerate(made):
        im, see = picture(m)
        im.save(fit / f"{k:05d}.png")
        a = np.asarray(im)[:, :, 3]
        qa.append({"see": see, "mask": a[::3, ::3] >= 128})
        print(f"  pictures {k + 1}/{n}", end="\r", flush=True)
    print()

    # 4. Quality check of every picture: see-through share, and shape jumps against both
    # neighbours (body above the shoes, and the shoe band). A picture far above the typical
    # value fails; its shoes or the whole picture come from the nearest real frame.
    fr = feet_row // 3
    def jump(k, part):
        sl = slice(fr, None) if part == "feet" else slice(0, fr)
        r = []
        for q in (k - 1, (k + 1) % n):
            a, b = qa[k]["mask"][sl], qa[q]["mask"][sl]
            r.append(1 - float((a & b).sum()) / max(1, (a | b).sum()))
        return min(r)  # a real jump differs from BOTH neighbours
    body_j = [jump(k, "body") for k in range(n)]
    feet_j = [jump(k, "feet") for k in range(n)]
    see = [q["see"] for q in qa]
    rife_see = [see[k] for k, m in enumerate(made) if m["file"] is not None] or [0.0]
    lim = {"see": max(0.004, 4 * float(np.median(rife_see))), "body": max(0.02, 4 * float(np.median(body_j))),
           "feet": max(0.05, 4 * float(np.median(feet_j)))}
    failed = []
    for k, m in enumerate(made):
        if m["file"] is None:
            continue  # a source frame itself (its faint edges were already removed by solid())
        bad = [w for w, v in (("see-through", see[k] > lim["see"]), ("body shape jump", body_j[k] > lim["body"])) if v]
        feet_bad = feet_j[k] > lim["feet"]
        if not bad and not feet_bad:
            continue
        near = source_picture(m["src"])
        if bad:  # whole picture from the nearest real (or flipped) frame
            near.save(fit / f"{k:05d}.png")
            fix = f"replaced by the nearest source frame ({m['src']})"
        else:  # shoe band from the nearest real (or flipped) frame, blended over 16 px
            cur = np.asarray(Image.open(fit / f"{k:05d}.png")).astype(np.float32)
            src_px = np.asarray(near).astype(np.float32)
            w = np.clip((np.arange(ch) - (feet_row - 16)) / 16.0, 0, 1)[:, None, None]
            Image.fromarray((cur * (1 - w) + src_px * w).astype(np.uint8), "RGBA").save(fit / f"{k:05d}.png")
            fix = f"shoes from the nearest source frame ({m['src']})"
        failed.append({"picture": k, "deg": round(360.0 * k / n, 2), "fail": bad + (["shoes (shape jump)"] if feet_bad else []),
                       "fix": fix, "see": round(see[k] * 100, 3), "bodyJump": round(body_j[k], 3), "feetJump": round(feet_j[k], 3)})
    print(f"check quality: {len(failed)} of {n} pictures failed and were fixed "
          f"(limits: see-through {lim['see'] * 100:.2f}% of the body, body jump {lim['body']:.3f}, shoe jump {lim['feet']:.3f})")
    for f in failed[:40]:
        print(f"  {f['deg']:7.2f} deg: {', '.join(f['fail'])} -> {f['fix']}")

    # Lock check on the final pictures: spread of sole edge, height and centre (px).
    meas = [body(np.asarray(Image.open(fit / f"{k:05d}.png"))[:, :, 3]) for k in range(n)]
    tops, toes, cxs = (np.array([m[j] for m in meas], dtype=float) for j in range(3))
    hs = toes - tops
    r2 = lambda v: round(float(v), 2)  # noqa: E731
    step = lambda v: r2(np.abs(np.diff(np.append(v, v[0]))).max())  # noqa: E731  (incl. the loop seam)
    check = {"spreadPx": {"sole": r2(np.ptp(toes)), "height": r2(np.ptp(hs)), "centre": r2(np.ptp(cxs))},
             "maxStepPx": {"sole": step(toes), "height": step(hs), "centre": step(cxs)}}
    print(f"check lock (target 0-1 px): spread over all pictures sole {check['spreadPx']['sole']}, height "
          f"{check['spreadPx']['height']}, centre {check['spreadPx']['centre']} px")

    keyframes = []
    for q in range(72):
        name = f"{q * 5:03d}.webp"
        Image.open(fit / f"{round(q * n / 72) % n:05d}.png").save(kf / name, "WEBP", quality=88, method=6)
        keyframes.append(name)
    write_feet(fb, fit, n, out / "feet.json")

    # Loop seam: last picture -> first, against the steps next to it.
    def small_px(k):
        return np.asarray(Image.open(fit / f"{k % n:05d}.png").convert("RGBA").resize((cw // 6, ch // 6))).astype(np.int16)

    near_step = max(float(np.abs(small_px(k) - small_px(k + 1)).mean()) for k in list(range(n - 7, n - 1)) + list(range(0, 6)))
    seam = float(np.abs(small_px(n - 1) - small_px(0)).mean())
    print(f"check loop seam: {seam:.2f} vs largest step next to it {near_step:.2f}"
          + ("  <- WARNING: visible jump; move the 'end' mark a few frames and run again" if seam > 2 * near_step else "  OK"))

    # Contact sheet: 24 pictures (every 15 deg), full size, with the lock lines.
    sheet = Image.new("RGB", (cw * 6, (ch + 40) * 4), (40, 12, 24))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default(size=28)
    except TypeError:  # Pillow < 10.1
        font = ImageFont.load_default()
    for q in range(24):
        x0, y0 = (q % 6) * cw, (q // 6) * (ch + 40)
        im = Image.open(fit / f"{round(q * n / 24) % n:05d}.png")
        sheet.paste(im, (x0, y0 + 40), im)
        for yy in (FIT_TOP, FIT_TOE):
            d.line([(x0, y0 + 40 + yy * ch), (x0 + cw, y0 + 40 + yy * ch)], fill=(0, 220, 255), width=2)
        d.line([(x0 + FIT_CX * cw, y0 + 40), (x0 + FIT_CX * cw, y0 + 40 + ch)], fill=(0, 220, 255), width=2)
        d.text((x0 + 12, y0 + 6), f"{q * 15} deg", fill=(255, 255, 255), font=font)
    sheet.save(out / "contact.jpg", quality=90)

    json.dump({"fps": fps, "frames": n, "duration": n / fps, "canvas": [cw, ch], "degPerFrame": 360 / n,
               "keyframes": keyframes, "keyframeDeg": 5, "gapFill": mode, "standingFrames": len(stood),
               "sources": [repr(s) for s in ring], "interpolated": len(jobs), "lockCheck": check,
               "qualityCheck": {"limits": lim, "failed": failed}, "marks": marks}, open(out / "meta.json", "w"), indent=2)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"done: {fit}/ ({n} PNG), {kf}/ (72 WebP), {out / 'contact.jpg'}, {out / 'meta.json'}")


if __name__ == "__main__":
    main()
