# Blueprint 编辑器

Blueprint 是页面、布局和组件实例的主要视觉作者表面。它编辑 PIR-current UI 文档，并通过 Renderer 投影到画布。

## 工作区组成

- **资源侧栏**：浏览 HTML、内置组件、外部组件与项目组件。
- **组件树**：查看 PIR 作者结构、选择节点并控制作者画布可见性。
- **画布**：渲染当前 route/page/component，并提供选择、缩放和拖放。
- **Inspector**：以“基础、样式、数据、Code”四个 tab 编辑当前目标。
- **地址栏**：在项目路由语义上定位当前页面，不是独立的浏览器路由副本。

## 选择与编辑

画布和组件树共享同一个 PIR location。选择节点后，Inspector 只提交该节点支持的领域 Command。拖入组件、移动节点、修改属性和删除节点都会经过 PIR/Workspace validator。

如果操作导致无效引用或文档形态，Command 会失败并进入 Issues；编辑器不应为“看起来成功”而保存无法解码的文档。

## 组件树隐藏

眼睛按钮只控制作者画布投影，适合检查遮挡或嵌套节点。隐藏状态不会：

- 改写 PIR 的运行时条件
- 影响 Preview
- 进入生产 Export
- 删除或禁用节点

真实可见性应通过属性、状态、Collection 或代码逻辑表达。

## Inspector 四个 tab

- **基础**：身份、文本、公开属性、结构性设置。
- **样式**：布局、尺寸、视觉样式和 class protocol。
- **数据**：binding、Collection 与数据上下文。
- **Code**：受控 JSX/CSS、Code Slot binding 与相关 Code Artifact。

Inspector 不拥有源码或组件定义；它通过稳定引用调用对应 owner。

## 复用

需要复用一棵子树时，使用组件抽取事务。Definition、Public Contract、Instance 和 Collection 都属于 PIR-current，详见[组件与 Collection 复用](/tutorials/component-collection)。

## 诊断与定位

PIR validation、引用解析、代码和导出问题都会进入 Issues。按 `Alt+0` 查看，再从诊断打开目标或文档。不要通过手工修改存储 JSON 绕过错误。
