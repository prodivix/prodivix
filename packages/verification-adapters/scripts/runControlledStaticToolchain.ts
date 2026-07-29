import {
  encodeControlledStaticToolchainResult,
  runControlledStaticToolchain,
} from './controlledStaticToolchainRunner';

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
}

try {
  const result = await runControlledStaticToolchain(Buffer.concat(chunks));
  process.stdout.write(encodeControlledStaticToolchainResult(result));
} catch (error) {
  const detail =
    error instanceof Error
      ? error.message
          .replace(/[A-Za-z]:\\[^:\r\n"']*/gu, '<private-windows-path>')
          .slice(0, 4_096)
      : 'unknown failure';
  process.stderr.write(
    `Controlled static toolchain execution failed: ${detail}\n`
  );
  process.exitCode = 1;
}
