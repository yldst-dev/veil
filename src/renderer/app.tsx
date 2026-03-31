import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Globe02Icon,
  FolderOpenIcon,
  ScanIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { QueuePreview } from '@/components/queue-preview'
import { Button } from '@/components/ui/button'
import { I18nProvider, useI18n } from '@/hooks/use-i18n'
import { useVeilDesktop } from '@/hooks/use-veil-desktop'
import type { UiLocale } from '@/shared/i18n'
import type { ProcessingTuningValues } from '@/shared/app-state'

type FileWithPath = File & { path?: string }
type Tab = 'convert' | 'queue' | 'settings' | 'about'
type ProcessingField = keyof ProcessingTuningValues

export function App() {
  const desktop = useVeilDesktop()

  return (
    <I18nProvider locale={desktop.state.settings.locale}>
      <AppScreen {...desktop} />
    </I18nProvider>
  )
}

function AppScreen({
  state,
  errorMessage,
  isActing,
  isAddingFiles,
  clearError,
  choosePdfFiles,
  enqueueDroppedFiles,
  chooseOutputDirectory,
  startProcessing,
  cancelJob,
  removeJob,
  openOutputTarget,
  checkForAppUpdates,
  openAppReleasePage,
  setLocale,
  setProcessingSettings
}: ReturnType<typeof useVeilDesktop>) {
  const { t, locale, localeOptions } = useI18n()
  const [activeTab, setActiveTab] = useState<Tab>('convert')
  const [isDragging, setIsDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const [processingDrafts, setProcessingDrafts] = useState<
    Record<ProcessingField, string>
  >(() => ({
    maxConcurrentJobs: String(state.settings.processing.values.maxConcurrentJobs),
    maxConcurrentPagesPerJob: String(
      state.settings.processing.values.maxConcurrentPagesPerJob
    ),
    rasterScale: String(state.settings.processing.values.rasterScale),
    minimumConfidence: String(state.settings.processing.values.minimumConfidence)
  }))

  const queuedCount = useMemo(
    () => state.items.filter(item => item.status === 'queued').length,
    [state.items]
  )

  useEffect(() => {
    setProcessingDrafts({
      maxConcurrentJobs: String(state.settings.processing.values.maxConcurrentJobs),
      maxConcurrentPagesPerJob: String(
        state.settings.processing.values.maxConcurrentPagesPerJob
      ),
      rasterScale: String(state.settings.processing.values.rasterScale),
      minimumConfidence: String(state.settings.processing.values.minimumConfidence)
    })
  }, [
    state.settings.processing.values.maxConcurrentJobs,
    state.settings.processing.values.maxConcurrentPagesPerJob,
    state.settings.processing.values.rasterScale,
    state.settings.processing.values.minimumConfidence
  ])

  const canStart =
    Boolean(state.settings.outputDirectory) &&
    state.items.some(item => item.status === 'queued') &&
    !state.isProcessing

  const performanceFields: Array<{
    key: ProcessingField
    label: string
    min: number
    step: number
  }> = [
    {
      key: 'maxConcurrentJobs',
      label: t('field.maxConcurrentJobs'),
      min: 1,
      step: 1
    },
    {
      key: 'maxConcurrentPagesPerJob',
      label: t('field.maxConcurrentPagesPerJob'),
      min: 1,
      step: 1
    },
    {
      key: 'rasterScale',
      label: t('field.rasterScale'),
      min: 1,
      step: 0.25
    },
    {
      key: 'minimumConfidence',
      label: t('field.minimumConfidence'),
      min: 0,
      step: 0.05
    }
  ]

  const formattedCheckedAt = state.update.checkedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(state.update.checkedAt))
    : t('update.notCheckedYet')

  const latestVersionLabel = state.update.latestVersion
    ? `v${state.update.latestVersion}`
    : null

  const updateStatusLabel =
    state.update.status === 'checking'
      ? t('update.status.checking')
      : state.update.status === 'available'
        ? t('update.status.available', {
            value: latestVersionLabel ?? `v${state.update.currentVersion}`
          })
        : state.update.status === 'current'
          ? t('update.status.current')
          : state.update.status === 'error'
            ? t('update.status.error')
            : t('update.status.idle')

  const updateStatusClass =
    state.update.status === 'available'
      ? 'text-emerald-600'
      : state.update.status === 'error'
        ? 'text-rose-600'
        : 'text-zinc-700'

  function extractPdfPaths(fileList: FileList): string[] {
    return Array.from(fileList)
      .map(file =>
        window.veil?.getPathForDroppedFile(file) ??
        (file as FileWithPath).path ??
        ''
      )
      .filter(filePath => filePath.toLowerCase().endsWith('.pdf'))
  }

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragging(false)
    const filePaths = extractPdfPaths(event.dataTransfer.files)
    if (filePaths.length > 0) {
      await enqueueDroppedFiles(filePaths)
      setActiveTab('queue')
    }
  }

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    if (!isDragging) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

    if (dragDepthRef.current === 0) {
      setIsDragging(false)
    }
  }

  function updateProcessingDraft(field: ProcessingField, value: string) {
    setProcessingDrafts(current => ({
      ...current,
      [field]: value
    }))
  }

  async function commitProcessingField(field: ProcessingField) {
    const rawValue = Number.parseFloat(processingDrafts[field])

    if (!Number.isFinite(rawValue)) {
      setProcessingDrafts(current => ({
        ...current,
        [field]: String(state.settings.processing.values[field])
      }))
      return
    }

    const nextValue = Math.max(
      field === 'minimumConfidence' ? 0 : 1,
      Math.min(state.settings.processing.limits[field], rawValue)
    )

    await setProcessingSettings({
      [field]: nextValue
    } as Pick<ProcessingTuningValues, ProcessingField>)
  }

  async function resetProcessingField(field: ProcessingField) {
    await setProcessingSettings({
      [field]: state.settings.processing.defaults[field]
    } as Pick<ProcessingTuningValues, ProcessingField>)
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-50 text-zinc-900 select-none font-sans">
      <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-200 bg-zinc-50 shrink-0 justify-center relative">
        <NavButton active={activeTab === 'convert'} onClick={() => setActiveTab('convert')} label={t('nav.convert')} />
        <NavButton active={activeTab === 'queue'} onClick={() => setActiveTab('queue')} label={`${t('nav.queue')}${queuedCount > 0 ? ` (${queuedCount})` : ''}`} />
        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label={t('nav.settings')} />
        <NavButton active={activeTab === 'about'} onClick={() => setActiveTab('about')} label={t('nav.about')} />
        <div className="absolute right-4 flex items-center gap-1.5">
          <HugeiconsIcon icon={Globe02Icon} className="size-3.5 text-zinc-400" />
          <select
            value={locale}
            onChange={event => {
              void setLocale(event.target.value as UiLocale)
            }}
            aria-label={t('toolbar.language')}
            className="h-7 min-w-24 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 shadow-none outline-none"
          >
            {localeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="flex-1 flex flex-col relative overflow-hidden"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-50/90 border-2 border-dashed border-blue-400 m-2 rounded">
            <div className="text-sm font-medium text-blue-600 flex items-center gap-2">
              {isAddingFiles ? (
                <LoadingSpinner className="size-5 border-blue-600/30 border-t-blue-600" />
              ) : (
                <HugeiconsIcon icon={ScanIcon} className="size-5" />
              )}
              {t('dropzone.title')}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="m-2 flex items-center justify-between rounded bg-rose-50 px-3 py-2 text-xs text-rose-900 border border-rose-200 shrink-0">
            <span>{errorMessage}</span>
            <button onClick={clearError} className="text-rose-600 font-medium hover:underline">
              {t('action.dismiss')}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden p-3 flex flex-col bg-white">
          {activeTab === 'convert' && (
            <div className="h-full flex flex-col gap-3">
              <div className="flex-1 border border-zinc-200 bg-zinc-50/50 rounded flex flex-col items-center justify-center p-4">
                 <HugeiconsIcon icon={ScanIcon} className="size-8 text-zinc-300 mb-2" />
                 <h2 className="text-base font-medium text-zinc-800 mb-1">{t('convert.title')}</h2>
                 <p className="text-[13px] text-zinc-400 text-center mb-4 leading-none whitespace-nowrap">
                   {t('convert.subtitle')}
                 </p>
                 <div className="flex w-full max-w-[280px]">
                   <Button onClick={() => void choosePdfFiles()} disabled={isActing} className="flex-1 h-8 text-sm shadow-none font-medium">
                     {isAddingFiles && (
                       <LoadingSpinner className="size-3.5 border-white/30 border-t-white" />
                     )}
                     {t('toolbar.addPdfs')}
                   </Button>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'queue' && (
            <div className="h-full flex flex-col border border-zinc-200 rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-zinc-200 flex justify-between items-center bg-zinc-50 shrink-0">
                <span className="text-[13px] font-medium text-zinc-700">{t('queue.monitor')}</span>
                <Button
                  variant="outline"
                  onClick={() => void chooseOutputDirectory()}
                  disabled={isActing}
                  className="h-6 text-xs px-3 shadow-none border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 font-medium"
                >
                  <HugeiconsIcon icon={FolderOpenIcon} className="size-3 mr-1.5" />
                  {t('toolbar.outputFolder')}
                </Button>
              </div>
              <div className="flex-1 overflow-hidden relative bg-white">
                <QueuePreview
                  items={state.items}
                  onCancelJob={jobId => void cancelJob(jobId)}
                  onRemoveJob={jobId => void removeJob(jobId)}
                  onOpenOutput={targetPath => void openOutputTarget(targetPath)}
                />
              </div>
              <div className="border-t border-zinc-200 bg-zinc-50/50 p-3 flex flex-col gap-2 shrink-0">
                <div className="bg-white py-1.5 px-2 rounded border border-zinc-200">
                  <div className="text-[13px] font-medium text-zinc-600">{t('field.outputFolder')}</div>
                  <div className="mt-1 text-xs text-zinc-500 break-all leading-relaxed">
                    {state.settings.outputDirectory || t('field.notSelected')}
                  </div>
                </div>
                <Button
                  onClick={() => void startProcessing()}
                  disabled={!canStart || isActing}
                  className="h-8 text-sm w-full shadow-none font-medium bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                >
                  {t('toolbar.start')}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="h-full border border-zinc-200 rounded p-3 bg-zinc-50/50">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-medium text-zinc-700">
                  {t('section.performance')}
                </div>
                <div className="text-xs text-zinc-400">
                  {t('field.detectedParallelism')}: {state.settings.processing.detectedParallelism}
                </div>
              </div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-400">
                {t('about.performanceHint')}
              </div>
              <div className="mt-3 grid h-[calc(100%-2.75rem)] grid-cols-2 gap-2">
                {performanceFields.map(field => (
                  <div
                    key={field.key}
                    className="flex min-h-0 flex-col justify-between rounded border border-zinc-200 bg-white px-3 py-2"
                  >
                    <div className="min-h-0">
                      <div className="text-[13px] font-medium text-zinc-700">
                        {field.label}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        {t('about.defaultValue', {
                          value: state.settings.processing.defaults[field.key]
                        })}
                        {' · '}
                        {t('field.maxValue', {
                          value: state.settings.processing.limits[field.key]
                        })}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="number"
                        min={field.min}
                        max={state.settings.processing.limits[field.key]}
                        step={field.step}
                        value={processingDrafts[field.key]}
                        onChange={event =>
                          updateProcessingDraft(field.key, event.target.value)
                        }
                        onBlur={() => void commitProcessingField(field.key)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur()
                          }
                        }}
                        disabled={isActing}
                        className="h-7 w-full rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-700 shadow-none outline-none select-text"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void resetProcessingField(field.key)}
                        disabled={isActing}
                        className="h-7 px-2 text-xs shadow-none"
                      >
                        {t('action.reset')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="h-full border border-zinc-200 rounded flex flex-col items-center justify-center p-6 text-center bg-zinc-50/50">
              <HugeiconsIcon icon={ScanIcon} className="size-8 text-zinc-300 mb-3" />
              <h1 className="text-base font-medium text-zinc-900">{t('app.title')}</h1>
              <p className="text-[13px] leading-relaxed text-zinc-500 mt-2 max-w-[260px]">
                {t('about.description')}
              </p>
              <div className="mt-6 flex w-full max-w-[320px] flex-col gap-3 text-left">
                <div className="rounded border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[13px] font-medium text-zinc-600">
                    {t('field.currentVersion')}
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-800">
                    v{state.update.currentVersion}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">{t('about.meta')}</div>
                </div>
                <div className="rounded border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[13px] font-medium text-zinc-600">
                    {t('field.updates')}
                  </div>
                  <div className={`mt-1 text-sm font-medium ${updateStatusClass}`}>
                    {updateStatusLabel}
                  </div>
                  {latestVersionLabel && (
                    <div className="mt-1 text-xs text-zinc-500">
                      {t('field.latestVersion', {
                        value: latestVersionLabel
                      })}
                    </div>
                  )}
                  {state.update.releaseName && (
                    <div className="mt-1 text-xs text-zinc-400">
                      {state.update.releaseName}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-zinc-400">
                    {t('field.lastChecked')}: {formattedCheckedAt}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void checkForAppUpdates()}
                      disabled={isActing || state.update.status === 'checking'}
                      className="h-7 flex-1 px-3 text-xs shadow-none"
                    >
                      {state.update.status === 'checking'
                        ? t('action.checkingUpdates')
                        : t('action.checkUpdates')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void openAppReleasePage()}
                      disabled={isActing}
                      className="h-7 flex-1 px-3 text-xs shadow-none font-medium bg-zinc-900 hover:bg-zinc-800 text-white"
                    >
                      {t('action.openReleasePage')}
                    </Button>
                  </div>
                </div>
                <div className="rounded border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-[13px] font-medium text-zinc-600">
                    {t('field.ocrRecognitionLocales')}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-zinc-500 break-all">
                    {state.settings.supportedRecognitionLanguages.join(', ')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NavButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded text-[13px] font-medium transition-colors ${
        active
          ? 'bg-zinc-200/50 text-zinc-900 shadow-none border border-zinc-300'
          : 'bg-transparent text-zinc-500 hover:text-zinc-800 border border-transparent hover:bg-zinc-100/50'
      }`}
    >
      {label}
    </button>
  )
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full border-2 animate-spin ${className ?? ''}`}
    />
  )
}
