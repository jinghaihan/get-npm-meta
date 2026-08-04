import type { RawConfig } from '../types'
import { parse as parseToml } from 'smol-toml'
import { assignRegistry, parseConfigFile, readRecord } from './shared'

const BUN_BRACED_ENV_VAR_RE = /\$\{(\w+)\}/gu
const BUN_ENV_VAR_RE = /\$(\w+)/gu

export function loadBunfigFile(filePath: string, env: NodeJS.ProcessEnv): RawConfig {
  const install = readRecord(parseConfigFile(filePath, parseToml)?.install)
  if (!install)
    return {}

  const rawConfig: RawConfig = {}

  assignBunRegistry(rawConfig, 'default', install.registry, env)

  for (const [scope, scopeConfig] of Object.entries(readRecord(install.scopes) ?? {}))
    assignBunRegistry(rawConfig, scope, scopeConfig, env)

  return rawConfig
}

function assignBunRegistry(rawConfig: RawConfig, scope: string, config: unknown, env: NodeJS.ProcessEnv) {
  const entry = readRecord(config)
  const registry = typeof config === 'string' ? config : entry?.url

  assignRegistry(rawConfig, scope, readBunValue(registry, env), readBunValue(entry?.token, env))
}

function readBunValue(value: unknown, env: NodeJS.ProcessEnv) {
  if (typeof value !== 'string')
    return

  return value
    .replace(BUN_BRACED_ENV_VAR_RE, (_, name: string) => env[name] ?? '')
    .replace(BUN_ENV_VAR_RE, (_, name: string) => env[name] ?? '')
}
