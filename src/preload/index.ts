import { contextBridge, ipcRenderer, webUtils } from 'electron'

import { appStateSchema } from '@/shared/app-state'
import {
  type CancelJobInput,
  type EnqueueFilesInput,
  ipcChannels,
  type OutputTargetInput,
  type RemoveJobInput,
  setLocaleInputSchema,
  setProcessingSettingsInputSchema,
  startProcessingInputSchema,
  stateChangedEventSchema,
  type VeilDesktopApi
} from '@/shared/ipc'

const veilApi: VeilDesktopApi = {
  async getState() {
    return appStateSchema.parse(await ipcRenderer.invoke(ipcChannels.getState))
  },
  async pickPdfFiles() {
    return ipcRenderer.invoke(ipcChannels.pickPdfFiles)
  },
  async pickOutputDirectory() {
    return ipcRenderer.invoke(ipcChannels.setOutputDirectory)
  },
  setLocale(input) {
    return ipcRenderer.invoke(
      ipcChannels.setLocale,
      setLocaleInputSchema.parse(input)
    )
  },
  setProcessingSettings(input) {
    return ipcRenderer.invoke(
      ipcChannels.setProcessingSettings,
      setProcessingSettingsInputSchema.parse(input)
    )
  },
  enqueueFiles(input: EnqueueFilesInput) {
    return ipcRenderer.invoke(ipcChannels.enqueueFiles, input)
  },
  startProcessing(input) {
    return ipcRenderer.invoke(
      ipcChannels.startProcessing,
      startProcessingInputSchema.parse(input)
    )
  },
  cancelJob(input: CancelJobInput) {
    return ipcRenderer.invoke(ipcChannels.cancelJob, input)
  },
  removeJob(input: RemoveJobInput) {
    return ipcRenderer.invoke(ipcChannels.removeJob, input)
  },
  openOutputTarget(input: OutputTargetInput) {
    return ipcRenderer.invoke(ipcChannels.openOutputTarget, input)
  },
  subscribeToStateChanged(listener) {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      listener(stateChangedEventSchema.parse(payload))
    }

    ipcRenderer.on(ipcChannels.stateChanged, wrappedListener)

    return () => {
      ipcRenderer.removeListener(ipcChannels.stateChanged, wrappedListener)
    }
  }
}

contextBridge.exposeInMainWorld('veil', {
  platform: process.platform,
  getPathForDroppedFile(file: File) {
    return webUtils.getPathForFile(file)
  }
})

contextBridge.exposeInMainWorld('veilApp', veilApi)
