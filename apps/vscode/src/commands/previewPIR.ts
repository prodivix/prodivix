import * as vscode from 'vscode';
import { createPirPreviewHtml } from './pirPreviewHtml';

export const previewPIR = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'pir') {
    await vscode.window.showErrorMessage(
      'Open a .pir.json document to preview PIR.'
    );
    return;
  }
  const document = editor.document;
  const panel = vscode.window.createWebviewPanel(
    'prodivix.pirPreview',
    'PIR structure preview',
    vscode.ViewColumn.Beside,
    { enableScripts: false, localResourceRoots: [] }
  );
  const refresh = () => {
    try {
      panel.webview.html = createPirPreviewHtml(
        document.getText(),
        document.uri.toString(),
        document.version
      );
    } catch (error) {
      panel.webview.html =
        '<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body><p>PIR preview is blocked. See the validation error in VS Code.</p></body></html>';
      void vscode.window.showErrorMessage(
        `PIR preview blocked: ${error instanceof Error ? error.message : 'Invalid document.'}`
      );
    }
  };
  const changes = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() === document.uri.toString()) refresh();
  });
  panel.onDidDispose(() => changes.dispose());
  context.subscriptions.push(panel, changes);
  refresh();
};
