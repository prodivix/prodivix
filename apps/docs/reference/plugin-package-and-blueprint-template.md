# 插件包工件与 Blueprint Template

Phase 4.6.0 建立了 official component plugin 共用的 package、React Host ABI 和 Blueprint 创建基座；Phase 4.6-4.8 已用同一基座完成 Ant Design、MUI、Radix 三库迁移。基座本身不绑定具体组件库，也不要求所有插件都提供框架 Host。

Phase 4.9 已完成 security/browser/production hardening：strict protocol 使用 property/fuzz 验证任意 JSON 与恶意 transport 输入，sandbox conformance 在 Chromium、Firefox、WebKit 上运行，独立 production sandbox image 会提供 hash-bound CSP、Permissions Policy、无 Cookie 响应和 fail-closed 404。

## 三个独立边界

- `@prodivix/plugin-host`：负责 Manifest、permission、owner/generation、贡献事务、生命周期和审计。
- `@prodivix/plugin-package`：负责 canonical JSON bytes、framed package digest、artifact 验证、`PluginPackageSource` 和 bundled catalog reconciliation plan。
- `@prodivix/plugin-react-host`：只负责 build-attested React 主线程投影 ABI，包括 component library、Palette preview、Render Policy、Icon Provider 和 surface host。

metadata、Codegen Policy 或其他纯数据插件只需要 Plugin Host 与 package source。只有需要在 Blueprint 画布中渲染 React component、preview、wrapper 或 icon 的 official package 才绑定 React Host Module。

## Official component plugins

| Plugin                   | Palette / runtime 覆盖                                         | Contributions | Exact 主包版本               |
| ------------------------ | -------------------------------------------------------------- | ------------- | ---------------------------- |
| `@prodivix/plugin-antd`  | 81 项：46 supported、1 template、34 degraded                   | 6             | `antd@5.28.0`                |
| `@prodivix/plugin-mui`   | 18 个 Palette item + 2 个 template-only runtime component      | 6             | `@mui/material@7.3.2`        |
| `@prodivix/plugin-radix` | 10 个 Palette item、7 个 compound template、37 个 runtime rule | 5             | `@radix-ui/react-slot@1.3.0` |

Ant Design 和 MUI 提供 icon provider；Radix 第一版不提供。bundled 只表示 package 随 Web build 可发现，不表示 workspace 默认启用：三个 library id 默认都处于 disabled 状态。

Web 通过一个 generic bundled catalog 读取 package metadata、exact version、artifact size 和 digest。旧 Ant Design/MUI profile、remote icon/d.ts loader、Radix Headless group/factory/placeholder，以及 Compiler 中三库与 icon provider 特判均已删除。

## Package identity

Bundled artifact 包含 canonical Manifest/resource bytes 和唯一 `packageDigest`。资源按 normalized POSIX path 的 UTF-8 byte order 排序，并使用以下 framing 计算 SHA-256：

```text
uint32be(pathByteLength)
pathBytes
uint64be(contentByteLength)
contentBytes
```

运行时通过 `createBundledPluginPackageSource` 验证摘要后再暴露只读资源。构建时通过 `scripts/plugin-artifacts/generate-bundled-plugin-artifact.mjs` 复用同一算法，避免 generated artifact 与 Host verification 使用不同 identity。

## `blueprintTemplate@1.0`

Template 使用 normalized PIR fragment 表达多节点初始结构：

- `rootLocalIds`
- `nodesByLocalId`
- `childIdsByLocalId`
- 可选 `regionsByLocalId`
- `primaryLocalId`
- Palette contribution/item binding

local id 只存在于 descriptor。实例化时 Host 在当前 PIR document 中分配真实 node id，应用 Palette defaults、size、status 和 variant props，然后生成一个包含 concrete graph 的 `WorkspaceCommandEnvelope`。

Template 不能携带 event、data/list scope、callback、React value、任意源码或 CodeReference source。code-owned 内容仍必须进入 Code Authoring Environment。

## Palette 创建

Palette snapshot 为每个 item 提供一种 creation recipe：

- `native`：现有 core Palette factory。
- `direct`：由 descriptor `runtimeType` 创建单节点。
- `template`：由 `blueprintTemplate@1.0` 创建 normalized fragment。

非 core plugin item 必须恰好选择 direct 或 template；两者并存或两者皆无会使整个 installation transaction 回滚。点击、canvas drop 和 tree drop 都通过同一 `component.insert@1.0` intent 与 document command 应用路径。

## 生命周期

Palette、External Library、Blueprint Template、Render Policy、Codegen Policy 和 Icon Provider 在一个 owner/generation transaction 中提交。disable 或 generation replacement 会清理 contribution、implementation、template 和 composition lease，但不会删除已经写入用户 PIR document 的节点。

## Codegen 与导出

Compiler 只消费 serializable `CodegenPolicySnapshot`，不会读取 Web Host 或 browser registry singleton。生成项目只携带实际使用 policy 的 exact dependency closure。AntD-only、MUI-only、Radix-only 与三库组合项目均已通过 install、build 和 browser behavior gate。

## Production Sandbox

Browser runtime 必须指向不携带 Prodivix 登录 Cookie 或用户数据的独立 origin。仓库提供 `@prodivix/plugin-sandbox` 构建和 `prodivix-plugin-sandbox` Nginx image；同一 security policy source 生成 `security-headers.json`、Cloudflare `_headers` 和 `nginx.conf`，并在 package test 中校验 exact script hash 与 route policy。

生产镜像和 Compose 部署通过 `SANDBOX_PORT` 暴露 broker。Web 镜像构建时通过 `VITE_PLUGIN_SANDBOX_URL` 绑定公开的 `runtime-broker.html` URL；未配置时 runtime activation 保持 fail closed。部署 smoke 会对真实 Nginx 响应验证：

- runtime/UI CSP 与 worker policy；
- script hash 和跨域读取头；
- `Permissions-Policy`、`Referrer-Policy` 与 `nosniff`；
- 无 `Set-Cookie`；
- 未知路径返回 404。

本地与 CI 可分别运行：

```bash
pnpm --filter @prodivix/plugin-sandbox test
pnpm test:e2e:plugin-sandbox:matrix
```
