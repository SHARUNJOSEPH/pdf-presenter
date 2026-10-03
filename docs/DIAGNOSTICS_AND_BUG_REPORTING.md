# 🐞 Diagnostic Bug Report Generator & Slide Flicker Troubleshooting

## Overview
PDF Presenter Suite includes a native, one-click **Diagnostic Bug Report Generator** accessible in both the Home Screen Launcher and the Presenter Cockpit toolbar. 

This tool is designed to diagnose hardware configurations, multi-screen topology, GPU acceleration states, and runtime render logs—specifically targeting issues like **slide flickering, VSync tearing, projector sync delays, and multi-DPI compositor stutter**.

---

## Accessing the Bug Report Generator
Users can launch the Diagnostics generator in multiple ways:
1. **Launcher Header**: Click the **🐞 Bug Report** button in the top navigation bar.
2. **Presenter Cockpit**: Click the **🐞** icon in the top toolbar while presenting.
3. **About & Help Modal**: Click **"Run System Diagnostics"** inside the About dialog.

---

## What the Report Collects
The report collects non-sensitive technical environment telemetry and sanitizes all personal file paths (`C:\Users\<REDACTED>\...`):

1. **System & OS Metrics**:
   - Operating System, kernel release, and Windows build number
   - Architecture (`x64` / `arm64`), CPU model, CPU cores
   - Total System RAM and Available Free RAM (MB)
   - Electron, Chromium, Node.js, and V8 versions

2. **Multi-Screen & Display Topology**:
   - Number of active monitors and connection index
   - Resolution, bounds, and work areas
   - **DPI Scale Factors** (e.g. 1.0x, 1.25x, 1.5x, 2.0x)
   - **Display Refresh Rates** (e.g. 60Hz, 120Hz, 144Hz)
   - Color depth, color space, and primary display flags

3. **GPU & Hardware Acceleration Telemetry**:
   - Chromium GPU feature status (`gpu_compositing`, `rasterization`, `webgl`, `direct_rendering`)
   - GPU hardware device, vendor ID, and driver version
   - Active GPU command-line switches (`--enable-gpu-rasterization`, `--enable-zero-copy`, `--disable-features=CalculateNativeWinOcclusion`)

4. **Active Presentation & Memory State**:
   - Slide count, active slide index, slide aspect ratio
   - Buffer memory usage
   - Companion / Stream Deck API state

5. **Slide Flicker Risk Analysis**:
   - **Automated Detection of Mixed DPIs**: Flags if laptop display and projector use different DPI scaling (a primary cause of Windows Chromium backbuffer surface re-allocation flicker).
   - **Automated Detection of Refresh Rate Mismatch**: Flags if high-refresh-rate laptops (144Hz) are paired with 60Hz/59Hz projectors.
   - **GPU Compositing Verification**: Flags if software fallback is active.

6. **Recent Runtime Event Buffer**:
   - A rolling circular buffer of the last 50 application logs, slide transition timestamps, IPC events, and warnings.

---

## User Actions
Once generated, users can:
- 📋 **Copy to Clipboard**: Copies formatted GitHub-flavored Markdown ready to paste into GitHub issues or support emails.
- 💾 **Save to File**: Saves a `.md` diagnostic file directly to their Desktop or Downloads.
- 🌐 **Open GitHub Issue**: Directly launches the GitHub issue tracker with prefilled metadata.

---

## Slide Flicker Troubleshooting Roadmap
When a user reports a slide flicker, follow this verification matrix:

| Suspected Cause | Diagnostic Signal in Report | Recommended Action / User Fix |
| :--- | :--- | :--- |
| **Mixed DPI Scaling** | `Mixed DPI Scale Factors (e.g., 1.5x vs 1.0x)` | Set both displays to matching DPI (e.g. 100% or 125%) in Windows Display Settings. |
| **Refresh Rate Mismatch** | `Displays have different refresh rates (144Hz vs 60Hz)` | Set primary display to 60Hz in Windows Advanced Display Settings to match projector VSync. |
| **Disabled GPU Compositing** | `gpu_compositing: disabled_software` | Update graphics drivers (Intel / NVIDIA / AMD) and verify Windows Graphics Performance is set to High Performance. |
| **Low RAM Headroom** | `Free RAM < 800 MB` | Close resource-heavy apps (e.g., Chrome, video editors) before launching presentations. |
