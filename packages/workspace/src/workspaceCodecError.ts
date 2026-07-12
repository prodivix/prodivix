export class WorkspaceCodecError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'WorkspaceCodecError';
    this.path = path;
  }
}
