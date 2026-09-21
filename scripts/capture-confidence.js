const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js')
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Confidence Console ${level}]: ${message} (${sourceId}:${line})`);
  });

  await win.loadFile(path.join(__dirname, '../views/confidence.html'));
  await new Promise(r => setTimeout(r, 1500));

  const image = await win.webContents.capturePage();
  const destPath = 'C:/Users/user/.gemini/antigravity/brain/41ac0ba7-4074-4827-af2a-a36e576a623d/confidence_screen.png';
  fs.writeFileSync(destPath, image.toPNG());
  console.log('Screenshot written to:', destPath);

  // Inspect DOM state
  const domInfo = await win.webContents.executeJavaScript(`
    (() => {
      const grid = document.getElementById('confDashboardGrid');
      const items = Array.from(grid ? grid.children : []).map(el => ({
        id: el.id,
        tagName: el.tagName,
        className: el.className,
        styleGridColumn: el.style.gridColumn,
        styleGridRow: el.style.gridRow,
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
        display: window.getComputedStyle(el).display,
        visibility: window.getComputedStyle(el).visibility
      }));
      return {
        gridCols: window.getComputedStyle(grid).gridTemplateColumns,
        gridRows: window.getComputedStyle(grid).gridTemplateRows,
        gridWidth: grid.offsetWidth,
        gridHeight: grid.offsetHeight,
        topBarDimmed: document.getElementById('confTopBar')?.classList.contains('hud-dimmed'),
        topBarDisplay: window.getComputedStyle(document.getElementById('confTopBar')).display,
        topBarOpacity: window.getComputedStyle(document.getElementById('confTopBar')).opacity,
        items
      };
    })()
  `);

  console.log('DOM Info:', JSON.stringify(domInfo, null, 2));

  app.quit();
});
