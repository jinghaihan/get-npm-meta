import type { NpaOptions, NpaResult } from './types'
import validateNpmPackageName from 'validate-npm-package-name'

const FILE_PROTOCOL_RE = /^file:/iu
const ALIAS_PROTOCOL_RE = /^npm:/iu
const URL_SPEC_RE = /^(?:git\+)?[a-z]+:/iu
const GIT_SSH_SPEC_RE = /^[^@]+@[^:.]+\.[^:]+:.+$/u
const LOCAL_PATH_RE = /^(?:\.{1,2}(?:[/\\]|$)|[/\\]|~[/\\]|[A-Za-z]:[/\\])/u

export function parseNpmSpec(options: NpaOptions): NpaResult {
  const rawSpec = options.spec.trim()

  if (!rawSpec)
    throw createNpaError('Package spec must be a non-empty string.', 'EINVALIDPACKAGESPEC')

  assertSupportedSpec(rawSpec)

  const result = rawSpec.startsWith('@')
    ? parseScopedPackageSpec(rawSpec)
    : parseUnscopedPackageSpec(rawSpec)

  validatePackageName(result.name, rawSpec)

  return {
    raw: rawSpec,
    name: result.name,
    escapedName: result.name.replace('/', '%2f'),
    scope: getPackageScope(result.name),
    rawSpec: result.rawSpec,
  }
}

function assertSupportedSpec(spec: string): void {
  if (FILE_PROTOCOL_RE.test(spec))
    throw createUnsupportedSpecError(spec, 'file')

  if (ALIAS_PROTOCOL_RE.test(spec))
    throw createUnsupportedSpecError(spec, 'npm alias')

  if (LOCAL_PATH_RE.test(spec))
    throw createUnsupportedSpecError(spec, 'local path')

  if (GIT_SSH_SPEC_RE.test(spec))
    throw createUnsupportedSpecError(spec, 'git')

  if (URL_SPEC_RE.test(spec))
    throw createUnsupportedSpecError(spec, 'url')
}

function parseScopedPackageSpec(spec: string): { name: string, rawSpec: string } {
  const slashIndex = spec.indexOf('/')
  if (slashIndex <= 1 || slashIndex === spec.length - 1)
    throw createNpaError(`Invalid scoped package spec "${spec}".`, 'EINVALIDPACKAGESPEC')

  const versionSeparatorIndex = spec.indexOf('@', slashIndex + 1)
  if (versionSeparatorIndex === -1)
    return { name: spec, rawSpec: '' }

  return {
    name: spec.slice(0, versionSeparatorIndex),
    rawSpec: spec.slice(versionSeparatorIndex + 1),
  }
}

function parseUnscopedPackageSpec(spec: string): { name: string, rawSpec: string } {
  const versionSeparatorIndex = spec.indexOf('@')
  if (versionSeparatorIndex === -1)
    return { name: spec, rawSpec: '' }

  return {
    name: spec.slice(0, versionSeparatorIndex),
    rawSpec: spec.slice(versionSeparatorIndex + 1),
  }
}

function validatePackageName(name: string, rawSpec: string): void {
  if (!name)
    throw createNpaError(`Invalid package spec "${rawSpec}".`, 'EINVALIDPACKAGESPEC')

  if (!name.startsWith('@') && name.includes('/'))
    throw createUnsupportedSpecError(rawSpec, 'local path')

  const packageNameValidation = validateNpmPackageName(name)
  if (!packageNameValidation.validForOldPackages) {
    throw createNpaError(
      `Invalid package name "${name}" in "${rawSpec}".`,
      'EINVALIDPACKAGENAME',
    )
  }
}

function getPackageScope(name: string): string | undefined {
  if (!name.startsWith('@'))
    return undefined

  return name.slice(0, name.indexOf('/'))
}

function createUnsupportedSpecError(spec: string, kind: string): Error {
  return createNpaError(
    `Unsupported ${kind} package spec "${spec}" for get-npm-meta.`,
    'EUNSUPPORTEDPACKAGESPEC',
  )
}

function createNpaError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}
