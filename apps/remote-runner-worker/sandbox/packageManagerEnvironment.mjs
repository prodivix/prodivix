export const sandboxCorepackHome = '/tmp/.cache/node/corepack';

export const sandboxInstallCachePaths = Object.freeze([
  '/tmp/.prodivix-npm-cache',
  '/tmp/.prodivix-pnpm-store',
  '/tmp/.prodivix-yarn-cache',
  '/tmp/.prodivix-bun-cache',
]);

const providerEnvironmentNames = new Set([
  'PATH',
  'HOME',
  'XDG_CACHE_HOME',
  'LOCALAPPDATA',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'NPM_CONFIG_PROXY',
  'NPM_CONFIG_HTTPS_PROXY',
  'NPM_CONFIG_CACHE',
  'NPM_CONFIG_STORE_DIR',
  'YARN_CACHE_FOLDER',
  'BUN_INSTALL_CACHE_DIR',
]);

/**
 * Only the installation phase can use the infrastructure proxy. Both phases
 * use one execution-local Corepack tool cache; dependency caches are retired
 * before permission is granted and the whole tool cache dies with the sandbox.
 */
export const createSandboxPackageManagerEnvironments = (
  imageEnvironment,
  publicEnvironment
) => {
  if (!Array.isArray(publicEnvironment))
    throw new TypeError('Sandbox public environment is invalid.');
  const publicNames = new Set();
  const entries = publicEnvironment.map((entry) => {
    if (
      !entry ||
      typeof entry.name !== 'string' ||
      typeof entry.value !== 'string' ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry.name) ||
      publicNames.has(entry.name)
    )
      throw new TypeError('Sandbox public environment entry is invalid.');
    const upperName = entry.name.toUpperCase();
    if (
      providerEnvironmentNames.has(upperName) ||
      upperName.startsWith('COREPACK_') ||
      (upperName.startsWith('NODE_') && upperName !== 'NODE_ENV')
    )
      throw new TypeError(
        'Sandbox public environment overrides runtime policy.'
      );
    publicNames.add(entry.name);
    return [entry.name, entry.value];
  });
  const executionEnvironment = Object.fromEntries([
    ...entries,
    ['PATH', imageEnvironment.PATH],
    ['HOME', '/tmp'],
    ['COREPACK_HOME', sandboxCorepackHome],
    ['COREPACK_ENABLE_NETWORK', '0'],
    ['COREPACK_DEFAULT_TO_LATEST', '0'],
    ['COREPACK_ENABLE_AUTO_PIN', '0'],
    ['COREPACK_ENABLE_DOWNLOAD_PROMPT', '0'],
    ['COREPACK_ENV_FILE', '0'],
    ['NODE_USE_ENV_PROXY', '0'],
  ]);
  const installEnvironment = {
    ...executionEnvironment,
    COREPACK_ENABLE_NETWORK: '1',
    NODE_USE_ENV_PROXY: '1',
    npm_config_cache: sandboxInstallCachePaths[0],
    npm_config_store_dir: sandboxInstallCachePaths[1],
    YARN_CACHE_FOLDER: sandboxInstallCachePaths[2],
    BUN_INSTALL_CACHE_DIR: sandboxInstallCachePaths[3],
  };
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY']) {
    if (typeof imageEnvironment[name] === 'string')
      installEnvironment[name] = imageEnvironment[name];
  }
  return Object.freeze({
    executionEnvironment: Object.freeze(executionEnvironment),
    installEnvironment: Object.freeze(installEnvironment),
  });
};
