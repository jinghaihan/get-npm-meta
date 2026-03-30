import type { RawConfig } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { NPM_CONFIG_ENV_PREFIX } from '../constants'

const INTERNAL_UNDERSCORE_RE = /(?!^)_/gu
const LINE_SPLIT_RE = /\r?\n/u
const ENV_VAR_RE = /\$\{([^}]+)\}/g

export function getUserConfigPath(env: NodeJS.ProcessEnv) {
  const envUserConfigPath = getEnvValue(env, `${NPM_CONFIG_ENV_PREFIX}userconfig`)
  if (envUserConfigPath)
    return envUserConfigPath

  const home = env.HOME || homedir()
  return join(home, '.npmrc')
}

export function getEnvValue(env: NodeJS.ProcessEnv, expectedKey: string) {
  const targetKey = expectedKey.toLowerCase()
  for (const [key, value] of Object.entries(env)) {
    if (key.toLowerCase() === targetKey && value !== undefined && value !== '')
      return value
  }
}

export function loadNpmrcFile(filePath: string, env: NodeJS.ProcessEnv = process.env): RawConfig {
  if (!existsSync(filePath))
    return {}

  const rawConfig: RawConfig = {}
  const lines = readFileSync(filePath, 'utf8').split(LINE_SPLIT_RE)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';'))
      continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1)
      continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimQuotes(trimmed.slice(separatorIndex + 1).trim())
    const value = rawValue.replace(ENV_VAR_RE, (_, name) => env[name] ?? '')
    assignRawConfigValue(rawConfig, key, value)
  }

  return rawConfig
}

export function loadEnvConfig(env: NodeJS.ProcessEnv): RawConfig {
  const rawConfig: RawConfig = {}

  for (const [envKey, envValue] of Object.entries(env)) {
    if (!envKey.toLowerCase().startsWith(NPM_CONFIG_ENV_PREFIX) || envValue === undefined || envValue === '')
      continue

    let key = envKey.slice(NPM_CONFIG_ENV_PREFIX.length)
    if (!key.startsWith('//'))
      key = key.replace(INTERNAL_UNDERSCORE_RE, '-').toLowerCase()

    assignRawConfigValue(rawConfig, key, envValue)
  }

  return rawConfig
}

export function assignRawConfigValue(rawConfig: RawConfig, key: string, value: string) {
  if (key.endsWith('[]')) {
    const normalizedKey = key.slice(0, -2)
    const currentValue = rawConfig[normalizedKey]
    if (Array.isArray(currentValue))
      currentValue.push(value)
    else if (typeof currentValue === 'string')
      rawConfig[normalizedKey] = [currentValue, value]
    else
      rawConfig[normalizedKey] = [value]
    return
  }

  rawConfig[key] = value
}

export function mergeConfig(
  target: RawConfig,
  source: RawConfig,
) {
  for (const [key, value] of Object.entries(source))
    target[key] = value
}

export function trimQuotes(value: string) {
  if (value.length < 2)
    return value

  const firstChar = value[0]
  const lastChar = value.at(-1)
  if ((firstChar === '"' && lastChar === '"') || (firstChar === '\'' && lastChar === '\''))
    return value.slice(1, -1)

  return value
}
