export type LibraryEntry = {
  id: string;
  label: string;
};

export type LibraryScope = 'component' | 'icon' | 'utility';
export type LibraryMode = 'locked' | 'latest' | 'dev';
export type LibraryStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'warning'
  | 'error';

export type PackageSizeThresholds = {
  cautionKb: number;
  warningKb: number;
  criticalKb: number;
};

export type LibraryCatalog = {
  id: string;
  label: string;
  scope: LibraryScope;
  packageName?: string;
  packageDependencies?: Array<{
    name: string;
    version?: string;
    kind?: 'dependency' | 'devDependency' | 'peerDependency';
  }>;
  description: string;
  license: string;
  packageSizeKb: number;
  components: string[];
  versions: string[];
};

export type ActiveLibrary = {
  id: string;
  label: string;
  scope: LibraryScope;
  version: string;
  status: LibraryStatus;
  description: string;
  license: string;
  packageSizeKb: number;
  components: string[];
  versions: string[];
  isRegistered: boolean;
  errorMessage: string | null;
  updatedAt: number;
};

export type PersistedLibrary = {
  id: string;
  scope: LibraryScope;
  version: string;
  status: LibraryStatus;
};
