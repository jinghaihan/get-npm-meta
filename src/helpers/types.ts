export type RawConfigValue = string | string[]

export type RawConfig = Record<string, RawConfigValue>

export interface PackageManagerConfig {
  file: string
  load: (filePath: string, env: NodeJS.ProcessEnv) => RawConfig
}

export interface LegacyRegistryAuthConfig {
  _auth?: string
  _authToken?: string
  _password?: string
  certfile?: string
  keyfile?: string
  username?: string
}
