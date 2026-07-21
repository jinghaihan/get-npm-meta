import type { NpmPackumentVersion } from '../types'

export interface PackumentVersionProvenanceMeta {
  provenance?: boolean
  trustedPublisher?: boolean
}

export function getPackumentVersionProvenance(version: NpmPackumentVersion): PackumentVersionProvenanceMeta {
  const legacyProvenance = version.provenance ?? version.dist?.provenance
  const provenance = legacyProvenance === true || Boolean(version.dist?.attestations?.provenance)
  const trustedPublisher = legacyProvenance === 'trustedPublisher' || Boolean(version._npmUser?.trustedPublisher)

  return {
    ...(provenance ? { provenance: true } : {}),
    ...(trustedPublisher ? { trustedPublisher: true } : {}),
  }
}
