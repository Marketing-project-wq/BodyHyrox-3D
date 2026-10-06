# CLAUDE.md

Guidance for Claude (and anyone else) working in this repo.

## Workflow
- Plan first: investigate, then present the plan (which files, what changes,
  and why) and wait for explicit approval before editing code or processing
  files.
- Never run Supabase migrations or change RLS/storage policies yourself. If a
  change needs them, write the SQL separately in the plan; the owner executes
  it after approval.
- Never merge to main or deploy without the owner's explicit approval. Open the
  PR, report verification results, and wait.
  Merge approval is valid only when the owner explicitly writes
  'merge PR #<number>'. General instructions (continue, agree, until deployed)
  are never merge approval. When in doubt, ask.
- Break larger work into small stages that can be reviewed one at a time.
- For the athlete stage, docs/STAGE_SPEC.md is the main reference. If an
  owner instruction contradicts it, follow the latest instruction and update
  that document in the same PR.
- After every UI change, report the checklist from "Verify before shipping"
  (desktop Windows / Mac Safari / Mac Chrome / iPad / iPhone / Android), plus
  anything that still needs a manual check on a real device.

## Cross-device rules

Every UI change must work on **desktop, iOS and Android, in portrait and
landscape**. Treat these as requirements, not nice-to-haves.

### Layout and sizing
- No hard-coded pixel positions for anything that depends on screen size.
  Use relative units (`%`, `svh`/`dvh`, `vw`, `cqw` container units, `aspect-ratio`)
  or recompute on resize (ResizeObserver / `resize`, plus `document.fonts.ready`
  for late layout shifts).
- Use `dvh`/`svh` instead of `100vh` for full-height layouts (mobile address
  bars change the viewport height).
- Respect iOS safe areas: `viewport-fit=cover` in the viewport meta and
  `env(safe-area-inset-*)` padding, so bottom controls (view tabs,
  "Place Your Logo") never sit under the home indicator.
- Tunable numbers (sizes, offsets, speeds, thresholds) live in `lib/config.ts`,
  never inline in components or CSS.
- No horizontal page scroll at any width down to 320px.
- Keep the stage card's view tabs and the "Place Your Logo" button clear of the
  athlete, the platform and the zone markers at every size (the button sits
  just under the platform's front edge, anchored to the feet line: `STAGE_CTA`).

### Touch and input
- Use Pointer Events rather than mouse-only events.
- Every hover interaction has a touch equivalent (tap), and every drag has a
  button alternative (e.g. ↑/↓ next to drag-and-drop).
- Touch targets are at least 44×44px.
- Horizontal swipes on the stage must not block vertical page scrolling
  (`touch-action: pan-y`).
- Respect `prefers-reduced-motion`: no auto-rotation, instant view changes.

### iOS Safari specifics
- Form inputs use font-size ≥16px, so iOS doesn't auto-zoom (admin pages).
- Add `-webkit-` prefixes where needed (backdrop-filter, mask).
- Video: `muted` + `playsinline` for autoplay.
- Watch memory when decoding many frames: use sized/compressed frames
  (WebP/AVIF) and don't keep more full-resolution decoded images alive than
  needed.

### Performance on phones
- Keep the 3D arena light (lower DPR on touch devices, adaptive quality) and
  always keep the CSS fallback working when WebGL is missing or too slow.
- Pause auto-rotation and the render loop when the tab is hidden
  (`visibilitychange`) or the zones panel is open.
- Animate only transform/opacity; keep heavy blur/glow limited.

### Admin pages
- Comfortable on laptop and tablet; must not break on a phone (controls stack
  under the preview, nothing cut off or overlapping).

### Localization
- The admin UI is bilingual (EN/ID). Every new or changed user-facing string
  must be added in both languages (`lib/i18n.ts`); no hard-coded text in
  components.

### Athlete stage specifics
- The athlete must stand on the platform ("napak") in every view and while
  rotating: feet anchoring, contact shadows, the platform and the zone markers
  must stay consistent at every size.
- Don't break layering (arena → platform → shadows → athlete → markers → UI),
  the spotlight, the zone markers, the buttons or the view tabs.

### Verify before shipping
- Verify and mock up every change on ALL of these device groups, not only
  phones:
  - Desktop Windows / Chrome: 1440×900 and 1903×950.
  - Mac (Safari and Chrome): 1280×800, 1440×900 and 1512×982 at DPR 2
    (Retina).
  - iPad portrait: 768×1024 and 820×1180. These are below `lg`, so they use
    the phone layout: it must use the space well and not look like a
    stretched phone.
  - iPad landscape: 1024×768 and 1180×820 (desktop layout).
  - Phone: 390×664, 390×844, 360×640, 430×932 and 844×390 (landscape).
- Sharpness: athlete frames must stay sharp on Retina (DPR 2) and large
  desktop screens while respecting the per-device memory limits; state the
  frame resolution and bitmap cache limits chosen for phone, tablet and
  desktop/Mac.
- Safari (Mac, iPad, iPhone) must be checked with the WebKit engine (e.g.
  Playwright `webkit`), not only Chromium. Say which engine and which DPR
  were used, and any limits of the test setup.
- Every PR report carries the checklist: desktop Windows ✓ / Mac Safari ✓ /
  Mac Chrome ✓ / iPad ✓ / iPhone ✓ / Android ✓, plus the list of things the
  owner must still check on a real device.
- For the athlete stage: all four views (Front/Right/Back/Left) plus one
  frame mid-rotation, on desktop and phone. Use `?debug=feet` on the athlete
  page to check the platform top face and each foot's contact point.
- Real-device check on iOS and Android when a change affects touch, scrolling
  or WebGL: run the dev server reachable on the network
  (`npx next dev -H 0.0.0.0`), then open `http://<computer's LAN IP>:3000`
  on the phone, connected to the same Wi-Fi.
