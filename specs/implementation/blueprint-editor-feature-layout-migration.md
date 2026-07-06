# Blueprint Editor Feature 目录迁移执行计划

## Context

本文件是 ADR `specs/decisions/32.blueprint-editor-feature-layout.md` 的执行配套。

性质：**纯机械目录迁移，不改任何运行时逻辑、props 或状态模型。** 把 Blueprint 编辑器从 `features/design/blueprint/` 提升为顶层 feature，把 Inspector 迁入其内部与 Canvas 平级，并拍平冗余的 `editor/components/` 分组层。

三个编辑器（`animation/`、`development/`、`blueprint/`）在迁移完成后于 `features/` 下真正平级。

---

## 执行约束

1. **每阶段对应一个可独立编译通过的提交。** 不要把多个阶段压成一个 commit，否则 bisect 失效。
2. **所有目录移动用 `git mv`**，保留 rename 历史。不要用"删旧建新"。
3. **不改运行时逻辑**。本计划里出现的代码改动仅限 import 路径与 barrel 导出。
4. **每阶段结束跑三道关卡**：
   - `pnpm --filter @prodivix/web exec tsc -b --pretty false`
   - workspace vitest（`node ..\..\node_modules\vitest\vitest.mjs --config vitest.config.ts --run --maxWorkers=1`，于 `apps/web` 下执行）
   - `pnpm lint`
5. import 路径更新必须覆盖**全仓**，不限于 `editor/features`（测试、core、storybook 等都可能引用）。

---

## 迁移前基线（已核实）

| 项 | 现状 | 来源 |
| --- | --- | --- |
| `features/design/` 子树 | `blueprint/`、`inspector/`、`__tests__/`（无 `design/index.ts` barrel） | `git ls-files` |
| `editor/components/` 子目录 | AddressBar / Assistant / Canvas / ComponentTree / Inspector / SaveIndicator / Sidebar / ViewportBar（共 8 个） | `git ls-files` |
| `editor/components/` 散文件 | `collapseButtonStyles.ts`（被 4 处引用）、`index.ts`（barrel，绝对路径引用方为 0） | `git grep` |
| `collapseButtonStyles.ts` 引用方 | Assistant / ComponentTree / Inspector / Sidebar 四个组件 | `git grep -l` |
| Inspector 外部消费方 | 仅 Blueprint（薄壳 `BlueprintEditorInspector.tsx` + `useBlueprintEditorInspectorController`） | `git grep` |
| `.trellis/spec/` | **不存在** | `ls` |

> ADR 32 中"`.trellis/spec/` 若有 design feature 描述需同步"一条：**当前为 N/A**，无 trellis spec 需同步。执行时仍按 CLAUDE.md 跑一次 `python ./.trellis/scripts/get_context.py --mode packages` 复核。

---

## 目标状态（迁移后）

```text
apps/web/src/editor/features/
├── animation/              # 不动
├── development/            # 不动
├── blueprint/
│   ├── editor/
│   │   ├── BlueprintEditor.tsx
│   │   ├── collapseButtonStyles.ts   # 原 components/collapseButtonStyles.ts
│   │   ├── canvas/                   # 原 components/Canvas/
│   │   ├── inspector/                # 原 design/inspector/ + 薄壳合并
│   │   ├── sidebar/
│   │   ├── componentTree/
│   │   ├── viewportBar/
│   │   ├── addressBar/
│   │   ├── assistant/
│   │   ├── saveIndicator/
│   │   ├── controller/
│   │   ├── model/
│   │   └── runtime/
│   ├── __tests__/                    # 原 design/__tests__/
│   ├── data/
│   ├── external/
│   ├── layoutPatterns/
│   ├── nesting.ts
│   ├── registry.ts
│   └── index.ts
├── export/
├── resources/
├── settings/
└── newfile/
```

`features/design/` 在迁移完成后从仓库中消失。

---

## 命名约定

`editor/components/` 的 PascalCase 子目录迁移到 `editor/` 直属时统一改为 camelCase，对齐既有约定（inspector 内部已有 `classProtocol/`、`layoutGroup/` 等 camelCase 多词目录）：

| 旧 | 新 |
| --- | --- |
| `components/Canvas/` | `editor/canvas/` |
| `components/Inspector/`（薄壳） | 合并入 `editor/inspector/`（见 Phase 2） |
| `components/Sidebar/` | `editor/sidebar/` |
| `components/ComponentTree/` | `editor/componentTree/` |
| `components/ViewportBar/` | `editor/viewportBar/` |
| `components/AddressBar/` | `editor/addressBar/` |
| `components/Assistant/` | `editor/assistant/` |
| `components/SaveIndicator/` | `editor/saveIndicator/` |

---

## 实施计划

### Phase 0: 基线冻结与影响面确认

目标：

- 冻结迁移范围，确认 ADR 32 已 review
- 产出精确的影响文件清单，供后续阶段比对

主要任务：

- 全仓枚举所有引用 `features/design/` 的文件：
  ```bash
  git grep -l "features/design/" -- '*.ts' '*.tsx' '*.md'
  ```
- 复核 `editor/components/index.ts` barrel 是否被相对引用（绝对路径已核实为 0）：
  ```bash
  git grep -n "from '\./components'" -- 'apps/web/src/editor/features/design/blueprint/editor/*'
  git grep -n 'from "\./components"' -- 'apps/web/src/editor/features/design/blueprint/editor/*'
  ```
  若有相对引用方，Phase 3 删除 barrel 前需先把引用切到具体子模块。
- 跑一次 `python ./.trellis/scripts/get_context.py --mode packages`，确认无 design 相关 spec 需同步。
- 记录基线 tsc / vitest / lint 结果（应为当前干净状态）。

完成标准：

- 影响文件清单产出并存档（贴入 PR 描述或本文件附录）
- 无未知 barrel 引用陷阱

---

### Phase 1: Blueprint 提升为顶层 feature

目标：

- 把 `features/design/blueprint/` 整体上提为 `features/blueprint/`
- 此时 `design/inspector/` 原地不动，仍可被正常引用，保证阶段内可编译

主要任务：

1. 迁移 feature 子树与其专属测试：
   ```bash
   git mv apps/web/src/editor/features/design/blueprint apps/web/src/editor/features/blueprint
   git mv apps/web/src/editor/features/design/__tests__ apps/web/src/editor/features/blueprint/__tests__
   ```
2. 全仓替换 import 前缀：
   - `features/design/blueprint/` → `features/blueprint/`
   - （`features/design/inspector/` 本阶段**不动**）
3. 更新 `BlueprintEditor.tsx` 等文件内部相对引用不受影响（相对路径随目录一起搬）。

主要受影响路径模式：

- `@/editor/features/design/blueprint/...`
- 相对 `../../design/blueprint/...` 之类（如有）

完成标准：

- 仓库内不再出现 `features/design/blueprint` 前缀
- `features/design/` 下只剩 `inspector/`
- tsc / vitest / lint 三道通过

---

### Phase 2: Inspector 迁入 Blueprint 并合并薄壳

目标：

- `features/design/inspector/`（74 文件内容库）→ `features/blueprint/editor/inspector/`
- 薄壳 `BlueprintEditorInspector.tsx` 并入同一目录
- 清空并删除 `features/design/`

主要任务：

1. 迁移内容库：
   ```bash
   git mv apps/web/src/editor/features/design/inspector apps/web/src/editor/features/blueprint/editor/inspector
   ```
2. 合并薄壳（此时薄壳仍在 `blueprint/editor/components/Inspector/`）：
   ```bash
   git mv apps/web/src/editor/features/blueprint/editor/components/Inspector/BlueprintEditorInspector.tsx \
          apps/web/src/editor/features/blueprint/editor/inspector/BlueprintEditorInspector.tsx
   ```
3. 处理薄壳原 `components/Inspector/index.ts`：
   - 若 `inspector/` 已有 barrel，确保其导出薄壳（或 `BlueprintEditor.tsx` 直接 `import from './inspector/BlueprintEditorInspector'`）
   - 删除空 `components/Inspector/` 目录及其 `index.ts`
4. 全仓替换 import 前缀：
   - `features/design/inspector/` → `features/blueprint/editor/inspector/`
5. 更新 `BlueprintEditor.tsx`：`./components/Inspector` → `./inspector`
6. 删除现在为空的 `features/design/`：
   ```bash
   # 确认 design/ 已空后
   rmdir apps/web/src/editor/features/design   # 或 git rm -r 残留
   ```

完成标准：

- `apps/web/src/editor/features/design/` 不再存在
- 仓库内不再出现 `features/design/inspector` 前缀
- 薄壳 `BlueprintEditorInspector.tsx` 位于 `features/blueprint/editor/inspector/` 内
- tsc / vitest / lint 三道通过

---

### Phase 3: 拍平 `editor/components/`

目标：

- 消除纯分组层 `editor/components/`，7 个组件子目录改为 `editor/` 直属 camelCase 目录
- `collapseButtonStyles.ts` 上提到 `editor/` 直属

主要任务：

1. 逐个迁移组件子目录（PascalCase → camelCase）：
   ```bash
   cd apps/web/src/editor/features/blueprint/editor
   git mv components/Canvas        canvas
   git mv components/Sidebar       sidebar
   git mv components/ComponentTree componentTree
   git mv components/ViewportBar   viewportBar
   git mv components/AddressBar    addressBar
   git mv components/Assistant     assistant
   git mv components/SaveIndicator saveIndicator
   ```
2. 上提共享样式 helper：
   ```bash
   git mv components/collapseButtonStyles.ts collapseButtonStyles.ts
   ```
3. 删除 barrel（Phase 0 已确认无引用；若复核发现引用，先迁移引用）：
   ```bash
   git rm components/index.ts
   ```
4. 更新相对引用：
   - `./components/Canvas` → `./canvas`（及其余 6 个，含 `./components/Canvas/index` 之类）
   - `./components/collapseButtonStyles` 或 `../components/collapseButtonStyles` → 对应 `./collapseButtonStyles` / `../collapseButtonStyles`（4 处引用方：Assistant / ComponentTree / Inspector / Sidebar）
5. 删除空 `components/` 目录。

完成标准：

- `features/blueprint/editor/` 下不再有 `components/` 目录
- 7 个组件目录以 camelCase 名直接挂在 `editor/` 下
- `collapseButtonStyles.ts` 位于 `editor/` 直属
- tsc / vitest / lint 三道通过

---

### Phase 4: 文档与决策同步

目标：

- 把文档里的 `features/design` 描述全部改为 `features/blueprint`
- 回填 ADR 32 验收项与索引表

主要任务：

1. `CLAUDE.md`：
   - "Repository Map" 段 `apps/web` 行的描述
   - "Web Editor Areas" 段 `apps/web/src/editor/features/design` → `apps/web/src/editor/features/blueprint`
2. `AGENTS.md`：同步对应描述（先用 `git grep -n "features/design" AGENTS.md` 定位）。
3. ADR 32 `验收标准` checkbox 勾选。
4. `specs/decisions/README.md` 状态表：`32.blueprint-editor-feature-layout.md` 的"实现状态"由 `Not Started` 改为 `Implemented`，并补"证据 / 说明"。

完成标准：

- 仓库内 `grep -r "features/design"` 仅剩本迁移计划文件中的"迁移前"描述（历史记录，不改）
- ADR 32 验收项全部勾选

---

### Phase 5: 全量验证

目标：

- 迁移完成后做一次端到端确认

主要任务：

1. `pnpm --filter @prodivix/web exec tsc -b --pretty false`
2. 于 `apps/web` 下：`node ..\..\node_modules\vitest\vitest.mjs --config vitest.config.ts --run --maxWorkers=1`
3. `pnpm lint`
4. `pnpm test:e2e:smoke`（如迁移触及运行时入口，跑一次冒烟）
5. 仓库内确认：
   ```bash
   git grep -n "features/design/" -- '*.ts' '*.tsx'   # 应为空
   ```

完成标准：

- 全部关卡通过
- `features/design/` 引用归零

---

## 建议提交切分

1. `refactor(editor): promote blueprint to top-level feature`（Phase 1）
2. `refactor(editor): move inspector into blueprint editor`（Phase 2）
3. `refactor(editor): flatten blueprint editor components directory`（Phase 3）
4. `docs(editor): update feature paths for blueprint promotion`（Phase 4）

> Phase 5 不单独成提交，作为 PR 合并前的最终验收。

---

## 验收标准（对齐 ADR 32）

- [x] `apps/web/src/editor/features/design/` 目录不再存在
- [x] `apps/web/src/editor/features/blueprint/` 与 `animation/`、`development/` 平级
- [x] `features/blueprint/editor/` 下不再有 `components/` 中间层
- [x] `features/design/inspector/` 的全部内容已迁入 `features/blueprint/editor/inspector/`
- [x] `BlueprintEditorInspector.tsx`（薄壳）位于 `features/blueprint/editor/inspector/` 内
- [x] 仓库内 `features/design/...` import 前缀归零（`git grep "features/design/" -- '*.ts' '*.tsx'` 为空）
- [x] `CLAUDE.md` 与 `AGENTS.md` 描述已更新
- [x] 目录移动通过 `git mv` 执行
- [x] `pnpm --filter @prodivix/web exec tsc -b --pretty false` 通过
- [x] workspace vitest 通过
- [x] `pnpm lint` 通过
- [x] ADR 32 验收项勾选、索引表实现状态更新

---

## 暂不处理（对齐 ADR 32 非目标）

1. 不改任何运行时逻辑、状态模型或组件 props。
2. 不重命名 `animation/` / `development/`。
3. 不调整 inspector 内部 panels / fields / tabs / classProtocol 子结构（ADR 21 范畴）。
4. 不拆分 `ViewportBar`（当前一个组件承担模式切换 / 视口尺寸 / zoom / 设备预设四件事）——留作后续单独决策。
5. 不合并 viewport 配置数据（当前散在 `editor/model/data.ts` 与 `data/viewport.ts`）——留作后续清理。
6. 不改 inspector 内部测试覆盖（ADR 21 收尾后统一补）。

---

## 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| import 替换遗漏导致 tsc 失败 | 每阶段 tsc 关卡 + Phase 5 全仓 grep 归零校验 |
| barrel `components/index.ts` 存在隐藏相对引用 | Phase 0 复核步骤；若发现，先迁引用再删 barrel |
| `git mv` 后 Windows 大小写折叠（如 `Canvas/` → `canvas/` 同盘） | 分两步：先 `git mv components/Canvas components/_canvas_tmp` 再 `git mv components/_canvas_tmp canvas`，避免大小写敏感问题 |
| 迁移中途发现设计需调整 | 每阶段独立可编译，可停在任意已通过关卡回滚最近一两个 commit |

> Windows 大小写折叠是本迁移在 win32 上的主要坑。`Canvas → canvas` 这类纯大小写改名，git 在不区分大小写的文件系统上可能只改引用不改磁盘。建议每个这类改名走"先临时名再目标名"两步，并在每步后 `git ls-files` 复核磁盘与索引一致。
