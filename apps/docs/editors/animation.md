# Animation 编辑器

Animation 编辑器管理独立的 `pir-animation` 文档，涵盖轨道、关键帧、目标引用、easing、CSS/SVG filter 以及可选的代码函数。

## 作者模型

时间轴是对 Animation 文档的可视化投影。拖动关键帧、修改时长或调整曲线都会生成可逆的 Command；而播放器的当前时间、选区和缩放仅属于视图状态。

目标节点通过类型化引用连接到 PIR 或组件实例。当目标被重命名、移动或删除时，Workspace Semantic Index 能够报告受影响的动画引用。

## 预览与求值

`@prodivix/animation` 提供与 DOM 无关的 contract、codec、authoring factory、确定性 evaluator、Runtime Port 和 same-context ExecutionProvider。连续播放会统一处理 delay、iterations、direction、fillMode、keyframe/timeline easing、取消与 timeout。

浏览器 adapter 使用 one-shot RAF 与 generation-fenced effect lease，将中立 frame 投影为 Renderer 所需的 CSS/SVG snapshot。新 Job 会使旧 lease 中迟到的帧自动失效。预览属于派生的运行时状态，不会将每一帧结果写回 Workspace 或 Job history。

## 代码与 Shader

自定义 easing、timeline script 和 shader 通过 Code Slot 绑定到共享的代码环境。GLSL/WGSL 的语言语义和 GPU compile capability 是两个独立的层次：能够跳转到符号定义并不代表目标设备已通过编译验证。

## 当前边界

Animation Play/Stop/Restart 已绑定当前 Canonical Workspace revision，并通过正式的 ExecutionJob、稳定 Session 和共享 Execution Center 运行。静态 scrub 仍采用轻量的本地求值方式；连续播放不再使用编辑器私有的 RAF 状态机。

尚未实现的 custom easing、timeline script 和 shader CodeSlot 执行会安全失败（fail closed）。跨 timeline/route composition、reduced-motion policy、GPU effect、远程执行以及完整的性能/视觉回归 Gate 尚未交付。

继续阅读：[Code 与 Shader](/editors/code-and-shaders)与[Preview 与 Export](/concepts/preview-and-export)。
