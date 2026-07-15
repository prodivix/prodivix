# 插件包与 Blueprint Template

Prodivix 插件体系把安装/权限、可验证 package bytes 和框架 host 投影分成独立边界。插件不能成为 Workspace 作者态真相源。

## Owner

| Package                       | 职责                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `@prodivix/plugin-host`       | Manifest、permission、owner/generation、contribution transaction、lifecycle 与 audit |
| `@prodivix/plugin-package`    | Canonical package bytes、digest、artifact verification、source 与 bundled catalog    |
| `@prodivix/plugin-react-host` | Build-attested React component、preview、render policy、icon 与 surface host ABI     |

纯数据、metadata 或 Codegen Policy 插件不必依赖 React Host。只有确实需要在 React 画布中投影 runtime component 的 package 才绑定框架 host。

## Package identity

Bundled artifact 由 canonical Manifest/resource bytes 和唯一 digest 标识。构建器与运行时必须使用同一 framing 和 hash 算法；摘要不匹配时 fail closed。

Bundled 只表示 Web build 可发现，不表示每个 Workspace 自动启用。Enable/disable 和 generation replacement 通过 contribution transaction 更新 registry。

## Blueprint Template

`blueprintTemplate@1.0` 用 normalized PIR fragment 描述多节点初始结构，包括本地节点 identity、children/regions、primary node 和 palette binding。

Template local id 只在 descriptor 内有效。实例化时 Host 为当前 PIR document 分配真实 id，并产生具体的 Workspace Command。

Template 不能携带：

- React element、callback 或闭包
- 任意可执行源码字符串
- 未声明的 event/data scope
- CodeReference 源码副本

Code-owned 内容仍通过 Code Artifact/Code Slot 接入。

## Palette creation recipe

- `native`：Core palette factory
- `direct`：由 runtime type 创建单节点
- `template`：实例化 normalized fragment

非 core item 必须声明唯一 recipe。点击、画布 drop 和组件树 drop 应复用同一个 intent/command 路径。

## Lifecycle

Palette、Template、Render Policy、Codegen Policy 和 Icon Provider 在一个 owner/generation transaction 中提交。Disable 或 generation replacement 会清理该 generation 的 contribution 与 lease，但不会删除已写入用户 PIR 的节点。

## Export 与 Sandbox

Compiler 只消费 serializable Codegen Policy snapshot，不读取 Web singleton 或 React runtime instance。导出项目只携带实际使用 policy 的 dependency closure。

不可信 browser runtime 必须运行在独立 sandbox origin，并使用 CSP、Permissions Policy、无 credential transport 与严格 protocol validation。未配置可信 broker 时 activation 应 fail closed。

插件错误码见[Plugin 诊断分类](/reference/diagnostics/plg)。
