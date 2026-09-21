const { app, BrowserWindow } = require('electron');
const path = require('path');

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

  await win.loadFile(path.join(__dirname, '../views/confidence.html'));
  await new Promise(r => setTimeout(r, 500));

  const report = await win.webContents.executeJavaScript(`
    (() => {
      const getElemReport = (id) => {
        const el = document.getElementById(id);
        if (!el) return { error: 'NOT_FOUND' };
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          id,
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          height: cs.height,
          width: cs.width,
          flex: cs.flex,
          flexGrow: cs.flexGrow,
          flexShrink: cs.flexShrink,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }
        };
      };

      return {
        body: {
          height: document.body.offsetHeight,
          width: document.body.offsetWidth
        },
        container: getElemReport('confContainer'),
        topBar: getElemReport('confTopBar'),
        mainContent: getElemReport('confMainContent'),
        grid: getElemReport('confDashboardGrid'),
        timer: getElemReport('dockWindowTimer'),
        current: getElemReport('dockWindowCurrent'),
        notes: getElemReport('dockWindowNotes')
      };
    })()
  `);

  console.log(JSON.stringify(report, null, 2));
  app.quit();
});
