================================================================================
           PDF PRESENTER SUITE — MACOS INSTALLATION & FIRST-LAUNCH GUIDE        
================================================================================

Thank you for choosing PDF Presenter Suite!

--------------------------------------------------------------------------------
1. HOW TO INSTALL (DRAG & DROP)
--------------------------------------------------------------------------------
1. Drag the "PDF Presenter Suite" application icon into the "Applications" 
   folder shortcut in this window.
2. Wait a few seconds for the file copy to complete.


--------------------------------------------------------------------------------
2. FIRST-LAUNCH ON MACOS (GATEKEEPER OPEN-SOURCE NOTICE)
--------------------------------------------------------------------------------
Because PDF Presenter Suite is 100% free, community-funded, and open-source 
(distributed outside Apple's paid Mac App Store), macOS Gatekeeper attaches a
quarantine security attribute to downloads from Safari / Chrome.

When double-clicking for the first time, macOS may display:
  "PDF Presenter Suite is damaged and can't be opened. 
   You should move it to the Trash."

THE APP IS NOT DAMAGED! This is simply Apple's default message for un-notarized 
community software.


--------------------------------------------------------------------------------
3. HOW TO LAUNCH IN 2 CLICKS (NO TERMINAL REQUIRED)
--------------------------------------------------------------------------------
1. Open your "Applications" folder in Finder.
2. DO NOT regular double-click. Instead:
   --> RIGHT-CLICK (or hold Control and click) "PDF Presenter Suite.app"
   --> Click "Open" from the context menu.
3. A macOS confirmation prompt will appear asking to confirm. Click "Open".

Once opened this way, macOS permanently whitelists PDF Presenter Suite on your Mac.
You can open it normally with a regular double-click or via Spotlight anytime!


--------------------------------------------------------------------------------
4. ALTERNATIVE: ONE-LINE TERMINAL FIX
--------------------------------------------------------------------------------
If you prefer using Terminal, open Terminal (Cmd + Space, type "Terminal") and run:

  xattr -cr "/Applications/PDF Presenter Suite.app"

Then press Enter. PDF Presenter Suite will launch immediately.


--------------------------------------------------------------------------------
5. PREFER PACKAGE MANAGERS? USE HOMEBREW CASK
--------------------------------------------------------------------------------
If you have Homebrew installed, you can install and update PDF Presenter Suite 
without ever seeing Gatekeeper warnings:

  brew tap SHARUNJOSEPH/pdf-presenter https://github.com/SHARUNJOSEPH/pdf-presenter
  brew install --cask pdf-presenter


================================================================================
Official GitHub Repository & Releases:
https://github.com/SHARUNJOSEPH/pdf-presenter

Licensed under MIT. Copyright (c) 2026 Joseph Sharun.
================================================================================
