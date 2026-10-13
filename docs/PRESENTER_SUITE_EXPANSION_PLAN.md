# Presenter Suite — Multi-Format Expansion Plan

**Author:** Planning pass for Joseph Sharun / PDF Presenter Suite  
**Date:** 2026-10-10  
**Status:** Decision-ready plan (not an implementation commit)  
**Current product:** PDF Presenter Suite v1.2.9-beta (Electron)  
**Live Store listing:** [9NS3LKFXHBXW](https://apps.microsoft.com/detail/9NS3LKFXHBXW) — *PDF Presenter Suite*  
**Reserved Store name:** [Presenter Suite](https://partner.microsoft.com/en-us/dashboard/products/9PP05X2HTND6/overview) — `9PP05X2HTND6`

> This document is product / architecture / compliance planning only. It is **not legal advice**. Before shipping Office-format support commercially, have a lawyer review trademark, patent (Open Specification Promise scope), codec licensing, and Store listing claims.

---

## 1. Executive answer

**Yes — you can take this to the next level.** Expanding from PDF-only to PPT/PPTX, DOC/DOCX, XLS/XLSX, images, and video is technically realistic on your current Electron stack, and it fits your AV dual-screen product better than staying PDF-only.

**But do it as a rebranded product (“Presenter Suite”), not as “PDF Presenter that happens to open Office files.”** You already reserved **Presenter Suite** in Partner Center. That name matches the vision. Keeping “PDF” in the primary brand after adding PowerPoint/Excel/Word/video will confuse buyers and invite inaccurate Store descriptions.

**Recommended strategy in one line:**  
Keep the existing dual-screen presentation engine, abstract the document loader into a **Slide Source pipeline**, ship formats in risk-ordered phases, convert Office documents to slide frames (prefer convert-to-PDF/images), never claim Microsoft affiliation, and migrate the Store listing carefully onto the reserved **Presenter Suite** identity.

---

## 2. What you have today (ground truth)

| Area | Current state |
|---|---|
| Stack | Electron `^44`, `electron-builder`, Node HTTP Companion API on port 3000 |
| Brand / IDs | `productName: "PDF Presenter Suite"`, `appId: com.josephsharun.pdfpresenter`, AppX `JOSEPHSHARUN.PDFPresenterSuite` |
| Document engine | `js/pdf-loader.js` → `PDFDocumentEngine` wrapping **PDF.js** (`vendor/pdfjs/`) |
| File picker | `dialog.showOpenDialog` filters **PDF only** (`main.js`) |
| Presentation model | Page/slide index → double-buffered canvas on Audience + Presenter + Confidence |
| Strengths already built | Dual-screen routing, dissolve transitions, notes, timer, laser/pen, Companion, NDI MJPEG, i18n (11 langs), freemium license, Store APPX pipeline |
| Privacy posture | Local-only document processing (`PRIVACY.md`) — must preserve this |

Your hard-won value is **not** “PDF viewing.” It is **stage presentation**: dual screens, confidence monitor, AV control, transitions, playlist. Multi-format support should feed that same stage engine.

---

## 3. Naming & Store identity (critical path)

### 3.1 Recommendation

| Option | Verdict |
|---|---|
| Keep **PDF Presenter Suite** and add formats | Weak. Name under-sells product; Store description becomes misleading. |
| Rename live listing to **PDF Presenter** | Worse — still PDF-branded while supporting PPT/video. |
| **Use reserved name Presenter Suite** | **Recommended.** Format-agnostic, already reserved (`9PP05X2HTND6`). |

### 3.2 Two Store products vs rename-in-place

You currently have:

1. **Live / shipping product:** PDF Presenter Suite — `9NS3LKFXHBXW`
2. **Reserved name:** Presenter Suite — `9PP05X2HTND6`

Partner Center allows reserved names and display-name changes, but **package identity** (`Identity Name`, publisher CN) is sticky. Practical paths:

**Path A — Preferred for a clean brand (Recommended)**  
Ship the multi-format app under the reserved **Presenter Suite** product (`9PP05X2HTND6`) as a new listing (or promote that reserved product once package identity is created). Keep PDF Presenter Suite listed temporarily as the PDF-focused SKU, or eventually deprecate / redirect users via Store description + in-app update messaging.

**Path B — Rename display name on existing listing**  
Change display name of `9NS3LKFXHBXW` toward “Presenter Suite” if Partner Center still allows that reserved name to be assigned / associated. Package family name may remain `JOSEPHSHARUN.PDFPresenterSuite` unless you create a new package identity — which means install upgrades may not seamlessly replace the old app.

**Action before coding:** In Partner Center, confirm whether `9PP05X2HTND6` already has a package identity / publisher linkage, and whether you can:

- Create a new submission under Presenter Suite with a new `identityName` (e.g. `JOSEPHSHARUN.PresenterSuite`), **or**
- Transfer / assign the reserved name onto the existing product.

Do **not** ship dual apps with confusingly similar names without a clear “which one to install” story.

### 3.3 Trademark hygiene (non-negotiable)

Safe:

- “Presenter Suite”
- “Opens PowerPoint files (.pptx)”
- “Works with Word and Excel documents”
- File-type icons that are generic / your own design

Unsafe / high risk:

- Using Microsoft / Office / PowerPoint / Word / Excel logos or trade dress
- Naming features “PowerPoint Mode,” “Excel View,” “Word Presenter” as if official
- Claiming “Microsoft certified,” “Official Office companion,” or pixel-perfect Office parity
- Shipping any Microsoft Office binaries, Office Online embeds that imply affiliation, or cracked converters

Describe formats as **file types**, not as Microsoft product endorsements.

---

## 4. Feasibility by format

### 4.1 Scorecard

| Format | Present as slides? | Technical difficulty | Legal / policy risk | Recommended approach | Phase |
|---|---|---|---|---|---|
| **PDF** | Native (already) | Done | Low | Keep PDF.js | P0 (keep) |
| **Images** (PNG/JPG/WebP/GIF/SVG/BMP) | One image = one slide; multi-select = playlist | Low | Low | Native `<img>` / canvas | **P1** |
| **Video** (MP4/WebM/MOV*) | Full-screen playable “slide” or interstitial | Low–Medium | Medium (codecs) | Chromium `<video>`; prefer MP4 H.264 + WebM | **P1** |
| **PPTX** | Slides map 1:1 | High (fidelity) | Medium (OOXML OK; trademarks; converter licenses) | Convert → PDF/images; optional native preview | **P2** |
| **PPT** (legacy binary) | Via conversion only | High | Medium | Convert via LibreOffice/OnlyOffice; no native binary parser | **P2/P3** |
| **DOCX** | Paginated pages as slides, or section breaks | Medium–High | Medium | Convert → PDF pages | **P2** |
| **DOC** legacy | Conversion only | High | Medium | Converter path | **P3** |
| **XLSX** | Selected sheet / print area / chart sheets as slides | Medium–High | Medium | Convert print ranges → PDF/images; or sheet carousel | **P3** |
| **Keynote / ODP** | Nice-to-have | Medium | Low–Medium | Convert via LibreOffice | Later |

\*MOV: often needs codec support beyond stock Chromium builds — treat as best-effort.

### 4.2 What “present” means for each format

Your app is a **presenter**, not an editor. That is your advantage and your legal shield.

- **Do:** open, navigate, blackout, annotate, confidence mirror, Companion control, playlist.
- **Do not:** become a Word/Excel/PowerPoint editor. Editing invites feature parity traps and stronger trademark confusion.

For Office docs, the product promise should be:

> “Presenter Suite opens your decks and documents for dual-screen stage presentation. Complex Office animations/macros may be flattened for reliable playback.”

Honest limitation copy reduces Store rejection and refund risk.

---

## 5. Architecture sketch

### 5.1 Core idea: everything becomes a Slide Source

Today:

```
PDF file → PDFDocumentEngine → renderPageToCanvas(n) → Presenter/Audience
```

Target:

```
Any supported file
        ↓
  DocumentRouter (by MIME / extension)
        ↓
  Format Adapter (PdfAdapter | ImageAdapter | VideoAdapter | OfficeConvertAdapter | …)
        ↓
  Normalized PresentationDocument
        {
          id, title, sourceType, sourcePath,
          slides: [ SlideFrame, … ],
          notes: { [index]: string },
          media: { [index]: MediaRef }   // video/audio attachments
        }
        ↓
  Existing stage pipeline (presenter.js / audience.js / confidence.js / sync bus)
```

### 5.2 `SlideFrame` contract (proposed)

```js
/**
 * @typedef {Object} SlideFrame
 * @property {number} index          // 1-based to match current UX
 * @property {'canvas'|'image'|'video'|'html'} kind
 * @property {() => Promise<HTMLCanvasElement|ImageBitmap|string>} render
 * @property {string} [notes]
 * @property {number} [durationMs]   // auto-advance for image/video playlists
 * @property {object} [meta]         // sheet name, slide size, aspect, etc.
 */
```

Refactor `PDFDocumentEngine` into `PdfAdapter` implementing the same interface. Do **not** rewrite presenter/audience first — adapt the loader.

### 5.3 Module layout (proposed)

```
js/
  document/
    router.js                 # pick adapter by extension
    types.js                  # PresentationDocument, SlideFrame
    adapters/
      pdf-adapter.js          # today’s pdf-loader.js evolved
      image-adapter.js
      video-adapter.js
      office-convert-adapter.js
      spreadsheet-adapter.js  # later
    converters/
      libreoffice-bridge.js   # spawn soffice --headless
      onlyoffice-bridge.js    # optional commercial path
      fallback-zip-pptx.js    # lightweight PPTX→image extract (best-effort)
  pdf-loader.js               # thin re-export during migration
```

### 5.4 Conversion strategies for Office (pick one primary)

| Strategy | How it works | Pros | Cons | Store / legal notes |
|---|---|---|---|---|
| **A. Convert-to-PDF (Recommended primary)** | On open: PPTX/DOCX/XLSX → PDF via headless converter → existing PDF.js path | Reuses 95% of your engine; reliable stage playback; animations flattened predictably | Needs bundled or detected converter; first-open latency; package size | Use LGPL LibreOffice carefully **or** license OnlyOffice Document Builder; disclose conversion |
| **B. Convert-to-image sequence** | Export each slide/page to PNG at 1920×1080 | Perfect dissolve compatibility; no PDF.js for Office | Large temp disk use; no selectable text; notes extraction separate | Same converter licensing |
| **C. Native OOXML render in Chromium** | Parse PPTX ZIP/XML, draw with HTML/Canvas | No external binary | Months of fidelity work; charts/SmartArt/fonts/animations incomplete | OOXML reading is generally covered by Microsoft’s Open Specification Promise for conforming implementations; still no trademark rights |
| **D. Shell out to installed PowerPoint/Excel** | COM Automation / AppleScript if Office present | Best fidelity when available | Requires user owns Office; fragile; not Store-sandbox friendly; macOS/Windows diverge | Must not redistribute Office; feature becomes optional “Enhanced fidelity if Microsoft 365/Office is installed” |
| **E. Cloud conversion** | Upload to a conversion API | Easy for you | **Breaks your privacy promise**; Store/privacy scrutiny; latency; cost | **Reject for core path** unless explicit opt-in cloud mode later |

**Recommended hybrid:**

1. **Primary:** Strategy A (convert → PDF) offline, local only.  
2. **Fallback:** Strategy D when Office is detected and user opts in for “Enhanced Office fidelity.”  
3. **Never** Strategy E as default.  
4. Strategy C only as a lightweight PPTX *preview* (thumbnails) — not as the fidelity path.

### 5.5 Video architecture

- Treat a video file as a **single-slide PresentationDocument** with `kind: 'video'`.
- Audience window plays `<video>` fullscreen; Presenter shows transport (play/pause, scrub, mute).
- Sync playhead over existing `PresentationSyncBus` / IPC (`VIDEO_PLAY`, `VIDEO_PAUSE`, `VIDEO_SEEK`).
- Playlist: video items sit beside PDF decks (you already have in-flight playlist — generalize it).
- Codecs: prefer **MP4 (H.264 + AAC)** and **WebM (VP9/Opus)** for Chromium reach. Document unsupported codecs clearly.

**Codec caution:** Shipping proprietary codecs (H.264/AAC) can implicate patent pools (e.g. MPEG LA) depending on how Electron/Chromium/ffmpeg is built and distributed. Use Electron’s supported media stack; do not bundle extra proprietary codec packs without counsel. For Store, stick to formats Chromium already decodes and state limitations in the listing.

### 5.6 Images

- Multi-select images → ordered slide deck (drag reorder in launcher).
- Optional Ken Burns / dissolve already fits your transition engine.
- SVG: rasterize to canvas at stage resolution to avoid dual-screen DPI surprises.

### 5.7 Spreadsheets (phase later)

Presenting Excel well is a product decision:

1. **Print-area → slides** (best for keynotes with chart dashboards).  
2. **Sheet-as-slide** (each sheet one full-bleed render).  
3. **Live scrollable sheet** (bad for projectors; avoid as default).

Ship (1) and (2) only.

---

## 6. Legal, policy, and compliance map

### 6.1 Generally allowed (with care)

| Topic | Position |
|---|---|
| Reading OOXML (.pptx/.docx/.xlsx) | Microsoft’s **Open Specification Promise** covers necessary patent claims for conforming implementations of covered Office Open XML specs. Implementing a reader/converter is a normal industry practice (LibreOffice, OnlyOffice, etc.). |
| Saying the app opens those file types | Allowed if accurate; use extensions and generic wording. |
| Local conversion | Aligns with your privacy policy. |
| Dual-screen presentation features | Your differentiation; no Office trademark needed. |

### 6.2 Avoid / high risk

| Risk | Mitigation |
|---|---|
| Microsoft trademarks & logos | No Office branding assets; no “PowerPoint” in app name; no fake ribbon UI clone |
| Redistributing Microsoft Office / viewers | Never bundle Office, Office Viewer, or Microsoft DLLs |
| Overclaiming fidelity | Store copy: “Complex animations, macros, and some SmartArt may be simplified” |
| LGPL (LibreOffice) compliance | If you **dynamically** call an installed LibreOffice, obligations are lighter than static linking; if you **bundle** LibreOffice, you must meet LGPL notice/source obligations. Prefer “detect installed LibreOffice” in v1, optional downloadable converter pack later with counsel. |
| OnlyOffice commercial terms | Document Builder / conversion server often needs a **commercial license** for proprietary desktop apps — budget this or avoid. |
| GPL contamination | Do not link GPL code into the Electron app binary in a way that forces your MIT app to GPL. Prefer separate-process converters (LGPL/commercial). |
| Privacy regression | No cloud upload of customer decks by default; update `PRIVACY.md` if any optional online path appears |
| Store policy: accurate metadata | Screenshots must show real multi-format UI; age rating; capabilities declaration |
| Security | Office files can contain macros/OLE. **Never execute macros.** Convert in a locked-down subprocess; sandbox temp dirs; delete temps on exit |
| Patent codecs | Don’t add extra H.264 redistributables; rely on platform/Chromium |

### 6.3 Microsoft Store specific checklist

- [ ] Product name / display name matches reserved **Presenter Suite** decision  
- [ ] Description lists supported extensions honestly  
- [ ] “What’s new” explains conversion limitations  
- [ ] Privacy policy updated for any new file-type processing / temp files  
- [ ] Age rating questionnaire re-reviewed if video content is general-purpose  
- [ ] App capabilities unchanged unless you add broader filesystem needs  
- [ ] No misleading competitor comparisons that violate Store policies  
- [ ] IAP / freemium disclosure still accurate if Pro gates new formats  

### 6.4 License file obligations in-repo

When adding libraries, maintain an `THIRD_PARTY_NOTICES.md` covering:

- PDF.js (Apache-2.0) — already used  
- Any PPTX parser (check license)  
- LibreOffice / conversion bridge notices if bundled  
- Electron / Chromium licenses (electron-builder can help generate)

Your app license is MIT — compatible with Apache-2.0; be careful with GPL/LGPL bundling strategy.

---

## 7. Product positioning

### 7.1 Positioning statement

> **Presenter Suite** is dual-screen stage software for keynotes, churches, conferences, and AV teams. Open PDF, PowerPoint, Word, Excel exports, images, and video — present them with confidence monitors, Companion control, and silky dissolves — without turning your laptop into an Office editor.

### 7.2 Competitive frame (honest)

You are closer to **stage / AV presentation tools** (think dual-screen presenter + playlist + Companion) than to PowerPoint itself or generic PDF readers.

Differentiation to protect:

1. Dual-screen + confidence layouts you already built  
2. Bitfocus Companion / Stream Deck API  
3. NDI / MJPEG program feed  
4. Local-first privacy  
5. Freemium Pro (watermark, NDI, Companion) — decide which formats are Free vs Pro  

### 7.3 Monetization suggestion

| Tier | Formats / features |
|---|---|
| Free | PDF + images + basic video |
| Pro | Office conversion (PPTX/DOCX/XLSX), NDI, Companion, watermark branding, playlists beyond N items |

This keeps the Store free SKU useful and makes Pro tangible.

---

## 8. Phased roadmap (action plan)

### Phase 0 — Decisions & Store hygiene (1–2 weeks, little/no code)

1. Confirm brand: **Presenter Suite** (recommended).  
2. In Partner Center for `9PP05X2HTND6`, confirm package identity creation / linkage vs `9NS3LKFXHBXW`.  
3. Decide identity strategy (new package vs display rename).  
4. Lawyer pass on: trademarks, OSP reliance, converter licensing, codec distribution.  
5. Write public limitation language (Store + README).  
6. Decide Free vs Pro format gates.  
7. Freeze “no cloud conversion” as a product principle unless opt-in.

**Exit criteria:** Written decision record (brand, Store product ID, converter vendor, Pro gating).

### Phase 1 — Architecture + easy wins (2–4 weeks)

1. Introduce `PresentationDocument` / `SlideFrame` abstraction.  
2. Refactor `PDFDocumentEngine` → `PdfAdapter` without UX regression.  
3. Expand file dialog filters; drag-drop MIME sniffing.  
4. Ship **Images** as multi-slide decks.  
5. Ship **Video** as playable stage items + transport sync.  
6. Update launcher UI: “Add Deck” becomes format-aware.  
7. Tests: unit tests for router; e2e for image deck + video play/pause sync.  
8. Update privacy policy: temp frames for video posters, etc.

**Exit criteria:** Users can present PDF + images + video on dual screens with existing confidence/Companion flows.

### Phase 2 — Office documents via conversion (4–8 weeks)

1. Implement `office-convert-adapter` with **detect installed LibreOffice** first (lowest legal friction).  
2. UX: “Converting deck for reliable stage playback…” progress UI.  
3. Cache converted PDF in app temp (`os.tmpdir()` / Electron `userData/cache`) keyed by file hash.  
4. Extract speaker notes from PPTX XML when possible (notesSlides).  
5. Optional: “Enhanced fidelity” toggle that uses installed PowerPoint COM **only if present**.  
6. Store listing update / Presenter Suite submission with PPTX/DOCX support.  
7. Security: disable macros; convert in subprocess; wipe temp on quit.

**Exit criteria:** PPTX and DOCX open reliably for typical corporate decks; known-limitation doc published.

### Phase 3 — Spreadsheets + polish (3–6 weeks)

1. XLSX print-area / sheet → PDF conversion.  
2. Playlist mixed types (PDF + video bumper + PPTX keynote).  
3. Auto-advance timing per item.  
4. Thumbnail grid for non-PDF sources.  
5. Optional bundled converter pack (OnlyOffice commercial **or** LGPL-compliant LibreOffice side-by-side) if detection-only is insufficient for Store users.

### Phase 4 — Hardening & scale

1. Font substitution report (“these fonts were replaced”).  
2. Animation flatten warnings.  
3. Large-deck memory budgets (your flicker/DPI diagnostics already help).  
4. macOS parity for conversion path.  
5. Deprecate or reposition old PDF Presenter Suite listing.

---

## 9. Concrete engineering action checklist

### Immediate (this sprint)

- [ ] Partner Center: inspect `9PP05X2HTND6` vs `9NS3LKFXHBXW` identity options  
- [ ] Create `docs/DECISION_LOG.md` with brand + converter choice  
- [ ] Spike: open a sample PPTX via detected LibreOffice → PDF → existing engine (time conversion of 20-slide deck)  
- [ ] Spike: play MP4 on Audience window with Presenter transport synced  
- [ ] Spike: multi-image deck through current dissolve path  

### Refactors required

- [ ] Replace PDF-only assumptions in `main.js` (`current.pdf` stream path → `current-document` + type)  
- [ ] Generalize playlist metrics beyond PDF buffers  
- [ ] File filters in `showOpenDialog`  
- [ ] Launcher copy / i18n keys (`Add PDF Deck` → `Add Presentation`)  
- [ ] Demo deck remains PDF/JS canvas (fine)

### Quality gates to add

- [ ] Conversion golden-file tests (fixture PPTX → page count)  
- [ ] Macro-bearing Office file rejected / sanitized  
- [ ] Video codec unsupported → friendly error  
- [ ] Temp cache size cap + cleanup  
- [ ] Store screenshot set for each format family  

---

## 10. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Users expect PowerPoint animation parity | Refunds / 1-star reviews | Honest marketing; flatten animations; show conversion notice once per deck |
| LibreOffice not installed | Feature appears broken | Detect + guided install link; later optional converter pack |
| APPX package size balloons | Store friction, slow updates | Don’t bundle LibreOffice in v1; convert externally |
| Package identity rename breaks updates | Users lose continuity | Prefer new Presenter Suite listing with migration banner in old app |
| Macro malware in DOCX/PPTX | Security incident | Never enable macros; convert headless; sandbox |
| Trademark complaint | Delisting | Strict naming guidelines in CONTRIBUTING / design system |
| Codec patent exposure | Legal cost | Use Chromium defaults only; document formats |
| Scope creep into editing | Endless roadmap | Hard rule: present-only through v2.x |

---

## 11. Success metrics

- Time-to-first-slide for PPTX ≤ 8s for a 25-slide deck on mid-range Windows laptop (cached ≤ 1s)  
- Dual-screen dissolve remains flicker-free (reuse diagnostics engine)  
- ≥ 90% of top-100 corporate template PPTX files render usable slides in internal corpus  
- Store listing conversion rate / ratings do not regress after rename  
- Zero privacy regressions (no deck uploads)  
- Pro conversion attach rate (if gated)

---

## 12. Recommended decision set (for you to confirm)

1. **Brand:** Proceed as **Presenter Suite** using reserved name `9PP05X2HTND6`.  
2. **Architecture:** Slide Source adapters; keep canvas stage pipeline.  
3. **Office path:** Local convert-to-PDF via detected LibreOffice first; optional Office COM fidelity later; no cloud.  
4. **Phase 1 ship:** Images + Video beside PDF.  
5. **Phase 2 ship:** PPTX + DOCX.  
6. **Phase 3:** XLSX + mixed playlists.  
7. **Monetization:** Office conversion behind Pro (recommended).  
8. **Legal:** Counsel review before Store submission that mentions Office formats.  
9. **Messaging:** Presenter, not editor; fidelity limitations disclosed.

---

## 13. Architecture diagram (logical)

```
┌─────────────────────────────────────────────────────────────────┐
│ LAUNCHER                                                         │
│  Add files → Router → Adapter → PresentationDocument → Playlist │
└───────────────────────────────┬─────────────────────────────────┘
                                │ IPC / SyncBus LOAD_DOCUMENT
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ PRESENTER     │     │ AUDIENCE STAGE  │     │ CONFIDENCE      │
│ Cockpit       │◄───►│ Dissolve canvas │◄───►│ Multiview       │
│ notes/timer   │     │ / video element │     │                 │
└───────┬───────┘     └────────┬────────┘     └────────┬────────┘
        │                      │                       │
        └──────────────┬───────┴───────────────────────┘
                       ▼
              Companion API / NDI
```

Office branch detail:

```
PPTX/DOCX/XLSX ──► Hash cache? ──yes──► cached PDF ──► PdfAdapter
                     │ no
                     ▼
              Converter subprocess
              (LibreOffice / OnlyOffice / optional COM)
                     ▼
                 PDF bytes ──► cache ──► PdfAdapter ──► Stage
```

---

## 14. Bottom line

**Possibility:** High — especially because your product is already a stage engine, not a PDF niche viewer.

**Biggest non-technical work:** Store identity migration to **Presenter Suite**, trademark-safe messaging, and choosing a conversion strategy that does not violate licenses or your privacy promise.

**Biggest technical work:** Abstracting `PDFDocumentEngine` and building a robust local Office→PDF pipeline with caching and security.

**Do not break laws/policies:** no Office redistribution, no trademark misuse, no macro execution, no silent cloud uploads, honest Store claims, respect LGPL/commercial converter terms, careful codec redistribution.

When you confirm the decision set in §12, the next implementation step is Phase 0 Partner Center verification + Phase 1 adapter refactor spikes.

---

## Appendix A — File-type matrix (v1 target)

| Extension | Adapter | Free/Pro | Notes |
|---|---|---|---|
| `.pdf` | PdfAdapter | Free | Existing |
| `.png .jpg .jpeg .webp .gif .bmp .svg` | ImageAdapter | Free | Multi-file deck |
| `.mp4 .webm` | VideoAdapter | Free (Pro: playlist length?) | Document codec limits |
| `.pptx` | OfficeConvertAdapter | Pro | Notes extraction best-effort |
| `.ppt` | OfficeConvertAdapter | Pro | Conversion only |
| `.docx` | OfficeConvertAdapter | Pro | Page = slide |
| `.doc` | OfficeConvertAdapter | Pro | Conversion only |
| `.xlsx .xls` | OfficeConvertAdapter | Pro | Phase 3 |
| `.odp .odt .ods` | OfficeConvertAdapter | Later | LibreOffice-native |

## Appendix B — Copy snippets (Store-safe)

**Short description:**  
Dual-screen presentation software for PDF, PowerPoint files, Word and Excel documents, images, and video — built for stages, confidence monitors, and AV control.

**Limitation line:**  
Presenter Suite prepares Office documents for reliable stage playback. Advanced animations, macros, and some embedded objects may be simplified or omitted.

**Trademark line (About dialog):**  
Microsoft, PowerPoint, Word, and Excel are trademarks of Microsoft Corporation. Presenter Suite is an independent product and is not affiliated with or endorsed by Microsoft.
