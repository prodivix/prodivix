# Remote Preview Host

`@prodivix/remote-preview-host` is the isolated static origin for successful
Remote Preview artifacts. The Backend uploads an already authorization-scoped
artifact through the internal bearer-authenticated endpoint; this service then
strictly decodes the canonical `ExecutionPreviewBundle` and issues a bounded,
short-lived capability origin:

```text
https://<random-capability>.preview.example.com/
```

Each capability is a distinct browser origin, so application routes remain rooted
at `/` while cookies and Web Storage cannot cross Preview sessions. The service
stores only a SHA-256 hash of the capability, keeps bundle files in bounded
ephemeral memory, never receives a Control Plane credential, and serves no
directory listing. Missing document routes fall back to the declared HTML
entrypoint; missing asset requests fail closed.

Production requires wildcard DNS and TLS for
`*.preview.example.com`. Configure:

- `REMOTE_PREVIEW_HOST_TOKEN`: Backend-to-Host credential.
- `REMOTE_PREVIEW_PUBLIC_BASE_URL`: base origin beneath the wildcard domain.
- `REMOTE_PREVIEW_EDITOR_ORIGINS`: comma-separated allowed iframe ancestors.
- `REMOTE_PREVIEW_MAXIMUM_SESSIONS`, `REMOTE_PREVIEW_MAXIMUM_TOTAL_BYTES`,
  `REMOTE_PREVIEW_MAXIMUM_UPLOAD_BYTES`, `REMOTE_PREVIEW_MAXIMUM_TTL_SECONDS`,
  and `REMOTE_PREVIEW_DEFAULT_TTL_SECONDS`: bounded resource policy.

Runtime requests use a deny-by-default CSP (`connect-src 'none'`), CSP sandbox,
Permissions Policy, no credentials, no cache, MIME sniffing protection, and
cross-origin isolation headers. Install-time package network access remains a
separate Worker policy and is never inherited by Preview runtime code.
