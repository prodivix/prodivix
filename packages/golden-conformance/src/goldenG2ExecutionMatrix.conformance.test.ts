import { beforeAll, describe, expect, it } from 'vitest';
import { projectExecutableProjectRuntimeFiles } from '@prodivix/runtime-core';
import {
  projectGoldenTestSemantics,
  runGoldenG2ExecutionMatrix,
  type GoldenG2ExecutionMatrixReport,
} from './goldenG2ExecutionMatrix';

describe('G2 Golden Browser/Remote execution contract matrix', () => {
  let matrix: GoldenG2ExecutionMatrixReport;

  beforeAll(async () => {
    matrix = await runGoldenG2ExecutionMatrix();
  });

  it('uses one neutral snapshot across every supported provider/profile pair', () => {
    expect(matrix.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      target: {
        presetId: 'react-vite',
        framework: 'react',
        runtime: 'vite',
      },
    });
    expect(matrix.snapshot.contentDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(matrix.snapshot.entrypoints.map((entry) => entry.kind)).toEqual([
      'build',
      'preview',
      'test',
    ]);
    expect(matrix.snapshot.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        '.prodivix/routes.json',
        'src/App.test.tsx',
        'src/components/page-checkout/GoldenCheckout.tsx',
        'src/components/component-order-summary/GoldenOrderSummary.tsx',
      ])
    );
    const packageFile = matrix.snapshot.files.find(
      (file) => file.path === 'package.json'
    );
    const checkoutModule = matrix.snapshot.files.find(
      (file) => file.path === 'src/components/page-checkout/GoldenCheckout.tsx'
    );
    const readFile = (contents: string | Uint8Array) =>
      typeof contents === 'string'
        ? contents
        : new TextDecoder().decode(contents);
    expect(JSON.parse(readFile(packageFile?.contents ?? ''))).toMatchObject({
      dependencies: { antd: '5.28.0' },
    });
    expect(readFile(checkoutModule?.contents ?? '')).toContain(
      "import { Button } from 'antd';"
    );
    expect(
      matrix.snapshot.files.find((file) => file.path === 'public/logo.png')
        ?.contents
    ).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(matrix.browser.mountedFilePaths).toEqual(
      projectExecutableProjectRuntimeFiles(matrix.snapshot)
        .map((file) => file.path)
        .sort()
    );
    expect(matrix.browser.resolvedDigests).toEqual([
      matrix.snapshot.contentDigest,
      matrix.snapshot.contentDigest,
    ]);
    expect(matrix.remote.uploadedDigests).toEqual([
      matrix.snapshot.contentDigest,
      matrix.snapshot.contentDigest,
      matrix.snapshot.contentDigest,
    ]);
    expect(matrix.browser.installCount).toBe(1);
    expect(matrix.browser.commandCount).toBe(3);
  });

  it('keeps Preview lifecycle differences explicit while preserving readiness', () => {
    expect(matrix.browser.preview.provider).toMatchObject({
      profiles: ['preview'],
      isolation: 'sandboxed',
    });
    expect(matrix.browser.preview.artifact).toMatchObject({
      kind: 'custom',
      mediaType: 'text/html',
      uri: 'https://browser-preview.golden.test/',
    });
    expect(matrix.browser.preview.terminal.status).toBe('cancelled');

    expect(matrix.remote.preview.provider).toMatchObject({
      id: 'prodivix.remote.preview',
      profiles: ['preview'],
      isolation: 'remote-isolated',
    });
    expect(matrix.remote.preview.result.status).toBe('succeeded');
    expect(matrix.remote.preview.artifact).toMatchObject({
      kind: 'bundle',
      mediaType: 'application/vnd.prodivix.execution-preview-bundle+json',
      uri: expect.stringMatching(
        /^https:\/\/[a-f0-9]{64}\.preview\.golden\.test\/$/u
      ),
      metadata: {
        snapshotDigest: matrix.snapshot.contentDigest,
        readiness: 'ready',
        health: 'healthy',
        entryFilePath: 'index.html',
      },
    });
  });

  it('publishes equivalent canonical Test semantics from Browser and Remote', () => {
    expect(matrix.browser.test.result.status).toBe('succeeded');
    expect(matrix.remote.test.result.status).toBe('succeeded');
    expect(matrix.browser.test.artifact.mediaType).toBe(
      'application/vnd.prodivix.test-report+json'
    );
    expect(matrix.remote.test.artifact).toMatchObject({
      mediaType: 'application/vnd.prodivix.test-report+json',
      metadata: {
        snapshotDigest: matrix.snapshot.contentDigest,
        status: 'passed',
      },
    });
    expect(projectGoldenTestSemantics(matrix.remote.test.report)).toEqual(
      projectGoldenTestSemantics(matrix.browser.test.report)
    );
    expect(matrix.remote.test.report.files[0]?.sourceTrace).toEqual(
      matrix.browser.test.report.files[0]?.sourceTrace
    );
    expect(
      matrix.remote.test.report.files[0]?.sourceTrace?.length
    ).toBeGreaterThan(0);
    expect(projectGoldenTestSemantics(matrix.remote.test.report)).toMatchObject(
      {
        status: 'passed',
        summary: {
          totalFiles: 1,
          passedFiles: 1,
          totalCases: 1,
          passedCases: 1,
        },
      }
    );
  });

  it('declares Build as Remote-only and verifies its canonical bundle result', () => {
    expect(matrix.browser.build).toEqual({ availability: 'unsupported' });
    expect(matrix.remote.build.provider).toMatchObject({
      id: 'prodivix.remote.build',
      profiles: ['build'],
      isolation: 'remote-isolated',
    });
    expect(matrix.remote.build.result.status).toBe('succeeded');
    expect(matrix.remote.build.artifact).toMatchObject({
      kind: 'bundle',
      mediaType: 'application/vnd.prodivix.execution-build-bundle+json',
      metadata: {
        format: 'prodivix.execution-build-bundle.v1',
        snapshotDigest: matrix.snapshot.contentDigest,
        presetId: 'react-vite',
      },
    });
  });
});
