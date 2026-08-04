import type { AgentName } from 'package-manager-detector'
import type { PackageManagerConfig, RawConfig } from '../types'
import { dirname } from 'node:path'
import process from 'node:process'
import { up as findUp } from 'empathic/find'
import { detect } from 'package-manager-detector'
import { loadBunfigFile } from './bun'
import { loadPnpmWorkspaceFile } from './pnpm'
import { loadYarnRcFile } from './yarn'

const PACKAGE_MANAGER_CONFIGS: Partial<Record<AgentName, PackageManagerConfig>> = {
  pnpm: {
    file: 'pnpm-workspace.yaml',
    load: loadPnpmWorkspaceFile,
  },
  yarn: {
    file: '.yarnrc.yml',
    load: loadYarnRcFile,
  },
  bun: {
    file: 'bunfig.toml',
    load: loadBunfigFile,
  },
}

/**
 * Load registry config from the package manager files that npm itself never reads:
 *
 * - pnpm — `pnpm-workspace.yaml` (`registries`)
 * - Yarn Berry — `.yarnrc.yml` (`npmRegistryServer`, `npmScopes`, `npmRegistries`)
 * - Bun — `bunfig.toml` (`[install].registry`, `[install.scopes]`)
 *
 * Values are translated into npm config keys (`registry`, `<scope>:registry` and
 * `//host/path/:_authToken`) so registry picking and auth resolution stay shared
 * with `.npmrc`. Only the detected package manager's config is loaded.
 *
 * Only bearer token auth is translated; basic auth is left to `.npmrc`.
 */
export async function loadPackageManagerConfig(dir: string, env: NodeJS.ProcessEnv = process.env): Promise<RawConfig> {
  const repositoryRoot = findRepositoryRoot(dir)
  const packageManager = await detect({ cwd: dir, stopDir: repositoryRoot })
  const config = packageManager ? PACKAGE_MANAGER_CONFIGS[packageManager.name] : undefined
  const filePath = config && findPackageManagerFile(config.file, dir, repositoryRoot)

  return filePath && config ? config.load(filePath, env) : {}
}

function findRepositoryRoot(dir: string): string {
  const gitPath = findUp('.git', { cwd: dir })
  return gitPath ? dirname(gitPath) : dir
}

function findPackageManagerFile(fileName: string, dir: string, repositoryRoot: string): string | undefined {
  return findUp(fileName, { cwd: dir, last: repositoryRoot })
}
