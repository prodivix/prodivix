import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createEmptyPirDocument, encodePirDocument } from '@prodivix/pir';
import { activate } from '../index';
import { createPirPreviewHtml } from '../commands/pirPreviewHtml';
import { PIRDocumentSymbolProvider } from '../language/pirDocumentSymbolProvider';
import {
  readPirDocumentModel,
  findPirSymbolSource,
} from '../language/pirDocumentModel';

const host = vi.hoisted(() => ({
  registerSymbols: vi.fn(),
  registerCommand: vi.fn(),
  registerDebug: vi.fn(),
  error: vi.fn(),
  createPanel: vi.fn(),
  onChange: vi.fn(),
  panelDisposed: vi.fn(),
  changesDisposed: vi.fn(),
}));
vi.mock('vscode', () => ({
  languages: { registerDocumentSymbolProvider: host.registerSymbols },
  commands: { registerCommand: host.registerCommand },
  debug: { registerDebugAdapterDescriptorFactory: host.registerDebug },
  window: {
    activeTextEditor: undefined,
    showErrorMessage: host.error,
    createWebviewPanel: host.createPanel,
  },
  workspace: { onDidChangeTextDocument: host.onChange },
  ViewColumn: { Beside: 2 },
  SymbolKind: { Object: 1, Class: 2, Property: 3, Variable: 4 },
  Range: class {
    constructor(
      readonly start: unknown,
      readonly end: unknown
    ) {}
  },
  DocumentSymbol: class {
    constructor(
      readonly name: string,
      readonly detail: string,
      readonly kind: number,
      readonly range: unknown,
      readonly selectionRange: unknown
    ) {}
  },
  DebugAdapterExecutable: class {
    constructor(
      readonly command: string,
      readonly args: string[],
      readonly options: unknown
    ) {}
  },
}));

const wireText = (literal = 'Hello PIR') => {
  const document = createEmptyPirDocument({
    rootId: 'root-node',
    rootType: 'container',
  });
  return encodePirDocument({
    ...document,
    ui: {
      graph: {
        ...document.ui.graph,
        nodesById: {
          ...document.ui.graph.nodesById,
          'root-node': {
            id: 'root-node',
            kind: 'element',
            type: 'container',
            text: { kind: 'literal', value: literal },
          },
        },
      },
    },
    logic: {
      state: { count: { name: 'Counter', initial: 0, typeRef: 'number' } },
    },
  });
};
const editorDocument = (text = wireText()) =>
  ({
    getText: () => text,
    uri: { toString: () => 'file:///project/page.pir.json' },
    version: 3,
    languageId: 'pir',
    positionAt: (offset: number) => ({ line: 0, character: offset }),
  }) as unknown as vscode.TextDocument;

beforeEach(() => {
  vi.clearAllMocks();
  for (const register of [
    host.registerSymbols,
    host.registerCommand,
    host.registerDebug,
  ])
    register.mockReturnValue({ dispose: vi.fn() });
  host.onChange.mockReturnValue({ dispose: host.changesDisposed });
  Object.assign(vscode.window, { activeTextEditor: undefined });
});

describe('PIR extension public behavior', () => {
  it('registers functional symbol, preview and executable debugger owners with disposable lifetimes', () => {
    const context = {
      subscriptions: [],
      asAbsolutePath: (path: string) => `D:/extension/${path}`,
    } as unknown as vscode.ExtensionContext;
    activate(context);
    expect(context.subscriptions).toHaveLength(3);
    expect(host.registerSymbols.mock.calls[0][0]).toEqual({ language: 'pir' });
    expect(host.registerCommand.mock.calls[0][0]).toBe('prodivix.previewPIR');
    const adapter =
      host.registerDebug.mock.calls[0][1].createDebugAdapterDescriptor();
    expect(adapter.args).toEqual(['D:/extension/dist/debugAdapter.js']);
    expect(adapter.options.env.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('decodes current wire through the owner and projects typed semantic facts onto actual source ranges', () => {
    const text = wireText();
    const model = readPirDocumentModel(text, 'page', 3);
    expect(model.symbols.find(({ name }) => name === 'Counter')).toMatchObject({
      kind: 'state',
      typeRef: 'number',
    });
    const root = model.symbols.find(({ kind }) => kind === 'pir-node')!;
    const source = findPirSymbolSource(model, root)!;
    expect(
      JSON.parse(text.slice(source.offset, source.offset + source.length))
    ).toMatchObject({ id: 'root-node', kind: 'element' });
    const symbols = new PIRDocumentSymbolProvider().provideDocumentSymbols(
      editorDocument(text)
    );
    expect(symbols.some(({ detail }) => detail === 'state · number')).toBe(
      true
    );
    expect(
      new PIRDocumentSymbolProvider().provideDocumentSymbols(
        editorDocument('{}')
      )
    ).toEqual([]);
    expect(() => readPirDocumentModel('{}', 'page', 3)).toThrow();
    const id = 'x.logic.state.y';
    const dottedText = encodePirDocument({
      ...createEmptyPirDocument(),
      logic: { state: { [id]: { initial: 1 } } },
    });
    const dottedModel = readPirDocumentModel(
      dottedText,
      'page.logic.state.name',
      3
    );
    const dottedSymbol = dottedModel.symbols.find(
      ({ kind }) => kind === 'state'
    )!;
    const dottedSource = findPirSymbolSource(dottedModel, dottedSymbol)!;
    expect(
      JSON.parse(
        dottedText.slice(
          dottedSource.offset,
          dottedSource.offset + dottedSource.length
        )
      )
    ).toEqual({ initial: 1 });
  });

  it('renders real literal structure as escaped read-only content with no scripts or resource access', () => {
    const html = createPirPreviewHtml(
      wireText('<script>throw "never execute"</script>'),
      '<document>',
      3
    );
    expect(html).toContain('root-node');
    expect(html).toContain('Counter');
    expect(html).toContain('editor revision 3');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('src=');
  });

  it('opens an actual preview, refreshes changed revision, and disposes its document listener', async () => {
    let text = wireText();
    let version = 3;
    const document = {
      ...editorDocument(),
      getText: () => text,
      get version() {
        return version;
      },
    };
    Object.assign(vscode.window, { activeTextEditor: { document } });
    const panel = {
      webview: { html: '' },
      onDidDispose: host.panelDisposed,
      dispose: vi.fn(),
    };
    host.createPanel.mockReturnValue(panel);
    const context = {
      subscriptions: [],
      asAbsolutePath: (path: string) => path,
    } as unknown as vscode.ExtensionContext;
    activate(context);
    await host.registerCommand.mock.calls[0][1]();
    expect(host.createPanel.mock.calls[0][3]).toEqual({
      enableScripts: false,
      localResourceRoots: [],
    });
    expect(panel.webview.html).toContain('Hello PIR');
    text = wireText('Changed PIR');
    version = 4;
    host.onChange.mock.calls[0][0]({ document });
    expect(panel.webview.html).toContain('Changed PIR');
    expect(panel.webview.html).toContain('editor revision 4');
    host.panelDisposed.mock.calls[0][0]();
    expect(host.changesDisposed).toHaveBeenCalledOnce();
  });

  it('reports missing editors and invalid PIR instead of a success placeholder', async () => {
    const context = {
      subscriptions: [],
      asAbsolutePath: (path: string) => path,
    } as unknown as vscode.ExtensionContext;
    activate(context);
    await host.registerCommand.mock.calls[0][1]();
    expect(host.error).toHaveBeenCalledWith(
      'Open a .pir.json document to preview PIR.'
    );
    Object.assign(vscode.window, {
      activeTextEditor: { document: editorDocument('{}') },
    });
    const panel = {
      webview: { html: '' },
      onDidDispose: vi.fn(),
      dispose: vi.fn(),
    };
    host.createPanel.mockReturnValue(panel);
    await host.registerCommand.mock.calls[0][1]();
    expect(panel.webview.html).toContain('preview is blocked');
    expect(host.error.mock.calls.at(-1)?.[0]).toContain('PIR preview blocked:');
  });
});
