# Resources

Resources 是项目级资源入口，不是另一套文件系统。每个 tab 都映射到 Canonical Workspace 中对应 owner 的文档或清单。

## 资源分类

| 分类     | 内容                                                         |
| -------- | ------------------------------------------------------------ |
| 概览     | 文件、诊断、引用与近期状态汇总                               |
| 组件     | 项目 Component Definition 与可复用入口                       |
| Token    | DTCG token 文档、主题、变体和 resolver                       |
| Public   | 图片、字体等公共静态资源                                     |
| Code     | 导入、外部与资源归属的 TS/JS、CSS/SCSS、GLSL/WGSL 与 adapter |
| i18n     | locale、namespace、key 与缺失值矩阵                          |
| 外部库   | 依赖声明、组件/图标能力与 adapter                            |
| 项目文件 | README、LICENSE、`.gitignore`、环境变量示例等导出文件        |

## 引用保护

资源移动、重命名或删除前，应查询 Semantic Index 的 references 与 impact。只改文件树显示名称而不更新 Route、PIR、Code Slot、Token 或 Asset 引用会产生诊断。

`F2` 可用于文件树重命名和支持的代码符号重命名；两者都会形成 proposal/transaction，不直接操作浏览器内存树。

## 外部库

外部能力按 Native、Adapted、Embedded 或 Code-only 接入。Prodivix 不承诺为每个 npm 包自动生成完整视觉 Inspector，但仍应提供代码编辑、引用、诊断、预览与导出依赖能力。

Resources 保留完整代码编辑表面，用于外部 adapter、导入文件和资源归属代码。它与独立 Code Workspace、三编辑器中的代码弹窗复用同一个 Code Authoring 实现和 canonical CodeArtifact，不形成第二套源码保存链路。

## Token 与主题

项目 Design Token 由 `packages/tokens` 及 Workspace token documents 管理；Prodivix 自身界面主题属于 `packages/themes`。二者不能混为同一个 owner。

## 敏感数据

环境变量示例可以作为项目文件，真实秘密不能写入可导出的普通文档。正式 SecretRef 和 runtime zone 尚未交付。
