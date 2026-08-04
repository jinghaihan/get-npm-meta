import type { RawConfig } from '../types'
import { parse as parseYaml } from 'yaml'
import { assignRegistry, parseConfigFile, readRecord } from './shared'

const PNPM_ENV_VAR_RE = /\$\{[^}]+\}/u

// pnpm ignores env var references in registry URLs.
export function loadPnpmWorkspaceFile(filePath: string): RawConfig {
  const workspace = parseConfigFile(filePath, parseYaml)
  const rawConfig: RawConfig = {}

  for (const [scope, registry] of Object.entries(readRecord(workspace?.registries) ?? {})) {
    if (typeof registry === 'string' && !PNPM_ENV_VAR_RE.test(registry))
      assignRegistry(rawConfig, scope, registry)
  }

  return rawConfig
}
