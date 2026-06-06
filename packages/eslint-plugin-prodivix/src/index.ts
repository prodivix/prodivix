import type { ESLint } from 'eslint';
import noCircular from './rules/no-circular';
import noTypeError from './rules/no-type-error';
import noUnusedVar from './rules/no-unused-var';

const plugin: ESLint.Plugin = {
  meta: {
    name: 'eslint-plugin-prodivix',
    version: '0.0.1',
  },
  rules: {
    'no-circular': noCircular,
    'no-type-error': noTypeError,
    'no-unused-var': noUnusedVar,
  },
  configs: {
    recommended: {
      plugins: ['prodivix'],
      rules: {
        'prodivix/no-circular': 'error',
        'prodivix/no-type-error': 'error',
        'prodivix/no-unused-var': 'warn',
      },
    },
  },
};

export = plugin;
