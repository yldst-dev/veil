import { z } from 'zod'

const repositoryOwner = 'yldst-dev'
const repositoryName = 'veil'
const latestReleaseApiUrl = `https://api.github.com/repos/${repositoryOwner}/${repositoryName}/releases/latest`
const releasesPageUrl = `https://github.com/${repositoryOwner}/${repositoryName}/releases`

const githubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  html_url: z.string().url(),
  name: z.string().nullable().optional().transform(value => value ?? null),
  published_at: z.string().nullable().optional().transform(value => value ?? null)
})

interface ParsedVersion {
  core: [number, number, number]
  preRelease: string[]
}

export interface LatestReleaseInfo {
  latestVersion: string
  releaseName: string | null
  releaseUrl: string
  publishedAt: string | null
  isUpdateAvailable: boolean
}

export function getRepositoryReleasesUrl() {
  return releasesPageUrl
}

export function normalizeVersionLabel(version: string) {
  return version.trim().replace(/^v/i, '')
}

function parseVersion(version: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim())

  if (!match) {
    return null
  }

  return {
    core: [
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    ],
    preRelease: match[4]?.split('.') ?? []
  }
}

function comparePreReleaseIdentifiers(left: string[], right: string[]) {
  if (left.length === 0 && right.length === 0) {
    return 0
  }

  if (left.length === 0) {
    return 1
  }

  if (right.length === 0) {
    return -1
  }

  const maxLength = Math.max(left.length, right.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]

    if (leftValue === undefined) {
      return -1
    }

    if (rightValue === undefined) {
      return 1
    }

    const leftIsNumeric = /^\d+$/.test(leftValue)
    const rightIsNumeric = /^\d+$/.test(rightValue)

    if (leftIsNumeric && rightIsNumeric) {
      const difference = Number(leftValue) - Number(rightValue)

      if (difference !== 0) {
        return difference
      }

      continue
    }

    if (leftIsNumeric !== rightIsNumeric) {
      return leftIsNumeric ? -1 : 1
    }

    const difference = leftValue.localeCompare(rightValue)

    if (difference !== 0) {
      return difference
    }
  }

  return 0
}

export function compareVersions(left: string, right: string) {
  const parsedLeft = parseVersion(left)
  const parsedRight = parseVersion(right)

  if (!parsedLeft || !parsedRight) {
    return normalizeVersionLabel(left).localeCompare(normalizeVersionLabel(right), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  }

  for (let index = 0; index < parsedLeft.core.length; index += 1) {
    const difference = parsedLeft.core[index] - parsedRight.core[index]

    if (difference !== 0) {
      return difference
    }
  }

  return comparePreReleaseIdentifiers(parsedLeft.preRelease, parsedRight.preRelease)
}

async function fetchLatestGithubRelease() {
  const response = await fetch(latestReleaseApiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'veil'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub release request failed with status ${response.status}`)
  }

  return githubReleaseSchema.parse(await response.json())
}

export async function resolveLatestReleaseInfo(
  currentVersion: string
): Promise<LatestReleaseInfo> {
  const latestRelease = await fetchLatestGithubRelease()
  const latestVersion = normalizeVersionLabel(latestRelease.tag_name)

  return {
    latestVersion,
    releaseName: latestRelease.name,
    releaseUrl: latestRelease.html_url,
    publishedAt: latestRelease.published_at,
    isUpdateAvailable: compareVersions(currentVersion, latestVersion) < 0
  }
}
