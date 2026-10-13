================================================================================
           PDF PRESENTER SUITE — MACOS INSTALLATION & FIRST-LAUNCH GUIDE        
================================================================================

Thank you for choosing PDF Presenter Suite!

--------------------------------------------------------------------------------
METHOD 1: AUTOMATED 1-CLICK SCRIPT (EASIEST)
--------------------------------------------------------------------------------
1. In this installer window, double-click:
   --> "Install-and-Launch.command"
2. (If macOS asks for permission, Right-Click "Install-and-Launch.command" 
   and click "Open").
3. The script will automatically copy the application to your Applications 
   folder, clear the Gatekeeper quarantine flag, and launch the app immediately!


--------------------------------------------------------------------------------
METHOD 2: MANUAL DRAG & DROP INSTALLATION
--------------------------------------------------------------------------------
1. Drag the "PDF Presenter Suite" application icon into the "Applications" 
   folder shortcut in this window.
2. In Finder, open your "Applications" folder.
3. DO NOT regular double-click. Instead:
   --> RIGHT-CLICK (or hold Control and click) "PDF Presenter Suite.app"
   --> Click "Open" from the context menu.
4. When the confirmation prompt appears, click "Open".

Once opened this way, macOS permanently whitelists PDF Presenter Suite. You can 
launch it normally with a standard double-click anytime in the future!


--------------------------------------------------------------------------------
WHY DOES MACOS SHOW "APP IS DAMAGED"?
--------------------------------------------------------------------------------
Because PDF Presenter Suite is 100% free and open-source (un-notarized 
community software), macOS Gatekeeper flags web browser downloads with:
  "PDF Presenter Suite is damaged and can't be opened. 
   You should move it to the Trash."

THE APP IS NOT DAMAGED! This is simply Apple's default message for software
distributed outside their paid developer program. Running either Method 1 or
Method 2 above bypasses this completely.


--------------------------------------------------------------------------------
ALTERNATIVE: TERMINAL ONE-LINER
--------------------------------------------------------------------------------
If you prefer Terminal, simply run:

  xattr -cr "/Applications/PDF Presenter Suite.app"


--------------------------------------------------------------------------------
PREFER PACKAGE MANAGERS? USE HOMEBREW CASK
--------------------------------------------------------------------------------
If you have Homebrew installed, you can install without any browser flags:

  brew tap SHARUNJOSEPH/pdf-presenter https://github.com/SHARUNJOSEPH/pdf-presenter
  brew install --cask pdf-presenter


================================================================================
Official GitHub Repository & Releases:
https://github.com/SHARUNJOSEPH/pdf-presenter

Licensed under MIT. Copyright (c) 2026 Joseph Sharun.
================================================================================
