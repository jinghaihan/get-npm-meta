import type { RawConfig } from '../types'
import { join } from 'node:path'
import process from 'node:process'
import { loadBunfigFile } from './bun'
import { loadPnpmWorkspaceFile } from './pnpm'
import { loadYarnRcFile } from './yarn'

const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml'
const YARN_RC_FILE = '.yarnrc.yml'
const BUNFIG_FILE = 'bunfig.toml'

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
