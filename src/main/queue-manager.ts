import { copyFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { ChildProcess, fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { app } from 'electron'
import Store from 'electron-store'

import {
  type AppState,
  appStateSchema,
  defaultRecognitionLanguages,
  type PdfDetection,
  type ProcessingTuningValues,
  type QueueListItem
} from '@/shared/app-state'
import { detectUiLocale, translate, type UiLocale } from '@/shared/i18n'
import type {
  CancelJobInput,
  QueueActionResult,
  StartProcessingInput
} from '@/shared/ipc'
import type {
  WorkerProgressMessage,
  WorkerStartJobMessage
} from '@/shared/worker'
import { workerProgressMessageSchema } from '@/shared/worker'
import {
  createOutputFilePath,
  createTemporaryOutputPath
} from '@/services/files/path-utils'
import { MacSystemOCRProvider } from '@/services/ocr/mac-system-ocr-provider'
import { inspectPdfFile } from '@/services/pdf/pdf-analysis'
import { logger } from '@/main/logger'
import {
  getEffectiveProcessingRuntime,
  normalizeProcessingTuningValues
} from '@/main/processing-config'
import {
  getRepositoryReleasesUrl,
  resolveLatestReleaseInfo
} from '@/main/update-checker'

const store = new Store<{
  outputDirectory: string | null
  recognitionLanguages: string[]
  supportedRecognitionLanguages: string[]
  locale: UiLocale
  processingSettings: Partial<ProcessingTuningValues>
}>({
  defaults: {
    outputDirectory: app.getPath('downloads'),
    recognitionLanguages: [...defaultRecognitionLanguages],
    supportedRecognitionLanguages: [...defaultRecognitionLanguages],
    locale: detectUiLocale(app.getLocale()),
    processingSettings: {}
  }
})

function resolveInitialOutputDirectory() {
  const storedOutputDirectory = store.get('outputDirectory')

  if (storedOutputDirectory) {
    return storedOutputDirectory
  }

  const downloadsDirectory = app.getPath('downloads')
  store.set('outputDirectory', downloadsDirectory)
  return downloadsDirectory
}

function nowIsoString(): string {
  return new Date().toISOString()
}

function createQueueItem(
  filePath: string,
  detection: PdfDetection,
  pageCount: number,
  message: string
): QueueListItem {
  const timestamp = nowIsoString()
  const baseStatus =
    detection === 'encrypted' || detection === 'malformed' ? 'failed' : 'queued'

  return {
    id: crypto.randomUUID(),
    inputPath: filePath,
    fileName: path.basename(filePath),
    outputPath: null,
    status: baseStatus,
    detection,
    totalPages: pageCount,
    completedPages: 0,
    currentPage: null,
    progressPercent: 0,
    message,
    createdAt: timestamp,
    updatedAt: timestamp,
    errorCode: null
  }
}

function withUpdatedTimestamp<T extends QueueListItem>(
  item: T,
  updates: Partial<QueueListItem>
): T {
  return {
    ...item,
    ...updates,
    updatedAt: nowIsoString()
  }
}

function toActionResult(state: AppState, item?: QueueListItem): QueueActionResult {
  return item ? { state, item } : { state }
}

export class QueueManager {
  private state: AppState = appStateSchema.parse({
    items: [],
    settings: {
      outputDirectory: resolveInitialOutputDirectory(),
      recognitionLanguages: store.get('recognitionLanguages'),
      supportedRecognitionLanguages: store.get('supportedRecognitionLanguages'),
      locale: store.get('locale'),
      processing: normalizeProcessingTuningValues(store.get('processingSettings'))
    },
    update: {
      currentVersion: app.getVersion(),
      status: 'idle',
      latestVersion: null,
      releaseName: null,
      releaseUrl: null,
      publishedAt: null,
      checkedAt: null
    },
    isProcessing: false,
    activeJobId: null
  })

  private readonly listeners = new Set<(state: AppState) => void>()
  private readonly currentWorkers = new Map<string, ChildProcess>()
  private readonly temporaryOutputPaths = new Map<string, string>()
  private readonly ocrProvider = new MacSystemOCRProvider()
  private queueRunning = false
  private isFillingWorkerPool = false
  private isCheckingForUpdates = false
  private refillRequested = false

  getState(): AppState {
    return this.state
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async initialize() {
    try {
      const supportedRecognitionLanguages =
        await this.ocrProvider.getSupportedRecognitionLanguages?.()

      if (!supportedRecognitionLanguages || supportedRecognitionLanguages.length === 0) {
        return
      }

      const filteredRecognitionLanguages = defaultRecognitionLanguages.filter(
        language => supportedRecognitionLanguages.includes(language)
      )
      const nextRecognitionLanguages =
        filteredRecognitionLanguages.length > 0
          ? filteredRecognitionLanguages
          : [supportedRecognitionLanguages[0]]

      this.state = this.withRuntimeState({
        ...this.state,
        settings: {
          ...this.state.settings,
          recognitionLanguages: nextRecognitionLanguages,
          supportedRecognitionLanguages
        }
      })
      store.set('recognitionLanguages', nextRecognitionLanguages)
      store.set('supportedRecognitionLanguages', supportedRecognitionLanguages)
      this.emitStateChanged()
    } catch (error) {
      logger.warn('Failed to detect supported OCR recognition languages', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async enqueueFiles(filePaths: string[]): Promise<QueueActionResult> {
    for (const filePath of filePaths) {
      const inspection = await inspectPdfFile(filePath, this.state.settings.locale)
      const item = createQueueItem(
        filePath,
        inspection.detection,
        inspection.pageCount,
        inspection.message
      )

      this.state = this.withRuntimeState({
        ...this.state,
        items: [...this.state.items, item]
      })
      this.emitStateChanged()
    }

    if (this.queueRunning) {
      void this.fillWorkerPool()
    }

    return toActionResult(this.state)
  }

  async setOutputDirectory(outputDirectory: string | null) {
    const nextOutputDirectory = outputDirectory ?? app.getPath('downloads')

    this.state = this.withRuntimeState({
      ...this.state,
      settings: {
        ...this.state.settings,
        outputDirectory: nextOutputDirectory
      }
    })
    store.set('outputDirectory', nextOutputDirectory)
    this.emitStateChanged()
    return this.state.settings.outputDirectory
  }

  async setLocale(locale: UiLocale) {
    this.state = this.withRuntimeState({
      ...this.state,
      settings: {
        ...this.state.settings,
        locale
      }
    })
    store.set('locale', locale)
    this.emitStateChanged()
    return this.state
  }

  async setProcessingSettings(input: Partial<ProcessingTuningValues>) {
    const nextProcessing = normalizeProcessingTuningValues({
      ...this.state.settings.processing.values,
      ...input
    })

    this.state = this.withRuntimeState({
      ...this.state,
      settings: {
        ...this.state.settings,
        processing: nextProcessing
      }
    })
    store.set('processingSettings', nextProcessing.values)
    this.emitStateChanged()

    if (this.queueRunning) {
      void this.fillWorkerPool()
    }

    return this.state
  }

  async checkForUpdates() {
    if (this.isCheckingForUpdates) {
      return this.state
    }

    this.isCheckingForUpdates = true
    this.state = this.withRuntimeState({
      ...this.state,
      update: {
        ...this.state.update,
        status: 'checking'
      }
    })
    this.emitStateChanged()

    try {
      const releaseInfo = await resolveLatestReleaseInfo(
        this.state.update.currentVersion
      )

      this.state = this.withRuntimeState({
        ...this.state,
        update: {
          ...this.state.update,
          status: releaseInfo.isUpdateAvailable ? 'available' : 'current',
          latestVersion: releaseInfo.latestVersion,
          releaseName: releaseInfo.releaseName,
          releaseUrl: releaseInfo.releaseUrl,
          publishedAt: releaseInfo.publishedAt,
          checkedAt: nowIsoString()
        }
      })
    } catch (error) {
      logger.warn('Failed to check for updates', {
        error: error instanceof Error ? error.message : String(error)
      })

      this.state = this.withRuntimeState({
        ...this.state,
        update: {
          ...this.state.update,
          status: 'error',
          checkedAt: nowIsoString()
        }
      })
    } finally {
      this.isCheckingForUpdates = false
    }

    this.emitStateChanged()
    return this.state
  }

  getReleasePageUrl() {
    return this.state.update.releaseUrl ?? getRepositoryReleasesUrl()
  }

  async startProcessing(input: StartProcessingInput): Promise<QueueActionResult> {
    if (input.outputDirectory !== undefined) {
      await this.setOutputDirectory(input.outputDirectory)
    }

    this.queueRunning = true
    this.state = this.withRuntimeState({
      ...this.state,
      settings: {
        ...this.state.settings,
        recognitionLanguages: input.recognitionLanguages
      }
    })
    store.set('recognitionLanguages', input.recognitionLanguages)
    const effectiveRuntime = this.getEffectiveProcessingRuntime()
    logger.info('Starting OCR queue', {
      requested: this.state.settings.processing.values,
      effective: {
        maxConcurrentJobs: effectiveRuntime.maxConcurrentJobs,
        maxConcurrentPagesPerJob: effectiveRuntime.maxConcurrentPagesPerJob,
        rasterScale: effectiveRuntime.rasterScale,
        minimumConfidence: effectiveRuntime.minimumConfidence
      },
      totalPageBudget: effectiveRuntime.totalPageBudget,
      detectedParallelism: effectiveRuntime.detectedParallelism
    })
    this.emitStateChanged()

    void this.fillWorkerPool()
    return toActionResult(this.state)
  }

  async cancelJob(input: CancelJobInput): Promise<QueueActionResult> {
    const worker = this.currentWorkers.get(input.jobId)
    const targetItem = this.findItem(input.jobId)

    if (worker) {
      worker.kill('SIGTERM')
      this.currentWorkers.delete(input.jobId)
      await this.cleanupTemporaryOutput(input.jobId)

      this.state = this.replaceItem(input.jobId, item =>
        withUpdatedTimestamp(item, {
          status: 'cancelled',
          message: this.t('queue.cancelledByUser'),
          currentPage: null,
          errorCode: null
        })
      )
      this.emitStateChanged()
      void this.fillWorkerPool()
      return toActionResult(this.state, this.findItem(input.jobId))
    }

    if (targetItem?.status === 'queued' || !this.queueRunning) {
      return this.removeJob(input.jobId)
    }

    this.state = this.replaceItem(input.jobId, item =>
      withUpdatedTimestamp(item, {
        status: 'cancelled',
        message: this.t('queue.removedBeforeStart'),
        errorCode: null
      })
    )

    if (
      this.queueRunning &&
      !this.currentWorkers.size &&
      !this.state.items.some(item => item.status === 'queued')
    ) {
      this.queueRunning = false
      this.state = this.withRuntimeState(this.state)
    }

    this.emitStateChanged()
    return toActionResult(this.state, this.findItem(input.jobId))
  }

  removeJob(jobId: string): QueueActionResult {
    this.state = this.withRuntimeState({
      ...this.state,
      items: this.state.items.filter(item => item.id !== jobId)
    })
    this.emitStateChanged()
    return toActionResult(this.state)
  }

  private async fillWorkerPool(): Promise<void> {
    if (this.isFillingWorkerPool) {
      this.refillRequested = true
      return
    }

    this.isFillingWorkerPool = true

    try {
      do {
        this.refillRequested = false
        await this.fillWorkerPoolOnce()
      } while (this.refillRequested)
    } finally {
      this.isFillingWorkerPool = false
    }
  }

  private async fillWorkerPoolOnce(): Promise<void> {
    if (!this.queueRunning) {
      return
    }

    const outputDirectory = this.state.settings.outputDirectory

    if (!outputDirectory) {
      const nextItem = this.state.items.find(item => item.status === 'queued')

      if (nextItem) {
        this.state = this.replaceItem(nextItem.id, item =>
          withUpdatedTimestamp(item, {
            status: 'failed',
            errorCode: 'missing-output-directory',
            message: this.t('queue.missingOutputDirectory')
          })
        )
      }

      this.queueRunning = false
      this.state = this.withRuntimeState(this.state)
      this.emitStateChanged()
      return
    }

    const effectiveRuntime = this.getEffectiveProcessingRuntime()

    while (
      this.queueRunning &&
      this.currentWorkers.size < effectiveRuntime.maxConcurrentJobs
    ) {
      const nextItem = this.state.items.find(item => item.status === 'queued')

      if (!nextItem) {
        break
      }

      if (
        nextItem.detection === 'encrypted' ||
        nextItem.detection === 'malformed'
      ) {
        this.state = this.replaceItem(nextItem.id, item =>
          withUpdatedTimestamp(item, {
            status: 'failed'
          })
        )
        this.emitStateChanged()
        continue
      }

      const outputPath = createOutputFilePath(nextItem.inputPath, outputDirectory)

      if (nextItem.detection === 'already-searchable') {
        await copyFile(nextItem.inputPath, outputPath)
        this.state = this.replaceItem(nextItem.id, item =>
          withUpdatedTimestamp(item, {
            status: 'completed',
            outputPath,
            completedPages: item.totalPages,
            progressPercent: 100,
            currentPage: null,
            message: this.t('queue.alreadySearchableCopied')
          })
        )
        this.emitStateChanged()
        continue
      }

      this.launchWorker(nextItem, outputPath, effectiveRuntime.maxConcurrentPagesPerJob)
    }

    if (
      this.queueRunning &&
      this.currentWorkers.size === 0 &&
      !this.state.items.some(item => item.status === 'queued')
    ) {
      this.queueRunning = false
      this.state = this.withRuntimeState(this.state)
      this.emitStateChanged()
    }
  }

  private launchWorker(
    item: QueueListItem,
    outputPath: string,
    pageConcurrency: number
  ) {
    const workerMessage: WorkerStartJobMessage = {
      type: 'start-job',
      jobId: item.id,
      inputPath: item.inputPath,
      outputPath,
      fontPath: this.resolveFontPath(),
      recognitionLanguages: this.state.settings.recognitionLanguages,
      minimumConfidence: this.state.settings.processing.values.minimumConfidence,
      rasterScale: this.state.settings.processing.values.rasterScale,
      pageConcurrency
    }

    const temporaryOutputPath = createTemporaryOutputPath(outputPath)
    this.temporaryOutputPaths.set(item.id, temporaryOutputPath)

    this.state = this.replaceItem(item.id, queueItem =>
      withUpdatedTimestamp(queueItem, {
        status: 'processing',
        outputPath,
        currentPage: 1,
        message: this.t('queue.launchingWorker')
      })
    )
    this.emitStateChanged()

    const worker = fork(this.resolveWorkerEntrypoint(), {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    })
    this.currentWorkers.set(item.id, worker)

    worker.on('message', message => {
      const result = workerProgressMessageSchema.safeParse(message)

      if (!result.success) {
        logger.warn('Ignored invalid worker message', {
          issues: result.error.issues
        })
        return
      }

      this.handleWorkerMessage(result.data)
    })

    worker.once('exit', code => {
      logger.info('Worker exited', { code, jobId: workerMessage.jobId })

      if (this.currentWorkers.get(workerMessage.jobId) === worker) {
        this.currentWorkers.delete(workerMessage.jobId)
      }

      const activeJob = this.findItem(workerMessage.jobId)
      const workerExitedUnexpectedly = activeJob?.status === 'processing'

      if (!workerExitedUnexpectedly) {
        this.state = this.withRuntimeState(this.state)
        this.emitStateChanged()
        void this.fillWorkerPool()
        return
      }

      void this.cleanupTemporaryOutput(workerMessage.jobId)
      this.state = this.replaceItem(workerMessage.jobId, queueItem =>
        withUpdatedTimestamp(queueItem, {
          status: 'failed',
          currentPage: null,
          errorCode: 'worker-exited',
          message:
            code === 0
              ? this.t('queue.workerExited')
              : this.t('queue.workerExitedWithCode', {
                  code: code ?? 'unknown'
                })
        })
      )
      this.emitStateChanged()
      void this.fillWorkerPool()
    })

    worker.send(workerMessage)
  }

  private handleWorkerMessage(message: WorkerProgressMessage) {
    switch (message.type) {
      case 'job-started':
        this.state = this.replaceItem(message.jobId, item =>
          withUpdatedTimestamp(item, {
            status: 'processing',
            outputPath: message.outputPath,
            totalPages: message.totalPages,
            message: this.t('queue.workerStarted')
          })
        )
        this.emitStateChanged()
        return

      case 'page-completed':
        this.state = this.replaceItem(message.jobId, item =>
          withUpdatedTimestamp(item, {
            status: 'processing',
            completedPages: message.completedPages,
            currentPage: message.currentPage,
            progressPercent: Math.round(
              (message.completedPages / message.totalPages) * 100
            ),
            message: this.t('queue.pageProcessed', {
              current: message.currentPage,
              total: message.totalPages
            })
          })
        )
        this.emitStateChanged()
        return

      case 'job-completed':
        this.currentWorkers.delete(message.jobId)
        this.temporaryOutputPaths.delete(message.jobId)
        this.state = this.replaceItem(message.jobId, item =>
          withUpdatedTimestamp(item, {
            status: 'completed',
            outputPath: message.outputPath,
            completedPages: message.totalPages,
            currentPage: null,
            progressPercent: 100,
            message: this.t('queue.savedSuccess')
          })
        )
        this.emitStateChanged()
        void this.fillWorkerPool()
        return

      case 'job-failed':
        this.currentWorkers.delete(message.jobId)
        void this.cleanupTemporaryOutput(message.jobId)
        this.state = this.replaceItem(message.jobId, item =>
          withUpdatedTimestamp(item, {
            status: 'failed',
            currentPage: null,
            errorCode: message.errorCode,
            message: message.message
          })
        )
        this.emitStateChanged()
        void this.fillWorkerPool()
        return
    }
  }

  private findItem(jobId: string): QueueListItem | undefined {
    return this.state.items.find(item => item.id === jobId)
  }

  private t(
    key: Parameters<typeof translate>[1],
    params?: Parameters<typeof translate>[2]
  ) {
    return translate(this.state.settings.locale, key, params)
  }

  private getEffectiveProcessingRuntime() {
    return getEffectiveProcessingRuntime(
      this.state.settings.processing.values,
      this.state.settings.processing.detectedParallelism
    )
  }

  private replaceItem(
    jobId: string,
    updater: (item: QueueListItem) => QueueListItem
  ): AppState {
    return this.withRuntimeState({
      ...this.state,
      items: this.state.items.map(item =>
        item.id === jobId ? updater(item) : item
      )
    })
  }

  private withRuntimeState(state: AppState): AppState {
    const activeJobId =
      state.items.find(item => item.status === 'processing')?.id ?? null

    return appStateSchema.parse({
      ...state,
      isProcessing: this.queueRunning,
      activeJobId
    })
  }

  private emitStateChanged() {
    const snapshot = this.getState()

    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  private async cleanupTemporaryOutput(jobId: string) {
    const temporaryOutputPath = this.temporaryOutputPaths.get(jobId)

    if (!temporaryOutputPath) {
      return
    }

    await rm(temporaryOutputPath, { force: true })
    this.temporaryOutputPaths.delete(jobId)
  }

  private resolveWorkerEntrypoint(): string {
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
    return path.join(currentDirectory, 'workers', 'processor.cjs')
  }

  private resolveFontPath(): string {
    if (app.isPackaged) {
      return path.join(
        process.resourcesPath,
        'fonts',
        'NotoSansCJKkr-Regular.otf'
      )
    }

    return path.join(
      process.cwd(),
      'resources',
      'fonts',
      'NotoSansCJKkr-Regular.otf'
    )
  }
}
