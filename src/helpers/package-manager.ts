import type { RawConfig } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'
import { createRegistryAuthKey } from './registry'

const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml'
const YARN_RC_FILE = '.yarnrc.yml'
const BUNFIG_FILE = 'bunfig.toml'

const YARN_ENV_VAR_RE = /\$\{([^}]+)\}/gu
const BUN_BRACED_ENV_VAR_RE = /\$\{(\w+)\}/gu
const BUN_ENV_VAR_RE = /\$(\w+)/gu

/**
 * Load registry config from the package manager files that npm itself never reads:
 *
 * - pnpm — `pnpm-workspace.yaml` (`registries`)
 * - Yarn Berry — `.yarnrc.yml` (`npmRegistryServer`, `npmScopes`, `npmRegistries`)
 * - Bun — `bunfig.toml` (`[install].registry`, `[install.scopes]`)
 *
 * Values are translated into npm config keys (`registry`, `<scope>:registry` and
 * `//host/path/:_authToken`) so registry picking and auth resolution stay shared
 * with `.npmrc`.
 *
 * Only bearer token auth is translated; basic auth is left to `.npmrc`.
 */
export function loadPackageManagerConfig(dir: string, env: NodeJS.ProcessEnv = process.env): RawConfig {
  return {
    ...loadPnpmWorkspaceFile(join(dir, PNPM_WORKSPACE_FILE)),
    ...loadYarnRcFile(join(dir, YARN_RC_FILE), env),
    ...loadBunfigFile(join(dir, BUNFIG_FILE), env),
  }
}

// pnpm does not expand env var references in registry URLs.
function loadPnpmWorkspaceFile(filePath: string): RawConfig {
  const workspace = parseConfigFile(filePath, parseYaml)
  const rawConfig: RawConfig = {}

  for (const [scope, registry] of Object.entries(readRecord(workspace?.registries) ?? {})) {
    if (typeof registry === 'string')
      assignRegistry(rawConfig, scope, registry)
  }

  return rawConfig
}

function loadYarnRcFile(filePath: string, env: NodeJS.ProcessEnv): RawConfig {
  const yarnRc = parseConfigFile(filePath, parseYaml)
  if (!yarnRc)
    return {}

  const rawConfig: RawConfig = {}

  assignRegistry(rawConfig, 'default', readYarnValue(yarnRc.npmRegistryServer, env), readYarnValue(yarnRc.npmAuthToken, env))

  for (const [scope, scopeConfig] of Object.entries(readRecord(yarnRc.npmScopes) ?? {})) {
    const config = readRecord(scopeConfig)
    assignRegistry(rawConfig, scope, readYarnValue(config?.npmRegistryServer, env), readYarnValue(config?.npmAuthToken, env))
  }

  // Auth-only entries, keyed by `//host` instead of by scope.
  for (const [registryKey, registryConfig] of Object.entries(readRecord(yarnRc.npmRegistries) ?? {}))
    assignAuthToken(rawConfig, registryKey, readYarnValue(readRecord(registryConfig)?.npmAuthToken, env))

  return rawConfig
}

function loadBunfigFile(filePath: string, env: NodeJS.ProcessEnv): RawConfig {
  const install = readRecord(parseConfigFile(filePath, parseToml)?.install)
  if (!install)
    return {}

  const rawConfig: RawConfig = {}

  assignBunRegistry(rawConfig, 'default', install.registry, env)

  for (const [scope, scopeConfig] of Object.entries(readRecord(install.scopes) ?? {}))
    assignBunRegistry(rawConfig, scope, scopeConfig, env)

  return rawConfig
}

// A Bun registry entry is either a registry URL or a table carrying auth alongside it.
function assignBunRegistry(rawConfig: RawConfig, scope: string, config: unknown, env: NodeJS.ProcessEnv) {
  const entry = readRecord(config)
  const registry = typeof config === 'string' ? config : entry?.url

  assignRegistry(rawConfig, scope, readBunValue(registry, env), readBunValue(entry?.token, env))
}

function assignRegistry(rawConfig: RawConfig, scope: string, registry?: string, token?: string) {
  if (!registry)
    return

  rawConfig[scope === 'default' ? 'registry' : `${normalizeScope(scope)}:registry`] = registry
  assignAuthToken(rawConfig, registry, token)
}

function assignAuthToken(rawConfig: RawConfig, registry: string, token?: string) {
  // Yarn keys per-registry auth by `//host`, which is not a parseable URL on its own.
  const registryUrl = registry.startsWith('//') ? `https:${registry}` : registry
  if (!token || !URL.canParse(registryUrl))
    return

  rawConfig[`${createRegistryAuthKey(registryUrl)}:_authToken`] = token
}

function normalizeScope(scope: string) {
  return scope.startsWith('@') ? scope : `@${scope}`
}

// Yarn expands `${NAME}`, `${NAME:-fallback}` (unset or empty) and `${NAME-fallback}` (unset only).
function readYarnValue(value: unknown, env: NodeJS.ProcessEnv) {
  if (typeof value !== 'string')
    return

  return value.replace(YARN_ENV_VAR_RE, (_, expression: string) => {
    const separatorIndex = expression.indexOf('-')
    if (separatorIndex === -1)
      return env[expression] ?? ''

    const fallbackOnEmpty = expression[separatorIndex - 1] === ':'
    const name = expression.slice(0, fallbackOnEmpty ? separatorIndex - 1 : separatorIndex)
    const fallback = expression.slice(separatorIndex + 1)
    const currentValue = env[name]

    if (fallbackOnEmpty)
      return currentValue === undefined || currentValue === '' ? fallback : currentValue

    return currentValue ?? fallback
  })
}

// Bun expands `$NAME` and `${NAME}`.
function readBunValue(value: unknown, env: NodeJS.ProcessEnv) {
  if (typeof value !== 'string')
    return

  return value
    .replace(BUN_BRACED_ENV_VAR_RE, (_, name: string) => env[name] ?? '')
    .replace(BUN_ENV_VAR_RE, (_, name: string) => env[name] ?? '')
}

function parseConfigFile(filePath: string, parse: (content: string) => unknown) {
  if (!existsSync(filePath))
    return

  try {
    return readRecord(parse(readFileSync(filePath, 'utf8')))
  }
  catch {
    // Unparseable package manager config falls back to `.npmrc`.
  }
}

function readRecord(value: unknown) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value))
    return value as Record<string, unknown>
}
