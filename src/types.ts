import type {
  GetLatestVersionOptions as DefaultRegistryGetLatestVersionOptions,
  GetVersionsOptions as DefaultRegistryGetVersionsOptions,
} from 'fast-npm-meta'

export interface NpmConfigOptions {
  /**
   * Working directory used to locate the default project `.npmrc` and package manager config.
   *
   * @default `process.cwd()`
   */
  cwd?: string
  /**
   * Environment source used for `npm_config_*` overrides and `HOME` lookup.
   *
   * @default `process.env`
   */
  env?: NodeJS.ProcessEnv
  /**
   * Explicit path to the user `.npmrc` file.
   *
   * @default `process.env.npm_config_userconfig` when present, otherwise `${HOME}/.npmrc`
   */
  userConfigPath?: string
  /**
   * Explicit path to the project `.npmrc` file.
   * Set to `false` to skip loading project config entirely.
   *
   * @default `${cwd}/.npmrc`
   */
  projectConfigPath?: string | false
  /**
   * Directory searched for package manager config files carrying registry settings
   * npm does not read: `pnpm-workspace.yaml`, `.yarnrc.yml` and `bunfig.toml`.
   * Set to `false` to skip loading package manager config entirely.
   *
   * @default `cwd`
   */
  packageManagerConfigDir?: string | false
}

export interface NpmConfig {
  /**
   * Effective default registry for unscoped packages.
   *
   * @default `https://registry.npmjs.org/`
   */
  registry: string
  /**
   * Flat config map containing the effective default registry plus any scoped registries.
   */
  npmConfigs: Record<string, string>
  /**
   * Scoped registry map keyed by package scope, for example `@my-scope`.
   *
   * @default `{}`
   */
  scopeRegistries: Record<string, string>
  /**
   * Auth settings grouped by normalized registry key, for example `//host/path/`.
   *
   * @default `{}`
   */
  authByRegistry: Record<string, RegistryAuthConfig>
  /**
   * Whether TLS certificates should be verified for registry requests.
   *
   * @default `true`
   */
  strictSSL: boolean
  /**
   * Inline CA certificate values collected from `ca[]` or equivalent inputs.
   *
   * @default `[]`
   */
  ca: string[]
  /**
   * CA bundle file path from `cafile`.
   */
  caFile?: string
  /**
   * Explicit user agent string from config when provided.
   */
  userAgent?: string
  /**
   * HTTP proxy URL from `proxy`.
   */
  proxy?: string
  /**
   * HTTPS proxy URL from `https-proxy`.
   */
  httpsProxy?: string
  /**
   * No-proxy value from `noproxy`.
   */
  noProxy?: string
  /**
   * Resolved user config path that was used during loading.
   */
  userConfigPath: string
  /**
   * Resolved project config path that was used during loading.
   * Omitted when project config loading is disabled.
   */
  projectConfigPath?: string
}

/**
 * Normalized auth settings that can be attached to a resolved registry.
 */
export interface RegistryAuthConfig {
  /**
   * Bearer token read from `:_authToken`.
   */
  token?: string
  /**
   * Base64-encoded basic auth value.
   * This may come from `_auth` directly or be derived from `username` and `_password`.
   */
  basicAuth?: string
  /**
   * Client certificate file path used for mTLS.
   */
  certFile?: string
  /**
   * Client private key file path used for mTLS.
   */
  keyFile?: string
}

export interface NpaOptions {
  /**
   * Raw package spec string to parse.
   * Supported inputs are registry package specs such as `foo`,
   * `foo@latest`, `foo@1.2.3`, and `@scope/foo@beta`.
   */
  spec: string
}

export interface NpaResult {
  /**
   * Original package spec string after trimming surrounding whitespace.
   */
  raw: string
  /**
   * Normalized package name, for example `foo` or `@scope/foo`.
   */
  name: string
  /**
   * URL-safe package name used by npm-compatible registries.
   * Scoped package slashes are encoded as `%2f`.
   */
  escapedName: string
  /**
   * Package scope when the package is scoped.
   */
  scope?: string
  /**
   * Raw version, tag, or range portion after the package name.
   *
   * @default `''`
   */
  rawSpec: string
}

export interface NpmPackumentVersion {
  _npmUser?: {
    approver?: unknown
    trustedPublisher?: unknown
  }
  deprecated?: string
  dist?: {
    attestations?: {
      provenance?: unknown
    }
    integrity?: string
    provenance?: 'trustedPublisher' | boolean
  }
  engines?: Partial<Record<string, string>>
  integrity?: string
  provenance?: 'trustedPublisher' | boolean
}

/**
 * Options for `getLatestVersion()` and `getLatestVersionBatch()`.
 *
 * This extends `fast-npm-meta`'s latest-version options with npm config
 * loading controls for registry resolution.
 */
export interface GetLatestVersionOptions<Metadata extends boolean = false, Throw extends boolean = true>
  extends NpmConfigOptions, DefaultRegistryGetLatestVersionOptions<Metadata, Throw> {}

/**
 * Options for `getVersions()` and `getVersionsBatch()`.
 *
 * This extends `fast-npm-meta`'s versions options with npm config loading
 * controls for registry resolution.
 */
export interface GetVersionsOptions<Metadata extends boolean = false, Throw extends boolean = true>
  extends NpmConfigOptions, DefaultRegistryGetVersionsOptions<Metadata, Throw> {}

export type {
  FetchOptions,
  InferGetLatestVersionResult,
  InferGetVersionsResult,
  MaybeError,
  PackageError,
  PackageManifest,
  PackageManifestError,
  PackageVersionMeta,
  PackageVersionsInfo,
  PackageVersionsInfoWithMetadata,
  ResolvedPackageVersion,
  ResolvedPackageVersionWithMetadata,
  RetryOptions,
} from 'fast-npm-meta'
