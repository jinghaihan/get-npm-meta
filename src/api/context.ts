import type { NpaResult, NpmConfig, NpmConfigOptions, RegistryAuthConfig } from '../types'
import { NPM_REGISTRY, pickRegistry } from 'fast-npm-meta'
import { loadNpmConfig } from '../config'
import { normalizeRegistry, resolveRegistryAuth } from '../helpers'
import { parseNpmSpec } from '../npa'

export interface PackageContext {
  auth?: RegistryAuthConfig
  config: NpmConfig
  parsed: NpaResult
  registry: string
}

export function isDefaultRegistry(registry: string): boolean {
  return normalizeRegistry(registry) === NPM_REGISTRY
}

export async function resolvePackageContexts(specs: string[], options: NpmConfigOptions): Promise<PackageContext[]> {
  const config = await loadNpmConfig(options)

  return specs.map(spec => resolvePackageContext(spec, config))
}

function resolvePackageContext(spec: string, config: NpmConfig): PackageContext {
  const parsed = parseNpmSpec({ spec })
  const registry = normalizeRegistry(pickRegistry(parsed.scope, config.npmConfigs))

  return {
    auth: resolveRegistryAuth(registry, config.authByRegistry),
    config,
    parsed,
    registry,
  }
}
