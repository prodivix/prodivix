import * as vscode from 'vscode';

export class PIRDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    // 空实现：返回空数组即可占位
    return [];
  }
}
