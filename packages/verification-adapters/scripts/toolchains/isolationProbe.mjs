import { spawn } from 'node:child_process';
import dns from 'node:dns';
import {
  existsSync,
  lstatSync,
  readFileSync,
  statfsSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

const PROBE_TIMEOUT_MS = 2_000;
const EXTERNAL_ADDRESS = '192.0.2.1';
const EXTERNAL_HOST = 'example.com';

const settleAttempt = (start) =>
  new Promise((resolveAttempt) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveAttempt(value);
    };
    const timeout = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    try {
      start(finish);
    } catch {
      finish(true);
    }
  });

const httpDenied = await settleAttempt((finish) => {
  const request = http.get(
    {
      host: EXTERNAL_ADDRESS,
      port: 80,
      path: '/',
      timeout: PROBE_TIMEOUT_MS - 250,
    },
    () => {
      request.destroy();
      finish(false);
    }
  );
  request.once('timeout', () => {
    request.destroy();
    finish(true);
  });
  request.once('error', () => finish(true));
});

const netDenied = await settleAttempt((finish) => {
  const socket = net.connect(443, EXTERNAL_ADDRESS, () => {
    socket.destroy();
    finish(false);
  });
  socket.setTimeout(PROBE_TIMEOUT_MS - 250, () => {
    socket.destroy();
    finish(true);
  });
  socket.once('error', () => finish(true));
});

const dnsDenied = await settleAttempt((finish) => {
  dns.resolve4(EXTERNAL_HOST, (error) => finish(Boolean(error)));
});

const workerNetworkDenied = await settleAttempt((finish) => {
  const worker = new Worker(
    `
      const { parentPort } = require('node:worker_threads');
      const net = require('node:net');
      const socket = net.connect(443, ${JSON.stringify(EXTERNAL_ADDRESS)}, () => {
        socket.destroy();
        parentPort.postMessage(false);
      });
      socket.setTimeout(${PROBE_TIMEOUT_MS - 250}, () => {
        socket.destroy();
        parentPort.postMessage(true);
      });
      socket.once('error', () => parentPort.postMessage(true));
    `,
    { eval: true }
  );
  worker.once('message', (denied) => {
    void worker.terminate();
    finish(denied === true);
  });
  worker.once('error', () => finish(true));
});

const childNetworkDenied = await settleAttempt((finish) => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
        const net = require('node:net');
        const socket = net.connect(443, ${JSON.stringify(EXTERNAL_ADDRESS)}, () => {
          socket.destroy();
          process.exit(7);
        });
        socket.setTimeout(${PROBE_TIMEOUT_MS - 250}, () => {
          socket.destroy();
          process.exit(0);
        });
        socket.once('error', () => process.exit(0));
      `,
    ],
    {
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      stdio: 'ignore',
      windowsHide: true,
    }
  );
  child.once('error', () => finish(true));
  child.once('close', (code) => finish(code === 0));
});

const symlinkPath = resolve('.prodivix/isolation-symlink-escape');
let symlinkEscapeDenied = false;
try {
  const target =
    process.platform === 'win32'
      ? (process.env.SystemRoot ?? 'C:\\Windows')
      : '/etc';
  symlinkSync(target, symlinkPath, 'dir');
  if (!lstatSync(symlinkPath).isSymbolicLink()) {
    throw new Error('Isolation probe did not create a symbolic link.');
  }
  try {
    const escapedWritePath = resolve(
      symlinkPath,
      '.prodivix-isolation-write-probe'
    );
    writeFileSync(escapedWritePath, 'forbidden');
    unlinkSync(escapedWritePath);
  } catch {
    symlinkEscapeDenied = true;
  }
} catch {
  symlinkEscapeDenied = true;
} finally {
  try {
    unlinkSync(symlinkPath);
  } catch {
    // A denied or already-removed adversarial link is contained.
  }
}

const rootWriteTarget =
  process.platform === 'win32'
    ? resolve(dirname(process.execPath), '.prodivix-root-write-probe')
    : '/opt/prodivix/.prodivix-root-write-probe';
let rootFilesystemWriteDenied = false;
try {
  writeFileSync(rootWriteTarget, 'forbidden');
  unlinkSync(rootWriteTarget);
} catch {
  rootFilesystemWriteDenied = true;
}

const forbiddenEnvironmentPattern =
  /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY|SESSION)/iu;
const inheritedCredentialKeyCount = Object.keys(process.env).filter((key) =>
  forbiddenEnvironmentPattern.test(key)
).length;
const hostMountAbsent =
  !existsSync('/host') &&
  !existsSync('/github') &&
  !existsSync('/home/runner/work');
const containerSocketAbsent =
  !existsSync('/run/podman/podman.sock') &&
  !existsSync('/run/docker.sock') &&
  !existsSync('/var/run/docker.sock');

let linuxAttestation;
if (process.platform === 'linux') {
  const status = readFileSync('/proc/self/status', 'utf8');
  const statusValue = (name) =>
    status
      .split('\n')
      .find((line) => line.startsWith(`${name}:`))
      ?.slice(name.length + 1)
      .trim();
  const mountInfo = readFileSync('/proc/self/mountinfo', 'utf8');
  const mountIsTmpfs = (mountPoint) =>
    mountInfo.split('\n').some((line) => {
      const [before, after] = line.split(' - ');
      return (
        before?.split(' ')[4] === mountPoint &&
        after?.split(' ')[0] === 'tmpfs'
      );
    });
  const readControl = (name) =>
    readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim();
  const workspaceStats = statfsSync('/workspace');
  const temporaryStats = statfsSync('/tmp');
  linuxAttestation = {
    cpuMaximum: readControl('cpu.max'),
    effectiveCapabilities: statusValue('CapEff'),
    gid: process.getgid(),
    memoryMaximum: readControl('memory.max'),
    noNewPrivileges: statusValue('NoNewPrivs'),
    pidsMaximum: readControl('pids.max'),
    temporaryMaximumBytes:
      Number(temporaryStats.bsize) * Number(temporaryStats.blocks),
    temporaryTmpfs: mountIsTmpfs('/tmp'),
    uid: process.getuid(),
    workspaceMaximumBytes:
      Number(workspaceStats.bsize) * Number(workspaceStats.blocks),
    workspaceTmpfs: mountIsTmpfs('/workspace'),
  };
}

const egressAttemptCount = 5;
const egressSuccessCount = [
  httpDenied,
  netDenied,
  dnsDenied,
  workerNetworkDenied,
  childNetworkDenied,
].filter((denied) => !denied).length;

const result = {
  childNetworkDenied,
  containerSocketAbsent,
  dnsDenied,
  egressAttemptCount,
  egressSuccessCount,
  format: 'prodivix.controlled-static-isolation-probe.v1',
  hostMountAbsent,
  httpDenied,
  inheritedCredentialKeyCount,
  ...(linuxAttestation ? { linuxAttestation } : {}),
  netDenied,
  rootFilesystemWriteDenied,
  symlinkEscapeDenied,
  workerNetworkDenied,
};

if (
  !httpDenied ||
  !netDenied ||
  !dnsDenied ||
  !workerNetworkDenied ||
  !childNetworkDenied ||
  !symlinkEscapeDenied ||
  !hostMountAbsent ||
  !containerSocketAbsent ||
  inheritedCredentialKeyCount !== 0 ||
  egressSuccessCount !== 0 ||
  (linuxAttestation !== undefined &&
    (!rootFilesystemWriteDenied ||
      linuxAttestation.uid === 0 ||
      linuxAttestation.gid === 0 ||
      linuxAttestation.effectiveCapabilities !== '0000000000000000' ||
      linuxAttestation.noNewPrivileges !== '1' ||
      !linuxAttestation.workspaceTmpfs ||
      !linuxAttestation.temporaryTmpfs ||
      linuxAttestation.workspaceMaximumBytes > 1024 * 1024 * 1024 ||
      linuxAttestation.temporaryMaximumBytes > 1024 * 1024 * 1024 ||
      linuxAttestation.memoryMaximum !== String(2_048 * 1024 * 1024) ||
      linuxAttestation.pidsMaximum !== '256' ||
      linuxAttestation.cpuMaximum !== '200000 100000'))
) {
  throw new Error('Controlled static toolchain isolation probe failed.');
}

process.stdout.write(JSON.stringify(result));
