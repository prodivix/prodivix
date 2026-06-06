import {
  type MitosisComponent,
  type MitosisNode,
  componentToReact,
  componentToVue,
} from '@builder.io/mitosis';
import type { ComponentNode, PIRDocument } from '@/core/types/engine.types';
import { materializePirRoot } from '@/pir/graph';

export const testSimpleGeneration = (target: 'react' | 'vue') => {
  // 这是一个最简单的、手写的 Mitosis 组件对象
  // 没有任何变量引用，只有最纯粹的结构
  const mockComponent: MitosisComponent = {
    '@type': '@builder.io/mitosis/component',
    name: 'HelloWorld',
    imports: [],
    exports: {},
    inputs: [],
    state: {},
    signals: {},
    props: {},
    refs: {},
    hooks: { onMount: [], onEvent: [] },
    context: { get: {}, set: {} },
    subComponents: [],
    meta: {},
    children: [
      {
        '@type': '@builder.io/mitosis/node',
        name: 'div',
        properties: { style: 'color: red;' },
        bindings: {
          children: {
            // 重点：双引号包裹单引号，确保它是一个纯字符串常量
            code: "'Hello from Mitosis!'",
            type: 'single' as const,
            bindingType: 'expression' as const,
          },
        },
        children: [],
        meta: {},
        scope: {},
      },
    ],
  };

  const transpilerArgs = { component: mockComponent };
  const options = { prettier: false };

  try {
    console.log('正在尝试原子级生成测试...');
    const result =
      target === 'vue'
        ? componentToVue(options)(transpilerArgs)
        : componentToReact(options)(transpilerArgs);

    console.log('生成成功！产物如下：');
    console.log(result);
    return result;
  } catch (e) {
    console.error('生成失败，环境仍有问题:', e);
    return `Error: ${e}`;
  }
};
// 1. 递归转换节点，修复 Binding 严格类型报错
const transformNode = (node: ComponentNode): MitosisNode => {
  // 1. 确定绑定代码
  let bindingCode = '';

  if (node.text && typeof node.text === 'object' && '$state' in node.text) {
    // 如果是状态绑定，生成 state.xxx
    bindingCode = `state.${node.text.$state}`;
  } else {
    // 如果是普通文本（例如 "Prodivix 渲染引擎测试"）
    // 必须使用 JSON.stringify，这会把 [MDR] 变成 ["MDR"]
    // 否则 Mitosis 会尝试把 "MDR" 当作变量名来解析，从而报错
    bindingCode = JSON.stringify(node.text || '');
  }

  // 2. 打印一下，方便你调试
  console.log(`Node ID: ${node.id}, Binding Code: ${bindingCode}`);

  const properties: Record<string, string> = {};
  if (node.props) {
    Object.entries(node.props).forEach(([key, value]) => {
      if (typeof value === 'string') properties[key] = value;
    });
  }

  return {
    '@type': '@builder.io/mitosis/node',
    name: node.type === 'container' ? 'div' : node.type,
    properties,
    bindings: {
      children: {
        code: bindingCode, // 这里的代码现在是安全的了
        type: 'single' as const,
        bindingType: 'expression' as const,
      },
    },
    children: node.children?.map(transformNode) || [],
    meta: {},
    scope: {},
  };
};

export const convertPirToCode = (
  pirDoc: PIRDocument,
  target: 'react' | 'vue'
) => {
  const root = materializePirRoot(pirDoc);
  // 2. 构建符合严格接口的 MitosisComponent
  const mitosisJson: MitosisComponent = {
    '@type': '@builder.io/mitosis/component',
    name: 'ExportedComponent',
    imports: [],
    exports: {},
    state: {
      buttonText: {
        code: '"确认提交"',
        type: 'property',
      },
    },
    inputs: [],
    signals: {},
    props: {},
    refs: {},
    hooks: {
      // 最新版本要求即使为空也必须声明这两个数组
      onMount: [],
      onEvent: [],
    },
    context: { get: {}, set: {} },
    children: [transformNode(root)],
    subComponents: [],
    meta: {},
    style: JSON.stringify(root.style || {}),
  };

  // 3. 调用转换函数
  const transpilerArgs = {
    component: mitosisJson,
  };

  if (target === 'vue') {
    return componentToVue()(transpilerArgs);
  }
  return componentToReact()(transpilerArgs);
};
