import { z } from 'zod'

import {
  appStateSchema,
  defaultRecognitionLanguages,
  processingTuningValuesSchema,
  queueItemSchema
} from '@/shared/app-state'
import { uiLocaleSchema } from '@/shared/i18n'

export const ipcChannels = {
  getState: 'app:get-state',
  pickPdfFiles: 'files:pick-pdfs',
  setOutputDirectory: 'files:set-output-directory',
  setLocale: 'app:set-locale',
  setProcessingSettings: 'app:set-processing-settings',
  enqueueFiles: 'queue:enqueue-files',
  startProcessing: 'queue:start-processing',
  cancelJob: 'queue:cancel-job',
  removeJob: 'queue:remove-job',
  openOutputTarget: 'files:open-output-target',
  stateChanged: 'events:state-changed'
} as const

export const enqueueFilesInputSchema = z.object({
  filePaths: z.array(z.string()).min(1)
})

export const startProcessingInputSchema = z.object({
  outputDirectory: z.string().nullable().optional(),
  recognitionLanguages: z
    .array(z.string())
    .min(1)
    .default([...defaultRecognitionLanguages])
})

export const cancelJobInputSchema = z.object({
  jobId: z.string()
})

export const setLocaleInputSchema = z.object({
  locale: uiLocaleSchema
})

export const setProcessingSettingsInputSchema =
  processingTuningValuesSchema.partial().refine(
    value => Object.keys(value).length > 0,
    'At least one processing setting must be provided.'
  )

export const removeJobInputSchema = z.object({
  jobId: z.string()
})

export const outputTargetInputSchema = z.object({
  path: z.string()
})

export const stateChangedEventSchema = z.object({
  state: appStateSchema
})

export const queueActionResultSchema = z.object({
  state: appStateSchema,
  item: queueItemSchema.optional()
})

export type EnqueueFilesInput = z.infer<typeof enqueueFilesInputSchema>
export type StartProcessingInput = z.infer<typeof startProcessingInputSchema>
export type CancelJobInput = z.infer<typeof cancelJobInputSchema>
export type SetLocaleInput = z.infer<typeof setLocaleInputSchema>
export type SetProcessingSettingsInput = z.infer<
  typeof setProcessingSettingsInputSchema
>
export type RemoveJobInput = z.infer<typeof removeJobInputSchema>
export type OutputTargetInput = z.infer<typeof outputTargetInputSchema>
export type StateChangedEvent = z.infer<typeof stateChangedEventSchema>
export type QueueActionResult = z.infer<typeof queueActionResultSchema>

export interface VeilDesktopApi {
  getState: () => Promise<z.infer<typeof appStateSchema>>
  pickPdfFiles: () => Promise<string[]>
  pickOutputDirectory: () => Promise<string | null>
  setLocale: (input: SetLocaleInput) => Promise<z.infer<typeof appStateSchema>>
  setProcessingSettings: (
    input: SetProcessingSettingsInput
  ) => Promise<z.infer<typeof appStateSchema>>
  enqueueFiles: (input: EnqueueFilesInput) => Promise<QueueActionResult>
  startProcessing: (input: StartProcessingInput) => Promise<QueueActionResult>
  cancelJob: (input: CancelJobInput) => Promise<QueueActionResult>
  removeJob: (input: RemoveJobInput) => Promise<QueueActionResult>
  openOutputTarget: (input: OutputTargetInput) => Promise<void>
  subscribeToStateChanged: (
    listener: (event: StateChangedEvent) => void
  ) => () => void
}
