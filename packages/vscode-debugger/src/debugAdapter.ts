import { basename, resolve } from 'node:path';
import {
  DebugSession,
  InitializedEvent,
  StoppedEvent,
  TerminatedEvent,
  Thread,
} from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { NodeGraphDebugSnapshot } from '@prodivix/nodegraph';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { NodeGraphDebugRuntime } from './nodeGraphDebugRuntime.js';

type LaunchArguments = DebugProtocol.LaunchRequestArguments & {
  program: string;
  documentRevision?: number;
  stopOnEntry?: boolean;
};

/** DAP maps UI requests onto the revision-bound domain controller, which owns execution, fences, and value projection. */
export class NodeGraphDebugSession extends DebugSession {
  private runtime?: NodeGraphDebugRuntime;
  private stopOnEntry = true;
  private terminated = false;

  constructor(obsoleteLinesStartAt1?: boolean, obsoleteIsServer?: boolean) {
    super(obsoleteLinesStartAt1, obsoleteIsServer);
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse
  ): void {
    response.body = {
      supportsConfigurationDoneRequest: true,
      supportsTerminateRequest: true,
    };
    this.sendResponse(response);
  }

  protected async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: LaunchArguments
  ): Promise<void> {
    try {
      if (this.runtime)
        throw new Error('A NodeGraph debug session is already launched.');
      if (typeof args.program !== 'string' || !args.program.trim())
        throw new Error('program must name a .nodegraph.json wire document.');
      this.runtime = await NodeGraphDebugRuntime.launch(
        args.program,
        args.documentRevision
      );
      this.stopOnEntry = args.stopOnEntry !== false;
      this.sendResponse(response);
      this.sendEvent(new InitializedEvent());
    } catch (error) {
      this.reject(response, error);
    }
  }

  protected async configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse
  ): Promise<void> {
    if (!this.runtime) {
      this.reject(
        response,
        new Error('Launch a NodeGraph document before configurationDone.')
      );
      return;
    }
    if (this.stopOnEntry) {
      this.sendResponse(response);
      this.sendEvent(new StoppedEvent('entry', 1));
    } else await this.run(response, 'continue');
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads:
        this.runtime && !this.terminated
          ? [new Thread(1, 'NodeGraph Runtime')]
          : [],
    };
    this.sendResponse(response);
  }

  protected async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): Promise<void> {
    try {
      const runtime = this.requireRuntime();
      const sourceMatches =
        args.source.path &&
        resolve(this.convertClientPathToDebugger(args.source.path)) ===
          runtime.sourcePath;
      const locations = (args.breakpoints ?? []).map(({ line }) => {
        const debuggerLine = this.convertClientLineToDebugger(line);
        return sourceMatches
          ? runtime.locations.find(
              (location) =>
                debuggerLine >= location.line &&
                debuggerLine <= location.endLine
            )
          : undefined;
      });
      await runtime.setBreakpoints([
        ...new Set(
          locations.flatMap((location) => (location ? [location.nodeId] : []))
        ),
      ]);
      response.body = {
        breakpoints: locations.map((location, index) =>
          location
            ? {
                id: index + 1,
                verified: true,
                line: this.convertDebuggerLineToClient(location.line),
                column: this.convertDebuggerColumnToClient(location.column),
                source: args.source,
              }
            : {
                verified: false,
                message:
                  'The requested source line is not a node in this launched revision.',
              }
        ),
      };
      this.sendResponse(response);
    } catch (error) {
      this.reject(response, error);
    }
  }

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse
  ): void {
    try {
      const runtime = this.requireRuntime();
      const frames = runtime.snapshot().callStack.map((frame, index) => {
        const location = runtime.locations.find(
          ({ nodeId }) => nodeId === frame.nodeId
        );
        return {
          id: index + 1,
          name: frame.nodeId,
          source: {
            name: basename(runtime.sourcePath),
            path: this.convertDebuggerPathToClient(runtime.sourcePath),
          },
          line: this.convertDebuggerLineToClient(location?.line ?? 1),
          column: this.convertDebuggerColumnToClient(location?.column ?? 1),
        };
      });
      response.body = { stackFrames: frames, totalFrames: frames.length };
      this.sendResponse(response);
    } catch (error) {
      this.reject(response, error);
    }
  }

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments
  ): void {
    try {
      if (!this.requireRuntime().snapshot().callStack[args.frameId - 1])
        throw new Error('The selected frame is no longer active.');
      response.body = {
        scopes: [
          {
            name: 'Bounded node outputs',
            variablesReference: 1,
            expensive: false,
          },
        ],
      };
      this.sendResponse(response);
    } catch (error) {
      this.reject(response, error);
    }
  }

  protected variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    try {
      if (args.variablesReference !== 1)
        throw new Error('Unknown variables reference.');
      response.body = {
        variables: Object.entries(
          this.requireRuntime().snapshot().outputsByNodeId
        )
          .sort(([a], [b]) => compareUnicodeCodePoints(a, b))
          .map(([name, value]) => ({
            name,
            value: canonicalJsonText(value),
            type:
              value === null
                ? 'null'
                : Array.isArray(value)
                  ? 'array'
                  : typeof value,
            variablesReference: 0,
          })),
      };
      this.sendResponse(response);
    } catch (error) {
      this.reject(response, error);
    }
  }

  protected async continueRequest(
    response: DebugProtocol.ContinueResponse
  ): Promise<void> {
    response.body = { allThreadsContinued: true };
    await this.run(response, 'continue');
  }
  protected async nextRequest(
    response: DebugProtocol.NextResponse
  ): Promise<void> {
    await this.run(response, 'step-over');
  }
  protected async stepInRequest(
    response: DebugProtocol.StepInResponse
  ): Promise<void> {
    await this.run(response, 'step-into');
  }
  protected async stepOutRequest(
    response: DebugProtocol.StepOutResponse
  ): Promise<void> {
    await this.run(response, 'step-out');
  }
  protected async pauseRequest(
    response: DebugProtocol.PauseResponse
  ): Promise<void> {
    try {
      await this.requireRuntime().command('pause');
      this.sendResponse(response);
    } catch (error) {
      this.reject(response, error);
    }
  }
  protected async disconnectRequest(
    response: DebugProtocol.DisconnectResponse
  ): Promise<void> {
    await this.finish(response);
  }
  protected async terminateRequest(
    response: DebugProtocol.TerminateResponse
  ): Promise<void> {
    await this.finish(response);
  }

  private requireRuntime(): NodeGraphDebugRuntime {
    if (!this.runtime)
      throw new Error('No NodeGraph debug revision has been launched.');
    return this.runtime;
  }

  private async run(
    response: DebugProtocol.Response,
    kind: 'continue' | 'step-into' | 'step-over' | 'step-out'
  ): Promise<void> {
    try {
      const snapshot = await this.requireRuntime().command(kind);
      this.sendResponse(response);
      this.publish(snapshot, kind === 'continue' ? 'breakpoint' : 'step');
    } catch (error) {
      this.reject(response, error);
      if (this.runtime?.snapshot().status === 'cancelled') this.end();
    }
  }

  private publish(snapshot: NodeGraphDebugSnapshot, reason: string): void {
    if (snapshot.status === 'paused')
      this.sendEvent(new StoppedEvent(reason, 1));
    else if (
      snapshot.status === 'completed' ||
      snapshot.status === 'cancelled' ||
      snapshot.status === 'detached' ||
      snapshot.status === 'failed'
    ) {
      if (snapshot.issue)
        this.sendEvent(
          new StoppedEvent('exception', 1, snapshot.issue.safeMessage)
        );
      this.end();
    }
  }

  private async finish(response: DebugProtocol.Response): Promise<void> {
    try {
      const status = this.runtime?.snapshot().status;
      if (status === 'paused' || status === 'running')
        await this.runtime!.command('cancel');
      this.sendResponse(response);
      this.end();
    } catch (error) {
      this.reject(response, error);
    }
  }

  private end(): void {
    if (!this.terminated) {
      this.terminated = true;
      this.sendEvent(new TerminatedEvent());
    }
  }
  private reject(response: DebugProtocol.Response, error: unknown): void {
    this.sendErrorResponse(
      response,
      1,
      error instanceof Error ? error.message : 'NodeGraph debug request failed.'
    );
  }
}

export const startDebugAdapter = (): void =>
  DebugSession.run(NodeGraphDebugSession);
