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
  it('returns request defaults when no config files exist', async () => {
    const { home, project } = createTempWorkspace()
    const config = await loadNpmConfig({
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

  it('applies project config over user config and env over both', async () => {
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

    const config = await loadNpmConfig({
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

  it('expands env var references in .npmrc values', async () => {
    const { home, project } = createTempWorkspace()
    const ref = (name: string) => '$' + `{${name}}`

    writeFileSync(join(project, '.npmrc'), [
      `//registry.npmjs.org/:_authToken=${ref('TEST_TOKEN')}`,
      `//other.example.com/:_authToken=${ref('MISSING_VAR')}`,
      `//multi.example.com/:_authToken=${ref('A')}${ref('B')}`,
      '//plain.example.com/:_authToken=static-token',
    ].join('\n'))

    const config = await loadNpmConfig({
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

  it('parses registry auth and certificate-related request config', async () => {
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

    const config = await loadNpmConfig({
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

describe('loadNpmConfig with package manager config', () => {
  it('reads registries from pnpm-workspace.yaml', async () => {
    const { home, project } = createTempWorkspace()

    writeFileSync(join(project, 'pnpm-workspace.yaml'), [
      'packages: []',
      'registries:',
      '  default: https://registry.example.com/npm',
      '  "@my-scope": https://npm.example.com',
      '  "@another": https://npm.another.dev/',
    ].join('\n'))

    const config = await loadNpmConfig({
      cwd: project,
      env: { HOME: home },
    })

    expect(config.registry).toBe('https://registry.example.com/npm/')
    expect(config.scopeRegistries).toEqual({
      '@another': 'https://npm.another.dev/',
      '@my-scope': 'https://npm.example.com/',
    })
    expect(config.authByRegistry).toEqual({})
    expect(pickRegistry('@my-scope', config.npmConfigs)).toBe('https://npm.example.com/')
  })

  it('ignores env placeholders in pnpm registry URLs', async () => {
    const { home, project } = createTempWorkspace()
    const privateRegistry = '$' + '{PRIVATE_REGISTRY}'
    const privateScopedRegistry = '$' + '{PRIVATE_SCOPED_REGISTRY}'

    writeFileSync(join(project, '.npmrc'), 'registry=https://npmrc.example.com/\n')
    writeFileSync(join(project, 'pnpm-workspace.yaml'), [
      'registries:',
      `  default: ${privateRegistry}`,
      `  "@private": ${privateScopedRegistry}`,
      '  "@valid": https://valid.example.com/',
    ].join('\n'))

    const config = await loadNpmConfig({
      cwd: project,
      env: { HOME: home },
    })

    expect(config.registry).toBe('https://npmrc.example.com/')
    expect(config.scopeRegistries).toEqual({
      '@valid': 'https://valid.example.com/',
    })
  })

  it('reads registries and token auth from .yarnrc.yml', async () => {
    const { home, project } = createTempWorkspace()
    const ref = (name: string) => '$' + `{${name}}`

    writeFileSync(join(project, 'yarn.lock'), '')
    writeFileSync(join(project, '.yarnrc.yml'), [
      'npmRegistryServer: "https://registry.example.com/"',
      `npmAuthToken: "${ref('TEST_DEFAULT_TOKEN')}"`,
      'npmScopes:',
      '  my-company:',
      '    npmRegistryServer: "https://npm.mycompany.com/"',
      `    npmAuthToken: "${ref('TEST_SCOPE_TOKEN')}"`,
      '  "@fallback":',
      '    npmRegistryServer: "https://npm.fallback.dev/"',
      `    npmAuthToken: "${ref('TEST_EMPTY_TOKEN:-fallback-token')}"`,
      'npmRegistries:',
      '  //npm.pkg.github.com:',
      '    npmAuthToken: "github-token"',
      '  //npm.unset.dev:',
      `    npmAuthToken: "${ref('TEST_UNSET_TOKEN-unset-token')}"`,
    ].join('\n'))

    const config = await loadNpmConfig({
      cwd: project,
      env: {
        HOME: home,
        TEST_DEFAULT_TOKEN: 'default-token',
        TEST_SCOPE_TOKEN: 'scope-token',
        TEST_EMPTY_TOKEN: '',
      },
    })

    expect(config.registry).toBe('https://registry.example.com/')
    expect(config.scopeRegistries).toEqual({
      '@fallback': 'https://npm.fallback.dev/',
      '@my-company': 'https://npm.mycompany.com/',
    })
    expect(config.authByRegistry).toEqual({
      '//npm.fallback.dev/': { token: 'fallback-token' },
      '//npm.mycompany.com/': { token: 'scope-token' },
      '//npm.pkg.github.com/': { token: 'github-token' },
      '//npm.unset.dev/': { token: 'unset-token' },
      '//registry.example.com/': { token: 'default-token' },
    })
    expect(pickRegistry('@my-company', config.npmConfigs)).toBe('https://npm.mycompany.com/')
  })

  it('reads registries and token auth from bunfig.toml', async () => {
    const { home, project } = createTempWorkspace()

    writeFileSync(join(project, 'bun.lock'), '')
    writeFileSync(join(project, 'bunfig.toml'), [
      '[install]',
      'registry = "https://registry.example.com/"',
      '',
      '[install.scopes]',
      'myorg = { url = "https://npm.myorg.com/", token = "$TEST_BUN_TOKEN" }',
      'another = "https://npm.another.dev/"',
    ].join('\n'))

    const config = await loadNpmConfig({
      cwd: project,
      env: { HOME: home, TEST_BUN_TOKEN: 'bun-token' },
    })

    expect(config.registry).toBe('https://registry.example.com/')
    expect(config.scopeRegistries).toEqual({
      '@another': 'https://npm.another.dev/',
      '@myorg': 'https://npm.myorg.com/',
    })
    expect(config.authByRegistry).toEqual({
      '//npm.myorg.com/': { token: 'bun-token' },
    })
    expect(pickRegistry('@myorg', config.npmConfigs)).toBe('https://npm.myorg.com/')
  })

  it('loads only the detected package manager config', async () => {
    const { home, project } = createTempWorkspace()

    writeFileSync(join(project, 'pnpm-workspace.yaml'), [
      'registries:',
      '  default: https://pnpm.example.com/',
    ].join('\n'))
    writeFileSync(join(project, '.yarnrc.yml'), 'npmRegistryServer: https://yarn.example.com/\n')
    writeFileSync(join(project, 'bunfig.toml'), '[install]\nregistry = "https://bun.example.com/"\n')

    const config = await loadNpmConfig({
      cwd: project,
      env: { HOME: home },
    })

    expect(config.registry).toBe('https://pnpm.example.com/')
  })

  it('finds package manager config in the repository root', async () => {
    const { home, project } = createTempWorkspace()
    const nested = join(project, 'packages', 'app')

    mkdirSync(nested, { recursive: true })
    mkdirSync(join(project, '.git'))
    writeFileSync(join(project, 'pnpm-workspace.yaml'), [
      'registries:',
      '  default: https://root.example.com/',
    ].join('\n'))

    const config = await loadNpmConfig({
      cwd: nested,
      env: { HOME: home },
    })

    expect(config.registry).toBe('https://root.example.com/')
  })

  it('does not search beyond the repository boundary', async () => {
    const { home, project } = createTempWorkspace()
    const nested = join(project, 'packages', 'app')

    mkdirSync(nested, { recursive: true })
    mkdirSync(join(project, '.git'))
    writeFileSync(join(tempRoot, 'pnpm-workspace.yaml'), [
      'registries:',
      '  default: https://outside.example.com/',
    ].join('\n'))

    const config = await loadNpmConfig({
      cwd: nested,
      env: { HOME: home },
    })

    expect(config.registry).toBe(NPM_REGISTRY)
  })

  it('applies package manager config over .npmrc and env over both', async () => {
    const { home, project } = createTempWorkspace()

    writeFileSync(join(project, '.npmrc'), [
      'registry=https://project.example/npm/',
      '@demo:registry=https://scope.project.example/npm/',
      '@untouched:registry=https://scope.untouched.example/npm/',
    ].join('\n'))

    writeFileSync(join(project, 'pnpm-workspace.yaml'), [
      'registries:',
      '  default: https://workspace.example/npm/',
      '  "@demo": https://scope.workspace.example/npm/',
    ].join('\n'))

    const config = await loadNpmConfig({
      cwd: project,
      env: {
        'HOME': home,
        'npm_config_@demo:registry': 'https://scope.env.example/npm/',
      },
    })

    expect(config.registry).toBe('https://workspace.example/npm/')
    expect(config.scopeRegistries).toEqual({
      '@demo': 'https://scope.env.example/npm/',
      '@untouched': 'https://scope.untouched.example/npm/',
    })
  })

  it('skips package manager config when disabled', async () => {
    const { home, project } = createTempWorkspace()

    writeFileSync(join(project, 'pnpm-workspace.yaml'), [
      'registries:',
      '  default: https://workspace.example/npm/',
    ].join('\n'))

    const config = await loadNpmConfig({
      cwd: project,
      env: { HOME: home },
      packageManagerConfigDir: false,
    })

    expect(config.registry).toBe(NPM_REGISTRY)
  })

  it('ignores unparseable package manager config', async () => {
    const { home, project } = createTempWorkspace()

    writeFileSync(join(project, '.npmrc'), 'registry=https://project.example/npm/')
    writeFileSync(join(project, 'bun.lock'), '')
    writeFileSync(join(project, 'bunfig.toml'), '[install')

    const config = await loadNpmConfig({
      cwd: project,
      env: { HOME: home },
    })

    expect(config.registry).toBe('https://project.example/npm/')
  })
})
