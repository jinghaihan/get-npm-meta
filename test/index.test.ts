import { Buffer } from 'node:buffer'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NPM_REGISTRY, pickRegistry } from 'fast-npm-meta'
import { afterEach, describe, expect, it } from 'vitest'
import { loadNpmConfig } from '../src/config'

const tempDirs: string[] = []
const tempRoot = fileURLToPath(new URL('./.tmp/', import.meta.url))

function createTempWorkspace() {
  mkdirSync(tempRoot, { recursive: true })
  const root = mkdtempSync(join(tempRoot, 'get-npm-meta-'))
  const home = join(root, 'home')
  const project = join(root, 'project')

  mkdirSync(home)
  mkdirSync(project)
  tempDirs.push(root)

  return { home, project }
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0))
    rmSync(tempDir, { recursive: true, force: true })
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('loadNpmConfig', () => {
  it('returns request defaults when no config files exist', () => {
    const { home, project } = createTempWorkspace()
    const config = loadNpmConfig({
      cwd: project,
      env: { HOME: home },
    })

    expect(config).toMatchObject({
      registry: NPM_REGISTRY,
      npmConfigs: {
        registry: NPM_REGISTRY,
      },
      scopeRegistries: {},
      authByRegistry: {},
      strictSSL: true,
      ca: [],
      userConfigPath: join(home, '.npmrc'),
      projectConfigPath: join(project, '.npmrc'),
    })
  })

  it('applies project config over user config and env over both', () => {
    const { home, project } = createTempWorkspace()

    writeFileSync(join(home, '.npmrc'), [
      'registry=https://user.example/npm',
      '@demo:registry=https://scope.user.example/npm',
      'strict-ssl=false',
      'proxy=https://user-proxy.example',
    ].join('\n'))

    writeFileSync(join(project, '.npmrc'), [
      'registry=https://project.example/npm/',
      'noproxy=internal.example.com',
    ].join('\n'))

    const config = loadNpmConfig({
      cwd: project,
      env: {
        'HOME': home,
        'npm_config_registry': 'https://env.example/npm',
        'npm_config_@demo:registry': 'https://scope.env.example/npm',
        'npm_config_strict_ssl': 'true',
      },
    })

    expect(config).toMatchObject({
      registry: 'https://env.example/npm/',
      npmConfigs: {
        '@demo:registry': 'https://scope.env.example/npm/',
        'registry': 'https://env.example/npm/',
      },
      scopeRegistries: {
        '@demo': 'https://scope.env.example/npm/',
      },
      strictSSL: true,
      proxy: 'https://user-proxy.example',
      noProxy: 'internal.example.com',
    })
    expect(pickRegistry('@demo', config.npmConfigs)).toBe('https://scope.env.example/npm/')
  })

  it('expands env var references in .npmrc values', () => {
    const { home, project } = createTempWorkspace()
    const ref = (name: string) => '$' + `{${name}}`

    writeFileSync(join(project, '.npmrc'), [
      `//registry.npmjs.org/:_authToken=${ref('TEST_TOKEN')}`,
      `//other.example.com/:_authToken=${ref('MISSING_VAR')}`,
      `//multi.example.com/:_authToken=${ref('A')}${ref('B')}`,
      '//plain.example.com/:_authToken=static-token',
    ].join('\n'))

    const config = loadNpmConfig({
      cwd: project,
      env: { HOME: home, TEST_TOKEN: 'registry', A: 'multi', B: '-example' },
    })

    expect(config.authByRegistry).toEqual({
      '//registry.npmjs.org/': { token: 'registry' },
      // ${MISSING_VAR} expands to '' → empty token → filtered out (same as npm behavior)
      '//multi.example.com/': { token: 'multi-example' },
      '//plain.example.com/': { token: 'static-token' },
    })
  })

  it('parses registry auth and certificate-related request config', () => {
    const { home, project } = createTempWorkspace()
    const password = Buffer.from('secret', 'utf8').toString('base64')

    writeFileSync(join(project, '.npmrc'), [
      'ca[]="first-ca"',
      'ca[]="second-ca"',
      'cafile=/tmp/company-ca.pem',
      '//registry.npmjs.org/:_authToken=npm-token',
      `//artifactory.example.com/api/npm/private/:username=alice`,
      `//artifactory.example.com/api/npm/private/:_password=${password}`,
      '//mtls.example.com/:certfile=/tmp/client-cert.pem',
      '//mtls.example.com/:keyfile=/tmp/client-key.pem',
    ].join('\n'))

    const config = loadNpmConfig({
      cwd: project,
      env: { HOME: home },
    })

    expect(config.ca).toEqual(['first-ca', 'second-ca'])
    expect(config.caFile).toBe('/tmp/company-ca.pem')
    expect(config.authByRegistry).toEqual({
      '//artifactory.example.com/api/npm/private/': {
        basicAuth: Buffer.from('alice:secret', 'utf8').toString('base64'),
      },
      '//mtls.example.com/': {
        certFile: '/tmp/client-cert.pem',
        keyFile: '/tmp/client-key.pem',
      },
      '//registry.npmjs.org/': {
        token: 'npm-token',
      },
    })
  })
})
