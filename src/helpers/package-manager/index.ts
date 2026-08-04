import type { RawConfig } from '../types'
import { join } from 'node:path'
import process from 'node:process'
import { detect } from 'package-manager-detector'
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
 * with `.npmrc`. Only the detected package manager's config is loaded.
 *
 * Only bearer token auth is translated; basic auth is left to `.npmrc`.
 */
export async function loadPackageManagerConfig(dir: string, env: NodeJS.ProcessEnv = process.env): Promise<RawConfig> {
  const packageManager = await detect({ cwd: dir })

  switch (packageManager?.name) {
    case 'pnpm':
      return loadPnpmWorkspaceFile(join(dir, PNPM_WORKSPACE_FILE))
    case 'yarn':
      return loadYarnRcFile(join(dir, YARN_RC_FILE), env)
    case 'bun':
      return loadBunfigFile(join(dir, BUNFIG_FILE), env)
    default:
      return {}
  }
}
