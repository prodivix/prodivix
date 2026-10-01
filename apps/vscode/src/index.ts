import * as vscode from 'vscode';
import { previewPIR } from './commands/previewPIR';
import { PIRDocumentSymbolProvider } from './language/pirDocumentSymbolProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'pir' },
      new PIRDocumentSymbolProvider()
    ),
    vscode.commands.registerCommand('prodivix.previewPIR', () =>
      previewPIR(context)
    ),
    vscode.debug.registerDebugAdapterDescriptorFactory('prodivix', {
      createDebugAdapterDescriptor: () =>
        new vscode.DebugAdapterExecutable(
          process.execPath,
          [context.asAbsolutePath('dist/debugAdapter.js')],
          { env: { ELECTRON_RUN_AS_NODE: '1' } }
        ),
    })
  );
}
