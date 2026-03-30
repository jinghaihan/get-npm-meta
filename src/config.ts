import type { NpmConfig, NpmConfigOptions } from './types'
import { join } from 'node:path'
import process from 'node:process'
import { DEFAULT_STRICT_SSL, NPM_REGISTRY } from './constants'
import {
  getNpmRegistryConfigs,
  getRegistryAuthConfigs,
  getScopeRegistries,
  getUserConfigPath,
  loadEnvConfig,
  loadNpmrcFile,
  mergeConfig,
  normalizeRegistry,
  readBoolean,
  readString,
  readStringArray,
} from './helpers'

export function loadNpmConfig(options: NpmConfigOptions = {}): NpmConfig {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const userConfigPath = options.userConfigPath ?? getUserConfigPath(env)
  const projectConfigPath = options.projectConfigPath === false
    ? undefined
    : (options.projectConfigPath ?? join(cwd, '.npmrc'))

  const rawConfig: Record<string, string | string[]> = {
    'registry': NPM_REGISTRY,
    'strict-ssl': String(DEFAULT_STRICT_SSL),
  }

  mergeConfig(rawConfig, loadNpmrcFile(userConfigPath, env))
  if (projectConfigPath)
    mergeConfig(rawConfig, loadNpmrcFile(projectConfigPath, env))
  mergeConfig(rawConfig, loadEnvConfig(env))

  const registry = normalizeRegistry(readString(rawConfig.registry) ?? NPM_REGISTRY)
  const scope = readString(rawConfig.scope)
  const scopeRegistries = getScopeRegistries(rawConfig)

  return {
    registry,
    npmConfigs: getNpmRegistryConfigs(registry, scopeRegistries, scope),
    scopeRegistries,
    authByRegistry: getRegistryAuthConfigs(rawConfig),
    strictSSL: readBoolean(rawConfig['strict-ssl'], DEFAULT_STRICT_SSL),
    ca: readStringArray(rawConfig.ca),
    caFile: readString(rawConfig.cafile),
    userAgent: readString(rawConfig['user-agent']),
    proxy: readString(rawConfig.proxy),
    httpsProxy: readString(rawConfig['https-proxy']),
    noProxy: readString(rawConfig.noproxy),
    userConfigPath,
    projectConfigPath,
  }
}
