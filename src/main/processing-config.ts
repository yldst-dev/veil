import { availableParallelism } from 'node:os'

import type { ProcessingTuningValues } from '@/shared/app-state'

export interface ProcessingConcurrencySettings {
  detectedParallelism: number
  maxConcurrentJobs: number
  maxConcurrentPagesPerJob: number
}

export interface ProcessingSettingsBundle {
  detectedParallelism: number
  limits: ProcessingTuningValues
  defaults: ProcessingTuningValues
  values: ProcessingTuningValues
}

export interface EffectiveProcessingRuntime extends ProcessingTuningValues {
  detectedParallelism: number
  totalPageBudget: number
}

const HARD_MAX_CONCURRENT_JOBS = 32
const HARD_MAX_PAGE_CONCURRENCY = 32
const MINIMUM_RASTER_SCALE = 1
const MAXIMUM_RASTER_SCALE = 4
const DEFAULT_RASTER_SCALE = 2
const MINIMUM_CONFIDENCE_FLOOR = 0
const MINIMUM_CONFIDENCE_CEILING = 1
const DEFAULT_MINIMUM_CONFIDENCE = 0.3

function parsePositiveIntegerEnv(name: string): number | null {
  const rawValue = process.env[name]

  if (!rawValue) {
    return null
  }

  const parsed = Number.parseInt(rawValue, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseNumberEnv(name: string): number | null {
  const rawValue = process.env[name]

  if (!rawValue) {
    return null
  }

  const parsed = Number.parseFloat(rawValue)
  return Number.isFinite(parsed) ? parsed : null
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)))
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function getProcessingTuningDefaults(
  detectedParallelismInput = availableParallelism()
): {
  detectedParallelism: number
  limits: ProcessingTuningValues
  defaults: ProcessingTuningValues
} {
  const concurrency = getProcessingConcurrencySettings(detectedParallelismInput)
  const limits: ProcessingTuningValues = {
    maxConcurrentJobs: clampInteger(
      concurrency.detectedParallelism,
      1,
      HARD_MAX_CONCURRENT_JOBS
    ),
    maxConcurrentPagesPerJob: clampInteger(
      concurrency.detectedParallelism,
      1,
      HARD_MAX_PAGE_CONCURRENCY
    ),
    rasterScale: MAXIMUM_RASTER_SCALE,
    minimumConfidence: MINIMUM_CONFIDENCE_CEILING
  }

  return {
    detectedParallelism: concurrency.detectedParallelism,
    limits,
    defaults: {
      maxConcurrentJobs: concurrency.maxConcurrentJobs,
      maxConcurrentPagesPerJob: concurrency.maxConcurrentPagesPerJob,
      rasterScale: clampNumber(
        parseNumberEnv('VEIL_RASTER_SCALE') ?? DEFAULT_RASTER_SCALE,
        MINIMUM_RASTER_SCALE,
        MAXIMUM_RASTER_SCALE
      ),
      minimumConfidence: clampNumber(
        parseNumberEnv('VEIL_MINIMUM_CONFIDENCE') ?? DEFAULT_MINIMUM_CONFIDENCE,
        MINIMUM_CONFIDENCE_FLOOR,
        MINIMUM_CONFIDENCE_CEILING
      )
    }
  }
}

export function normalizeProcessingTuningValues(
  values: Partial<ProcessingTuningValues> | null | undefined,
  detectedParallelismInput = availableParallelism()
): ProcessingSettingsBundle {
  const { detectedParallelism, limits, defaults } = getProcessingTuningDefaults(
    detectedParallelismInput
  )

  return {
    detectedParallelism,
    limits,
    defaults,
    values: {
      maxConcurrentJobs: clampInteger(
        values?.maxConcurrentJobs ?? defaults.maxConcurrentJobs,
        1,
        limits.maxConcurrentJobs
      ),
      maxConcurrentPagesPerJob: clampInteger(
        values?.maxConcurrentPagesPerJob ?? defaults.maxConcurrentPagesPerJob,
        1,
        limits.maxConcurrentPagesPerJob
      ),
      rasterScale: clampNumber(
        values?.rasterScale ?? defaults.rasterScale,
        MINIMUM_RASTER_SCALE,
        MAXIMUM_RASTER_SCALE
      ),
      minimumConfidence: clampNumber(
        values?.minimumConfidence ?? defaults.minimumConfidence,
        MINIMUM_CONFIDENCE_FLOOR,
        MINIMUM_CONFIDENCE_CEILING
      )
    }
  }
}

export function getEffectiveProcessingRuntime(
  values: Partial<ProcessingTuningValues> | null | undefined,
  detectedParallelismInput = availableParallelism()
): EffectiveProcessingRuntime {
  const normalized = normalizeProcessingTuningValues(
    values,
    detectedParallelismInput
  )
  const rasterLoadFactor = Math.max(
    1,
    normalized.values.rasterScale * normalized.values.rasterScale
  )
  const totalPageBudget = clampInteger(
    Math.floor((normalized.detectedParallelism * 2) / rasterLoadFactor),
    1,
    HARD_MAX_PAGE_CONCURRENCY
  )
  const maxConcurrentJobs = clampInteger(
    normalized.values.maxConcurrentJobs,
    1,
    Math.min(normalized.limits.maxConcurrentJobs, totalPageBudget)
  )
  const maxConcurrentPagesPerJob = clampInteger(
    normalized.values.maxConcurrentPagesPerJob,
    1,
    Math.max(1, Math.floor(totalPageBudget / maxConcurrentJobs))
  )

  return {
    detectedParallelism: normalized.detectedParallelism,
    totalPageBudget,
    maxConcurrentJobs,
    maxConcurrentPagesPerJob,
    rasterScale: normalized.values.rasterScale,
    minimumConfidence: normalized.values.minimumConfidence
  }
}

export function getProcessingConcurrencySettings(
  detectedParallelismInput = availableParallelism()
): ProcessingConcurrencySettings {
  const detectedParallelism = Math.max(1, detectedParallelismInput)
  const defaultConcurrentJobs = Math.min(
    3,
    Math.max(1, Math.floor(detectedParallelism / 4))
  )
  const defaultConcurrentPagesPerJob = Math.min(
    3,
    Math.max(1, Math.floor(detectedParallelism / defaultConcurrentJobs))
  )

  const maxConcurrentJobs = Math.min(
    HARD_MAX_CONCURRENT_JOBS,
    parsePositiveIntegerEnv('VEIL_MAX_CONCURRENT_JOBS') ?? defaultConcurrentJobs
  )
  const maxConcurrentPagesPerJob = Math.min(
    HARD_MAX_PAGE_CONCURRENCY,
    parsePositiveIntegerEnv('VEIL_MAX_PAGE_CONCURRENCY') ??
      defaultConcurrentPagesPerJob
  )

  return {
    detectedParallelism,
    maxConcurrentJobs,
    maxConcurrentPagesPerJob
  }
}
