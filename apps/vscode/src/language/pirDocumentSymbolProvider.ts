import * as vscode from 'vscode';
import { findPirSymbolSource, readPirDocumentModel } from './pirDocumentModel';

export class PIRDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.DocumentSymbol[] {
    try {
      const model = readPirDocumentModel(
        document.getText(),
        document.uri.toString(),
        document.version
      );
      return model.symbols.flatMap((symbol) => {
        const source = findPirSymbolSource(model, symbol);
        if (!source) return [];
        const range = new vscode.Range(
          document.positionAt(source.offset),
          document.positionAt(source.offset + source.length)
        );
        const kind =
          symbol.kind === 'pir-node'
            ? vscode.SymbolKind.Object
            : symbol.kind === 'component'
              ? vscode.SymbolKind.Class
              : symbol.kind.startsWith('component-')
                ? vscode.SymbolKind.Property
                : vscode.SymbolKind.Variable;
        return [
          new vscode.DocumentSymbol(
            symbol.displayName ?? symbol.name,
            [symbol.kind, symbol.typeRef].filter(Boolean).join(' · '),
            kind,
            range,
            range
          ),
        ];
      });
    } catch {
      return [];
    }
  }
}
