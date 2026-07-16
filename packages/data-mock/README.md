# @prodivix/data-mock

Deterministic, transport-neutral fixture adapter for `@prodivix/data`.

The package owns runtime fixture matching and mock session isolation. Fixtures are provisioned per runtime session, never written into lifecycle snapshots, Network traces, canonical Workspace documents, or live adapter configuration. Exact input fixtures take precedence over an operation fallback; missing and ambiguous fixtures fail closed.
