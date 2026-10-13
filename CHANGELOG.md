# Changelog

All notable changes to **PDF Presenter Suite** are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.2.10] — 2026-10-13

### Added
- **macOS Friction-Free Distribution & Gatekeeper Guidance**:
  - Bundled **`READ_ME_FIRST.txt`** guide directly on the root volume of the macOS DMG installer (`build/READ_ME_FIRST.txt`) so users can double-click and read setup instructions and Gatekeeper unblock steps directly in TextEdit without warnings.
  - Custom 640×450 dark-themed DMG installer background (`build/background.png`, `scripts/generate-dmg-background.ps1`) with high-resolution drag-to-install arrow, README callout, and permanent 2-click (Right-Click ➔ Open) first-launch guidance card.
  - Official **Homebrew Cask Formula** (`Casks/pdf-presenter.rb`) providing 1-line installation (`brew install --cask pdf-presenter`) that automatically bypasses macOS browser quarantine attributes.
- **Direct Downloads Table Expansion**: Added dedicated Homebrew Cask row to the main download table in `README.md`.

---

## [1.2.9] — 2026-10-12

### Fixed
- **4K Audience Dissolve Flicker Elimination** — Eliminated the 1px subpixel edge seam and mid-scrub flicker line on 4K displays (`css/audience.css`, `js/audience.js`, `js/pdf-loader.js`). Replaced percentage centering with integer-aligned flex centering (`inset: 0; margin: auto; contain: paint`), matched outgoing/incoming canvas bounds prior to opacity blend, and skipped expensive overlay canvas resizes during active mid-scrub aborts.
- **Launcher Multi-Deck Queue Sync** — Dragged and freshly loaded PDFs on the Launcher hub now automatically synchronize with the multi-deck playlist queue (`js/launcher.js`).
- **Compositor & Layout Reflow Hardening** — Removed synchronous layout reflow thrash (`offsetWidth`) before dissolve transitions and snapped audience drawing/spotlight overlays to integer pixels.

### Added
- **GPU Adapter Hardware Telemetry & Cadence Diagnostics** — Expanded diagnostic bug reports with WMI/hardware GPU adapter enumeration (device name, driver version, VRAM) and slide transition cadence analysis (`js/diagnostics-engine.js`, `main.js`).
- **Custom Executable Icon Injection** — Added `scripts/inject-exe-icon.js` `afterPack` hook so packaged Windows builds embed the custom application icon cleanly with `signAndEditExecutable: false`.

---

## [1.2.7-beta] — 2026-10-07

### Fixed
- **NDI IP Broadcast** — Completed the server-side MJPEG streaming pipeline in `main.js`.  
  The Electron built-in HTTP server now handles `POST /api/stream/frame` (frame ingestion from `ndi-engine.js`), `GET /api/stream/program.mjpg`, `GET /api/stream/alpha.mjpg`, `GET /api/stream/program/snapshot`, `GET /api/stream/alpha/snapshot`, and `GET /api/ndi/status`. OBS Studio, vMix, and TriCaster can now subscribe to the MJPEG program/alpha streams.
- **Duplicate Desktop Shortcut on Installation** — `ensureDesktopShortcutOnFirstRun()` in `main.js` now skips when the app is running as an NSIS/portable packaged executable (`app.isPackaged && !process.windowsStore`). The NSIS installer already creates a desktop shortcut via `electron-builder`'s `createDesktopShortcut: true`, so the first-run PowerShell shortcut creator no longer fires for that case, preventing two identical `.lnk` files appearing on the desktop.  
  The first-run creator still runs for Microsoft Store (AppX) installs and for dev/git installs, where no installer-generated shortcut exists.
- **Version drift** — README download links and `AppxManifest.xml` bumped to `1.2.7-beta` / `1.2.7.0` to match `package.json`.

### Added
- `CHANGELOG.md` — this file.

---

## [1.2.6-beta] — 2026-10-07

### Added
- **Microsoft Store submission assets** — `generate-store-assets.ps1` generates `store-app-tile-300x300.png`, `store-poster-art-1440x2160.png`, `store-poster-art-720x1080.png` for Store listing.
- **`bump-version.js`** — Automated version bump script for coordinated `package.json` + `AppxManifest.xml` + `latest.yml` updates.

---

## [1.2.5] — 2026-09-30

### Added
- **APPX build pipeline** — `dist:appx` script and `AppxManifest.xml` for Microsoft Store submission.
- **`generate-appx-assets.ps1`** — Generates all required Windows Store tile assets (logos, splash, wide tiles).

---

## [1.2.4] — 2026-09-27

### Fixed
- **Freemium paywall validation** — `e2e-freemium-validation.js` regression; license gating on Companion API corrected.
- **`updater-version-check.test.js`** — Update notifier edge cases (simulate-update flag).
- **Launcher tools** — `launcher-tools.test.js` test suite stabilized.

---

## [1.2.3] — 2026-09-27

### Fixed
- **License manager** — HMAC-SHA256 key validation hardening; AES-256 persistence edge cases.

---

## [1.2.2] — 2026-09-24

### Added
- **Privacy Policy** — `PRIVACY.md` added.

### Fixed
- Security policy CSP header regression in `views/confidence.html`.

---

## [1.2.1] — 2026-09-21

### Added
- **R11 — Responsive Top Bar** — Graduated media query system (`1366px`, `1200px`, `1050px`) and flexbox collapse preventing top bar overflow on laptop screens.
- New locale keys added to all 11 languages for responsive label truncation.

---

## [1.2.0] — 2026-09-08

### Added
- **R10 — In-Flight Playlist & Deck Switch Sync** — Dynamic file picker, `LOAD_DOCUMENT` broadcast, and playlist metrics persistence across deck switches.
- **R9 — PowerPoint-Style Direct Slide Number Jump** — `[N] + Enter` numeric key buffer listener with glassmorphic HUD toast on the Presenter Cockpit.
- **R8 — Stage Confidence Output Enable/Disable** — Feed toggle across toolbar, modal, and REST API (`POST /api/confidence/toggle`).
- **R7 — Diagnostics & Bug Report Generator** — `js/diagnostics-engine.js`, `#bugReportModal` in all views, flicker heuristic analysis, 1-click markdown export with path sanitization.
- **NDI IP Broadcast engine** — `js/ndi-engine.js` client-side canvas frame capture and POST pipeline (server-side completed in 1.2.7).

---

## [1.1.3] — 2026-09-07

### Added
- **11-Language NSIS installer** — Multi-language installer with per-locale prompts.
- **Stage Confidence Monitor** — `views/confidence.html` + `js/confidence.js`: 4 broadcast layout templates (Dual Cinema, Prompter Focus, Timekeeper, Single Mirror).
- **Watermark & Audience Banner** — `js/watermark-banner.js`: Pro-tier lower-third audience banner and branding overlay.
- **NDI status API** — `GET /api/ndi/status` in `server.js`.

### Fixed
- **R5 — Full regression suite** — 30/30 unit tests, 6/6 pre-flight gates passing.
- **R3 — Modal triple dismissal** — Close button, backdrop click, and Escape key dismissal wired across all modals in Presenter and Launcher.

---

## [1.1.2] — 2026-09-03

### Added
- **R4 — Live BroadcastChannel Sync** — Dual-path sync engine: Electron IPC + `BroadcastChannel('pdf_presenter_sync_bus')` operating concurrently.
- **R2 — Arabic RTL & Numeric Isolation** — Explicit CSS `direction: ltr !important` + `unicode-bidi: isolate` on `.timer-widget`, `#slideCounter`, `#clockDisplay`, `.api-active-bar`.

### Fixed
- Timer widget digit inversion under Arabic RTL layout.

---

## [1.1.1] — 2026-09-02 *(internal)*

### Added
- **R1 — 11-Language Visual Audit** — `tests/e2e-swarm-verification.js`: 33 view + 33 modal screenshots across all 11 locales.
- Audience stage screenshot captures translated `#placeholder` waiting screen.

---

## [1.0.0] — 2026-09-02

### Added
- Initial release of **PDF Presenter Suite**.
- Electron 44 dual-screen PDF presentation app.
- Presenter Cockpit with slide preview, speaker notes, timer, slide strip.
- Audience Display with PDF canvas, laser pointer, annotation pen, blackout/whiteout.
- Launcher Hub with PDF file picker, display routing, recent files.
- Bitfocus Companion REST + WebSocket API on port 3000.
- 11-language i18n engine (en, es, fr, de, zh, ja, ar, pt, hi, ru, it).
- Freemium + Pro license system (HMAC-SHA256 + AES-256).
- Built-in 6-slide demo deck.
- Windows NSIS installer and macOS DMG builds.
- MIT License.
