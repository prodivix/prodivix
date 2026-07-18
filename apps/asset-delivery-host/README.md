# Asset Delivery Host

The Asset Delivery Host is an independent, credential-free public origin for
short-lived Binary Asset delivery. A trusted internal caller uploads exact
bytes with a digest. The host transforms and scans supported media before it
allocates a capability subdomain; only the capability hash is retained.

The production policy composes deterministic PNG and baseline JPEG metadata
stripping, dimension and structural validation, one or more required
malware-engine groups, derived caching, and inline delivery. The current
production adapter uses bounded
ClamAV `INSTREAM`; each engine group can have ordered replicas, but every group
must return clean. Replica failover occurs only for bounded infrastructure
unavailability, never after a quarantine verdict. Every explicitly allowlisted
media type outside those image-transform profiles is subject to the same
required-engine policy. Unsupported
media, duplicate scanner coverage, exhausted replicas, divergent policy
cohorts, daemon errors, protocol drift, timeouts, and connection failures all
fail closed before a capability session is allocated. Active content can never
be delivered inline; a clean active asset is still forced to attachment
delivery on this isolated origin.

`POST /internal/image-transform-delivery-sessions` accepts only `image/png`
with `prodivix.image.png-sanitize@1` or `image/jpeg` with
`prodivix.image.jpeg-sanitize@1`, and both require inline disposition. The JPEG
profile is deliberately narrow: 8-bit baseline Huffman coding, one or three
components, valid DQT/DHT/SOF0/SOS/EOI structure, bounded segments/scans and
default EXIF orientation only. It strips APP metadata and comments, preserves
the rendering-critical Adobe APP14 marker, and preserves validated entropy
bytes exactly. Progressive/arithmetic/CMYK JPEG, non-default orientation,
table redefinition, trailing data, and malformed or over-budget input fail
closed. Full raster decode/re-encode and additional image formats remain a
separate Gate. `POST /internal/delivery-sessions` remains the scanned original
attachment path.

Required configuration:

- `ASSET_DELIVERY_HOST_TOKEN`
- `ASSET_DELIVERY_PUBLIC_BASE_URL` in production, including wildcard DNS/TLS
  for `*.asset-delivery.example.com`
- `ASSET_DELIVERY_SCANNER_POLICY_VERSION`, the canonical base identity for the
  scanner composition. The runtime combines it with every required engine's
  loaded engine/signature-database identity to form the effective policy
  version.

ClamAV configuration:

- `ASSET_DELIVERY_CLAMAV_ENGINES_JSON`, optional strict multi-engine topology.
  When absent, the legacy host/port settings below form one `clamav/primary`
  engine and replica. The JSON is bounded to 8 required engines, 16 ordered
  replicas per engine, and 32 total replicas. For example:

  ```json
  [
    {
      "id": "feed-a",
      "replicas": [
        { "id": "primary", "host": "clamav-a-1", "port": 3310 },
        { "id": "secondary", "host": "clamav-a-2", "port": 3310 }
      ]
    },
    {
      "id": "feed-b",
      "replicas": [{ "id": "primary", "host": "clamav-b-1", "port": 3310 }]
    }
  ]
  ```

- `ASSET_DELIVERY_CLAMAV_HOST` (default `127.0.0.1`)
- `ASSET_DELIVERY_CLAMAV_PORT` (default `3310`)
- `ASSET_DELIVERY_CLAMAV_TIMEOUT_MS` (default `15000`)
- `ASSET_DELIVERY_CLAMAV_CHUNK_BYTES` (default `65536`)
- `ASSET_DELIVERY_CLAMAV_MAXIMUM_RESPONSE_BYTES` (default `4096`)
- `ASSET_DELIVERY_CLAMAV_MAXIMUM_DATABASE_AGE_HOURS` (default `72`)
- `ASSET_DELIVERY_CLAMAV_MAXIMUM_FUTURE_SKEW_SECONDS` (default `300`)
- `ASSET_DELIVERY_CLAMAV_READINESS_CACHE_SECONDS` (default `30`)

Run `clamd` on a private co-located or otherwise trusted network boundary; its
TCP protocol is not a public authenticated API. `clamd` `StreamMaxLength` must
be at least `ASSET_DELIVERY_MAXIMUM_UPLOAD_BYTES`, and the daemon/container must
run in UTC so the bounded database-age check is unambiguous. At startup the host
uses NUL-framed `PING` and `VERSIONCOMMANDS` probes to require `INSTREAM`
support, parse bounded engine/database metadata, and reject stale or
future-dated signature databases. See the official
[clamd protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html) and
[ClamAV container guidance](https://docs.clamav.net/manual/Installing/Docker.html).

`GET /healthz` is process liveness only. `GET /readyz` refreshes the cached,
bounded fleet snapshot. Internal delivery creation performs the same refresh
before reading an upload and verifies the same immutable generation again
before allocating a capability session. A refresh selects one converged,
freshest cohort per required engine, rejects downgrade/incomparable/divergent
cohorts, and publishes all engine changes atomically. A newly loaded FreshClam
database therefore creates a new effective policy generation without a Host
restart. Observing that generation revokes all old short-lived delivery
sessions; cached derived exact bytes are re-scanned under the new policy, and
an in-flight old-generation scan cannot sign a session. Orchestrators should
poll `/readyz` at an interval no longer than the configured readiness cache so
fresh updates and session revocation are observed promptly.

The adapter never returns daemon signature names: malware maps only to
`AST-SCAN-MALWARE-DETECTED`. The GitHub-only
`g2-binary-asset-malware.yml` workflow starts the official preloaded-database
image as a rootless, capability-dropped Podman container and checks clean and
quarantine paths against the real daemon. Normal local unit/contract Gates do
not require Podman, Docker, nerdctl, WSL, or a local ClamAV installation.

The host does not hold Workspace, Backend, database, object-store, or Control
Plane credentials.
