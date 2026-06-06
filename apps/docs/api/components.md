# 组件库 API

本文档描述 `@prodivix/ui` 组件库中实际实现的组件及其 API。

::: tip
组件库包含 76 个已实现的 React 组件，支持主题定制和无障碍访问。
:::

## 安装

```bash
pnpm add @prodivix/ui
```

## 按钮组件

### PdxButton

通用按钮组件。

```tsx
import { PdxButton } from '@prodivix/ui';

<PdxButton
  text="点击我"
  category="Primary"
  size="Medium"
  onClick={() => console.log('clicked')}
/>;
```

**Props**:

| 属性           | 类型                                                                                                            | 默认值      | 描述             |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ----------- | ---------------- |
| `text`         | string                                                                                                          | -           | 按钮文本         |
| `size`         | `'Big'` \| `'Medium'` \| `'Small'` \| `'Tiny'`                                                                  | `'Medium'`  | 按钮尺寸         |
| `category`     | `'Primary'` \| `'Secondary'` \| `'Danger'` \| `'SubtleDanger'` \| `'Warning'` \| `'SubtleWarning'` \| `'Ghost'` | `'Primary'` | 按钮类型         |
| `disabled`     | boolean                                                                                                         | `false`     | 禁用状态         |
| `icon`         | ReactNode                                                                                                       | -           | 图标             |
| `onlyIcon`     | boolean                                                                                                         | `false`     | 仅显示图标       |
| `iconPosition` | `'Left'` \| `'Right'`                                                                                           | `'Left'`    | 图标位置         |
| `className`    | string                                                                                                          | -           | 自定义类名       |
| `style`        | CSSProperties                                                                                                   | -           | 内联样式         |
| `id`           | string                                                                                                          | -           | 元素 ID          |
| `onClick`      | function                                                                                                        | -           | 点击事件         |
| `as`           | ElementType                                                                                                     | `'button'`  | 渲染的 HTML 元素 |

### PdxButtonLink

链接样式按钮组件。

## 输入组件

### PdxInput

文本输入框组件。

```tsx
import { PdxInput } from '@prodivix/ui';

<PdxInput
  type="Text"
  placeholder="请输入用户名"
  size="Medium"
  onChange={(e) => setValue(e.target.value)}
/>;
```

**Props**:

| 属性           | 类型                                                                                                            | 默认值      | 描述                  |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ----------- | --------------------- |
| `type`         | `'Text'` \| `'Password'` \| `'Email'` \| `'Number'` \| `'Tel'` \| `'Url'` \| `'Search'` \| `'Date'` \| `'Time'` | `'Text'`    | 输入类型              |
| `placeholder`  | string                                                                                                          | -           | 占位文本              |
| `value`        | string                                                                                                          | -           | 输入值                |
| `size`         | `'Small'` \| `'Medium'` \| `'Large'`                                                                            | `'Medium'`  | 尺寸                  |
| `state`        | `'Default'` \| `'Error'` \| `'Warning'` \| `'Success'`                                                          | `'Default'` | 状态                  |
| `disabled`     | boolean                                                                                                         | `false`     | 禁用状态              |
| `readOnly`     | boolean                                                                                                         | `false`     | 只读状态              |
| `required`     | boolean                                                                                                         | `false`     | 必填                  |
| `minLength`    | number                                                                                                          | -           | 最小长度              |
| `maxLength`    | number                                                                                                          | -           | 最大长度              |
| `min`          | number                                                                                                          | -           | 最小值（number 类型） |
| `max`          | number                                                                                                          | -           | 最大值（number 类型） |
| `step`         | number                                                                                                          | -           | 步进值                |
| `pattern`      | string                                                                                                          | -           | 正则验证              |
| `autoFocus`    | boolean                                                                                                         | `false`     | 自动聚焦              |
| `autoComplete` | string                                                                                                          | -           | 自动完成              |
| `name`         | string                                                                                                          | -           | 表单名称              |
| `icon`         | ReactNode                                                                                                       | -           | 图标                  |
| `iconPosition` | `'Left'` \| `'Right'`                                                                                           | `'Left'`    | 图标位置              |
| `onChange`     | function                                                                                                        | -           | 值变化事件            |
| `onFocus`      | function                                                                                                        | -           | 聚焦事件              |
| `onBlur`       | function                                                                                                        | -           | 失焦事件              |
| `onKeyDown`    | function                                                                                                        | -           | 键盘按下事件          |
| `onKeyUp`      | function                                                                                                        | -           | 键盘松开事件          |

### PdxTextarea

多行文本输入组件。

### PdxSearch

搜索输入组件。

## 表单组件

### PdxSelect

下拉选择组件。

```tsx
import { PdxSelect } from '@prodivix/ui';

<PdxSelect
  label="选择城市"
  options={[
    { label: '北京', value: 'beijing' },
    { label: '上海', value: 'shanghai' },
    { label: '广州', value: 'guangzhou', disabled: true },
  ]}
  placeholder="请选择"
  onChange={(value) => console.log(value)}
/>;
```

**Props**:

| 属性           | 类型                                 | 默认值     | 描述             |
| -------------- | ------------------------------------ | ---------- | ---------------- |
| `label`        | string                               | -          | 标签文本         |
| `description`  | string                               | -          | 描述文本         |
| `message`      | string                               | -          | 提示/错误信息    |
| `options`      | `PdxSelectOption[]`                  | `[]`       | 选项列表         |
| `value`        | string                               | -          | 选中值（受控）   |
| `defaultValue` | string                               | -          | 默认值（非受控） |
| `placeholder`  | string                               | -          | 占位文本         |
| `size`         | `'Small'` \| `'Medium'` \| `'Large'` | `'Medium'` | 尺寸             |
| `disabled`     | boolean                              | `false`    | 禁用状态         |
| `onChange`     | function                             | -          | 值变化事件       |

**PdxSelectOption**:

```ts
interface PdxSelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}
```

### PdxFileUpload

文件上传组件，支持拖拽上传。

```tsx
import { PdxFileUpload } from '@prodivix/ui';

<PdxFileUpload
  label="上传文件"
  accept=".pdf,.doc,.docx"
  multiple
  showList
  onChange={(files) => console.log(files)}
/>;
```

**Props**:

| 属性           | 类型     | 默认值  | 描述             |
| -------------- | -------- | ------- | ---------------- |
| `label`        | string   | -       | 标签文本         |
| `description`  | string   | -       | 描述文本         |
| `message`      | string   | -       | 提示信息         |
| `accept`       | string   | -       | 接受的文件类型   |
| `multiple`     | boolean  | `false` | 是否多选         |
| `disabled`     | boolean  | `false` | 禁用状态         |
| `required`     | boolean  | `false` | 必填             |
| `showList`     | boolean  | `true`  | 显示文件列表     |
| `value`        | File[]   | -       | 文件列表（受控） |
| `defaultValue` | File[]   | -       | 默认文件列表     |
| `onChange`     | function | -       | 文件变化事件     |

### PdxRating

评分组件。

```tsx
import { PdxRating } from '@prodivix/ui';

<PdxRating
  label="评分"
  max={5}
  defaultValue={3}
  onChange={(value) => console.log(value)}
/>;
```

**Props**:

| 属性           | 类型                                 | 默认值     | 描述           |
| -------------- | ------------------------------------ | ---------- | -------------- |
| `label`        | string                               | -          | 标签文本       |
| `description`  | string                               | -          | 描述文本       |
| `message`      | string                               | -          | 提示信息       |
| `value`        | number                               | -          | 评分值（受控） |
| `defaultValue` | number                               | -          | 默认评分       |
| `max`          | number                               | `5`        | 最大评分       |
| `size`         | `'Small'` \| `'Medium'` \| `'Large'` | `'Medium'` | 尺寸           |
| `readOnly`     | boolean                              | `false`    | 只读状态       |
| `disabled`     | boolean                              | `false`    | 禁用状态       |
| `onChange`     | function                             | -          | 评分变化事件   |

### 其他表单组件

- **PdxDatePicker** - 日期选择器
- **PdxDateRangePicker** - 日期范围选择器
- **PdxTimePicker** - 时间选择器
- **PdxColorPicker** - 颜色选择器
- **PdxSlider** - 滑块
- **PdxRange** - 范围选择器
- **PdxRadioGroup** - 单选组
- **PdxImageUpload** - 图片上传
- **PdxRegexInput** - 正则输入
- **PdxRegionPicker** - 地区选择器
- **PdxVerificationCode** - 验证码输入
- **PdxPasswordStrength** - 密码强度指示器
- **PdxRichTextEditor** - 富文本编辑器

## 数据展示组件

### PdxTable

表格组件，支持泛型。

```tsx
import { PdxTable } from '@prodivix/ui';

interface User {
  id: number;
  name: string;
  age: number;
}

<PdxTable<User>
  data={users}
  columns={[
    { key: 'name', title: '姓名', dataIndex: 'name' },
    { key: 'age', title: '年龄', dataIndex: 'age', align: 'Center' },
    {
      key: 'action',
      title: '操作',
      render: (_, record) => <button>编辑 {record.name}</button>,
    },
  ]}
  bordered
  striped
  hoverable
/>;
```

**Props**:

| 属性        | 类型                                 | 默认值       | 描述       |
| ----------- | ------------------------------------ | ------------ | ---------- |
| `data`      | T[]                                  | `[]`         | 数据源     |
| `columns`   | `PdxTableColumn&lt;T&gt;[]`          | `[]`         | 列配置     |
| `size`      | `'Small'` \| `'Medium'` \| `'Large'` | `'Medium'`   | 尺寸       |
| `bordered`  | boolean                              | `false`      | 显示边框   |
| `striped`   | boolean                              | `false`      | 斑马纹     |
| `hoverable` | boolean                              | `true`       | 悬停高亮   |
| `title`     | string                               | -            | 表格标题   |
| `caption`   | string                               | -            | 表格说明   |
| `emptyText` | string                               | `'暂无数据'` | 空数据文本 |

**`PdxTableColumn<T>`**:

```ts
interface PdxTableColumn<T> {
  key: string;
  title: string;
  dataIndex?: keyof T;
  align?: 'Left' | 'Center' | 'Right';
  width?: string | number;
  render?: (value: any, record: T, index: number) => ReactNode;
}
```

### PdxList

列表组件。

```tsx
import { PdxList } from '@prodivix/ui';

<PdxList
  items={[
    { title: '项目 1', description: '描述文本' },
    {
      title: '项目 2',
      description: '描述文本',
      extra: <span>额外内容</span>,
    },
  ]}
  bordered
  split
/>;
```

**Props**:

| 属性         | 类型                                 | 默认值     | 描述           |
| ------------ | ------------------------------------ | ---------- | -------------- |
| `items`      | `PdxListItem[]`                      | `[]`       | 列表项         |
| `size`       | `'Small'` \| `'Medium'` \| `'Large'` | `'Medium'` | 尺寸           |
| `bordered`   | boolean                              | `false`    | 显示边框       |
| `split`      | boolean                              | `true`     | 显示分割线     |
| `renderItem` | function                             | -          | 自定义渲染函数 |

### PdxBadge

徽章组件。

```tsx
import { PdxBadge } from '@prodivix/ui';

<PdxBadge count={5} max={99}>
  <button>消息</button>
</PdxBadge>

<PdxBadge dot color="red">
  <span>新功能</span>
</PdxBadge>
```

**Props**:

| 属性       | 类型      | 默认值  | 描述                |
| ---------- | --------- | ------- | ------------------- |
| `count`    | number    | -       | 显示数字            |
| `max`      | number    | `99`    | 最大显示数字        |
| `dot`      | boolean   | `false` | 显示为小红点        |
| `showZero` | boolean   | `false` | 数字为 0 时是否显示 |
| `color`    | string    | -       | 自定义颜色          |
| `children` | ReactNode | -       | 子元素              |

### 其他数据组件

- **PdxDataGrid** - 数据网格
- **PdxCheckList** - 勾选列表
- **PdxTree** - 树形控件
- **PdxTreeSelect** - 树形选择
- **PdxTag** - 标签
- **PdxProgress** - 进度条
- **PdxSpinner** - 加载指示器
- **PdxStatistic** - 统计数值
- **PdxTimeline** - 时间线
- **PdxSteps** - 步骤条

## 导航组件

### PdxTabs

标签页组件。

```tsx
import { PdxTabs } from '@prodivix/ui';

<PdxTabs
  items={[
    { key: '1', label: '标签 1', content: <div>内容 1</div> },
    { key: '2', label: '标签 2', content: <div>内容 2</div> },
    {
      key: '3',
      label: '标签 3',
      content: <div>内容 3</div>,
      disabled: true,
    },
  ]}
  defaultActiveKey="1"
  onChange={(key) => console.log(key)}
/>;
```

**Props**:

| 属性               | 类型           | 默认值 | 描述                 |
| ------------------ | -------------- | ------ | -------------------- |
| `items`            | `PdxTabItem[]` | `[]`   | 标签项配置           |
| `activeKey`        | string         | -      | 当前激活标签（受控） |
| `defaultActiveKey` | string         | -      | 默认激活标签         |
| `onChange`         | function       | -      | 切换事件             |

**PdxTabItem**:

```ts
interface PdxTabItem {
  key: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}
```

### 其他导航组件

- **PdxNav** - 导航菜单
- **PdxNavbar** - 导航栏
- **PdxSidebar** - 侧边栏
- **PdxBreadcrumb** - 面包屑
- **PdxPagination** - 分页
- **PdxCollapse** - 折叠面板
- **PdxAnchorNavigation** - 锚点导航

## 容器组件

### PdxPanel

面板组件。

```tsx
import { PdxPanel } from '@prodivix/ui';

<PdxPanel title="面板标题" variant="Bordered" padding="Medium" collapsible>
  面板内容
</PdxPanel>;
```

**Props**:

| 属性          | 类型                                             | 默认值      | 描述             |
| ------------- | ------------------------------------------------ | ----------- | ---------------- |
| `children`    | ReactNode                                        | -           | 内容             |
| `size`        | `'Small'` \| `'Medium'` \| `'Large'`             | `'Medium'`  | 尺寸             |
| `variant`     | `'Default'` \| `'Bordered'` \| `'Filled'`        | `'Default'` | 变体样式         |
| `padding`     | `'None'` \| `'Small'` \| `'Medium'` \| `'Large'` | `'Medium'`  | 内边距           |
| `collapsible` | boolean                                          | `false`     | 是否可折叠       |
| `collapsed`   | boolean                                          | -           | 折叠状态（受控） |
| `onToggle`    | function                                         | -           | 折叠切换事件     |
| `title`       | string                                           | -           | 标题             |

### 其他容器组件

- **PdxDiv** - 通用 div 容器
- **PdxSection** - 区块容器
- **PdxCard** - 卡片容器

## 文本组件

### PdxHeading

标题组件。

```tsx
import { PdxHeading } from '@prodivix/ui';

<PdxHeading level={1} weight="Bold" color="Primary">
  主标题
</PdxHeading>;
```

**Props**:

| 属性       | 类型                                                                                                 | 默认值      | 描述     |
| ---------- | ---------------------------------------------------------------------------------------------------- | ----------- | -------- |
| `children` | ReactNode                                                                                            | -           | 内容     |
| `level`    | `1` \| `2` \| `3` \| `4` \| `5` \| `6`                                                               | `1`         | 标题级别 |
| `weight`   | `'Light'` \| `'Normal'` \| `'Medium'` \| `'SemiBold'` \| `'Bold'`                                    | `'Bold'`    | 字重     |
| `color`    | `'Default'` \| `'Muted'` \| `'Primary'` \| `'Secondary'` \| `'Danger'` \| `'Warning'` \| `'Success'` | `'Default'` | 颜色     |
| `align`    | `'Left'` \| `'Center'` \| `'Right'`                                                                  | `'Left'`    | 对齐     |
| `as`       | ElementType                                                                                          | -           | 渲染元素 |

### 其他文本组件

- **PdxText** - 普通文本
- **PdxParagraph** - 段落文本

## 图标组件

### PdxIcon

图标组件，支持多种图标源。

```tsx
import { PdxIcon } from '@prodivix/ui';
import { FiCheck } from 'react-icons/fi';

// 使用 react-icons
<PdxIcon icon={FiCheck} size={24} color="green" />

// 使用 SVG 组件
<PdxIcon icon={MySvgIcon} size="1.5rem" />
```

**Props**:

| 属性    | 类型             | 默认值           | 描述                                         |
| ------- | ---------------- | ---------------- | -------------------------------------------- |
| `icon`  | IconRenderable   | -                | 图标（React Element、SVG 组件、react-icons） |
| `size`  | number \| string | `24`             | 图标尺寸                                     |
| `color` | string           | `'currentColor'` | 图标颜色                                     |
| `title` | string           | -                | 无障碍标题                                   |

### PdxIconLink

可点击的图标链接。

## 媒体组件

- **PdxImage** - 图片
- **PdxAvatar** - 头像
- **PdxImageGallery** - 图片画廊
- **PdxVideo** - 视频
- **PdxAudio** - 音频

## 嵌入组件

- **PdxIframe** - iframe 嵌入
- **PdxEmbed** - 通用嵌入

## 反馈组件

### PdxModal

模态框组件。

```tsx
import { PdxModal } from '@prodivix/ui';

<PdxModal
  open={isOpen}
  title="确认操作"
  size="Medium"
  onClose={() => setIsOpen(false)}
  footer={
    <>
      <PdxButton
        text="取消"
        category="Secondary"
        onClick={() => setIsOpen(false)}
      />
      <PdxButton text="确认" category="Primary" onClick={handleConfirm} />
    </>
  }
>
  确定要执行此操作吗？
</PdxModal>;
```

**Props**:

| 属性                  | 类型                                 | 默认值     | 描述         |
| --------------------- | ------------------------------------ | ---------- | ------------ |
| `open`                | boolean                              | `false`    | 显示状态     |
| `title`               | string                               | -          | 标题         |
| `children`            | ReactNode                            | -          | 内容         |
| `footer`              | ReactNode                            | -          | 底部内容     |
| `size`                | `'Small'` \| `'Medium'` \| `'Large'` | `'Medium'` | 尺寸         |
| `closeOnOverlayClick` | boolean                              | `true`     | 点击遮罩关闭 |
| `showClose`           | boolean                              | `true`     | 显示关闭按钮 |
| `onClose`             | function                             | -          | 关闭事件     |

### PdxMessage

消息提示组件。

```tsx
import { PdxMessage } from '@prodivix/ui';

<PdxMessage
  text="操作成功"
  type="Success"
  closable
  onClose={() => setShow(false)}
/>;
```

**Props**:

| 属性       | 类型                                                 | 默认值   | 描述     |
| ---------- | ---------------------------------------------------- | -------- | -------- |
| `text`     | string                                               | -        | 消息内容 |
| `type`     | `'Info'` \| `'Success'` \| `'Warning'` \| `'Danger'` | `'Info'` | 消息类型 |
| `closable` | boolean                                              | `false`  | 可关闭   |
| `onClose`  | function                                             | -        | 关闭事件 |

### 其他反馈组件

- **PdxDrawer** - 抽屉
- **PdxTooltip** - 工具提示
- **PdxPopover** - 气泡卡片
- **PdxNotification** - 通知
- **PdxEmpty** - 空状态
- **PdxSkeleton** - 骨架屏

## 链接组件

### PdxLink

链接组件。

## Storybook

查看完整的组件示例和文档：

```bash
pnpm storybook:ui
```

访问 `http://localhost:6006` 查看 Storybook 文档。
