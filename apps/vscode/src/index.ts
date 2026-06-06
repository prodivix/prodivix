import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // 1. 语言支持
  //   vscode.languages.registerDocumentSymbolProvider(
  //     { language: 'pir' },
  //     new PIRDocumentSymbolProvider()
  //   )

  // 2. 命令
  vscode.commands.registerCommand('prodivix.previewPIR', () => {
    vscode.window.showInformationMessage('PIR Preview 已连接');
  });

  // 3. 调试适配器（稍后实现）
  //   const factory = new PIRDebugAdapterDescriptorFactory()
  //   vscode.debug.registerDebugAdapterDescriptorFactory('prodivix', factory)
}

export function deactivate() {}
