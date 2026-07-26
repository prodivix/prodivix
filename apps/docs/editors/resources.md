# Resources

Resources 是项目级的资源管理入口，而非另一套文件系统。每个 tab 都映射到 Canonical Workspace 中对应 owner 的文档或清单。

## 资源分类

| 分类     | 内容                                                         |
| -------- | ------------------------------------------------------------ |
| 概览     | 文件、诊断、引用及近期状态的汇总                             |
| 组件     | 项目 Component Definition 与可复用入口                       |
| Token    | DTCG token 文档、主题、变体和 resolver                       |
| Public   | 图片、字体等公共静态资源                                     |
| Code     | 导入、外部与资源归属的 TS/JS、CSS/SCSS、GLSL/WGSL 与 adapter |
| i18n     | locale、namespace、key 与缺失值矩阵                          |
| 外部库   | 依赖声明、组件/图标能力与 adapter                            |
| 项目文件 | README、LICENSE、`.gitignore`、环境变量示例等导出文件        |

## 引用保护

在移动、重命名或删除资源之前，应先查询 Semantic Index 的 references 与 impact。如果只修改文件树中的显示名称而不同步更新 Route、PIR、Code Slot、Token 或 Asset 引用，将会触发诊断警告。

`F2` 可用于文件树重命名和代码符号重命名；两者都会生成 proposal/transaction，而非直接操作内存中的文件树。

## 外部库

外部能力按 Native、Adapted、Embedded 或 Code-only 方式接入。Prodivix 不承诺为每个 npm 包自动生成完整的可视化 Inspector，但仍会提供代码编辑、引用、诊断、预览与导出依赖等能力。

Resources 保留了完整的代码编辑界面，用于外部 adapter、导入文件和资源归属代码。它与独立 Code Workspace 以及三大编辑器中的代码弹窗共用同一套 Code Authoring 实现和 canonical CodeArtifact，不会形成另一套源码存储链路。

## Token 与主题

项目 Design Token 由 `packages/tokens` 和 Workspace token documents 管理；Prodivix 自身的界面主题则归属 `packages/themes`。两者的 owner 各自独立，不可混淆。

## 敏感数据

环境变量示例可以作为项目文件，但真正的密钥和凭据不能写入可导出的普通文档。`EnvironmentBindingReference` 与 `SecretRef` 已提供 reference-only identity，但 Secret store、resolver、runtime-zone permission 与 value provisioning 尚未交付；引用的存在并不意味着密钥已实际可用。
