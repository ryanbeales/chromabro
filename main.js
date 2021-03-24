const { app, BrowserWindow, screen } = require('electron')
const path = require('path')

function createWindow () {

  const display = screen.getPrimaryDisplay()

  const win = new BrowserWindow({
    width: 520,
    height: 420,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    },
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    x: display.bounds.width-480,
    y: display.bounds.height-320
  })
  win.setMenuBarVisibility(false)
  win.loadFile('index.html')
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
    app.quit()
  }
})
