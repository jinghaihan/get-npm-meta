# get-npm-meta

[![npm version][npm-version-src]][npm-version-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

Minimal, auth-aware npm metadata utilities for projects that rely on `.npmrc`, scoped registries, or private registries.

```sh
pnpm add get-npm-meta
```

## Usage

```ts
import { getLatestVersion, getVersions } from 'get-npm-meta'

const react = await getLatestVersion('react')

const internal = await getLatestVersion('@org/pkg@^1', {
  cwd: process.cwd(),
  metadata: true,
})

const versions = await getVersions('@org/pkg', {
  cwd: process.cwd(),
  metadata: true,
})
```

`get-npm-meta` reads user and project `.npmrc`, applies `npm_config_*` overrides, resolves scoped registries, and forwards registry auth when needed.

Registries declared in a package manager's own config file are picked up as well, since npm never reads them:

- pnpm — `pnpm-workspace.yaml`: `registries`
- Yarn Berry — `.yarnrc.yml`: `npmRegistryServer`, `npmScopes`, `npmRegistries`
- Bun — `bunfig.toml`: `[install].registry`, `[install.scopes]`

They layer over `.npmrc` and below `npm_config_*` overrides, matching how each tool treats its own config. Bearer token auth is translated too, applying each tool's env var interpolation; basic auth is left to `.npmrc`. Pass `packageManagerConfigDir: false` to skip them.

Supported specs are registry package specs such as `foo`, `foo@latest`, `foo@^1`, and `@scope/foo@beta`.

## API

> [!TIP]
> The request options extend `fast-npm-meta` with npm config loading controls: `cwd`, `env`, `userConfigPath`, `projectConfigPath`, and `packageManagerConfigDir`.

- `getLatestVersion(spec, options)`
- `getLatestVersionBatch(specs, options)`
- `getVersions(spec, options)`
- `getVersionsBatch(specs, options)`
- `loadNpmConfig(options)`
- `parseNpmSpec({ spec })`

## Compared to fast-npm-meta

[`fast-npm-meta`](https://github.com/antfu/fast-npm-meta) is the recommended choice when you only use the default npm registry.

`get-npm-meta` is for npm-style registry resolution: it loads `.npmrc`, picks scoped registries, reuses auth config, and keeps the return shape aligned with `fast-npm-meta` where practical.

When a package resolves to the default npm registry (`https://registry.npmjs.org/`), this package delegates the request to `fast-npm-meta`.

## Credits

- [`npm/cli`](https://github.com/npm/cli)
- [`npm/npm-package-arg`](https://github.com/npm/npm-package-arg)
- [`npm/npm-registry-fetch`](https://github.com/npm/npm-registry-fetch)
- [`fast-npm-meta`](https://github.com/antfu/fast-npm-meta)

## License

[MIT](./LICENSE) License © [jinghaihan](https://github.com/jinghaihan)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/get-npm-meta?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/get-npm-meta
[npm-downloads-src]: https://img.shields.io/npm/dm/get-npm-meta?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/get-npm-meta
[bundle-src]: https://img.shields.io/bundlephobia/minzip/get-npm-meta?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=get-npm-meta
[license-src]: https://img.shields.io/badge/license-MIT-blue.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/jinghaihan/get-npm-meta/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/get-npm-meta
