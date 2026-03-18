import { z } from 'zod'
import { detectUiLocale, uiLocaleSchema } from '@/shared/i18n'

export const queueItemStatusSchema = z.enum([
  'idle',
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled'
])

export const pdfDetectionSchema = z.enum([
  'unknown',
  'image-only',
  'already-searchable',
  'encrypted',
  'malformed'
])

export const defaultRecognitionLanguages = [
  'ko-KR',
  'en-US',
  'ja-JP',
  'zh-Hans',
  'zh-Hant'
] as const

export const processingTuningRuntimeSchema = z.object({
  maxConcurrentJobs: z.number().int().min(1).max(32),
  maxConcurrentPagesPerJob: z.number().int().min(1).max(32),
  rasterScale: z.number().min(1).max(4),
  minimumConfidence: z.number().min(0).max(1)
})

export const processingTuningValuesSchema = z.object({
  maxConcurrentJobs: z.number().int().min(1).max(32),
  maxConcurrentPagesPerJob: z.number().int().min(1).max(32),
  rasterScale: z.number().min(1).max(4),
  minimumConfidence: z.number().min(0).max(1)
})

export const defaultProcessingTuningValues = {
  maxConcurrentJobs: 1,
  maxConcurrentPagesPerJob: 1,
  rasterScale: 2,
  minimumConfidence: 0.3
} satisfies z.infer<typeof processingTuningValuesSchema>

export const processingSettingsSchema = z.object({
  detectedParallelism: z.number().int().positive(),
  limits: processingTuningRuntimeSchema,
  defaults: processingTuningValuesSchema,
  values: processingTuningValuesSchema
})

export const queueItemSchema = z.object({
  id: z.string(),
  inputPath: z.string(),
  fileName: z.string(),
  outputPath: z.string().nullable(),
  status: queueItemStatusSchema,
  detection: pdfDetectionSchema,
  totalPages: z.number().int().nonnegative(),
  completedPages: z.number().int().nonnegative(),
  currentPage: z.number().int().nullable(),
  progressPercent: z.number().min(0).max(100),
  message: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  errorCode: z.string().nullable()
})

export const appSettingsSchema = z.object({
  outputDirectory: z.string().nullable(),
  recognitionLanguages: z.array(z.string()).min(1),
  supportedRecognitionLanguages: z.array(z.string()).min(1),
  locale: uiLocaleSchema.default(detectUiLocale()),
  processing: processingSettingsSchema
})

export const appStateSchema = z.object({
  items: z.array(queueItemSchema),
  settings: appSettingsSchema,
  isProcessing: z.boolean(),
  activeJobId: z.string().nullable()
})

export type QueueItemStatus = z.infer<typeof queueItemStatusSchema>
export type PdfDetection = z.infer<typeof pdfDetectionSchema>
export type ProcessingTuningValues = z.infer<typeof processingTuningValuesSchema>
export type ProcessingSettings = z.infer<typeof processingSettingsSchema>
export type QueueListItem = z.infer<typeof queueItemSchema>
export type AppSettings = z.infer<typeof appSettingsSchema>
export type AppState = z.infer<typeof appStateSchema>
