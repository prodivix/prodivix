# AI 助手

MFE 的 AI 助手是一个浏览器端优先的 LLM 集成入口。当前实现聚焦在蓝图编辑器右下角的小窗口，用自然语言生成结构化计划，并保留 Prompt 与原始返回用于调试。

## 使用入口

在蓝图编辑器右下角点击 AI 图标即可展开 AI 助手。展开后可以输入设计意图，例如“规划一个更清晰的首屏结构”，然后点击输入框右下角的发送按钮生成计划。

AI 助手会读取最小蓝图上下文：

| 上下文     | 说明                                |
| ---------- | ----------------------------------- |
| 当前路由   | 当前正在编辑或预览的 Blueprint 路由 |
| 当前选中项 | 画布或组件树中选中的节点 ID         |

当前版本只返回计划，不会直接写入 PIR。后续写入 PIR 前仍需要经过 dry-run、风险校验和可撤销命令链路。

## Provider 设置

AI 设置以弹窗形式出现在 AI 助手标题栏的设置按钮中。配置保存在浏览器本地状态中，符合 MFE 重前端、轻后端的使用方式。

| 字段              | 说明                                                  |
| ----------------- | ----------------------------------------------------- |
| Provider          | `mock` 或 `OpenAI-compatible`                         |
| Base URL          | OpenAI-compatible 服务地址                            |
| Model             | 请求使用的模型 ID                                     |
| API Key           | 可选，直接由浏览器请求时会发送到配置的 Base URL       |
| JSON mode         | 开启后发送 `response_format: { type: "json_object" }` |
| Temperature       | 控制输出随机性                                        |
| Max output tokens | 控制单次输出 token 上限                               |

Mock provider 不会请求外部模型，适合本地验证 UI 闭环。OpenAI-compatible provider 会调用 `{baseURL}/chat/completions`。

## 模型发现

设置弹窗提供模型发现按钮。它会请求：

```txt
GET {baseURL}/models
```

发现函数兼容常见的 `data` 或 `models` 数组返回，并只读取模型的基础信息，例如 `id`、`ownedBy`、`createdAt` 和原始对象。MFE 不根据模型 ID 推断 JSON mode、tool calling 或上下文长度能力，因为这些规则变化很快，应由用户或 provider 元数据显式配置。

## 调试入口

AI 助手在生成后会显示两个轻量图标按钮：

| 按钮         | 行为                                                          |
| ------------ | ------------------------------------------------------------- |
| 查看 Prompt  | Hover 时展示实际发送给 OpenAI-compatible provider 的 messages |
| 查看原始返回 | Hover 时展示模型原始文本返回                                  |

原始返回来自 OpenAI-compatible 响应的 `choices[0].message.content`。如果模型返回了 token 但结构化解析失败，错误信息会展示在面板内，同时仍保留原始返回，方便排查模型是否包了 Markdown、返回了非 JSON 文本或字段结构不符合 MFE 协议。

## 当前输出协议

最小 UI 目前要求模型优先返回计划结构：

```json
{
  "goal": "string",
  "assumptions": ["string"],
  "milestones": [
    {
      "id": "string",
      "title": "string",
      "description": "string | optional"
    }
  ]
}
```

这个计划结构属于 `@prodivix/shared` 的 LLM 协议层。Provider 可以继续扩展为 PIR command batch、node graph operation batch 或 code artifact，但 Blueprint 右下角 UI 目前只展示计划和调试信息。

## 架构位置

AI 能力拆在共享协议、跨端运行时和 Web UI 三层：

| 位置                                | 职责                                                      |
| ----------------------------------- | --------------------------------------------------------- |
| `packages/shared/src/llm`           | LLM 请求、结果、诊断、trace、gateway 和 provider 基础协议 |
| `packages/ai/src`                   | Provider 创建、OpenAI-compatible 请求、模型发现、设置类型 |
| `apps/web/src/ai`                   | Web 端 AI 设置持久化                                      |
| `apps/web/src/editor/.../Assistant` | Blueprint 右下角 AI 助手 UI 与设置弹窗                    |

这种划分让未来的 CLI、VS Code 扩展或其他 MFE app 可以复用 `packages/shared` 与 `packages/ai`，只在各自 app 中实现环境相关能力，例如 fetcher、密钥保存策略和 UI。

## 限制与后续方向

- 当前不支持 streaming，响应完成后一次性展示结果。
- 当前不调用工具，也不直接写入 PIR。
- API Key 保存在浏览器本地状态中，适合个人本地使用；团队或生产环境应提供更安全的密钥代理。
- JSON mode 不是所有 OpenAI-compatible provider 都支持，遇到 provider 拒绝 `response_format` 时可以关闭。
- 后续会把计划结果连接到 PIR dry-run、命令预览、撤销历史和风险提示。

## 下一步

- [项目结构](/guide/project-structure) - 了解 AI 相关包和应用目录
- [PIR 语法规范](/reference/pir-spec) - 理解后续 AI 命令会修改的核心数据结构
