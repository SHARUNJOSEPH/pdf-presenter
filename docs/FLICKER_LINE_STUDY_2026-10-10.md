# Study: Intermittent 1px Line Flicker on Audience Dissolve

> **Date:** 2026-10-10  
> **App:** PDF Presenter Suite `v1.2.7-beta`  
> **Report ID analyzed:** `PPR-MV215TFB-A2CC`  
> **Symptom:** Thin line-like flicker, **audience / projector only**, intermittent, during dissolve slide changes  
> **Scope:** Compare Antigravity’s in-progress work vs remaining root causes (analysis only — no patch in this doc)

---

## 1. Environment from the bug report

| Item | Value | Relevance |
|------|-------|-----------|
| Primary | Built-in `1920×1080` @ `1×` DPI, `60Hz` | Presenter cockpit (no line reported) |
| Audience | Samsung `LS27A70` `3840×2160` @ `1×` DPI, `60Hz` | Where the line appears |
| DPI / Hz match | Same scale, same refresh | Diagnostics correctly report **LOW** risk — this is **not** the classic mixed-DPI / 30Hz case |
| Transition | `dissolve 1.0s` | Opacity crossfade on double-buffered canvases |
| GPU | Compositing + rasterization enabled; `skia_graphite` off; `direct_rendering_display_compositor` off | Healthy enough that heuristics stay green |
| Logs | Rapid page hops (~150–200 ms apart) while dissolve is 1000 ms | Mid-flight transition aborts are frequent in real use |

**Takeaway:** Hardware heuristics will keep saying LOW. The remaining bug is almost certainly **compositor / layout / canvas sizing**, not “bad GPU flags.”

---

## 2. What Antigravity already shipped (today)

### 2.1 `93d383e` — rAF sync before dissolve (`js/audience.js`, `js/presenter.js`)

**Intent:** Stop the incoming canvas from starting its opacity transition before Chromium has committed it at `opacity: 0`, which can produce a single-frame flash.

**What changed:**
- Capture `incoming` / `outgoing` refs before the animation.
- Double `requestAnimationFrame` before setting `transition` + `opacity: 1` + `.dissolve-in`.
- Defer `resizeDrawCanvas()` / `clearDrawings()` until dissolve **ends** (was running at transition start).
- Stop clearing drawings on every `GOTO_PAGE` before render (moved to after settle).

**What this fixed well:** Full-frame white/black flashes and “drawing overlay pops during fade.”

**What it does not fully address:** A **hairline / edge seam** that appears only on the 4K audience surface. That class of bug is usually geometric (layer bounds don’t match by 1 device pixel), not “opacity started one frame early.”

### 2.2 `35b7a8b` — Chromium GPU / occlusion switches (`main.js`)

```js
enable-gpu-rasterization
enable-zero-copy
force_high_performance_gpu
disable-backgrounding-occluded-windows
disable-features=CalculateNativeWinOcclusion
```

**Intent:** Keep the fullscreen audience window fully composited on the discrete GPU and stop Windows occlusion from throttling it when the presenter is focused.

**Good for:** Stutter / intermittent hitch when focus moves; hybrid GPU laptop panels.

**Not enough alone for:** A sharp 1px line during an otherwise smooth dissolve.

### 2.3 Uncommitted WIP — `css/audience.css` (mtime ~10:54 today)

Antigravity is mid-edit on the audience slide canvas CSS. Diff vs HEAD:

| Before (committed) | After (working tree) |
|--------------------|----------------------|
| `top: 50%; left: 50%` | `inset: 0; margin: auto` |
| `transform: translate(-50%, -50%) translateZ(0)` | `transform: translateZ(0)` only |
| `will-change: opacity, transform` | `will-change: opacity` |
| `aspect-ratio: 16 / 9` | removed |
| `background-color: transparent` | `background-color: #000000` |

**This is the right direction** for a 1px line. Classic Chromium/Electron hairlines come from percentage centering + `translate(-50%, -50%)` when CSS width/height round to odd pixels: the layer lands on a half-pixel, and during opacity blending you get a 1-device-pixel seam against the black stage.

Also important: transparent canvas chrome + letterboxing made any 1px misalignment read as a bright/dark line. Solid black canvas fill hides small gaps better.

**Status:** Present in the working tree, **not committed**, and **not yet paired** with matching JS sizing hardening. That likely explains “still sometimes.”

---

## 3. Current dissolve architecture (audience)

Double buffer: `#audienceSlideCanvasA` / `#audienceSlideCanvasB`.

Solid-underlay dissolve (from `b5705c2`, still the design):

1. Render next page into hidden `backCanvas` (`opacity: 0`).
2. Keep outgoing solid underneath (`opacity: 1`, `z-index: 1`).
3. Fade incoming on top (`z-index: 2`, opacity 0→1 over 1.0s).
4. After timeout, hide outgoing and normalize classes.

That design correctly kills **full-frame black dips**. It does **not** guarantee the two canvas **layer bounds** are pixel-identical during the fade.

---

## 4. Why the remaining line is intermittent and audience-only

### Hypothesis A — Subpixel centering hairline (HIGH confidence)

**Mechanism:** Old CSS centers with `left/top: 50%` + `translate(-50%, -50%)`. On 3840×2160, PDF-fit CSS sizes from `pdf-loader.js` use `Math.round(...)`. When `cssW` or `cssH` is **odd**, the transformed layer can sit on a fractional device pixel. During GPU opacity blend of two such layers, Chromium often draws a 1px edge AA fringe.

**Why intermittent:** Only when consecutive slides produce odd (or differently rounded) CSS dimensions — e.g. mixed page crop boxes, or fit math that flips between even/odd after `Math.round`.

**Why audience-only:** Presenter slide stage is a smaller nested panel (not fullscreen 4K). Same bug can exist there but is harder to see; user confirmed audience only.

**Antigravity WIP status:** CSS move to `inset: 0; margin: auto` + drop percentage translate **attacks this directly**. Incomplete until canvas CSS size is also forced even and identical for both buffers.

### Hypothesis B — Dual-canvas size mismatch between pages (HIGH confidence)

In `js/pdf-loader.js` → `renderPageToCanvas`:

- Fit scale = `min(targetW / pageW, targetH / pageH) * dpr`
- CSS size = `round(baseViewport * cssScale)`
- Bitmap size = viewport at device pixels

If slide 8 and slide 9 have slightly different PDF page boxes, **outgoing and incoming canvases get different `style.width` / `style.height`** during the dissolve. Even 1 CSS pixel difference → visible seam on a 4K panel while both are partially opaque.

**Why intermittent:** Same-size consecutive pages → no line. Different crop/aspect → line.

**Not yet fixed** by rAF sync or GPU flags. CSS `inset:0; margin:auto` helps centering but does **not** force both buffers to share one locked display rect.

### Hypothesis C — Mid-flight abort path (`finishTransitionImmediately`) (MEDIUM–HIGH)

Bug report logs show transitions every ~160 ms while dissolve is 1000 ms. Each hop calls:

```js
if (isTransitioning) finishTransitionImmediately();
```

That path:
- Clears transition timers
- Forces `transition: none`, opacity/zIndex swaps, className resets
- Forces layout via `void activeCanvas.offsetWidth`

Under rapid scrubbing this can leave one frame where:
- Both canvases briefly share z-index 1, or
- Outgoing is forced to 0 before incoming is fully opaque, or
- Class toggles fight the CSS `.dissolve-in` rule

Result: a **one-frame edge flash** that reads as a thin line — especially on a large 4K surface.

**Why “sometimes”:** Calm 1s-apart clicks → rare. Deck scrubbing / Stream Deck mash → common. Matches the report’s log pattern.

### Hypothesis D — `aspect-ratio: 16/9` vs real PDF page box (MEDIUM)

Committed CSS forced `aspect-ratio: 16 / 9` on the canvas element while JS also sets explicit `style.width` / `style.height` from the PDF page. Those two sizing authorities can disagree for non-16:9 pages, producing letterbox math that differs between buffers.

Antigravity’s WIP **removes** `aspect-ratio` — correct. Must stay removed.

### Hypothesis E — Overlay canvas (`#audienceDrawCanvas`) fractional rect (LOW–MEDIUM)

`resizeDrawCanvas()` uses `getBoundingClientRect()` (can be fractional) and writes integer `width`/`height` plus `style.left/top`. If that runs mid-dissolve (older code did; `93d383e` deferred it), a 1px misaligned overlay could flash. Current dissolve end-path is safer; rapid-abort path still calls it after settle.

Less likely to be the primary “line on clean dissolves,” more a contributor under annotation/spotlight use.

### Hypothesis F — Windows DWM / fullscreen exclusive quirks (LOW given report)

Same 60 Hz, 1× DPI, GPU compositing on. Unlikely primary. GPU flags already address the main Electron occlusion footgun.

---

## 5. Why diagnostics said LOW (and that’s OK)

`analyzeFlickerPotential()` keys off:
- Mixed DPI
- Refresh mismatch (esp. 29/30 Hz)
- GPU compositing / rasterization off

Your setup trips **none** of those. The remaining bug is a **software compositing edge case**, so the green LOW rating is expected and not contradictory.

Recommendation for a later pass (not required to fix the line): add a software heuristic such as:
- “Audience canvas CSS size odd”
- “Incoming vs outgoing canvas CSS size differ”
- “Transition aborted mid-dissolve N times in last 10s”

---

## 6. Gap analysis — Antigravity vs remaining symptom

| Layer | Antigravity action | Covers full-frame flash? | Covers 1px line? |
|-------|--------------------|--------------------------|------------------|
| Dissolve timing (rAF ×2) | Committed `93d383e` | Yes | Partial |
| Defer overlay resize | Committed `93d383e` | Partial | Partial |
| GPU / occlusion flags | Committed `35b7a8b` | Partial (hitch) | No |
| Kill `%` + `translate(-50%)` centering | **WIP uncommitted** CSS | — | **Yes (main)** |
| Solid black canvas fill | **WIP uncommitted** CSS | — | Yes (masks gaps) |
| Drop forced `aspect-ratio: 16/9` | **WIP uncommitted** CSS | — | Yes |
| Lock both buffers to identical even CSS rect | **Not done** | — | **Needed** |
| Snap fit sizes to even pixels | **Not done** | — | **Needed** |
| Softer mid-flight abort (no layout thrash) | **Not done** | Partial | **Needed** |
| Pre-paint black underlay into canvas bitmap before drawImage | Partial historically | Yes | Helpful |

**Bottom line:** Antigravity’s CSS WIP is aimed at the right bug class. The line persists “sometimes” because (1) that CSS isn’t finished/landed with JS size locking, and (2) rapid mid-dissolve aborts still thrash layers.

---

## 7. Recommended fix plan (for Antigravity or a follow-up patch)

Do these in order. Prefer audience-first since that’s where you see it.

### P0 — Finish and harden the CSS centering change
1. Keep `inset: 0; margin: auto; transform: translateZ(0); will-change: opacity; background: #000`.
2. Do **not** bring back `top/left: 50%`, `translate(-50%,-50%)`, or `aspect-ratio` on audience slide canvases.
3. Ensure slide-style keyframes (`translateX`) don’t fight `translateZ(0)` if that mode is still used (compose transforms or isolate slide mode).

### P0 — Lock a shared display rect for both buffers
In `audience.js` (and optionally presenter):
1. Compute fit size **once** per render from `window.innerWidth/innerHeight` + page aspect.
2. Force **even** CSS pixels: `w = w & ~1; h = h & ~1` (or `Math.round(x / 2) * 2`).
3. Apply the **same** `style.width` / `style.height` to **both** `activeCanvas` and `backCanvas` before starting dissolve (outgoing keeps its bitmap; only the CSS box is normalized if needed — or re-blit outgoing into the locked rect if aspect changed).
4. Ideally also set canvas bitmap dimensions consistently so device-pixel edges align on the 4K surface.

### P1 — Soften `finishTransitionImmediately`
1. Avoid `void offsetWidth` if possible; use a single rAF to commit final opacities.
2. Guarantee invariant in one frame: incoming opacity 1 + active class; outgoing opacity 0 + hidden class; no intermediate both-visible-wrong-z state.
3. Optionally ignore GOTO storms closer than ~1–2 frames apart (queue latest page only — you already have `pendingPage`; ensure abort path always ends on the latest).

### P1 — pdf-loader even-size helper
Centralize in `renderPageToCanvas`:
- After computing `targetCssW/H`, snap to even integers.
- Optionally fill target canvas with `#000` before `drawImage(offscreen)` so any uncovered edge is black, not uninitialized GPU garbage.

### P2 — Verify on this exact topology
Test matrix on the LS27A70:
1. Slow next/prev ( > 1.2s apart) — expect zero lines after P0.
2. Rapid scrub (like the bug-report log) — expect zero after P1.
3. Mixed page sizes in one deck (portrait + landscape pages if any).
4. Dissolve 1.0s and 0.4s; also instant cut (`duration 0`) as control.

### P2 — Diagnostics tweak (optional)
Surface “odd canvas CSS size” / “buffer size mismatch” in the bug report so future LOW-risk reports still show a software clue.

---

## 8. What not to chase first

- More GPU Chromium flags (already in good shape for this report).
- Mixed-DPI messaging (not your topology).
- Presenter cockpit dissolve (symptom is audience-only).
- Reintroducing `aspect-ratio: 16/9` on audience canvases.
- Blaming the Samsung panel refresh — both displays are 60 Hz.

---

## 9. Concise verdict

Antigravity has already fixed the **big** dissolve flashes (underlay dissolve, rAF commit, GPU occlusion). The leftover **thin intermittent line on the 4K audience** is a different bug class: **1-device-pixel layer misalignment** during opacity blend, amplified by:

1. Percentage + `translate(-50%, -50%)` centering (WIP CSS correctly removes this),
2. Per-page CSS size drift between the two buffers,
3. Rapid mid-dissolve aborts while scrubbing.

Land the CSS WIP **together with** even/locked dual-buffer sizing and a quieter abort path — that combination is the highest-probability kill for the remaining line.

---

## 10. Source map

| Path | Role |
|------|------|
| `js/audience.js` | Audience double-buffer dissolve + abort |
| `js/pdf-loader.js` | Canvas bitmap + CSS sizing |
| `css/audience.css` | Layer positioning (WIP change) |
| `main.js` | Audience `BrowserWindow` + GPU switches |
| `js/diagnostics-engine.js` | Hardware flicker heuristics (misses this case) |
| Commits | `b5705c2`, `e005e8e`, `93d383e`, `35b7a8b` + uncommitted `css/audience.css` |
