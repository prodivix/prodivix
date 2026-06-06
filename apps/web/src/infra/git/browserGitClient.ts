import LightningFS from '@isomorphic-git/lightning-fs';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

export type BrowserGitAuth = git.GitAuth;
export type BrowserGitAuthCallback = git.AuthCallback;
export type BrowserGitProgressCallback = git.ProgressCallback;

export type BrowserGitRepositoryOptions = {
  dir: string;
  gitdir?: string;
};

export type BrowserGitClientOptions = BrowserGitRepositoryOptions & {
  fs?: LightningFS;
  fsName?: string;
  onAuth?: BrowserGitAuthCallback;
  onAuthFailure?: git.AuthFailureCallback;
  onAuthSuccess?: git.AuthSuccessCallback;
  onProgress?: BrowserGitProgressCallback;
};

export type BrowserGitCloneOptions = {
  url: string;
  ref?: string;
  remote?: string;
  depth?: number;
  singleBranch?: boolean;
  noCheckout?: boolean;
};

export type BrowserGitFetchOptions = {
  remote?: string;
  ref?: string;
  remoteRef?: string;
  depth?: number;
  singleBranch?: boolean;
  tags?: boolean;
};

export type BrowserGitPushOptions = {
  remote?: string;
  ref?: string;
  remoteRef?: string;
  force?: boolean;
};

export type BrowserGitCommitAuthor = {
  name: string;
  email: string;
  timestamp?: number;
  timezoneOffset?: number;
};

export type BrowserGitCommitOptions = {
  message: string;
  author: BrowserGitCommitAuthor;
  committer?: BrowserGitCommitAuthor;
  ref?: string;
};

export type BrowserGitDiffEntry = {
  filepath: string;
  oldOid?: string;
  newOid?: string;
  status: 'added' | 'deleted' | 'modified' | 'unchanged' | 'untracked';
};

const DEFAULT_FS_NAME = 'mfe-browser-git';

const toText = (content: Uint8Array): string =>
  new TextDecoder().decode(content);

const readBlobText = async (
  fs: LightningFS,
  repository: BrowserGitRepositoryOptions,
  ref: string,
  filepath: string
): Promise<string | undefined> => {
  try {
    const oid = await resolveGitRef(fs, repository, ref);
    const { blob } = await git.readBlob({
      fs,
      dir: repository.dir,
      gitdir: repository.gitdir,
      oid,
      filepath,
    });
    return toText(blob);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'NotFoundError'
    ) {
      return undefined;
    }
    throw error;
  }
};

const readWorkingFileText = async (
  fs: LightningFS,
  dir: string,
  filepath: string
): Promise<string | undefined> => {
  try {
    return await fs.promises.readFile(`${dir}/${filepath}`, {
      encoding: 'utf8',
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
};

const hashTextBlob = async (content: string | undefined) =>
  content === undefined
    ? undefined
    : (
        await git.hashBlob({
          object: new TextEncoder().encode(content),
        })
      ).oid;

const resolveGitRef = async (
  fs: LightningFS,
  repository: BrowserGitRepositoryOptions,
  ref: string
) => {
  try {
    return await git.resolveRef({
      fs,
      dir: repository.dir,
      gitdir: repository.gitdir,
      ref,
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'NotFoundError'
    ) {
      return ref;
    }
    throw error;
  }
};

/**
 * Creates the browser-side Git boundary used by export, history, and future PIR diff flows.
 * Keep PIR semantic diffing above this layer: this client only loads and persists Git blobs.
 */
export const createBrowserGitClient = ({
  dir,
  gitdir,
  fs = new LightningFS(DEFAULT_FS_NAME),
  fsName,
  onAuth,
  onAuthFailure,
  onAuthSuccess,
  onProgress,
}: BrowserGitClientOptions) => {
  if (fsName) {
    fs.init(fsName);
  }

  const repository = { dir, gitdir };
  const commonRemoteOptions = {
    fs,
    http,
    ...repository,
    onAuth,
    onAuthFailure,
    onAuthSuccess,
    onProgress,
  };

  return {
    fs,
    repository,

    clone: (options: BrowserGitCloneOptions) =>
      git.clone({
        ...commonRemoteOptions,
        ...options,
      }),

    fetch: (options: BrowserGitFetchOptions = {}) =>
      git.fetch({
        ...commonRemoteOptions,
        ...options,
      }),

    push: (options: BrowserGitPushOptions = {}) =>
      git.push({
        ...commonRemoteOptions,
        ...options,
      }),

    currentBranch: (fullname = false) =>
      git.currentBranch({
        fs,
        ...repository,
        fullname,
      }),

    listFiles: (ref?: string) =>
      git.listFiles({
        fs,
        ...repository,
        ref,
      }),

    log: (ref?: string, depth?: number) =>
      git.log({
        fs,
        ...repository,
        ref,
        depth,
      }),

    statusMatrix: (filepaths?: string[]) =>
      git.statusMatrix({
        fs,
        ...repository,
        filepaths,
      }),

    readFileAtRef: async (ref: string, filepath: string) =>
      readBlobText(fs, repository, ref, filepath),

    readWorkingFile: (filepath: string) =>
      readWorkingFileText(fs, dir, filepath),

    writeWorkingFile: (filepath: string, content: string) =>
      fs.promises.writeFile(`${dir}/${filepath}`, content, 'utf8'),

    add: (filepath: string | string[]) =>
      git.add({
        fs,
        ...repository,
        filepath,
      }),

    commit: (options: BrowserGitCommitOptions) =>
      git.commit({
        fs,
        ...repository,
        ...options,
      }),

    getRawFileDiff: async (filepath: string): Promise<BrowserGitDiffEntry> => {
      const [status] = await git.statusMatrix({
        fs,
        ...repository,
        filepaths: [filepath],
      });

      if (!status) {
        return { filepath, status: 'unchanged' };
      }

      const [, head, workdir, stage] = status;
      const oldOid = await hashTextBlob(
        head === 0
          ? undefined
          : await readBlobText(fs, repository, 'HEAD', filepath)
      );
      const newOid = await hashTextBlob(
        workdir === 0 ? undefined : await readWorkingFileText(fs, dir, filepath)
      );

      if (head === 0 && workdir !== 0) {
        return {
          filepath,
          newOid,
          status: stage === 0 ? 'untracked' : 'added',
        };
      }
      if (head !== 0 && workdir === 0) {
        return { filepath, oldOid, status: 'deleted' };
      }
      if (oldOid && newOid && oldOid !== newOid) {
        return { filepath, oldOid, newOid, status: 'modified' };
      }
      return { filepath, oldOid, newOid, status: 'unchanged' };
    },
  };
};

export type BrowserGitClient = ReturnType<typeof createBrowserGitClient>;
