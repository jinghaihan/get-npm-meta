import type { RawConfig } from '../types'
import { parse as parseYaml } from 'yaml'
import { assignAuthToken, assignRegistry, parseConfigFile, readRecord } from './shared'

const YARN_ENV_VAR_RE = /\$\{([^}]+)\}/gu

export function loadYarnRcFile(filePath: string, env: NodeJS.ProcessEnv): RawConfig {
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
