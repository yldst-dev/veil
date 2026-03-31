import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  compareVersions,
  normalizeVersionLabel,
  resolveLatestReleaseInfo
} from '@/main/update-checker'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('compareVersions', () => {
  it('compares semantic versions numerically', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0)
    expect(compareVersions('1.3.0', '1.2.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('treats stable versions as newer than prereleases', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0)
  })
})

describe('normalizeVersionLabel', () => {
  it('removes a leading v prefix', () => {
    expect(normalizeVersionLabel('v0.4.1')).toBe('0.4.1')
    expect(normalizeVersionLabel('0.4.1')).toBe('0.4.1')
  })
})

describe('resolveLatestReleaseInfo', () => {
  it('marks a newer GitHub release as available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/yldst-dev/veil/releases/tag/v0.2.0',
        name: 'v0.2.0',
        published_at: '2026-03-30T00:00:00.000Z'
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveLatestReleaseInfo('0.1.0')).resolves.toEqual({
      latestVersion: '0.2.0',
      releaseName: 'v0.2.0',
      releaseUrl: 'https://github.com/yldst-dev/veil/releases/tag/v0.2.0',
      publishedAt: '2026-03-30T00:00:00.000Z',
      isUpdateAvailable: true
    })
  })
})
