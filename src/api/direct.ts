import type {
  FetchOptions,
  GetLatestVersionOptions,
  GetVersionsOptions,
  InferGetLatestVersionResult,
  InferGetVersionsResult,
  NpmPackumentVersion,
  PackageError,
  PackageVersionMeta,
  PackageVersionsInfo,
  PackageVersionsInfoWithMetadata,
  ResolvedPackageVersion,
  ResolvedPackageVersionWithMetadata,
  RetryOptions,
} from '../types'
import type { PackageContext } from './context'
import pRetry from 'p-retry'
import { findMaxSatisfying, isValid, isValidRange, satisfies } from 'verkit'
import { DEFAULT_RETRY_OPTIONS } from '../constants'
import { getPackumentVersionProvenance, getPackumentVersionStaged } from '../helpers'

interface NpmPackument {
  'dist-tags'?: Record<string, string>
  'name'?: string
  'time'?: Record<string, string>
  'versions'?: Record<string, NpmPackumentVersion>
}

export async function getLatestVersionFromRegistry<Metadata extends boolean = false, Throw extends boolean = true>(
  context: PackageContext,
  options: GetLatestVersionOptions<Metadata, Throw> = {},
): Promise<InferGetLatestVersionResult<Metadata, Throw>> {
  const packument = await loadPackument(context, options)
  if (isPackageError(packument)) {
    if (options.throw === false)
      return packument as InferGetLatestVersionResult<Metadata, Throw>

    throw new Error(packument.error)
  }

  const versions = packument.versions ?? {}
  const distTags = toDistTags(packument['dist-tags'])
  const time = packument.time ?? {}
  const availableVersions = Object.keys(versions)
  const specifier = context.parsed.rawSpec || 'latest'
  const lastSynced = Date.now()

  const version = resolveLatestVersion(availableVersions, versions, distTags, specifier)
  const result: ResolvedPackageVersion = {
    name: packument.name ?? context.parsed.name,
    version,
    specifier,
    publishedAt: version ? (time[version] ?? null) : null,
    lastSynced,
  }

  if (!options.metadata || !version || !versions[version])
    return result as InferGetLatestVersionResult<Metadata, Throw>

  return {
    ...result,
    ...toPackageVersionMeta(versions[version], time[version]),
  } satisfies ResolvedPackageVersionWithMetadata as InferGetLatestVersionResult<Metadata, Throw>
}

export async function getVersionsFromRegistry<Metadata extends boolean = false, Throw extends boolean = true>(
  context: PackageContext,
  options: GetVersionsOptions<Metadata, Throw> = {},
): Promise<InferGetVersionsResult<Metadata, Throw>> {
  const packument = await loadPackument(context, options)
  if (isPackageError(packument)) {
    if (options.throw === false)
      return packument as InferGetVersionsResult<Metadata, Throw>

    throw new Error(packument.error)
  }

  const versions = packument.versions ?? {}
  const distTags = toDistTags(packument['dist-tags'])
  const time = packument.time ?? {}
  const specifier = context.parsed.rawSpec || '*'
  const lastSynced = Date.now()
  const selectedVersions = filterVersionsBySpecifier(Object.keys(versions), distTags, specifier, options.loose)
  const filteredVersions = filterVersionsByDate(selectedVersions, time, options.after)

  if (options.metadata) {
    const result: PackageVersionsInfoWithMetadata = {
      name: packument.name ?? context.parsed.name,
      distTags,
      lastSynced,
      specifier,
      timeCreated: time.created ?? '',
      timeModified: time.modified ?? '',
      versionsMeta: Object.fromEntries(
        filteredVersions
          .filter(version => Boolean(versions[version]))
          .map(version => [version, toPackageVersionMeta(versions[version], time[version])] satisfies [string, PackageVersionMeta]),
      ),
    }

    return result as InferGetVersionsResult<Metadata, Throw>
  }

  const result: PackageVersionsInfo = {
    name: packument.name ?? context.parsed.name,
    distTags,
    lastSynced,
    specifier,
    versions: filteredVersions,
    time: {
      created: time.created ?? '',
      modified: time.modified ?? '',
      ...Object.fromEntries(
        filteredVersions
          .filter(version => Boolean(time[version]))
          .map(version => [version, time[version]!]),
      ),
    },
  }

  return result as InferGetVersionsResult<Metadata, Throw>
}

async function fetchPackument(
  context: PackageContext,
  options: Pick<FetchOptions, 'fetch'>,
): Promise<NpmPackument | PackageError> {
  const fetchApi = options.fetch ?? fetch
  const url = new URL(context.parsed.escapedName, context.registry)
  const headers = new Headers({
    accept: 'application/json',
  })

  if (context.auth?.token) {
    headers.set('authorization', `Bearer ${context.auth.token}`)
  }
  else if (context.auth?.basicAuth) {
    headers.set('authorization', `Basic ${context.auth.basicAuth}`)
  }

  if (context.config.userAgent)
    headers.set('user-agent', context.config.userAgent)

  const response = await fetchApi(url, { headers })

  if (!response.ok) {
    return toPackageError(context.parsed.name, url, response.status, response.statusText)
  }

  return response.json() as Promise<NpmPackument>
}

async function loadPackument(
  context: PackageContext,
  options: Pick<FetchOptions, 'fetch'> & { retry?: RetryOptions | number | false },
): Promise<NpmPackument | PackageError> {
  const retryOptions = normalizeRetryOptions(options.retry)
  const fetchPackumentFn = (): Promise<NpmPackument | PackageError> => fetchPackument(context, options)

  return retryOptions === false
    ? fetchPackumentFn()
    : pRetry(fetchPackumentFn, retryOptions)
}

function filterVersionsByDate(versions: string[], time: Record<string, string>, after?: string): string[] {
  if (!after)
    return versions

  const afterDate = Date.parse(after)
  if (Number.isNaN(afterDate))
    return versions

  return versions.filter((version) => {
    const publishedAt = time[version]
    if (!publishedAt)
      return false

    return Date.parse(publishedAt) > afterDate
  })
}

function filterVersionsBySpecifier(
  availableVersions: string[],
  distTags: Record<string, string>,
  specifier: string,
  loose?: boolean,
): string[] {
  if (specifier === '*')
    return availableVersions

  const taggedVersion = distTags[specifier]
  if (taggedVersion)
    return availableVersions.includes(taggedVersion) ? [taggedVersion] : []

  if (isValid(specifier))
    return availableVersions

  if (isValidRange(specifier)) {
    return availableVersions.filter(version =>
      satisfies(version, specifier, { includePrerelease: true, loose: loose ?? false }),
    )
  }

  return availableVersions
}

function isPackageError(value: NpmPackument | PackageError): value is PackageError {
  return 'error' in value
}

function resolveLatestVersion(
  availableVersions: string[],
  versions: Record<string, NpmPackumentVersion>,
  distTags: Record<string, string>,
  specifier: string,
): string | null {
  if (distTags[specifier])
    return distTags[specifier]

  if (versions[specifier])
    return specifier

  if (isValidRange(specifier))
    return findMaxSatisfying(availableVersions, specifier) ?? null

  return null
}

function normalizeRetryOptions(retry?: RetryOptions | number | false): RetryOptions | false {
  if (retry === false)
    return false

  if (typeof retry === 'number') {
    return {
      ...DEFAULT_RETRY_OPTIONS,
      retries: retry,
    }
  }

  return retry ?? DEFAULT_RETRY_OPTIONS
}

function toDistTags(distTags?: Record<string, string>): Record<string, string> & { latest: string } {
  return {
    latest: distTags?.latest ?? '',
    ...(distTags ?? {}),
  }
}

function toPackageError(name: string, url: URL, status: number, statusText: string): PackageError {
  return {
    status,
    name,
    error: `[GET] "${url}": ${status} ${statusText}`,
  }
}

function toPackageVersionMeta(version: NpmPackumentVersion, time?: string): PackageVersionMeta {
  return {
    time,
    engines: version.engines,
    deprecated: version.deprecated,
    ...getPackumentVersionProvenance(version),
    ...getPackumentVersionStaged(version),
    integrity: version.integrity ?? version.dist?.integrity,
  }
}
