import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  delete process.env.VEIL_MAX_CONCURRENT_JOBS
  delete process.env.VEIL_MAX_PAGE_CONCURRENCY
  delete process.env.VEIL_RASTER_SCALE
  delete process.env.VEIL_MINIMUM_CONFIDENCE
})

describe('getProcessingConcurrencySettings', () => {
  it('derives bounded concurrency from available parallelism', async () => {
    const { getProcessingConcurrencySettings } = await import(
      '@/main/processing-config'
    )

    expect(getProcessingConcurrencySettings(12)).toEqual({
      detectedParallelism: 12,
      maxConcurrentJobs: 3,
      maxConcurrentPagesPerJob: 3
    })
  })

  it('allows explicit environment overrides', async () => {
    process.env.VEIL_MAX_CONCURRENT_JOBS = '4'
    process.env.VEIL_MAX_PAGE_CONCURRENCY = '2'

    const { getProcessingConcurrencySettings } = await import(
      '@/main/processing-config'
    )

    expect(getProcessingConcurrencySettings(8)).toEqual({
      detectedParallelism: 8,
      maxConcurrentJobs: 4,
      maxConcurrentPagesPerJob: 2
    })
  })

  it('normalizes persisted tuning values against defaults and bounds', async () => {
    const { normalizeProcessingTuningValues } = await import(
      '@/main/processing-config'
    )

    expect(
      normalizeProcessingTuningValues(
        {
          maxConcurrentJobs: 8,
          rasterScale: 4.5,
          minimumConfidence: -1
        },
        12
      )
    ).toEqual({
      detectedParallelism: 12,
      limits: {
        maxConcurrentJobs: 12,
        maxConcurrentPagesPerJob: 12,
        rasterScale: 4,
        minimumConfidence: 1
      },
      defaults: {
        maxConcurrentJobs: 3,
        maxConcurrentPagesPerJob: 3,
        rasterScale: 2,
        minimumConfidence: 0.3
      },
      values: {
        maxConcurrentJobs: 8,
        maxConcurrentPagesPerJob: 3,
        rasterScale: 4,
        minimumConfidence: 0
      }
    })
  })

  it('reduces effective page concurrency when requested parallel work exceeds safe budget', async () => {
    const { getEffectiveProcessingRuntime } = await import(
      '@/main/processing-config'
    )

    expect(
      getEffectiveProcessingRuntime(
        {
          maxConcurrentJobs: 2,
          maxConcurrentPagesPerJob: 10,
          rasterScale: 2,
          minimumConfidence: 0.3
        },
        10
      )
    ).toEqual({
      detectedParallelism: 10,
      totalPageBudget: 5,
      maxConcurrentJobs: 2,
      maxConcurrentPagesPerJob: 2,
      rasterScale: 2,
      minimumConfidence: 0.3
    })
  })
})
