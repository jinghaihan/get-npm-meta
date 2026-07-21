interface PackumentVersionProvenance {
  dist?: {
    attestations?: {
      provenance?: unknown
    }
    provenance?: 'trustedPublisher' | boolean
  }
  provenance?: 'trustedPublisher' | boolean
}

export interface PackumentVersionProvenanceMeta {
  provenance?: boolean
  trustedPublisher?: boolean
}

export function getPackumentVersionProvenance(version: PackumentVersionProvenance): PackumentVersionProvenanceMeta {
  const raw = version.provenance
    ?? version.dist?.provenance
    ?? (version.dist?.attestations?.provenance ? true : undefined)

  if (raw === 'trustedPublisher')
    return { trustedPublisher: true }

  if (raw)
    return { provenance: true }

  return {}
}
