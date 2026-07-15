# Animation 编辑器

Animation 编辑器管理独立 `pir-animation` 文档，包括轨道、关键帧、目标引用、easing、CSS/SVG filter 和可选代码函数。

## 作者模型

时间轴是 Animation 文档的投影。拖动关键帧、修改时长或调整曲线会形成可逆 Command；播放器的当前时间、选区和缩放只是视图状态。

目标节点通过类型化引用连接 PIR 或组件实例。重命名、移动和删除目标时，Workspace Semantic Index 能报告动画引用影响。

## 预览与求值

`@prodivix/animation` 提供无 DOM contract、codec、authoring factory 和确定性 evaluator。浏览器预览由 runtime adapter 把求值结果应用到 Renderer target。

预览是派生运行态，不会把每一帧结果写回 Workspace。

## 代码与 Shader

自定义 easing、timeline script 与 shader 通过 Code Slot 绑定共享代码环境。GLSL/WGSL 的语言语义和 GPU compile capability 是两个独立层次：能跳转到符号不代表目标设备已经通过编译验证。

## 当前边界

Animation 文档、确定性求值、语义贡献和 Code Slot 已经形成可用基础。复杂 lifecycle、跨运行区调度、远程执行和完整性能/视觉回归 Gate 尚未交付。

继续阅读：[Code 与 Shader](/editors/code-and-shaders)与[Preview 与 Export](/concepts/preview-and-export)。
