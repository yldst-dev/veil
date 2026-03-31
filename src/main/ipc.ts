import { dialog, ipcMain, shell, webContents } from 'electron'

import {
  cancelJobInputSchema,
  enqueueFilesInputSchema,
  ipcChannels,
  outputTargetInputSchema,
  removeJobInputSchema,
  setLocaleInputSchema,
  setProcessingSettingsInputSchema,
  startProcessingInputSchema
} from '@/shared/ipc'
import { translate } from '@/shared/i18n'
import { logger } from '@/main/logger'
import { QueueManager } from '@/main/queue-manager'

export function registerIpcHandlers(queueManager: QueueManager) {
  ipcMain.handle(ipcChannels.getState, () => queueManager.getState())
  ipcMain.handle(ipcChannels.checkForAppUpdates, () =>
    queueManager.checkForUpdates()
  )

  ipcMain.handle(ipcChannels.pickPdfFiles, async () => {
    const locale = queueManager.getState().settings.locale
    const result = await dialog.showOpenDialog({
      title: translate(locale, 'dialog.pickPdfs'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF files', extensions: ['pdf'] }]
    })

    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(ipcChannels.setOutputDirectory, async () => {
    const locale = queueManager.getState().settings.locale
    const result = await dialog.showOpenDialog({
      title: translate(locale, 'dialog.pickOutputDirectory'),
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled) {
      return queueManager.getState().settings.outputDirectory
    }

    const selectedPath = result.filePaths[0] ?? null
    await queueManager.setOutputDirectory(selectedPath)
    return selectedPath
  })

  ipcMain.handle(ipcChannels.setLocale, async (_event, input) => {
    const payload = setLocaleInputSchema.parse(input)
    return queueManager.setLocale(payload.locale)
  })

  ipcMain.handle(ipcChannels.setProcessingSettings, async (_event, input) => {
    const payload = setProcessingSettingsInputSchema.parse(input)
    return queueManager.setProcessingSettings(payload)
  })

  ipcMain.handle(ipcChannels.enqueueFiles, async (_event, input) => {
    const payload = enqueueFilesInputSchema.parse(input)
    return queueManager.enqueueFiles(payload.filePaths)
  })

  ipcMain.handle(ipcChannels.startProcessing, async (_event, input) => {
    const payload = startProcessingInputSchema.parse(input)
    return queueManager.startProcessing(payload)
  })

  ipcMain.handle(ipcChannels.cancelJob, async (_event, input) => {
    const payload = cancelJobInputSchema.parse(input)
    return queueManager.cancelJob(payload)
  })

  ipcMain.handle(ipcChannels.removeJob, (_event, input) => {
    const payload = removeJobInputSchema.parse(input)
    return queueManager.removeJob(payload.jobId)
  })

  ipcMain.handle(ipcChannels.openOutputTarget, async (_event, input) => {
    const payload = outputTargetInputSchema.parse(input)

    if (payload.path.endsWith('.pdf')) {
      shell.showItemInFolder(payload.path)
      return
    }

    const error = await shell.openPath(payload.path)

    if (error) {
      logger.warn('Failed to open output target', { error, path: payload.path })
      throw new Error(error)
    }
  })

  ipcMain.handle(ipcChannels.openAppReleasePage, async () => {
    const releasePageUrl = queueManager.getReleasePageUrl()
    try {
      await shell.openExternal(releasePageUrl)
    } catch (error) {
      logger.warn('Failed to open release page', {
        error: error instanceof Error ? error.message : String(error),
        releasePageUrl
      })
      throw error
    }
  })

  queueManager.subscribe(state => {
    for (const content of webContents.getAllWebContents()) {
      content.send(ipcChannels.stateChanged, { state })
    }
  })
}
