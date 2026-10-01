import fs from 'node:fs/promises';
import path from 'node:path';

const RELEASE_TYPES = new Set(['patch', 'minor', 'major']);
const PACKAGE_PATHS = [
  'packages/shared/package.json',
  'packages/themes/package.json',
  'packages/ui/package.json',
];

const releaseType = process.argv[2];

if (!RELEASE_TYPES.has(releaseType)) {
  console.error('Usage: node scripts/bump-packages.mjs <patch|minor|major>');
  process.exit(1);
}

function bumpVersion(version) {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));

  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isInteger(part) || part < 0)
  ) {
    throw new Error(`Unsupported semver version: ${version}`);
  }

  const [major, minor, patch] = parts;

  if (releaseType === 'major') {
    return `${major + 1}.0.0`;
  }

  if (releaseType === 'minor') {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

for (const packagePath of PACKAGE_PATHS) {
  const absolutePath = path.resolve(packagePath);
  const packageJson = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
  const nextVersion = bumpVersion(packageJson.version);

  packageJson.version = nextVersion;
  await fs.writeFile(
    absolutePath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8'
  );
  console.log(`${packageJson.name}@${nextVersion}`);
}
