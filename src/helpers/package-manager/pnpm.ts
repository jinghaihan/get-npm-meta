import type { RawConfig } from '../types'
import { parse as parseYaml } from 'yaml'
import { assignRegistry, parseConfigFile, readRecord } from './shared'

// pnpm does not expand env var references in registry URLs.
export function loadPnpmWorkspaceFile(filePath: string): RawConfig {
  const workspace = parseConfigFile(filePath, parseYaml)
  const rawConfig: RawConfig = {}

  for (const [scope, registry] of Object.entries(readRecord(workspace?.registries) ?? {})) {
    if (typeof registry === 'string')
      assignRegistry(rawConfig, scope, registry)
  }

  return rawConfig
}
