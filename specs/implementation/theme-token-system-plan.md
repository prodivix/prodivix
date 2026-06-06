# Theme Token System Rebuild Plan

## Context

Prodivix 旧主题体系曾主要依赖 `packages/themes/src/variables.scss` 直接注入 CSS custom properties，例如 `--bg-canvas`、`--text-primary`、`--spacing-sm`、`--radius-md`。这套实现只适合作为早期占位，不能支撑后续的官方主题、自定义主题、社区主题和设计工具级主题编辑能力。

本计划按“推倒重建”处理主题系统。旧 `variables.scss` 已删除，空的 `presets` / `utils` / `semantic` 目录不作为新架构约束；它们只提供迁移时的视觉参考。

当前缺失：

1. 底层色阶 palette，例如 `--palette-gray-1`
2. 语义化 token，例如 `--bg-color`
3. 官方主题 / 自定义主题 / 社区主题
4. 字体、圆角、阴影、密度等非颜色主题属性
5. 主题数据的验证、导入、导出和共享协议

目标是重新建立“主题 manifest 驱动的 token pipeline”，而不是在现有 SCSS 变量文件上继续补丁式扩展。

## Goals

1. 建立分层主题模型：palette scale -> semantic token -> runtime CSS variables。
2. 官方主题使用 JSON manifest 描述，可生成 CSS variables。
3. 用户可以自定义主题，社区可以分享主题。
4. 颜色之外的字体、字号、圆角、阴影、密度、动效等也可以被主题 manifest 管理。
5. 不再提供匿名色阶 legacy shim；新设计以 semantic/product token 为中心。
6. 为 Tailwind 4 的 `text-(--token)` / `bg-(--token)` 写法提供稳定 token。

## Rebuild Stance

新主题系统以 JSON manifest、schema validation、token resolver、runtime CSS emitter 为核心。旧 `packages/themes/src/variables.scss` 已删除。

原则：

- 不继续把 `variables.scss` 当单一真源。
- 不继续以 `--bg-canvas` 到 `--text-primary` 这种匿名色阶作为业务语义。
- 不继续把 light / dark 写死为唯一主题维度。
- 新主题数据必须可序列化、可验证、可导入、可导出、可分享。
- 旧变量只服务迁移，不服务新功能设计。

## Non Goals

1. 不在本阶段重写所有 UI 样式。
2. 不把主题能力塞进 `@prodivix/ui`，主题包仍由 `packages/themes` 承担。
3. 不要求所有 token 一次性覆盖完整设计系统。
4. 不允许主题 JSON 直接执行代码。
5. 不允许社区主题绕过 schema validation。
6. 不承诺长期保留所有旧 token。

## Layer Model

主题系统分为四层。

```text
Palette Layer
  ↓
Semantic Token Layer
  ↓
Component / Product Token Layer
  ↓
Runtime CSS Variables
```

### 1. Palette Layer

底层色阶只表达颜色本身，不表达用途。

示例：

```json
{
  "palette": {
    "gray": {
      "0": "#ffffff",
      "1": "#f8f8f8",
      "2": "#eeeeee",
      "3": "#dddddd",
      "4": "#bbbbbb",
      "5": "#888888",
      "6": "#666666",
      "7": "#444444",
      "8": "#222222",
      "9": "#111111",
      "10": "#000000"
    },
    "red": {
      "5": "#e5484d",
      "6": "#dc3e42",
      "7": "#ce2c31"
    }
  }
}
```

输出变量：

```css
--palette-gray-0: #ffffff;
--palette-gray-1: #f8f8f8;
--palette-red-6: #dc3e42;
```

规则：

- palette token 不应被业务组件直接依赖，除非是色板编辑器、主题编辑器、可视化调试面板。
- palette key 必须稳定、可验证、可序列化。
- 官方主题可以提供多套 palette，如 neutral / gray / slate / brand / danger。

### 2. Semantic Token Layer

语义 token 表达 UI 目的，引用 palette。

示例：

```json
{
  "semantic": {
    "surface": {
      "canvas": "{palette.gray.0}",
      "panel": "{palette.gray.1}",
      "raised": "{palette.gray.2}"
    },
    "text": {
      "primary": "{palette.gray.10}",
      "secondary": "{palette.gray.7}",
      "muted": "{palette.gray.5}",
      "inverse": "{palette.gray.0}"
    },
    "border": {
      "subtle": "{palette.gray.2}",
      "default": "{palette.gray.3}",
      "strong": "{palette.gray.5}"
    },
    "accent": {
      "default": "{palette.gray.10}",
      "hover": "{palette.gray.8}"
    },
    "danger": {
      "default": "{palette.red.6}",
      "hover": "{palette.red.7}",
      "subtle": "{palette.red.5}"
    }
  }
}
```

输出变量：

```css
--bg-canvas: var(--palette-gray-0);
--bg-panel: var(--palette-gray-1);
--text-primary: var(--palette-gray-10);
--text-muted: var(--palette-gray-5);
--border-default: var(--palette-gray-3);
--danger-color: var(--palette-red-6);
```

规则：

- 应用代码优先使用 semantic token。
- palette 修改不应要求业务代码变更。
- semantic token 必须有默认值，主题缺失时使用官方 fallback。

### 3. Product Token Layer

产品 token 表达 Prodivix 特定区域或状态。

示例：

```json
{
  "product": {
    "editor": {
      "canvasBackground": "{semantic.surface.canvas}",
      "selectionOutline": "{semantic.accent.default}",
      "dropIndicator": "{semantic.accent.default}"
    },
    "inspector": {
      "rowHover": "{palette.gray.2}",
      "fieldLabel": "{semantic.text.secondary}",
      "fieldControl": "{semantic.text.primary}"
    },
    "nodeGraph": {
      "nodeBackground": "{semantic.surface.panel}",
      "nodeBorder": "{semantic.border.default}",
      "portColor": "{semantic.text.secondary}"
    }
  }
}
```

输出变量：

```css
--editor-canvas-bg: var(--bg-canvas);
--editor-selection-outline: var(--accent-color);
--inspector-row-hover: var(--palette-gray-2);
--node-bg: var(--bg-panel);
```

规则：

- 产品 token 允许更贴近 MFE 业务语义。
- 组件内部不应反复硬编码 `--bg-canvas` / `--text-primary`，应逐步迁移到 semantic/product token。

### 4. Runtime CSS Variables

主题运行时最终只写入 CSS custom properties。

Runtime target:

```html
<html data-theme="light" data-theme-id="official.monochrome.light"></html>
```

输出位置：

```css
:root,
[data-theme-id='official.monochrome.light'] {
  --palette-gray-0: #ffffff;
  --bg-canvas: var(--palette-gray-0);
  --text-primary: var(--palette-gray-10);
}
```

## Theme Manifest

官方、自定义、社区主题统一使用 JSON manifest。

```ts
type ThemeManifest = {
  schemaVersion: '1.0';
  id: string;
  name: string;
  author?: string;
  source: 'official' | 'custom' | 'community';
  mode: 'light' | 'dark' | 'adaptive';
  palette: ThemePalette;
  semantic: ThemeSemanticTokens;
  product?: ThemeProductTokens;
  typography?: ThemeTypographyTokens;
  radius?: ThemeRadiusTokens;
  shadow?: ThemeShadowTokens;
  density?: ThemeDensityTokens;
  motion?: ThemeMotionTokens;
  metadata?: {
    description?: string;
    tags?: string[];
    preview?: string;
    license?: string;
  };
};
```

### Reference Syntax

Token references use `{path.to.token}`:

```json
{
  "semantic": {
    "text": {
      "primary": "{palette.gray.10}"
    }
  }
}
```

Rules:

- References must resolve inside the same manifest or official fallback.
- Cycles are invalid.
- Unknown paths are invalid unless explicitly allowed by custom extension fields.

## Non-Color Tokens

Themes should also support product appearance beyond colors.

### Typography

```json
{
  "typography": {
    "fontFamily": {
      "ui": "Inter, HarmonyOS Sans, system-ui, sans-serif",
      "mono": "JetBrains Mono, Consolas, monospace",
      "canvas": "{typography.fontFamily.ui}"
    },
    "fontSize": {
      "xs": "12px",
      "sm": "13px",
      "md": "14px",
      "lg": "16px"
    },
    "lineHeight": {
      "compact": "1.3",
      "normal": "1.5"
    }
  }
}
```

Runtime variables:

```css
--font-family-ui: Inter, HarmonyOS Sans, system-ui, sans-serif;
--font-family-mono: JetBrains Mono, Consolas, monospace;
--font-size-sm: 13px;
--line-height-normal: 1.5;
```

### Radius

```json
{
  "radius": {
    "none": "0",
    "sm": "4px",
    "md": "6px",
    "lg": "8px",
    "full": "9999px"
  }
}
```

### Shadow

```json
{
  "shadow": {
    "sm": "0 1px 2px rgb(0 0 0 / 0.08)",
    "md": "0 8px 20px rgb(0 0 0 / 0.12)"
  }
}
```

### Density

```json
{
  "density": {
    "controlHeight": {
      "sm": "24px",
      "md": "28px",
      "lg": "32px"
    },
    "spacing": {
      "xs": "4px",
      "sm": "8px",
      "md": "12px",
      "lg": "16px"
    }
  }
}
```

### Motion

```json
{
  "motion": {
    "duration": {
      "fast": "120ms",
      "normal": "180ms",
      "slow": "260ms"
    },
    "easing": {
      "standard": "cubic-bezier(0.2, 0, 0, 1)"
    }
  }
}
```

## Official / Custom / Community

### Official Themes

Official themes live in the repo:

```text
packages/themes/
  manifests/
    official/
      monochrome-light.json
      monochrome-dark.json
      high-contrast-light.json
      high-contrast-dark.json
```

Official themes:

- are versioned with the app
- are validated in CI
- provide fallback token coverage

### Custom Themes

Custom themes are created or edited by users.

Storage options:

- local workspace settings
- project settings
- user profile settings

Custom themes must:

- declare `schemaVersion`
- pass validation
- be serializable to JSON
- avoid executable content

### Community Themes

Community themes are shared theme manifests.

Community theme import flow:

1. Load JSON.
2. Validate schema.
3. Resolve token references.
4. Preview in a sandboxed theme scope.
5. Allow user to install.

Community theme metadata should include:

- author
- license
- tags
- preview image or preview token swatches

## Package Responsibilities

`packages/themes` should be rebuilt as the theme engine.

Suggested structure:

```text
packages/themes/
  package.json
  manifests/
    official/
  src/
    schema/
      themeManifest.schema.json
      themeManifest.types.ts
    tokens/
      defaultFallback.ts
      tokenPaths.ts
    resolver/
      resolveThemeManifest.ts
      resolveTokenReferences.ts
      detectTokenCycles.ts
    css/
      createCssVariables.ts
      createThemeStyleText.ts
    validation/
      validateThemeManifest.ts
    index.ts
  README.md
```

Responsibilities:

- validate manifests
- resolve references
- apply fallbacks
- emit CSS variables
- expose official themes
- expose TypeScript types
- replace the current hand-written SCSS variable source

`apps/web` responsibilities:

- select active theme
- persist user preference
- load custom/community manifests
- inject generated CSS into runtime
- provide theme editor UI later

## Legacy Shim Plan

Because older app surfaces used anonymous palette tokens in many places, a short-lived compatibility shim was allowed during migration. This is not the foundation of the new design.

Existing variables may remain available during migration:

```css
--bg-canvas
--bg-panel
--bg-raised
...
--text-primary
--success-color
--danger-color
--spacing-sm
--radius-md
--font-size-sm
```

Possible compatibility mapping:

```json
{
  "legacy": {
    "color.0": "{semantic.surface.canvas}",
    "color.1": "{semantic.surface.panel}",
    "color.9": "{semantic.text.primary}",
    "color.10": "{semantic.text.primary}"
  }
}
```

Output:

```css
--bg-canvas: var(--bg-canvas);
--bg-panel: var(--bg-panel);
--text-primary: var(--text-primary);
--text-primary: var(--text-primary);
```

Rules:

- New code should use semantic/product tokens.
- Existing code can continue using legacy tokens only until the owning area is migrated.
- Migration should happen area by area, starting with Inspector and editor shell.
- The shim should be generated from manifests, not manually maintained in SCSS.
- Once major surfaces migrate, remove unused legacy tokens.

## Tailwind 4 Usage

New Tailwind classes should use custom properties directly:

```tsx
className = 'bg-(--bg-panel) text-(--text-primary) border-(--border-default)';
```

Avoid:

```tsx
className = 'text-[var(--text-primary)]';
```

## Implementation Phases

### Phase 0: Remove Old Assumptions

- Delete the legacy `variables.scss` entry point.
- Stop treating anonymous numbered palette tokens as the target API.
- Define the new source-of-truth files under `packages/themes/src`.
- Decide which existing visual values are kept as official monochrome presets.

### Phase 1: Theme Manifest Schema

- Add `ThemeManifest` TypeScript types.
- Add JSON schema.
- Add validation utility.
- Add official monochrome light/dark manifests. They can start near current visual output but do not need to preserve every old token exactly.

### Phase 2: Resolver and CSS Emitter

- Implement reference resolver.
- Detect missing references and cycles.
- Emit CSS variable map.
- Emit style text for active theme.

### Phase 3: Runtime Theme Loading

- Update `ThemeSync` to select by `themeId`, not only `light | dark`.
- Inject active theme variables into a managed style tag.
- Preserve system light/dark preference as a resolver input.

### Phase 4: Legacy Shim

- Emit only semantic/product tokens and existing spacing/radius/font tokens needed by runtime surfaces.
- Delete `variables.scss`.
- Document new preferred semantic tokens.

### Phase 5: Theme Editing and Import

- Add custom theme storage.
- Add theme preview.
- Add community theme import validation.
- Add export/import JSON.

### Phase 6: Component Migration

- Migrate Inspector to semantic/product tokens.
- Migrate editor shell.
- Migrate node graph.
- Migrate remaining panels and pages opportunistically.

## Acceptance Criteria

- Official light/dark themes exist as JSON manifests.
- Theme manifests can define palette, semantic color tokens, typography, radius, shadow, density, and motion.
- Theme resolver can generate CSS variables from manifest data.
- Runtime can switch themes without rebuilding SCSS.
- Anonymous legacy color variables are removed after migration.
- New code has a documented path to use semantic/product tokens.
- Custom/community themes are validated before use.
- Theme manifests and runtime CSS emitter are the source of truth.
