import { type PIRDocument } from '@prodivix/shared/types/pir';
import { normalizePirDocument } from '@/pir/resolvePirDocument';

export const testDoc: PIRDocument = normalizePirDocument({
  version: '1.0',
  ui: {
    root: {
      id: 'root',
      type: 'PdxDiv',
      props: {
        display: 'Flex',
        flexDirection: 'Column',
        alignItems: 'Center',
        gap: '20px',
        padding: '40px',
        backgroundColor: '#e4ffb4',
        border: '1px solid #ccc',
      },
      style: {
        minHeight: '50vh',
      },
      children: [
        {
          id: 'h1',
          type: 'PdxText',
          text: 'Prodivix 渲染引擎测试',
          props: {
            size: 'Big',
            weight: 'Bold',
          },
          style: {
            display: 'block',
            marginBottom: '20px',
          },
        },
        {
          id: 'countDisplay',
          type: 'PdxDiv',
          props: {
            display: 'Flex',
            alignItems: 'Center',
            gap: '8px',
          },
          children: [
            {
              id: 'p',
              type: 'PdxText',
              text: '当前计数：',
              props: { size: 'Large' },
            },
            {
              id: 'countValue',
              type: 'PdxText',
              text: { $state: 'count' },
              props: { size: 'Large', weight: 'Bold' },
            },
          ],
        },
        {
          id: 'btn',
          type: 'PdxButton',
          text: { $param: 'buttonText' },
          props: { size: 'Medium', category: 'Primary' },
          events: {
            click: {
              trigger: 'click',
              action: 'increment',
            },
          },
        },
        {
          id: 'input_1',
          type: 'PdxInput',
          props: {
            placeholder: '搜索项目...',
            maxLength: 20,
            size: 'Medium',
          },
        },
      ],
    },
  },
  logic: {
    state: {
      count: { initial: 0 },
    },
    props: {
      buttonText: { type: 'string', default: 'Click Me' },
    },
  },
});
