import { PassThrough, type Readable, type Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  encodeNodeGraphDocument,
  type NodeGraphDocument,
} from '@prodivix/nodegraph';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { NodeGraphDebugSession } from './debugAdapter.js';
import { NodeGraphDebugRuntime } from './nodeGraphDebugRuntime.js';

const graph: NodeGraphDocument = {
  nodes: ['start', 'process', 'end'].map((id, index) => ({
    id,
    descriptorRef: { id: `core.${id}`, version: '1' },
    ports: [
      ...(index > 0
        ? [
            {
              id: 'in.control.prev',
              direction: 'input' as const,
              flow: 'control' as const,
              required: true,
              cardinality: 'single' as const,
            },
          ]
        : []),
      ...(index < 2
        ? [
            {
              id: 'out.control.next',
              direction: 'output' as const,
              flow: 'control' as const,
              required: false,
              cardinality: 'single' as const,
            },
          ]
        : []),
    ],
    configuration: {},
    editor: {},
  })),
  edges: ['start', 'process'].map((id, index) => ({
    id: `edge-${index}`,
    source: { nodeId: id, portId: 'out.control.next' },
    target: {
      nodeId: index === 0 ? 'process' : 'end',
      portId: 'in.control.prev',
    },
  })),
};

class ProtocolClient {
  readonly input: Writable;
  readonly output: Readable;
  readonly session?: NodeGraphDebugSession;
  readonly events: DebugProtocol.Event[] = [];
  private buffer = Buffer.alloc(0);
  private sequence = 0;
  private replies = new Map<
    number,
    (response: DebugProtocol.Response) => void
  >();
  constructor(transport?: { input: Writable; output: Readable }) {
    this.input = transport?.input ?? new PassThrough();
    this.output = transport?.output ?? new PassThrough();
    if (!transport) {
      this.session = new NodeGraphDebugSession();
      this.session.setRunAsServer(true);
    }
    this.output.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      while (true) {
        const end = this.buffer.indexOf('\r\n\r\n');
        if (end < 0) break;
        const size = Number(
          /Content-Length: (\d+)/.exec(
            this.buffer.subarray(0, end).toString()
          )?.[1]
        );
        if (this.buffer.length < end + 4 + size) break;
        const message = JSON.parse(
          this.buffer.subarray(end + 4, end + 4 + size).toString('utf8')
        ) as DebugProtocol.Response | DebugProtocol.Event;
        this.buffer = this.buffer.subarray(end + 4 + size);
        if (message.type === 'response') {
          const response = message as DebugProtocol.Response;
          this.replies.get(response.request_seq)?.(response);
          this.replies.delete(response.request_seq);
        } else this.events.push(message as DebugProtocol.Event);
      }
    });
    if (this.session)
      this.session.start(this.input as PassThrough, this.output as PassThrough);
  }
  request<T extends DebugProtocol.Response = DebugProtocol.Response>(
    command: string,
    args: unknown = {}
  ): Promise<T> {
    const seq = ++this.sequence;
    const result = new Promise<T>((resolveReply) =>
      this.replies.set(seq, (response) => resolveReply(response as T))
    );
    const body = Buffer.from(
      JSON.stringify({ seq, type: 'request', command, arguments: args })
    );
    this.input.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.input.write(body);
    return result;
  }
  close() {
    this.session?.shutdown();
    this.input.destroy();
    this.output.destroy();
  }
}

const temporaryDirectories: string[] = [];
const clients: ProtocolClient[] = [];
afterEach(async () => {
  clients.forEach((client) => client.close());
  clients.length = 0;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});
const sourceFile = async (document = graph) => {
  const directory = await mkdtemp(join(tmpdir(), 'prodivix-dap-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'graph.nodegraph.json');
  await writeFile(
    path,
    JSON.stringify(encodeNodeGraphDocument(document), null, 2)
  );
  return path;
};

describe('NodeGraph VS Code DAP', () => {
  it('runs the packaged stdio adapter rather than an inert module', async () => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('../lib/debugAdapterMain.cjs', import.meta.url))],
      { stdio: 'pipe', windowsHide: true }
    );
    const client = new ProtocolClient({
      input: child.stdin,
      output: child.stdout,
    });
    clients.push(client);
    const exited = new Promise<number | null>((resolveExit, rejectExit) => {
      child.once('exit', resolveExit);
      child.once('error', rejectExit);
    });
    try {
      expect(
        (
          await client.request('initialize', {
            adapterID: 'prodivix',
            pathFormat: 'path',
          })
        ).success
      ).toBe(true);
      expect(
        (await client.request('launch', { program: await sourceFile() }))
          .success
      ).toBe(true);
      expect((await client.request('configurationDone')).success).toBe(true);
      expect((await client.request('terminate')).success).toBe(true);
      child.stdin.end();
      expect(await exited).toBe(0);
    } finally {
      child.kill();
    }
  });
  it('launches a real Program, verifies node breakpoints, steps, projects frames/values, and completes', async () => {
    const program = await sourceFile();
    const runtime = await NodeGraphDebugRuntime.launch(program, 7);
    const processLocation = runtime.locations.find(
      ({ nodeId }) => nodeId === 'process'
    )!;
    const client = new ProtocolClient();
    clients.push(client);
    expect(
      (
        await client.request('initialize', {
          adapterID: 'prodivix',
          pathFormat: 'path',
          linesStartAt1: true,
          columnsStartAt1: true,
        })
      ).success
    ).toBe(true);
    expect(
      (await client.request('launch', { program, documentRevision: 7 })).success
    ).toBe(true);
    const breakpoints =
      await client.request<DebugProtocol.SetBreakpointsResponse>(
        'setBreakpoints',
        {
          source: { path: program },
          breakpoints: [{ line: processLocation.line }, { line: 1 }],
        }
      );
    expect(
      breakpoints.body?.breakpoints.map(({ verified }) => verified)
    ).toEqual([true, false]);
    expect((await client.request('configurationDone')).success).toBe(true);
    expect((await client.request('continue', { threadId: 1 })).success).toBe(
      true
    );
    const frames = await client.request<DebugProtocol.StackTraceResponse>(
      'stackTrace',
      { threadId: 1 }
    );
    expect(frames.body?.stackFrames[0]).toMatchObject({
      name: 'process',
      line: processLocation.line,
      source: { path: program },
    });
    expect(
      (
        await client.request<DebugProtocol.ScopesResponse>('scopes', {
          frameId: 1,
        })
      ).body?.scopes[0].variablesReference
    ).toBe(1);
    expect(
      (
        await client.request<DebugProtocol.VariablesResponse>('variables', {
          variablesReference: 1,
        })
      ).body?.variables.map(({ name }) => name)
    ).toContain('start');
    expect((await client.request('next', { threadId: 1 })).success).toBe(true);
    expect(
      (
        await client.request<DebugProtocol.StackTraceResponse>('stackTrace', {
          threadId: 1,
        })
      ).body?.stackFrames[0].name
    ).toBe('end');
    expect((await client.request('stepIn', { threadId: 1 })).success).toBe(
      true
    );
    expect((await client.request('continue', { threadId: 1 })).success).toBe(
      true
    );
    expect(
      client.events.some(
        ({ event, body }) => event === 'stopped' && body.reason === 'breakpoint'
      )
    ).toBe(true);
    expect(
      client.events.filter(({ event }) => event === 'terminated')
    ).toHaveLength(1);
  });

  it('fails closed on changed source, missing files, invalid documents, and revisions', async () => {
    const program = await sourceFile();
    const runtime = await NodeGraphDebugRuntime.launch(program);
    await writeFile(program, '{}');
    await expect(runtime.command('step-over')).rejects.toThrow(
      'source changed'
    );
    expect(runtime.snapshot().status).toBe('cancelled');
    await expect(NodeGraphDebugRuntime.launch(program)).rejects.toThrow();
    await expect(
      NodeGraphDebugRuntime.launch(program + '.missing')
    ).rejects.toThrow();
    await expect(NodeGraphDebugRuntime.launch(program, 0)).rejects.toThrow(
      'positive integer'
    );
    await writeFile(program, Buffer.from([0xff]));
    await expect(NodeGraphDebugRuntime.launch(program)).rejects.toThrow(
      'UTF-8'
    );
  });

  it('converts zero-based client source coordinates without moving the breakpoint to another node', async () => {
    const program = await sourceFile();
    const runtime = await NodeGraphDebugRuntime.launch(program);
    const location = runtime.locations.find(
      ({ nodeId }) => nodeId === 'process'
    )!;
    const client = new ProtocolClient();
    clients.push(client);
    await client.request('initialize', {
      adapterID: 'prodivix',
      pathFormat: 'path',
      linesStartAt1: false,
      columnsStartAt1: false,
    });
    await client.request('launch', { program });
    const response = await client.request<DebugProtocol.SetBreakpointsResponse>(
      'setBreakpoints',
      { source: { path: program }, breakpoints: [{ line: location.line - 1 }] }
    );
    expect(response.body?.breakpoints[0]).toMatchObject({
      verified: true,
      line: location.line - 1,
      column: location.column - 1,
    });
    await client.request('configurationDone');
    await client.request('continue', { threadId: 1 });
    const frames = await client.request<DebugProtocol.StackTraceResponse>(
      'stackTrace',
      { threadId: 1 }
    );
    expect(frames.body?.stackFrames[0]).toMatchObject({
      name: 'process',
      line: location.line - 1,
    });
  });

  it('rejects unregistered executors and privileged capabilities instead of executing source', async () => {
    const document = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'process'
          ? {
              ...node,
              descriptorRef: { id: 'untrusted.javascript', version: '1' },
            }
          : node
      ),
    };
    await expect(
      NodeGraphDebugRuntime.launch(await sourceFile(document))
    ).rejects.toThrow();
    const privileged = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'process'
          ? { ...node, descriptorRef: { id: 'core.data.query', version: '1' } }
          : node
      ),
    };
    await expect(
      NodeGraphDebugRuntime.launch(await sourceFile(privileged))
    ).rejects.toThrow();
  });

  it('returns request errors before launch and cancels a live session exactly once', async () => {
    const client = new ProtocolClient();
    clients.push(client);
    expect((await client.request('next')).success).toBe(false);
    expect(
      (await client.request('launch', { program: await sourceFile() })).success
    ).toBe(true);
    expect((await client.request('terminate')).success).toBe(true);
    expect((await client.request('disconnect')).success).toBe(true);
    expect(
      client.events.filter(({ event }) => event === 'terminated')
    ).toHaveLength(1);
  });
});
