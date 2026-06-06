# 更新日志

本页面记录 Prodivix 的版本更新历史。

## [Unreleased]

### Workspace / Blueprint 最新进展（2026-02-08）

- 新建项目时后端会自动初始化 workspace 快照（含 `doc_root`），减少首次编辑 404。
- 访问 legacy 项目时，`GET /api/workspaces/:id` 与 capabilities 接口会自动补建缺失 workspace。
- Blueprint 保存链路调整为“优先文档级保存 + capability 回退项目级保存（过渡期）”。
- 地址栏右侧新增保存状态图标（saving/saved/error/fallback），保存成功后短暂显示并自动回到 idle。
- Blueprint 编辑器已完成模块化拆分（controller/autosave/dragdrop/tree/palette/save-indicator），便于维护与扩展。
- 以上新增保存与状态提示文案已补齐 i18n（`en` / `zh-CN`）。

### 新增

- **蓝图编辑器**
  - 组件拖拽功能
  - 组件树层级管理
  - 属性检查器
  - 视口工具栏（缩放、平移、重置）

- **UI 组件库** (`@prodivix/ui`)
  - 76 个 React 组件
  - 包括按钮、输入框、表单、表格、模态框等
  - Storybook 文档支持

- **后端服务**
  - 用户认证 API（注册、登录、登出）
  - 用户信息管理 API
  - Session-based Token 认证

- **文档站点**
  - VitePress 搭建
  - 快速入门指南
  - API 参考文档

### 变更

- 样式系统从 SCSS 迁移到 Tailwind CSS
- 更新 React 到 v19
- 更新 TypeScript 到 v5.9

### 修复

- 修复编辑器首页项目卡片布局问题
- 修复输入框边框颜色样式
- 修复国际化文本显示问题

---

## 版本规划

### v0.1.0 (计划中)

- [ ] 蓝图编辑器基础功能完成
- [ ] PIR 到 React 代码生成
- [ ] 项目保存和加载
- [ ] CLI build 命令实现

### v0.2.0 (计划中)

- [ ] 节点图系统基础功能
- [ ] 实时预览功能
- [ ] 组件库扩展

### v0.3.0 (计划中)

- [ ] 多框架代码导出（Vue、Angular）
- [ ] 一键部署功能
- [ ] 数据库持久化

### v1.0.0 (长期目标)

- [ ] 完整的可视化开发体验
- [ ] 稳定的 API
- [ ] 生产级质量
- [ ] 完善的文档和示例

---

## 贡献者

感谢所有为 Prodivix 做出贡献的开发者！

<!-- 贡献者列表将在这里自动生成 -->

---

## 如何查看详细变更

查看 Git 提交历史：

```bash
git log --oneline

# 最近的提交
git log -10 --oneline

# 查看特定版本之间的变更
git log v0.1.0..v0.2.0 --oneline
```

查看 GitHub Releases 页面获取每个版本的详细说明。
