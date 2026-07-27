import type { NodeCatalogItem } from '../nodeCatalog';
import { CONTROL_IN } from '../nodeCatalogConstants';

export const advancedFormsNodeCatalog: NodeCatalogItem[] = [
  {
    kind: 'validate',
    label: 'Validate',
    icon: '◇',
    groupId: 'advanced-forms',
    groupLabel: 'Advanced Forms',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.value',
      dataOut: 'out.data.cleaned',
      controlOut: 'out.control.valid',
    },
    defaults: {
      ruleType: 'schema',
      schema: '',
      stopAtFirstError: 'false',
      rules: '',
    },
  },
  {
    kind: 'rateLimit',
    label: 'Rate Limit',
    icon: '○',
    groupId: 'advanced-forms',
    groupLabel: 'Advanced Forms',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.value',
      dataOut: 'out.data.value',
      controlOut: 'out.control.fire',
    },
    defaults: {
      mode: 'debounce',
      waitMs: '300',
      leading: 'false',
      trailing: 'true',
      maxWaitMs: '0',
    },
  },
  {
    kind: 'formContext',
    label: 'Form Context',
    icon: '○',
    groupId: 'advanced-forms',
    groupLabel: 'Advanced Forms',
    ports: {
      controlIn: CONTROL_IN,
      dataOut: 'out.data.form',
      controlOut: 'out.control.changed',
    },
    defaults: {
      formId: 'checkout-form',
      autoCreate: 'true',
      resetOnSubmit: 'false',
    },
  },
  {
    kind: 'formField',
    label: 'Form Field',
    icon: '○',
    groupId: 'advanced-forms',
    groupLabel: 'Advanced Forms',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.value',
      dataOut: 'out.data.value',
      controlOut: 'out.control.changed',
    },
    defaults: {
      fieldName: 'email',
      action: 'bind',
      defaultValue: '',
    },
  },
];
