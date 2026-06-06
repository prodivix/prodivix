# 贡献指南

感谢你对 Prodivix 的关注！我们欢迎各种形式的贡献，包括但不限于代码、文档、测试、设计和翻译。

## 行为准则

参与本项目意味着你同意遵守我们的行为准则。请保持友善、尊重他人，营造一个包容的社区环境。

## 如何贡献

### 报告 Bug

如果你发现了 Bug，请通过 GitHub Issues 报告：

1. 搜索现有 Issues，确认问题尚未被报告
2. 创建新 Issue，使用 Bug 报告模板
3. 提供详细信息：
   - 重现步骤
   - 期望行为
   - 实际行为
   - 环境信息（操作系统、浏览器、Node.js 版本等）
   - 如可能，提供截图或错误日志

### 提出新功能

如果你有新功能的想法：

1. 搜索现有 Issues 和 Discussions
2. 创建 Discussion 或 Issue 描述你的想法
3. 说明：
   - 功能解决什么问题
   - 提议的解决方案
   - 可能的替代方案

### 提交代码

#### 1. Fork 仓库

```bash
# Fork 后克隆你的仓库
git clone https://github.com/你的用户名/prodivix.git
cd prodivix

# 添加上游仓库
git remote add upstream https://github.com/prodivix/prodivix.git
```

#### 2. 创建分支

```bash
# 从 main 创建特性分支
git checkout -b feature/你的功能名称

# 或修复分支
git checkout -b fix/问题描述
```

分支命名规范：

| 前缀        | 用途          |
| ----------- | ------------- |
| `feature/`  | 新功能        |
| `fix/`      | Bug 修复      |
| `docs/`     | 文档更新      |
| `refactor/` | 代码重构      |
| `test/`     | 测试相关      |
| `chore/`    | 构建/工具相关 |

#### 3. 安装依赖

```bash
# 使用 pnpm
pnpm install
```

#### 4. 开发

```bash
# 启动开发服务器
pnpm dev:web      # Web 编辑器
pnpm dev:docs     # 文档站点
pnpm storybook:ui # UI 组件库
```

#### 5. 测试

```bash
# 运行所有测试
pnpm test

# 运行特定包的测试
pnpm --filter @prodivix/web test

# 运行 E2E 测试
pnpm test:e2e
```

#### 6. 代码检查

```bash
# Lint 检查
pnpm lint

# 格式化代码
pnpm format

# 类型检查
pnpm typecheck
```

#### 7. 提交代码

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
# 提交格式
<type>(<scope>): <subject>

# 示例
feat(editor): add component drag-and-drop support
fix(ui): resolve button hover state issue
docs(readme): update installation instructions
```

**Type 类型**:

| 类型       | 描述                   |
| ---------- | ---------------------- |
| `feat`     | 新功能                 |
| `fix`      | Bug 修复               |
| `docs`     | 文档更新               |
| `style`    | 代码格式（不影响逻辑） |
| `refactor` | 代码重构               |
| `test`     | 测试相关               |
| `chore`    | 构建/工具/依赖更新     |
| `perf`     | 性能优化               |

**Scope 范围**（可选）:

- `editor` - 编辑器相关
- `ui` - UI 组件库
- `pir` - PIR 相关
- `cli` - 命令行工具
- `backend` - 后端服务
- `docs` - 文档

#### 8. 同步上游

```bash
# 获取上游更新
git fetch upstream

# 合并到你的分支
git rebase upstream/main
```

#### 9. 推送并创建 PR

```bash
git push origin feature/你的功能名称
```

然后在 GitHub 上创建 Pull Request。

### Pull Request 规范

- 标题简洁描述变更内容
- 填写 PR 模板中的所有部分
- 关联相关 Issues
- 确保所有 CI 检查通过
- 请求至少一位维护者 Review

## 开发规范

### 代码风格

项目使用 ESLint 和 Prettier 保证代码风格一致：

```bash
# 检查代码风格
pnpm lint

# 自动修复
pnpm lint --fix

# 格式化
pnpm format
```

### TypeScript

- 使用严格模式
- **禁止使用 `any`**：ESLint 规则 `@typescript-eslint/no-explicit-any` 已设为 `error`（在 `apps/web/eslint.config.js` 与根 `.eslintrc.cjs`），CI 会拦下任何引入 `any` 的 PR。需要"任意值"时一律用 `unknown` + 类型守卫；少数 React 多态场景（图标库、动态 ElementType）必须用 `any` 时，加 `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 原因` 显式说明。
- 为公共 API 添加类型注释
- 优先使用接口而非类型别名

```typescript
// 推荐
interface ButtonProps {
  text: string;
  onClick: () => void;
}

// 避免
type ButtonProps = {
  text: any; // ❌ ESLint error: no-explicit-any
  onClick: Function;
};

// 必须用 any 时（罕见）
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon libs have heterogeneous prop shapes
type IconComponent = React.ComponentType<any>;
```

### React 组件

- 使用函数组件和 Hooks
- Props 使用接口定义
- 使用命名导出

```tsx
// 推荐
interface PdxButtonProps {
  text: string;
  disabled?: boolean;
}

export function PdxButton({ text, disabled = false }: PdxButtonProps) {
  return <button disabled={disabled}>{text}</button>;
}
```

### 测试

- 为新功能编写单元测试
- 测试文件放在 `__tests__` 目录或使用 `.test.ts(x)` 后缀
- 使用 React Testing Library 测试组件

```tsx
// PdxButton.test.tsx
import { render, screen } from '@testing-library/react';
import { PdxButton } from './PdxButton';

describe('PdxButton', () => {
  it('renders button text', () => {
    render(<PdxButton text="Click me" />);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = vi.fn();
    render(<PdxButton text="Click" onClick={onClick} />);
    screen.getByText('Click').click();
    expect(onClick).toHaveBeenCalled();
  });
});
```

### 文档

- 为新功能更新文档
- 为公共 API 添加 JSDoc 注释
- 保持中英文文档同步

```typescript
/**
 * 渲染按钮组件
 * @param props - 按钮属性
 * @param props.text - 按钮文本
 * @param props.disabled - 是否禁用
 * @returns 按钮元素
 */
export function PdxButton(props: PdxButtonProps): JSX.Element {
  // ...
}
```

## 项目结构

```
prodivix/
├── apps/
│   ├── web/          # Web 编辑器
│   ├── backend/      # Go 后端
│   ├── cli/          # 命令行工具
│   ├── docs/         # 文档站点
│   └── vscode/       # VS Code 扩展
│
├── packages/
│   ├── ui/           # UI 组件库
│   ├── pir-compiler/ # PIR 编译器
│   ├── shared/       # 共享类型
│   ├── themes/       # 主题系统
│   └── i18n/         # 国际化
│
├── tests/            # E2E 测试
└── specs/            # 规范文档
```

## 获取帮助

- 查看 [开发指南](/community/development) 了解更多开发细节
- 在 GitHub Discussions 中提问
- 加入社区讨论

## 致谢

感谢所有贡献者！每一个贡献都让 Prodivix 变得更好。
