# 内置组件目录收敛执行计划

## Context

本文件是 ADR `specs/decisions/29.plugin-extension-points.md`「Native 内置组件作为第一方贡献」一节的执行配套，也是 ADR 29 的**第一份实现文档**。

性质：把内置组件目录从"按关注点横切"（`data/groups/*.tsx` 定义 + `data/options.ts` 变体 + `data/sampleData.tsx` 示例三处分散）**收敛为按 group 内聚的自包含形态**，对齐外部库 profile 的贡献形态。**纯数据组织重构，不改 PIR 语义、不改运行时逻辑、不改组件 props。**

本计划遵循 `AGENTS.md` 代码规范，关键约束：
- **Rule 16**：alpha 阶段做彻底重构，**不留兼容层**，要最长期稳定的实现。→ `options.ts` / `sampleData.tsx` **彻底溶解**，不保留为 shim。
- **Rule 17**：不追求最小修正，重复逻辑 / 错误抽象 / 临时补丁**当前一并收敛**。→ 顺带修正 `REGION_OPTIONS` 被误置于 `sampleData.tsx`（实为 Form 组件 option）等错位。
- **Rule 4**：包内用 `@/...` 绝对路径 import。
- **Rule 6**：文件过长则拆分。

## 范围边界（关键事实，已核实）

**类型层已统一，无需新类型。** 外部 profile（`external/libraries/antdProfile.tsx:3`）已 import 并返回 `ComponentPreviewItem`（定义于 `editor/model/types.ts`）。内置 group 与外部库组件**已经是同一个 `ComponentPreviewItem` 形态**。故本收敛**不发明 `PaletteContribution` 新类型**——`ComponentPreviewItem` 即事实贡献契约，收敛只重组数据归属。

**`options.ts` 实为两类东西混装，按 Rule 17 拆开：**
- `SIZE_OPTIONS` / `BUTTON_SIZE_OPTIONS` / `TEXT_SIZE_OPTIONS` / `AVATAR_SIZE_OPTIONS`——**真跨 group 共享**（FormGroup 给 ~10 个组件复用 `SIZE_OPTIONS`）→ 归 `catalog/sizeOptions.ts`
- `HEADING_LEVELS` / `BUTTON_CATEGORIES` / `CARD_VARIANTS` / `TAG_VARIANTS` / `NAV_COLUMNS` / `PROGRESS_STATUSES` / `DRAWER_PLACEMENTS` / `TOOLTIP_PLACEMENTS` / `MESSAGE_TYPES` / `NOTIFICATION_TYPES` / `SKELETON_VARIANTS` / `STEPS_DIRECTIONS`——**组件特有变体枚举** → 内联进各自 group

**`sampleData.tsx` 全是组件特有 demo 数据**（`REGION_OPTIONS`→Form、`TABLE_DATA`→Data、`NAVBAR_ITEMS`→Nav…）→ 内联进各自 group。

## 迁移前基线（已核实）

```text
blueprint/data/
├── ComponentGroups.tsx     # 目录根：聚合 9 个 group，tag source: builtIn/headless
├── groups/*.tsx            # 9 个 group 定义（每个 import 自己那片 options/sample）
├── helpers.ts              # buildVariants / getDefaultSizeId / getDefaultStatusIndex / isWideComponent（跨 group 共享）
├── options.ts              # 14+ 项：SIZE_* 共享 + 变体枚举（组件特有）— 混装
├── placeholders.ts         # 预览占位资产（跨 group 共享）
├── sampleData.tsx          # 18 项组件 demo 数据 — 全组件特有
└── viewport.ts             # VIEWPORT_*（非目录数据，应迁出）
```

group 对 options/sample 的取用（已核实）：每个 group 文件**只 import 自己那片**（各 group 仅 1 行 options import），横切存储非必需。

## 目标状态

```text
blueprint/
├── catalog/                          # was data/ — 纯组件目录
│   ├── ComponentGroups.tsx           # 目录根（不变，聚合 group + tag source）
│   ├── groups/
│   │   ├── BaseGroup.tsx             # + 内联 HEADING_LEVELS / BUTTON_CATEGORIES
│   │   ├── FormGroup.tsx             # + 内联 REGION_OPTIONS
│   │   ├── DataGroup.tsx             # + 内联 TABLE_* / GRID_* / LIST_ITEMS / TREE_* 等
│   │   ├── NavGroup.tsx              # + 内联 NAVBAR_ITEMS / SIDEBAR_ITEMS / BREADCRUMB_* 等
│   │   └── …（每个 group 自包含；超 ~300 行则按 Rule 6 拆为 groups/<group>/ 文件夹）
│   ├── helpers.ts                    # 跨 group 共享（不变）
│   ├── placeholders.ts               # 跨 group 共享（不变）
│   └── sizeOptions.ts                # was options.ts 的 SIZE_* 部分（跨 group 共享）
└── editor/
    └── model/
        └── viewport.ts               # was data/viewport.ts — VIEWPORT_*（迁出 catalog）
```

**删除**：`options.ts`（溶解）、`sampleData.tsx`（溶解）、`data/viewport.ts`（迁出）。

**不变量**：
- `ComponentPreviewItem` / `ComponentGroup` 类型不改。
- `ComponentGroups.tsx` 的聚合与 `source` tag 不改。
- PIR 写入链路（`createNodeFromPaletteItem` 等）不改——目录是 PIR 的上游，重组不触及 PIR 语义。

## 实施计划

### Phase 0：基线与映射

目标：冻结范围，产出"每个 options/sample 导出 → 其消费 group"的映射表。

- `git fetch` + 确认分支不落后远端（AGENTS Rule 0）。
- 枚举 `options.ts` 每个导出的消费方：
  ```bash
  for sym in $(grep -oE '^export const [A-Z_]+' data/options.ts | awk '{print $3}'); do
    echo "$sym -> $(git grep -l "\b$sym\b" -- 'data/groups/*')"
  done
  ```
- 同法枚举 `sampleData.tsx` 每个导出的消费 group。
- 分类：`SIZE_*` → 共享；其余变体枚举 → 标注归属 group；sample 数据 → 标注归属 group。
- 确认 `ComponentPreviewItem` 已被外部 profile 复用（已核实，执行时复核）。

完成标准：映射表产出（可贴入本文件附录或 PR 描述），每个导出有明确归属。

### Phase 1：共享数据归位

目标：把跨 group 共享的 `SIZE_*` 抽到独立文件，把非目录数据 `viewport.ts` 迁出 `data/`。

主要任务：

1. 新建 `data/sizeOptions.ts`，迁入 `SIZE_OPTIONS` / `BUTTON_SIZE_OPTIONS` / `TEXT_SIZE_OPTIONS` / `AVATAR_SIZE_OPTIONS`。
2. 从 `data/options.ts` 删除上述四项。
3. 把消费方（各 group 中 `sizeOptions:` 字段、`BUTTON_SIZE_OPTIONS` / `TEXT_SIZE_OPTIONS` 引用）的 import 从 `data/options` 改指 `data/sizeOptions`。
4. `git mv data/viewport.ts editor/model/viewport.ts`；更新 3 个消费方（`canvas` / `controller` / `viewportBar`）import 指向 `editor/model/viewport`。

完成标准：
- `data/options.ts` 只剩组件特有变体枚举
- `data/viewport.ts` 不存在，`VIEWPORT_*` 在 `editor/model/viewport.ts`
- tsc / vitest / lint 通过

### Phase 2：溶解 options.ts 与 sampleData.tsx（group 自包含）

目标：每个 group 文件内联其组件特有的变体枚举与 demo 数据，删除两个横切大文件。

主要任务（按 group 逐个处理，每个 group 一次到位）：

1. 对每个有组件特有数据的 group：
   - 把它消费的变体枚举（来自 `options.ts`）作为模块级 const 内联到 group 文件顶部
   - 把它消费的 demo 数据（来自 `sampleData.tsx`）作为模块级 const 内联
   - 删除该 group 对 `data/options` / `data/sampleData` 的 import
2. 全部 group 处理完后，`options.ts` 与 `sampleData.tsx` 应已无消费方：
   ```bash
   git rm data/options.ts data/sampleData.tsx
   ```
3. 若某 group 文件内联后超过 ~300 行（Rule 6），拆为 `data/groups/<group>/` 文件夹：`<group>Group.tsx`（定义）+ `<group>Data.ts`（内联数据）。判断阈值执行时定，但**所有 group 采用一致策略**（Rule 17：不搞"有的内联有的拆文件夹"的混搭）。

> Rule 17 顺带修正：`REGION_OPTIONS` 原误置于 `sampleData.tsx`（实为 Form 的 region-picker option），内联进 `FormGroup.tsx` 后名实相符。

完成标准：
- `data/options.ts` 与 `data/sampleData.tsx` 不存在
- 每个 group 文件自包含（定义 + 其特有 options + 其 demo 数据）
- 仅 `sizeOptions.ts` / `helpers.ts` / `placeholders.ts` 作为共享文件保留
- tsc / vitest / lint 通过

### Phase 3：重命名 data/ → catalog/

目标：`data/` 内容收敛为纯组件目录后，rename 使名实相符。

主要任务：

1. `git mv data catalog`（于 `blueprint/` 下）。
2. 全仓替换 import 前缀 `@/editor/features/blueprint/data/` → `@/editor/features/blueprint/catalog/`。
3. 复核无相对路径残留（`./data/`、`../data/`）。

> Windows 注意（AGENTS 实践经验）：`data → catalog` 是非大小写改名，不触发 ADR 32 遇到的折叠问题；但执行前确认 bash CWD 不在 `data/` 内（会锁目录）。

完成标准：
- `blueprint/data/` 不存在
- 仓库内 `features/blueprint/data` 引用归零
- tsc / vitest / lint 通过

### Phase 4：文档与验收

- ADR 29 验收项勾选（仅与本收敛相关的）：
  - `[ ] 内置组件数据形态与 paletteContribution 契约一致（定义+options+preview 聚合为单一贡献单元）` → 本收敛使每个 group 自包含，**直接满足**
  - `[ ] Palette 消费内置组件与插件组件走同一代码路径` → `ComponentPreviewItem` 已共享，**类型层已满足**；若 Palette 消费代码仍有内置/外部分支，记为后续项
- `specs/decisions/README.md` 状态表：`29.plugin-extension-points.md` 的"实现状态"由 `Planned` 推进为 `Partial（内置侧收敛）`，证据注明本计划。

## 建议提交切分

本收敛属"当前一并收敛"（AGENTS Rule 17），建议**单提交**（与 ADR 32 / 33 一致）：

```
refactor(blueprint): converge native catalog to self-contained groups
```

若需细分便于 review：
1. `refactor(blueprint): extract shared sizeOptions and relocate viewport config`（Phase 1）
2. `refactor(blueprint): dissolve options and sampleData into self-contained groups`（Phase 2）
3. `refactor(blueprint): rename data directory to catalog`（Phase 3）

## 验收标准

- [ ] `data/options.ts` 与 `data/sampleData.tsx` 不存在（彻底溶解，无 shim）
- [ ] 每个 group 文件自包含（定义 + 其组件特有 options + 其 demo 数据）
- [ ] 跨 group 共享数据仅在 `catalog/sizeOptions.ts` / `catalog/helpers.ts` / `catalog/placeholders.ts`
- [ ] `viewport.ts` 迁至 `editor/model/viewport.ts`，3 个消费方 import 更新
- [ ] `blueprint/data/` 重命名为 `blueprint/catalog/`，仓库内 `data` 前缀引用归零
- [ ] `ComponentPreviewItem` / `ComponentGroup` 类型未改
- [ ] `ComponentGroups.tsx` 聚合与 `source` tag 未改
- [ ] PIR 写入链路（`createNodeFromPaletteItem` 等）未改
- [ ] 所有 import 使用 `@/...` 绝对路径（AGENTS Rule 4）
- [ ] `pnpm --filter @prodivix/web exec tsc -b --pretty false` 通过
- [ ] workspace vitest 通过
- [ ] `pnpm lint` 通过
- [ ] ADR 29 相关验收项勾选、索引表实现状态更新

## 非目标

1. 本计划不改 `ComponentPreviewItem` / `ComponentGroup` 类型（已统一）。
2. 本计划不改 PIR 写入语义、`createNodeFromPaletteItem` 逻辑或组件 props。
3. 本计划不实现完整插件宿主 / manifest / capability sandbox（ADR 29 Phase 1–2 范畴）。
4. 本计划不迁移外部库 profile（`external/libraries/*`）——它们已是目标形态（内联），是内置收敛的**参照模板**，不动。
5. 本计划不重命名 group 文件大小写（保持 `BaseGroup.tsx` 等），仅重组内容与目录名。
6. 本计划不统一 Palette 消费代码中可能存在的内置/外部分支（若发现，记为后续项，不在本轮扩张范围）。

## 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| 某变体枚举/demo 数据被多个 group 共享（误判为组件特有） | Phase 0 映射表逐导出核实消费方；若多 group 共享则归 `sizeOptions.ts` 同级的共享文件，不强行内联 |
| 内联后 group 文件过长 | Rule 6 拆为 `groups/<group>/` 文件夹；**所有 group 一致策略**（Rule 17） |
| `data → catalog` rename 漏改相对路径 import | Phase 3 后 `git grep "blueprint/data"` 归零校验 + tsc 兜底 |
| Windows 目录 rename 被 CWD 锁 | 执行前确认 bash CWD 在仓库根（ADR 32 实践经验） |
| 溶解后遗漏某个导出导致 tsc 失败 | 删除 `options.ts` / `sampleData.tsx` 前 `git grep` 确认无消费方；tsc 关卡兜底 |

> 回滚：未提交前 `git restore`；提交后因按 Phase 独立可编译，可 revert 最近提交。
