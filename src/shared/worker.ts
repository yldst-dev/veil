import { z } from 'zod'

export const workerStartJobMessageSchema = z.object({
  type: z.literal('start-job'),
  jobId: z.string(),
  inputPath: z.string(),
  outputPath: z.string(),
  fontPath: z.string(),
  rebuildFromImages: z.boolean().default(false),
  recognitionLanguages: z.array(z.string()).min(1),
  minimumConfidence: z.number().min(0).max(1).default(0.3),
  rasterScale: z.number().min(1).max(4).default(2),
  pageConcurrency: z.number().int().min(1).max(32).default(1)
})

export const workerProgressMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('job-started'),
    jobId: z.string(),
    totalPages: z.number().int().positive(),
    outputPath: z.string()
  }),
  z.object({
    type: z.literal('page-completed'),
    jobId: z.string(),
    completedPages: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
    currentPage: z.number().int().positive(),
    message: z.string()
  }),
  z.object({
    type: z.literal('job-completed'),
    jobId: z.string(),
    outputPath: z.string(),
    totalPages: z.number().int().positive()
  }),
  z.object({
    type: z.literal('job-failed'),
    jobId: z.string(),
    errorCode: z.string(),
    message: z.string()
  })
])

export type WorkerStartJobMessage = z.infer<typeof workerStartJobMessageSchema>
export type WorkerProgressMessage = z.infer<typeof workerProgressMessageSchema>
