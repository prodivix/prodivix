import { defineConfig } from 'vitepress';

const base = process.env.VITEPRESS_BASE ?? '/';

export default defineConfig({
  base,
  title: 'Prodivix',
  description: '浏览器中的语义化前端作者环境',
  lang: 'zh-CN',
  lastUpdated: true,
  ignoreDeadLinks: [/^\/storybook(?:\/|$)/],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#111111' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Prodivix' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          '视觉编辑、代码作者态、语义索引与生产导出使用同一 Canonical Workspace。',
      },
    ],
  ],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Prodivix',
    search: { provider: 'local' },
    outline: { level: [2, 3], label: '本页内容' },
    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    lastUpdatedText: '最后更新',
    docFooter: { prev: '上一篇', next: '下一篇' },
    editLink: {
      pattern:
        'https://github.com/Mdr-Tutorials/prodivix/edit/main/apps/docs/:path',
      text: '在 GitHub 上编辑此页',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Mdr-Tutorials/prodivix' },
    ],
    footer: {
      message: 'Prodivix 仍处于 alpha 阶段。文档只把已验证能力描述为可用。',
      copyright: 'Released under the MIT License.',
    },
    nav: [
      { text: '首页', link: '/' },
      { text: '开始使用', link: '/guide/introduction' },
      { text: '教程', link: '/tutorials/first-project' },
      { text: '编辑器', link: '/editors/blueprint' },
      { text: '核心概念', link: '/concepts/workspace-vfs' },
      { text: '开发者', link: '/developer/setup' },
      { text: '参考', link: '/reference/pir-spec' },
      { text: '产品状态', link: '/roadmap/current-status' },
      {
        text: '更多',
        items: [
          { text: '组件 API', link: '/api/components' },
          { text: 'CLI', link: '/api/cli' },
          { text: 'Backend API', link: '/api/backend' },
          { text: '贡献指南', link: '/community/contributing' },
          { text: 'Storybook', link: '/storybook/' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '开始使用',
          items: [
            { text: '认识 Prodivix', link: '/guide/introduction' },
            { text: '本地启动', link: '/guide/getting-started' },
            { text: '产品导览', link: '/guide/product-tour' },
            { text: '项目结构速览', link: '/guide/project-structure' },
            { text: 'AI 助手边界', link: '/guide/ai-assistant' },
          ],
        },
      ],
      '/tutorials/': [
        {
          text: '完整教程',
          items: [
            { text: '创建第一个项目', link: '/tutorials/first-project' },
            {
              text: '组件与 Collection 复用',
              link: '/tutorials/component-collection',
            },
            {
              text: '视觉与代码双向编辑',
              link: '/tutorials/visual-code-round-trip',
            },
            {
              text: '导出 React/Vite 项目',
              link: '/tutorials/export-react-vite',
            },
          ],
        },
      ],
      '/editors/': [
        {
          text: '产品表面',
          items: [
            { text: 'Blueprint 编辑器', link: '/editors/blueprint' },
            { text: '组件作者页', link: '/editors/components' },
            { text: 'NodeGraph 编辑器', link: '/editors/nodegraph' },
            { text: 'Animation 编辑器', link: '/editors/animation' },
            { text: 'Code 与 Shader', link: '/editors/code-and-shaders' },
            { text: 'Resources', link: '/editors/resources' },
            {
              text: 'Issues、History 与冲突',
              link: '/editors/issues-history-conflicts',
            },
          ],
        },
      ],
      '/concepts/': [
        {
          text: '核心模型',
          items: [
            {
              text: 'Canonical Workspace VFS',
              link: '/concepts/workspace-vfs',
            },
            { text: 'PIR-current', link: '/concepts/pir-current' },
            {
              text: 'Semantic Authoring',
              link: '/concepts/semantic-authoring',
            },
            { text: 'Change 与 Sync', link: '/concepts/change-and-sync' },
            { text: 'Preview 与 Export', link: '/concepts/preview-and-export' },
          ],
        },
      ],
      '/developer/': [
        {
          text: '开发者指南',
          items: [
            { text: '开发环境', link: '/developer/setup' },
            { text: '架构与 Package Owner', link: '/developer/architecture' },
            { text: '测试与产品 Gate', link: '/developer/testing-and-gates' },
            { text: '维护文档', link: '/developer/documentation' },
            { text: '贡献代码', link: '/community/contributing' },
          ],
        },
      ],
      '/reference/': [
        {
          text: '稳定参考',
          items: [
            { text: 'PIR-current', link: '/reference/pir-spec' },
            {
              text: 'Workspace Semantic Index',
              link: '/reference/authoring-symbol-environment',
            },
            {
              text: '插件包与 Blueprint Template',
              link: '/reference/plugin-package-and-blueprint-template',
            },
            { text: 'Code 诊断', link: '/reference/code-diagnostics' },
            { text: '快捷键', link: '/reference/keyboard-shortcuts' },
            { text: '诊断码总览', link: '/reference/diagnostic-codes' },
          ],
        },
        {
          text: '诊断分类',
          collapsed: true,
          items: [
            { text: 'Workspace', link: '/reference/diagnostics/wks' },
            { text: 'PIR', link: '/reference/diagnostics/pir' },
            { text: 'Semantic', link: '/reference/diagnostics/sem' },
            { text: 'Code', link: '/reference/diagnostics/cod' },
            { text: 'Route', link: '/reference/diagnostics/rte' },
            { text: 'NodeGraph', link: '/reference/diagnostics/ngr' },
            { text: 'Animation', link: '/reference/diagnostics/ani' },
            { text: 'Editor', link: '/reference/diagnostics/edt' },
            { text: 'Plugin', link: '/reference/diagnostics/plg' },
            { text: 'Codegen', link: '/reference/diagnostics/gen' },
            { text: 'Backend/API', link: '/reference/diagnostics/api' },
            { text: 'AI', link: '/reference/diagnostics/ai' },
            { text: 'UX', link: '/reference/diagnostics/ux' },
          ],
        },
      ],
      '/roadmap/': [
        {
          text: '产品路线图',
          items: [{ text: '当前状态', link: '/roadmap/current-status' }],
        },
      ],
      '/api/': [
        {
          text: 'API',
          items: [
            { text: '组件与 Renderer Host', link: '/api/components' },
            { text: 'CLI', link: '/api/cli' },
            { text: 'Backend', link: '/api/backend' },
          ],
        },
      ],
      '/community/': [
        {
          text: '社区',
          items: [
            { text: '贡献指南', link: '/community/contributing' },
            { text: '开发索引', link: '/community/development' },
            { text: 'Changelog', link: '/community/changelog' },
          ],
        },
      ],
    },
  },
});
