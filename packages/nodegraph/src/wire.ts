const canonicalStringSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 512,
  pattern: '^\\S(?:[\\s\\S]*\\S)?$',
} as const;

export const NODEGRAPH_CURRENT_WIRE_VERSION = 2 as const;

/**
 * Machine-readable persistence contract for the active NodeGraph wire
 * snapshot. Production consumers use the version-neutral domain model.
 */
export const nodeGraphCurrentWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/nodegraph/v2.json',
  title: 'Prodivix NodeGraph wire document v2',
  type: 'object',
  required: ['version', 'nodes', 'edges'],
  properties: {
    version: { const: NODEGRAPH_CURRENT_WIRE_VERSION },
    nodes: {
      type: 'array',
      maxItems: 10_000,
      items: { $ref: '#/$defs/node' },
    },
    edges: {
      type: 'array',
      maxItems: 50_000,
      items: { $ref: '#/$defs/edge' },
    },
    publicContract: { $ref: '#/$defs/publicContract' },
  },
  additionalProperties: false,
  $defs: {
    canonicalString: canonicalStringSchema,
    sourceSpan: {
      type: 'object',
      required: [
        'artifactId',
        'startLine',
        'startColumn',
        'endLine',
        'endColumn',
      ],
      properties: {
        artifactId: { $ref: '#/$defs/canonicalString' },
        startLine: { type: 'integer', minimum: 1 },
        startColumn: { type: 'integer', minimum: 1 },
        endLine: { type: 'integer', minimum: 1 },
        endColumn: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
    codeReference: {
      type: 'object',
      required: ['artifactId'],
      properties: {
        artifactId: { $ref: '#/$defs/canonicalString' },
        exportName: { $ref: '#/$defs/canonicalString' },
        symbolId: { $ref: '#/$defs/canonicalString' },
        sourceSpan: { $ref: '#/$defs/sourceSpan' },
      },
      additionalProperties: false,
    },
    codeSlotBinding: {
      type: 'object',
      required: ['slotId', 'reference'],
      properties: {
        slotId: { $ref: '#/$defs/canonicalString' },
        reference: { $ref: '#/$defs/codeReference' },
      },
      additionalProperties: false,
    },
    descriptorRef: {
      type: 'object',
      required: ['id', 'version'],
      properties: {
        id: { $ref: '#/$defs/canonicalString' },
        version: { $ref: '#/$defs/canonicalString' },
      },
      additionalProperties: false,
    },
    portReference: {
      type: 'object',
      required: ['nodeId', 'portId'],
      properties: {
        nodeId: { $ref: '#/$defs/canonicalString' },
        portId: { $ref: '#/$defs/canonicalString' },
      },
      additionalProperties: false,
    },
    port: {
      type: 'object',
      required: ['id', 'direction', 'flow', 'required', 'cardinality'],
      properties: {
        id: { $ref: '#/$defs/canonicalString' },
        direction: { enum: ['input', 'output'] },
        flow: { enum: ['control', 'data'] },
        typeRef: { $ref: '#/$defs/canonicalString' },
        required: { type: 'boolean' },
        cardinality: { enum: ['single', 'multiple'] },
      },
      additionalProperties: false,
    },
    editorPosition: {
      type: 'object',
      required: ['x', 'y'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
      additionalProperties: false,
    },
    editor: {
      type: 'object',
      properties: {
        position: { $ref: '#/$defs/editorPosition' },
        parentId: { $ref: '#/$defs/canonicalString' },
        extent: { const: 'parent' },
        zIndex: { type: 'integer' },
        collapsed: { type: 'boolean' },
        label: { $ref: '#/$defs/canonicalString' },
      },
      additionalProperties: false,
    },
    node: {
      type: 'object',
      required: ['id', 'descriptorRef', 'ports', 'configuration', 'editor'],
      properties: {
        id: { $ref: '#/$defs/canonicalString' },
        descriptorRef: { $ref: '#/$defs/descriptorRef' },
        ports: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/port' },
        },
        configuration: { type: 'object', additionalProperties: true },
        editor: { $ref: '#/$defs/editor' },
        codeSlot: { $ref: '#/$defs/codeSlotBinding' },
      },
      additionalProperties: false,
    },
    edge: {
      type: 'object',
      required: ['id', 'source', 'target'],
      properties: {
        id: { $ref: '#/$defs/canonicalString' },
        source: { $ref: '#/$defs/portReference' },
        target: { $ref: '#/$defs/portReference' },
      },
      additionalProperties: false,
    },
    publicPort: {
      type: 'object',
      required: ['id', 'port', 'typeRef', 'required'],
      properties: {
        id: { $ref: '#/$defs/canonicalString' },
        port: { $ref: '#/$defs/portReference' },
        typeRef: { $ref: '#/$defs/canonicalString' },
        required: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    publicContract: {
      type: 'object',
      required: [
        'inputs',
        'outputs',
        'errors',
        'requiredCapabilities',
        'maximumSteps',
      ],
      properties: {
        inputs: {
          type: 'array',
          items: { $ref: '#/$defs/publicPort' },
        },
        outputs: {
          type: 'array',
          items: { $ref: '#/$defs/publicPort' },
        },
        errors: {
          type: 'array',
          items: { $ref: '#/$defs/canonicalString' },
        },
        requiredCapabilities: {
          type: 'array',
          items: { $ref: '#/$defs/canonicalString' },
        },
        maximumSteps: {
          type: 'integer',
          minimum: 1,
          maximum: 1_000_000,
        },
      },
      additionalProperties: false,
    },
  },
  examples: [
    {
      version: NODEGRAPH_CURRENT_WIRE_VERSION,
      nodes: [
        {
          id: 'source',
          descriptorRef: { id: 'core.start', version: '1' },
          ports: [
            {
              id: 'out.control.next',
              direction: 'output',
              flow: 'control',
              required: false,
              cardinality: 'single',
            },
          ],
          configuration: {},
          editor: {},
        },
        {
          id: 'target',
          descriptorRef: { id: 'core.end', version: '1' },
          ports: [
            {
              id: 'in.control.prev',
              direction: 'input',
              flow: 'control',
              required: true,
              cardinality: 'single',
            },
          ],
          configuration: {},
          editor: {},
        },
      ],
      edges: [
        {
          id: 'edge',
          source: {
            nodeId: 'source',
            portId: 'out.control.next',
          },
          target: {
            nodeId: 'target',
            portId: 'in.control.prev',
          },
        },
      ],
    },
  ],
} as const;

export const nodeGraphCurrentWireFields = Object.freeze({
  document: Object.freeze(Object.keys(nodeGraphCurrentWireSchema.properties)),
  node: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.node.properties)
  ),
  descriptorRef: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.descriptorRef.properties)
  ),
  port: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.port.properties)
  ),
  portReference: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.portReference.properties)
  ),
  editor: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.editor.properties)
  ),
  editorPosition: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.editorPosition.properties)
  ),
  publicContract: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.publicContract.properties)
  ),
  publicPort: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.publicPort.properties)
  ),
  codeSlotBinding: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.codeSlotBinding.properties)
  ),
  codeReference: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.codeReference.properties)
  ),
  sourceSpan: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.sourceSpan.properties)
  ),
  edge: Object.freeze(
    Object.keys(nodeGraphCurrentWireSchema.$defs.edge.properties)
  ),
});
