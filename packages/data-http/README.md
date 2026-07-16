# Prodivix Data HTTP Adapter

`@prodivix/data-http` is the HTTP protocol adapter for the transport-neutral
`@prodivix/data` runtime kernel. It maps canonical Data source and operation
configuration to an injected network transport; it does not call browser fetch,
own environment or Secret resolution, persist responses, or define a second
lifecycle.

Current live configuration uses literal `baseUrl` on the source and literal
`method`, `path`, and optional `emptyWhen` on the operation. Query input becomes
sorted scalar query parameters. Mutation input becomes a JSON body. Empty is
explicit (`status-204`) and is never inferred from an empty array, null, or other
response shape.

Every transport response or failure must carry the shared metadata-only
`network.request` trace. The Data kernel fences its document, operation,
invocation, sequence, attempt, runtime zone, and mode correlation before
publishing it. Headers, URL paths/queries, bodies, and credentials never enter
the trace contract.
