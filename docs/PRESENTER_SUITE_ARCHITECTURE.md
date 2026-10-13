# Presenter Suite — Architecture Sketch

Companion to `PRESENTER_SUITE_EXPANSION_PLAN.md`.  
Focus: how to grow from PDF-only to multi-format **without rewriting** the stage engine.

---

## 1. Current architecture (as-is)

```
┌────────────┐   IPC/HTTP    ┌──────────────────┐
│ launcher.js│──────────────►│ main.js          │
│ (PDF only) │               │ file dialog PDF  │
└─────┬──────┘               │ buffer + /current.pdf
      │                      └─────────┬────────┘
      ▼                                │
PDFDocumentEngine (pdf-loader.js)      │
      │                                │
      ▼                                ▼
┌────────────┐  SyncBus/IPC  ┌────────────┐  ┌──────────────┐
│presenter.js│◄─────────────►│audience.js │  │confidence.js │
│ canvas     │               │ dissolve   │  │ layouts      │
└────────────┘               └────────────┘  └──────────────┘
```

**Bottleneck today:** almost every path assumes “document = PDF bytes + page number.”

---

## 2. Target architecture (to-be)

```
                    ┌─────────────────────────┐
                    │     DocumentRouter      │
                    │  ext/MIME → adapter     │
                    └───────────┬─────────────┘
          ┌──────────┬──────────┼──────────┬──────────┐
          ▼          ▼          ▼          ▼          ▼
     PdfAdapter ImageAdapter VideoAdapter OfficeConv Spreadsheet
          │          │          │          │          │
          └──────────┴──────────┼──────────┴──────────┘
                                ▼
                 PresentationDocument { slides[] }
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
           Presenter       Audience        Confidence
           (unchanged      (canvas OR      (unchanged
            chrome)         <video>)        chrome)
```

---

## 3. Key interfaces

### 3.1 Router

```js
// js/document/router.js
async function openPresentation(filePath, options) {
  const ext = path.extname(filePath).toLowerCase();
  const adapter = adapters[ext] || adapters[mimeOf(filePath)];
  if (!adapter) throw new UnsupportedFormatError(ext);
  return adapter.load(filePath, options);
}
```

### 3.2 Adapter contract

```js
class DocumentAdapter {
  /** @returns {Promise<PresentationDocument>} */
  async load(filePath, options) {}
  /** optional progressive preview */
  async preview?(filePath) {}
}
```

### 3.3 PresentationDocument

```js
{
  id: 'sha256…',
  title: 'Keynote.pptx',
  sourceType: 'pptx',          // pdf | image-set | video | pptx | docx | xlsx
  sourcePath: 'C:\\…\\deck.pptx',
  conversion: {
    used: true,
    engine: 'libreoffice',     // none | libreoffice | onlyoffice | mso-com
    outputPath: '%TEMP%/ps-cache/….pdf',
    warnings: ['Animations flattened']
  },
  slideCount: 24,
  async getSlide(n) { /* SlideFrame */ },
  async getNotes(n) { /* string */ },
  async getThumbnail(n, width) { /* canvas/bitmap */ },
  dispose() { /* revoke blob URLs, clear temp if policy says so */ }
}
```

---

## 4. Office conversion sequence

```
User picks deck.pptx
        │
        ▼
Hash file (SHA-256) ── cache hit? ──yes──► open cached PDF via PdfAdapter
        │ no
        ▼
Show modal: "Preparing deck for stage…"
        │
        ▼
Spawn converter (separate process)
  soffice --headless --convert-to pdf --outdir <cacheDir> <file>
        │
        ▼
Validate PDF page count > 0
        │
        ▼
Write cache index { hash, mtime, pages, engine, createdAt }
        │
        ▼
PdfAdapter.load(cachedPdf)
        │
        ▼
LOAD_DOCUMENT broadcast (existing sync path)
```

**Security rules**

- Converter working directory = dedicated temp folder per job  
- No network for converter process  
- Kill + delete on timeout  
- Never enable macros (`--norestore`, macro security high / Remove personal info flags as available)  
- Do not keep original Office file open with write locks during show

---

## 5. Video slide path

```
Audience:
  if slide.kind === 'video':
    show <video src=… autoplay?=policy>
  else:
    existing canvas dissolve

Presenter:
  transport bar → IPC VIDEO_PLAY / PAUSE / SEEK / MUTE
  preview uses same media element or poster frame

SyncBus payload example:
  { type: 'VIDEO_SEEK', t: 12.04, playing: true, sender: 'presenter' }
```

Blackout (`B`) should pause + hide video (avoid audio leak).

---

## 6. Image deck path

```
Multi-select [a.png, b.jpg, c.webp]
  → ImageAdapter sorts by name or user order
  → slides[] each kind:'image'
  → optional default durationMs for autoplay playlist mode
```

Reuse dissolve between images — already implemented for PDF pages.

---

## 7. Main-process API changes (minimal)

| Today | Tomorrow |
|---|---|
| `select-pdf-file` | `select-presentation-files` |
| `set-active-pdf-buffer` | `set-active-document` `{ type, buffer?, path?, meta }` |
| `GET /api/document/current.pdf` | `GET /api/document/current` + `Content-Type` negotiated **or** keep PDF stream when converted |
| filters: `pdf` | filters: pdf/images/video/office |

Keep `/current.pdf` as alias when active document is PDF or converted-PDF to avoid breaking Companion clients immediately.

---

## 8. Package / dependency impact

| Component | Bundle in APPX? | Phase |
|---|---|---|
| PDF.js | Yes (already) | P0 |
| Image/Video (Chromium) | Yes (already) | P1 |
| LibreOffice | **No** (detect) | P2 |
| Optional converter side-by-side | Separate download / Pro add-on | P3 |
| OnlyOffice Document Builder | Only with commercial license | optional |

Electron app size should stay near current ~100–170 MB APPX. Bundling LibreOffice would multiply size and LGPL duties — avoid in first Office release.

---

## 9. UI touchpoints

1. **Launcher dropzone** — accept all supported MIME types; show format badges.  
2. **Conversion progress** — non-blocking sheet with cancel.  
3. **Deck row** — icon by type (PDF / PPT / DOC / XLS / IMG / VID).  
4. **About / Legal** — Microsoft trademark disclaimer.  
5. **Unsupported codec / missing converter** — actionable error (“Install LibreOffice” / “Re-export as PDF”).

---

## 10. Test plan sketch

| Layer | Cases |
|---|---|
| Unit | Router extension map; cache key stability; notes XML extract |
| Integration | PPTX→PDF page count on fixtures; image ordering; video seek sync |
| E2E | Dual-screen image deck; video blackout mutes audio; Office deck confidence mirror |
| Security | Macro-enabled PPTX does not execute; path traversal in converter args blocked |
| Perf | 50-slide PPTX cold convert < threshold; warm cache < 1s |

---

## 11. Migration order (code)

1. Extract interfaces; wrap existing PDF engine (no behavior change).  
2. Images.  
3. Video.  
4. Rename user-facing strings toward Presenter Suite (feature-flagged).  
5. Office convert adapter + cache.  
6. Spreadsheet.  
7. Store package identity / listing cutover.

This order ships value every phase and keeps the dual-screen quality bar intact.
