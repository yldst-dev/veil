import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow } from 'electron'

import { registerIpcHandlers } from '@/main/ipc'
import { logger } from '@/main/logger'
import { QueueManager } from '@/main/queue-manager'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const queueManager = new QueueManager()

function resolveDevelopmentIconPath() {
  const iconPath = path.join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(iconPath) ? iconPath : null
}

function createMainWindow(): BrowserWindow {
  const developmentIconPath = process.env.VITE_DEV_SERVER_URL
    ? resolveDevelopmentIconPath()
    : null

  const window = new BrowserWindow({
    width: 640,
    height: 480,
    resizable: false,
    backgroundColor: '#fafafa',
    icon: developmentIconPath ?? undefined,
    webPreferences: {
      preload: path.join(currentDirectory, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      sandbox: false,
      devTools: false
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(path.join(currentDirectory, '..', 'renderer', 'index.html'))
  }

  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process gone', {
      reason: details.reason,
      exitCode: details.exitCode
    })

    if (!window.isDestroyed()) {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.webContents.reloadIgnoringCache()
        }
      }, 250)
    }
  })

  window.on('unresponsive', () => {
    logger.warn('BrowserWindow became unresponsive')
  })

  window.on('responsive', () => {
    logger.info('BrowserWindow responsive again')
  })

  return window
}

app.whenReady().then(async () => {
  await queueManager.initialize()

  const developmentIconPath = process.env.VITE_DEV_SERVER_URL
    ? resolveDevelopmentIconPath()
    : null

  if (process.platform === 'darwin' && developmentIconPath) {
    app.dock?.setIcon(developmentIconPath)
  }

  registerIpcHandlers(queueManager)
  createMainWindow()
  void queueManager.checkForUpdates()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
