# 📽️ PDF Presenter Suite (v1.1.3)

> A modern, high-performance desktop application for dual-screen PDF presentations with a PowerPoint/Keynote-style presenter cockpit, 1.0s silky-smooth dissolve transitions, and integrated Bitfocus Companion / Stream Deck REST control.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-Available%20Now-0078D4.svg)](https://apps.microsoft.com/detail/9NS3LKFXHBXW)
[![Platform: Windows & macOS](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-informational.svg)](https://github.com/SHARUNJOSEPH)
[![Creator](https://img.shields.io/badge/Creator-Joseph%20Sharun-6366f1.svg)](https://www.linkedin.com/in/joseph-sharun/)

---

## 🌟 Key Features

- **Multi-Screen Intelligent Routing**:
  - Automatically identifies all connected displays (primary screen, external monitors, HDMI projectors).
  - Clean fullscreen feed for the audience (no browser tabs, toolbars, or mouse pointers).
  - Dedicated **Presenter Cockpit** auto-maximized on your primary display.
- **Recent Presentations History**:
  - Quick-launch list on the setup screen remembers your last 5 opened slide decks.
  - 1-Click to reopen frequently used PDF presentations without searching folders.
- **Slide Sorter & Quick Jump Grid (`G`)**:
  - Instant visual grid modal displays high-resolution thumbnails for every slide in your deck.
  - Jump directly to any slide (e.g., Slide 15 during audience Q&A) without scrolling through intermediate slides in front of the audience.
- **Live Presentation Timer & Real-Time Wall Clock**:
  - Live stopwatch timer with Start/Pause/Reset controls.
  - Real-time digital clock displays local time-of-day so you never run over your session schedule.
- **PowerPoint-Style Adjustable Presenter Cockpit**:
  - **Draggable Vertical Splitter**: Adjust width between Current Slide and Sidebar on the fly.
  - **Draggable Horizontal Splitter**: Expand Speaker Notes into a tall teleprompter view or enlarge Next-Slide Preview.
  - **Layout Memory**: Saves custom panel proportions in `localStorage` across sessions (double-click to reset).
  - **Large Live Preview** of current slide with responsive aspect re-fitting.
  - **Next-Slide Glance Preview** for seamless speaking flow.
  - **Visual Slide Strip** with jump-to-slide thumbnails.
  - **Per-Slide Speaker Notes** with instant local auto-saving.
- **Silky 1.0s True Dissolve Transitions**:
  - Double-buffered canvas architecture eliminates all white flashes and flickering.
  - Smooth dissolve animation ensures a cinematic keynote experience.
- **Production Hardened & Developer Tools Lock-down**:
  - Standard Chromium menus and development tools are cleanly stripped from production builds.
  - Inspection shortcuts (`F12`, `Ctrl+Shift+I`) are blocked in release packages for a polished native desktop feel.
- **Interactive Tools & Keyboard Control**:
  - 🔴 **Virtual Laser Pointer**: Centered and synced live to the audience screen (`L`).
  - ✏️ **Digital Annotation Pen**: Draw and annotate slides in real-time (`P`).
  - ⬛ **Instant Blackout & Whiteout (`B` / `W`)**: Direct stage attention to the speaker.
  - 🗂️ **Slide Sorter Grid (`G`)**: Open bird's-eye slide grid to jump instantly to any slide.
  - 🛑 **Quick Exit (`Esc`)**: Press Esc anytime to close modals or exit presenter view cleanly.
  - ⛶ **Fullscreen Toggle (`F11`)**: Borderless distraction-free presenter view.
- **Bitfocus Companion & Stream Deck Integration**:
  - Built-in lightweight HTTP REST & WebSocket API on port `3000`.
  - 1-Click **"📋 Copy"** buttons for all API endpoints and network IP addresses.
  - Control slides, blackout, and timers directly from hardware production switchers.

---

## 🚀 Getting Started

### Option 1: Standalone Installers (No Node.js Required)
1. Download the **Windows Installer** (`PDF Presenter Suite Setup 1.1.2.exe`) or the **Portable `.exe`**.
2. Run the application, select your PDF presentation, and click **"Start Dual-Screen Presentation"**.

### Option 2: Running from Source
```bash
git clone https://github.com/SHARUNJOSEPH/pdf-presenter.git
cd pdf-presenter
npm install
npm start
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `→` / `Space` / `PageDown` / `Enter` | Next Slide |
| `←` / `Backspace` / `PageUp` | Previous Slide |
| `Home` / `End` | First / Last Slide |
| `B` | Toggle Blackout Screen |
| `W` | Toggle Whiteout Screen |
| `L` | Toggle Virtual Laser Pointer |
| `P` | Toggle Digital Drawing Pen |
| `G` | Toggle Slide Grid Modal |
| `?` | Show Shortcuts Cheat Sheet |
| `F11` | Toggle Fullscreen Cockpit |
| `Esc` | Exit Presenter View / Close Modal |

---

## 🎛️ Bitfocus Companion / REST API (Port 3000)

| Endpoint | Method | Description |
| --- | --- | --- |
| `POST /api/next` | POST | Advance to next slide |
| `POST /api/prev` | POST | Return to previous slide |
| `POST /api/first` | POST | Jump to first slide |
| `POST /api/last` | POST | Jump to last slide |
| `POST /api/goto?page=N` | POST | Jump directly to slide `N` |
| `POST /api/blackout` | POST | Toggle stage blackout |
| `POST /api/whiteout` | POST | Toggle stage whiteout |
| `POST /api/timer/start` | POST | Start/resume presentation timer |
| `POST /api/timer/pause` | POST | Pause presentation timer |
| `GET /api/status` | GET | Retrieve live JSON presentation state |

---

## 👨‍💻 Creator & Community

Created with passion by **Joseph Sharun**:
- 💼 **LinkedIn**: [joseph-sharun](https://www.linkedin.com/in/joseph-sharun/)
- 🐙 **GitHub**: [@SHARUNJOSEPH](https://github.com/SHARUNJOSEPH)

This project is built to be open-sourced to empower speakers, educators, and AV professionals worldwide. Contributions, bug reports, and feature suggestions are warmly welcomed!

---

## 📄 License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Joseph Sharun.
