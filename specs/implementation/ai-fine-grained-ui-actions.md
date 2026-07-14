# AI Workspace Actions And Fine-Grained UI Triggers

## Status

- Draft
- Date: 2026-06-29
- Related documents:
  - `specs/decisions/22.llm-integration-architecture.md`
  - `specs/decisions/12.command-transaction-planner.md`
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/decisions/28.code-authoring-environment.md`
  - `specs/decisions/08.route-manifest-outlet.md`
  - `specs/router/route-manifest.md`
  - `specs/implementation/llm-integration-foundation.md`
  - `specs/implementation/llm-streaming-runtime.md`

## Goal

This document defines the next implementation step for Prodivix AI in the Web editor: move from the current plan-only Blueprint assistant toward target-scoped workspace actions.

Fine-grained UI triggers are still important, but they are only entry points. The AI action itself must be allowed to target the correct workspace object: route, document, PIR node, code artifact, asset, i18n resource, external library, settings, export config, diagnostic, test, NodeGraph, or animation document.

The goal is not to build a free-form agent. The goal is to make AI available at the exact UI surface where the user is already working, while keeping each AI operation small, typed, reviewable, reversible, and validated by the same workspace systems that human edits use.

## Current Implementation Baseline

Current code has an early AI foundation:

- `packages/shared/src/llm` defines task, gateway, context, tool, trace, streaming event, and output channel primitives.
- `packages/ai` provides settings, provider factory, OpenAI-compatible provider, streaming support, task creation, and basic structured output validation.
- `apps/web/src/ai/aiSettingsStore.ts` stores browser-side AI settings.
- `BlueprintAssistantPanel` provides a bottom-right assistant in the Blueprint editor.
- The Blueprint assistant currently collects only current route and selected node id.
- The assistant requests `outputChannels: ['pir-command']`, `requiresPlan: true`, JSON mode, and streaming.
- The assistant displays plan, raw response, prompt preview, and trace id.

Important limitation: the current Blueprint assistant is plan-only. It does not dry-run or apply changes. It also frames the AI task too narrowly as a Blueprint/PIR command task. `LlmPirCommandBatch.commands` is still `unknown[]`, and there is no workspace action validator for route, resource, settings, export, diagnostic, or test targets.

## Product Direction

AI should be surfaced as object-scoped actions, not only as a global chat panel.

The user should be able to invoke AI from:

- Selected component on canvas.
- Component tree node.
- Inspector section.
- Class Protocol editor.
- Event and trigger editor.
- Mounted CSS editor.
- Route tree, address bar, route inspector, or Outlet binding UI.
- Resources pages for public assets, project files, code files, i18n, and external libraries.
- Code Artifact editor.
- NodeGraph node or edge.
- Animation timeline, track, or keyframe.
- Issues or diagnostics panel.
- Export error, preview failure, or deployment config.
- Workspace settings and theme token surfaces.

Each entry point should define:

- The trigger surface.
- The target object.
- The allowed edit surface.
- The allowed action target kinds.
- The allowed command / intent / operation families.
- The context budget.
- Whether the action is explain-only, plan-only, dry-run, or apply-capable.
- Whether user confirmation is required.

## Principles

### 1. Small Scope By Default

AI actions should default to the smallest useful target.

Examples:

- Rewrite text for the selected node.
- Suggest layout fixes for the selected container.
- Create a child route under the selected route.
- Bind the selected `PdxOutlet` to the active route.
- Generate mounted CSS classes for the selected node.
- Explain a diagnostic on one target.
- Generate an event handler for one event slot.
- Fix one export diagnostic.
- Add one i18n key for selected text.

Large intents are allowed, but they must first produce a plan and then split into small batches.

### 2. UI Triggers Carry Capability

Do not let the model infer the available operation space from prose alone. The UI trigger must pass an explicit capability summary.

Example target context:

```json
{
  "surface": "route.inspector",
  "target": {
    "kind": "route",
    "routeNodeId": "route-settings",
    "path": "/settings"
  },
  "allowedTargetKinds": ["route", "document", "code-artifact"],
  "allowedActions": [
    "renameRouteSegment",
    "createChildRoute",
    "attachRouteLayout",
    "bindRouteOutlet",
    "createRouteLoader"
  ],
  "riskLevel": "medium"
}
```

### 3. No Direct State Writes From Model Output

Model output must never directly mutate React state, PIR graph, Workspace VFS, CodeArtifact, RouteGraph, NodeGraph, animation documents, settings, or resources.

All write-capable AI output must pass through:

```text
LLM output
  -> structured output validation
  -> capability validation
  -> dry-run
  -> user review if needed
  -> apply command / intent / patch
  -> diagnostics / trace
```

### 4. Code-Owned Work Uses Code Authoring Environment

AI-generated handler, executor, adapter, route loader, route guard, mounted CSS, shader, or utility code must be represented as CodeArtifact or CodeReference and routed through Code Authoring Environment.

AI must not store code strings directly inside Blueprint, RouteGraph, NodeGraph, Animation, or local UI state.

### 5. Diagnostics Are AI Inputs And Outputs

Diagnostics should drive AI actions:

- "Explain this issue."
- "Fix this issue."
- "Create a safe patch."

AI repair loops should consume structured diagnostic fields such as code, targetRef, sourceSpan, evidence, allowedValues, and repairHint. They should not parse user-facing text as the primary protocol.

## Proposed Architecture

### Web AI Runtime Layer

Add a Web editor AI runtime boundary instead of keeping AI orchestration inside `BlueprintAssistantPanel`.

Recommended files:

```text
apps/web/src/editor/ai/
  aiAction.types.ts
  aiActionRegistry.ts
  buildAiActionContext.ts
  runAiAction.ts
  validateAiActionOutput.ts
  dryRunAiAction.ts
  applyAiAction.ts
  aiTracePresentation.ts
```

Responsibilities:

- Build target-scoped context bundles.
- Register AI actions per editor surface and workspace domain.
- Build `LlmTaskRequest`.
- Register editor semantic tools.
- Validate structured output against action capability.
- Dispatch dry-run and apply through existing editor command paths.
- Convert diagnostics and trace into UI presentation.

### AI Action Model

Introduce a stable action descriptor.

```ts
export type EditorAiSurface =
  | 'blueprint.canvas'
  | 'blueprint.componentTree'
  | 'blueprint.inspector'
  | 'blueprint.classProtocol'
  | 'blueprint.events'
  | 'blueprint.mountedCss'
  | 'route.tree'
  | 'route.inspector'
  | 'resources.assets'
  | 'resources.i18n'
  | 'resources.externalLibraries'
  | 'resources.code'
  | 'nodeGraph.node'
  | 'animation.timeline'
  | 'issues'
  | 'export'
  | 'workspace.settings';

export type EditorAiTargetKind =
  | 'workspace'
  | 'route'
  | 'document'
  | 'pir-node'
  | 'code-artifact'
  | 'node-graph'
  | 'animation'
  | 'asset'
  | 'i18n'
  | 'external-library'
  | 'theme'
  | 'settings'
  | 'export'
  | 'test'
  | 'diagnostic';

export type EditorAiActionMode = 'explain' | 'plan' | 'dry-run' | 'apply';

export interface EditorAiActionDefinition {
  id: string;
  title: string;
  surface: EditorAiSurface;
  mode: EditorAiActionMode;
  allowedTargetKinds: readonly EditorAiTargetKind[];
  outputChannels: readonly LlmOutputChannel[];
  allowedTools: readonly string[];
  allowedOperationTypes: readonly string[];
  riskLevel: LlmRiskLevel;
  requiresSelection?: boolean;
  requiresConfirmation?: boolean;
}
```

Initial actions should be narrow:

| Action                   | Surface                   | Target          | Mode    |
| ------------------------ | ------------------------- | --------------- | ------- |
| Explain selected node    | `blueprint.inspector`     | `pir-node`      | explain |
| Rewrite selected text    | `blueprint.inspector`     | `pir-node`      | dry-run |
| Suggest classes          | `blueprint.classProtocol` | `pir-node`      | plan    |
| Create mounted CSS class | `blueprint.classProtocol` | `code-artifact` | dry-run |
| Create child route       | `route.tree`              | `route`         | dry-run |
| Bind selected Outlet     | `route.inspector`         | `route`         | dry-run |
| Create route loader      | `route.inspector`         | `code-artifact` | dry-run |
| Add i18n key for text    | `resources.i18n`          | `i18n`          | dry-run |
| Explain diagnostic       | `issues`                  | `diagnostic`    | explain |
| Fix selected diagnostic  | `issues`                  | target-derived  | dry-run |
| Generate event handler   | `blueprint.events`        | `code-artifact` | dry-run |
| Explain export failure   | `export`                  | `export`        | explain |
| Fix export configuration | `export`                  | `export`        | dry-run |
| Generate test for route  | `route.inspector`         | `test`          | dry-run |

## Context Construction

`buildAiActionContext` should construct a minimal, authoritative context bundle.

Context entries should include only what the action needs:

- Current route / matchChain.
- Selected route node and route capabilities.
- Selected PIR node summary.
- Selected subtree summary, only for container actions.
- Editable props and allowed enum values.
- Existing class tokens and mounted CSS references.
- Relevant CodeArtifact summaries.
- Resource summaries for assets, i18n, external libraries, or export config.
- Diagnostics for the target.
- Component capability summary.
- Theme token summary.
- Action capability and risk policy.

Avoid:

- Full PIR document by default.
- Full workspace files by default.
- Full external library source.
- Long raw CSS or TS files unless the target action explicitly edits that artifact.

Example context bundle:

```json
{
  "entries": [
    {
      "id": "route.current",
      "title": "Current route",
      "authority": "authoritative",
      "value": "/settings"
    },
    {
      "id": "target.route",
      "title": "Selected route",
      "authority": "authoritative",
      "value": {
        "routeNodeId": "route-settings",
        "path": "/settings",
        "pageDocId": "page-settings",
        "layoutDocId": "layout-app"
      }
    },
    {
      "id": "target.capability",
      "title": "Allowed edits",
      "authority": "authoritative",
      "value": {
        "allowedOperationTypes": [
          "route.renameSegment",
          "route.createChild",
          "route.bindOutlet"
        ]
      }
    }
  ],
  "omittedContext": ["Full workspace omitted for selected-route action."],
  "tokenBudget": 1800
}
```

## Structured Output Tightening

The current shared type is too loose:

```ts
export interface LlmPirCommandBatch {
  channel: 'pir-command';
  commands: readonly unknown[];
  riskLevel: LlmRiskLevel;
}
```

Next implementation should introduce an editor-side workspace action validation layer before shared protocol is tightened globally.

Recommended temporary shape:

```ts
export interface AiWorkspaceActionEnvelope {
  type: string;
  targetRef: {
    kind: EditorAiTargetKind;
    id?: string;
    documentId?: string;
    routeNodeId?: string;
    artifactId?: string;
  };
  payload: Record<string, unknown>;
  reason?: string;
}
```

Validation must check:

- Operation type is allowed by the action.
- Target kind and id match the UI trigger scope.
- Payload only edits allowed fields.
- Risk level does not exceed action policy.
- Code-owned payloads are represented as CodeArtifact or CodeReference, not raw UI state strings.
- Route operations use RouteGraph intents, not component-local path strings.
- Resource, settings, export, and test operations use workspace command paths.

Long term, this should converge with Workspace Command / Intent schema instead of remaining AI-specific.

## Dry-Run And Apply

Every write-capable AI action should produce a dry-run result before apply.

```ts
export interface AiDryRunResult {
  status: 'ok' | 'blocked';
  summary: string;
  riskLevel: LlmRiskLevel;
  diagnostics: readonly LlmDiagnostic[];
  preview:
    | { kind: 'pir-diff'; before: unknown; after: unknown }
    | { kind: 'route-diff'; before: unknown; after: unknown }
    | { kind: 'workspace-diff'; before: unknown; after: unknown }
    | { kind: 'code-diff'; artifactId?: string; before?: string; after: string }
    | { kind: 'node-graph-diff'; before: unknown; after: unknown }
    | { kind: 'animation-diff'; before: unknown; after: unknown }
    | { kind: 'resource-diff'; before: unknown; after: unknown }
    | { kind: 'settings-diff'; before: unknown; after: unknown }
    | { kind: 'export-diff'; before: unknown; after: unknown };
  applyToken?: string;
}
```

Apply must require a successful dry-run. High-risk actions require explicit user confirmation.

Apply should route through existing editor/store command paths:

- PIR graph changes through graph command / patch helpers.
- Route changes through route intent / route manifest command.
- Workspace document changes through workspace document mutation paths.
- CodeArtifact changes through Code Authoring Environment and workspace code document APIs.
- Resource changes through resource workspace command helpers.
- NodeGraph changes through NodeGraph operation validators.
- Animation changes through animation document update paths.
- Settings and export changes through their own workspace command validators.

## UI Patterns

### Inline AI Buttons

Use small icon buttons or menu items near the target control. Avoid adding large AI panels inside dense inspector sections.

Examples:

- Class Protocol input: AI suggest class button.
- Mounted CSS editor: AI generate class button.
- Event handler slot: AI create handler button.
- Route row: AI create child route or explain route.
- Outlet field: AI bind active route.
- Diagnostic row: AI explain / fix button.
- Export error: AI explain / propose fix button.
- Component tree context menu: AI refactor subtree.

### Review Panel

For dry-run actions, show a compact review panel:

- User intent.
- Trigger surface.
- Target.
- Summary.
- Risk level.
- Diff preview.
- Diagnostics.
- Apply / discard controls.

Do not auto-apply generated patches from normal inline actions.

### Global Assistant Role

The existing bottom-right Blueprint assistant should become a plan and orchestration surface:

- Good for broad questions.
- Good for explaining current selection.
- Good for creating multi-step plans.
- Good for coordinating actions across domains.
- Not the primary path for small edits.

## Initial Implementation Phases

### Phase 1: Extract Runtime Boundary

- Move task creation, provider creation, context building, and gateway usage out of `BlueprintAssistantPanel`.
- Add `apps/web/src/editor/ai` with action types and runner skeleton.
- Keep current assistant behavior working.
- Add action context for current route and selected node.

Acceptance:

- Blueprint assistant no longer owns AI orchestration details.
- Existing mock and OpenAI-compatible settings still work.
- No writes yet.

### Phase 2: Action Registry And Explain Actions

- Add `EditorAiActionRegistry`.
- Register explain-only actions for selected node, selected route, diagnostics, and export failure.
- Surface actions in Inspector, Route surfaces, Issues, and Export.
- Return plan-like explanation output only.

Acceptance:

- User can invoke AI from a selected node or route surface.
- Context contains target details and diagnostics, not just selected id.
- No state write path exists in this phase.

### Phase 3: Workspace Action Dry-Run For Low-Risk Commands

- Define editor-side `AiWorkspaceActionEnvelope`.
- Add validation for selected-node text, safe props updates, route child creation, and route outlet binding.
- Add dry-run for:
  - rewrite selected text
  - update safe prop values
  - create child route
  - bind route outlet
  - suggest class tokens without creating code artifacts
- Show review panel before apply.

Acceptance:

- Default-collapsed or unselected nodes cannot be edited by stale AI output.
- Model cannot target an object outside the action scope.
- Invalid action shape returns structured diagnostics.

### Phase 4: Mounted CSS, Route Runtime, And CodeArtifact Actions

- Add AI action for creating mounted CSS classes.
- Add route loader / guard / action code generation.
- Route generated code into CodeArtifact / workspace code document.
- Bind generated code through CodeReference.
- Reuse the revision-bound Workspace Semantic Index for class, symbol, reference, and impact discovery; do not scan editor-private state.

Acceptance:

- AI-generated mounted CSS and route runtime code are not stored as raw strings in component-local UI state.
- Generated classes show up in Class Protocol suggestions.
- Dry-run preview shows code artifact diff and binding diff.

### Phase 5: Resources, Export, NodeGraph, And Animation Actions

- Add i18n key generation and asset metadata actions.
- Add export diagnostic explain/fix actions.
- Add NodeGraph action for small operation batches.
- Add animation action for small timeline/keyframe changes.
- Validate target, inputs, outputs, and capability constraints.

Acceptance:

- AI can safely modify non-editor-canvas workspace objects.
- Export and resource changes use workspace command validators.
- NodeGraph and animation operation dry-runs validate domain semantics.

### Phase 6: Repair Loop

- Feed validation and dry-run diagnostics back into the model.
- Limit repair attempts.
- Preserve trace of original output, diagnostics, repair prompts, and final result.

Acceptance:

- Schema or capability errors can be repaired without user rewriting the prompt.
- Repeated failures produce a readable blocked result.

## Diagnostics

Initial AI action diagnostics should use stable codes. Candidate codes:

| Code      | Meaning                                      |
| --------- | -------------------------------------------- |
| `AI-5001` | Output command type is not allowed           |
| `AI-5002` | Output target is outside the action scope    |
| `AI-5003` | Output edits a field not allowed by action   |
| `AI-5004` | Output requires CodeArtifact but used string |
| `AI-5005` | Dry-run failed domain validation             |
| `AI-5006` | Apply token is missing or stale              |

These should be reconciled with `specs/diagnostics/ai-diagnostic-codes.md` before becoming accepted.

## Security And Privacy

- Browser-side OpenAI-compatible settings are local user settings.
- Do not send full workspace state by default.
- Do not send API keys to Prodivix backend unless an explicit backend proxy mode exists.
- Do not include secrets from env files, code artifacts, or project config in AI context.
- High-risk code, dependency, export, and settings changes require explicit user confirmation before apply.

## Non-Goals

- No autonomous multi-step agent in this phase.
- No direct full-project rewrite.
- No automatic dependency installation.
- No hidden writes during streaming.
- No backend-required AI path for local personal use.
- No MCP server implementation in this document.

## Open Questions

1. Should `LlmOutputChannel` be extended now, or should Web keep an editor-side `AiWorkspaceActionEnvelope` validator first?
2. What is the first stable workspace action union that should be AI-safe?
3. Where should AI action review UI live: assistant panel, inspector drawer, or a shared command review popover?
4. Should AI settings remain browser-local only, or should workspace/team policy be introduced before shared projects use AI?
5. How should CodeArtifact diffs be displayed before a full code editor review surface exists?

## Acceptance Checklist

- [ ] AI action runtime exists outside Blueprint assistant component.
- [ ] UI surfaces can register object-scoped AI actions.
- [ ] Context includes target capability, not just selected id.
- [ ] AI target scope covers routes, documents, resources, settings, export, diagnostics, tests, PIR, NodeGraph, Animation, and CodeArtifact.
- [ ] Write-capable outputs validate operation type, target scope, and payload.
- [ ] Dry-run exists before apply.
- [ ] High-risk actions require confirmation.
- [ ] Code-owned output routes through Code Authoring Environment.
- [ ] Diagnostics can drive AI explain/fix actions.
- [ ] Trace records intent, trigger surface, context summary, output, validation diagnostics, dry-run result, and apply result.
