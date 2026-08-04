import type { RawConfig } from '../types'
import { existsSync, readFileSync } from 'node:fs'
import { createRegistryAuthKey } from '../registry'

export function assignRegistry(rawConfig: RawConfig, scope: string, registry?: string, token?: string) {
  if (!registry)
    return

  rawConfig[scope === 'default' ? 'registry' : `${normalizeScope(scope)}:registry`] = registry
  assignAuthToken(rawConfig, registry, token)
}

export function assignAuthToken(rawConfig: RawConfig, registry: string, token?: string) {
  // Yarn keys per-registry auth by `//host`, which is not a parseable URL on its own.
  const registryUrl = registry.startsWith('//') ? `https:${registry}` : registry
  if (!token || !URL.canParse(registryUrl))
    return

  rawConfig[`${createRegistryAuthKey(registryUrl)}:_authToken`] = token
}

export function parseConfigFile(filePath: string, parse: (content: string) => unknown) {
  if (!existsSync(filePath))
    return

  try {
    return readRecord(parse(readFileSync(filePath, 'utf8')))
  }
  catch {
    // Unparseable package manager config falls back to `.npmrc`.
  }
}

export function readRecord(value: unknown) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value))
    return value as Record<string, unknown>
}

function normalizeScope(scope: string) {
  return scope.startsWith('@') ? scope : `@${scope}`
}
