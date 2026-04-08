const { app, BrowserWindow, screen } = require('electron')

// Handle Squirrel.Windows install/update/uninstall events.
// When launched by the installer with --squirrel-* args, this module
// creates/removes shortcuts and returns true so we quit immediately,
// preventing a second overlay window from spawning alongside the real launch.
if (require('electron-squirrel-startup')) {
  app.quit()
  return
}

const path = require('path')

let win;

function createWindow () {

  const display = screen.getPrimaryDisplay()

  win = new BrowserWindow({
    width: 520,
    height: 420,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      devTools: false,
    },
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    x: display.bounds.width-480,
    y: display.bounds.height-320,
    hasShadow: false,
    maximizable: false,
    resizable: false,
    fullscreen: false
  })
  win.setMenuBarVisibility(false)
  win.loadFile('index.html')

  // The constructor's alwaysOnTop defaults to 'floating', which full-screen
  // Chromium windows and some conferencing apps can still cover. 'screen-saver'
  // is the highest standard level.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true)

  // If another app steals focus and demotes our z-order, reassert it.
  win.on('blur', () => {
    win.setAlwaysOnTop(true, 'screen-saver')
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});