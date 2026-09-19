# 📦 PDF Presenter Suite — Git Release Strategy & Store Submission Guide

## 1. Executive Summary: Do We Need Separate Repositories or Branches for Pro?

### **No.**
Both the **Free tier** and the **Enterprise Pro tier** reside in the **exact same Git repository and branch (`main`)**, and are compiled into a **single unified application package (`.appx` / `.msix`)**.

---

## 2. Why a Single Unified Repository is the Standard Architecture

### A. Microsoft Store Durable Add-on Requirements
- The Microsoft Store requires a single store listing and primary binary (`PDF Presenter Suite`, Product ID: `9NS3LKFXHBXW`).
- Pro features are unbolted dynamically at runtime as an **In-App Purchase (IAP) Durable Add-on** (`PDFPresenterSuite.ProLifetime`).
- If you were to create a separate "Pro" Git repository or separate app submission:
  1. You would have to submit two completely different apps to the Microsoft Store.
  2. Users downloading the Free version would not be able to upgrade inside the app.
  3. Every bug fix, UI polish, or dependency update would require manual cherry-picking and double maintenance.

### B. Dynamic Runtime Entitlement Architecture
The application uses a hardened client-side and server-side entitlement architecture (`js/license-manager.js` and `js/upgrade-modal.js`):
1. **Default State**:
   - The application starts with base presentation features completely unrestricted:
     - Dual-screen presentation engine
     - 6-slide Interactive Demonstration deck and user PDF loading
     - Digital Pen annotation & laser pointer
     - Count-up stopwatch timer
     - Instant dissolve transitions
2. **Pro State Activation**:
   - When a user purchases the add-on via Microsoft Store or activates an offline enterprise license key (`PRO-XXXX-XXXX-XXXX-XXXX`), `LicenseManager` validates the signature and enables `isPro = true`.
   - All locked tools instantly unlock without requiring an application restart or redownload:
     - 📡 **NDI® 5/6 IP Video Broadcast & Alpha Lower-Third Streamer**
     - 🖥️ **Stage Floor Confidence Monitor & Teleprompter (3rd Screen)**
     - 🔦 **Cinematic Spotlight & Background Dimming Focus Mode (S)**
     - 🎬 **OBS Studio & vMix Automation Gateway**
     - 🎨 **Brand Watermark & Live Lower-Third Ticker Banner**
     - ⏱️ **Smart Keynote Countdown Timer & Overtime Flashing**
     - 📑 **Multi-Deck Conference Playlist & Speaker Queue**
     - 📊 **Rehearsal Analytics Heatmap & Notes Handout Export**
     - 🎛️ **Bitfocus Companion & Stream Deck REST/WebSocket Gateway**

---

## 3. Step-by-Step Git Release Workflow

Whenever you release a new version (containing new Free and Pro updates):

### Step 1: Ensure Quality & Verification
```powershell
# Navigate to the repository
cd C:\Users\user\.gemini\antigravity\scratch\pdf-presenter

# Run all automated test suites
npm test

# Run full pre-flight verification (all 6 release quality gates)
npm run verify
```

### Step 2: Commit All Staged Code to `main`
```powershell
git add .
git commit -m "feat(pro): add NDI IP broadcast, stage confidence monitor, spotlight mode, and OBS automation"
```

### Step 3: Create an Annotated Semantic Version Tag
Follow Semantic Versioning (`MAJOR.MINOR.PATCH`):
```powershell
git tag -a v1.3.0 -m "Release v1.3.0 - Enterprise Broadcast Edition (NDI, Confidence Monitor, Spotlight)"
```

### Step 4: Push to Remote Repository
```powershell
git push origin main
git push origin v1.3.0
```

### Step 5: Build the Production Distribution Package
```powershell
# Builds the Microsoft Store (.appx / .msix) package in dist/
npm run dist:appx

# Or for direct standalone installers (NSIS executable)
npm run dist:win
```

---

## 4. Microsoft Partner Center Add-on Configuration

To connect the Store Purchase button (`#btnStoreBuyPro`) to your Microsoft Store listing:

1. Log in to [Microsoft Partner Center](https://partner.microsoft.com/dashboard).
2. Go to **Apps and games** > **PDF Presenter Suite** (`9NS3LKFXHBXW`).
3. In the left navigation menu, select **Add-ons**.
4. Click **Create a new add-on**:
   - **Product type**: `Durable`
   - **Product ID**: `PDFPresenterSuite.ProLifetime`
5. In **Properties**:
   - **Lifetime**: Set to `Forever` (does not expire).
6. In **Pricing and availability**:
   - Set price tier (e.g. `$19.99` or `$29.99` USD lifetime unlock).
7. In **Store listings**:
   - Title: `PDF Presenter Suite — Pro Lifetime License`
   - Description: Highlights NDI streaming, Stage Confidence Monitor, Spotlight, Stream Deck integration, Multi-deck playlists, and Rehearsal Analytics.
8. Submit the add-on for Microsoft certification. Once approved, the Windows Store API inside the app (`Windows.Services.Store`) automatically recognizes purchases!

---

## 5. Direct / Air-Gapped Enterprise License Key Generation

For enterprise clients, government venues, or offline conference rooms without Microsoft Store access:

```powershell
# Generate an algorithmic license key
node scripts/generate-license-key.js "Acme Corporation Keynote 2026"
```
The output `PRO-XXXX-XXXX-XXXX-XXXX` key can be entered directly into the **Activate Key** dialog inside the application.
