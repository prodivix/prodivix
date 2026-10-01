import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  compileNodeGraphProgram,
  createFirstPartyNodeGraphDescriptorRegistry,
  createNodeGraphDebugController,
  createNodeGraphProgramDebugExecutor,
  decodeNodeGraphDocument,
  type NodeGraphDebugCommand,
  type NodeGraphDebugController,
  type NodeGraphDebugSnapshot,
} from '@prodivix/nodegraph';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';

export type NodeGraphSourceLocation = Readonly<{
  nodeId: string;
  line: number;
  column: number;
  endLine: number;
}>;
const digestText = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');
const readBoundedSource = async (path: string): Promise<string> => {
  const info = await stat(path);
  if (!info.isFile() || info.size > 2_097_152)
    throw new Error('NodeGraph debug source must be a file of at most 2 MiB.');
  const bytes = await readFile(path);
  if (bytes.byteLength > 2_097_152)
    throw new Error('NodeGraph debug source exceeded its byte budget.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('NodeGraph source must use valid UTF-8.');
  }
};

/** This adapter grants no gateways or CodeSlot execution; the domain owner compiles and executes the immutable graph. */
export class NodeGraphDebugRuntime {
  private constructor(
    readonly sourcePath: string,
    readonly documentRevision: number,
    readonly sourceDigest: string,
    readonly locations: readonly NodeGraphSourceLocation[],
    private readonly controller: NodeGraphDebugController
  ) {}

  static async launch(
    program: string,
    documentRevision = 1
  ): Promise<NodeGraphDebugRuntime> {
    if (!Number.isSafeInteger(documentRevision) || documentRevision < 1)
      throw new Error('documentRevision must be a positive integer.');
    const sourcePath = resolve(program);
    const text = await readBoundedSource(sourcePath);
    const decoded = decodeNodeGraphDocument(JSON.parse(text));
    if (!decoded.ok)
      throw new Error(
        decoded.issues
          .slice(0, 5)
          .map(({ path, message }) => `${path}: ${message}`)
          .join('; ')
      );
    const compiled = compileNodeGraphProgram({
      documentId: sourcePath,
      documentRevision,
      graph: decoded.value,
      registry: createFirstPartyNodeGraphDescriptorRegistry(),
      runtimeZone: 'client',
      availableCapabilities: [],
      maximumNodes: 512,
      maximumEdges: 2_048,
    });
    if (!compiled.ok)
      throw new Error(
        compiled.issues
          .slice(0, 5)
          .map(({ path, message }) => `${path}: ${message}`)
          .join('; ')
      );
    const created = createNodeGraphDebugController({
      program: compiled.program,
      jobId: randomUUID(),
      attemptId: randomUUID(),
      leaseId: randomUUID(),
      executor: createNodeGraphProgramDebugExecutor({
        program: compiled.program,
        grantedCapabilities: [],
      }),
      maximumCommands: 1_000,
      maximumValueDepth: 8,
      maximumValueNodes: 256,
      maximumValueUtf8Bytes: 16_384,
    });
    if (!created.ok) throw new Error(created.issue.safeMessage);
    const tree = parseTree(text);
    const positionAt = (offset: number) => {
      const before = text.slice(0, offset);
      const lastNewline = before.lastIndexOf('\n');
      return { line: before.split('\n').length, column: offset - lastNewline };
    };
    const locations = decoded.value.nodes.map((node, index) => {
      const source = tree && findNodeAtLocation(tree, ['nodes', index]);
      if (!source) throw new Error('NodeGraph source mapping is unavailable.');
      const start = positionAt(source.offset);
      return {
        nodeId: node.id,
        ...start,
        endLine: positionAt(source.offset + source.length).line,
      };
    });
    return new NodeGraphDebugRuntime(
      sourcePath,
      documentRevision,
      digestText(text),
      locations,
      created.controller
    );
  }

  snapshot(): NodeGraphDebugSnapshot {
    return this.controller.snapshot();
  }

  async command(
    kind: Exclude<NodeGraphDebugCommand['kind'], 'set-breakpoints'>
  ): Promise<NodeGraphDebugSnapshot> {
    if (kind !== 'cancel' && kind !== 'detach')
      await this.assertSourceCurrent();
    return this.send({ kind });
  }

  async setBreakpoints(
    nodeIds: readonly string[]
  ): Promise<NodeGraphDebugSnapshot> {
    await this.assertSourceCurrent();
    return this.send({ kind: 'set-breakpoints', nodeIds });
  }

  private async assertSourceCurrent(): Promise<void> {
    let current: string;
    try {
      current = digestText(await readBoundedSource(this.sourcePath));
    } catch {
      await this.cancelIfActive();
      throw new Error(
        'NodeGraph source is unavailable; launch a new debug revision.'
      );
    }
    if (current !== this.sourceDigest) {
      await this.cancelIfActive();
      throw new Error('NodeGraph source changed; launch a new debug revision.');
    }
  }

  private async cancelIfActive(): Promise<void> {
    if (
      this.snapshot().status === 'paused' ||
      this.snapshot().status === 'running'
    )
      await this.send({ kind: 'cancel' });
  }

  private async send(
    command:
      | { kind: Exclude<NodeGraphDebugCommand['kind'], 'set-breakpoints'> }
      | { kind: 'set-breakpoints'; nodeIds: readonly string[] }
  ): Promise<NodeGraphDebugSnapshot> {
    const snapshot = this.controller.snapshot();
    const result = await this.controller.command({
      ...snapshot.identity,
      expectedCommandSequence: snapshot.commandSequence + 1,
      ...command,
    });
    if (!result.accepted) throw new Error(result.issue.safeMessage);
    return result.snapshot;
  }
}
