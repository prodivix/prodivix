import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const manifest = (directory) =>
  JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
const packages = new Map(
  readdirSync(path.join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => {
      const directory = path.join(root, 'packages', name);
      const value = manifest(directory);
      return [value.name, { directory, manifest: value }];
    })
);

const runtimeImports = (file) => {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  return source.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) &&
      !ts.isExportDeclaration(statement)
    )
      return [];
    if (!statement.moduleSpecifier || statement.isTypeOnly) return [];
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) return [];
      if (
        clause &&
        !clause.name &&
        clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.every((element) => element.isTypeOnly)
      )
        return [];
    }
    return [statement.moduleSpecifier.text];
  });
};

const importedOwners = () => {
  const owners = new Set();
  const visited = new Set();
  const pending = [path.join(root, 'scripts/sync-g4-wire-contracts.mjs')];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of runtimeImports(file)) {
      if (specifier.startsWith('@prodivix/')) {
        owners.add(specifier.split('/').slice(0, 2).join('/'));
        continue;
      }
      if (!specifier.startsWith('.')) continue;
      const base = path.resolve(path.dirname(file), specifier);
      const target = [base, `${base}.ts`, `${base}.mjs`].find(existsSync);
      assert.ok(target, `Runtime import ${specifier} from ${file} resolves.`);
      const owner = [...packages.entries()].find(([, { directory }]) =>
        target.startsWith(`${directory}${path.sep}`)
      );
      if (owner && owner[0] !== '@prodivix/golden-conformance') {
        owners.add(owner[0]);
      } else {
        pending.push(target);
      }
    }
  }
  return owners;
};

test('G4 wire generation builds the public runtime owners of its canonical fixtures', () => {
  const command =
    manifest(root).scripts['build:g4-wire-dependencies'].split(' ');
  assert.deepEqual(command.slice(0, 3), ['turbo', 'run', 'build']);
  const dryRun = JSON.parse(
    execFileSync(
      process.execPath,
      [require.resolve('turbo/bin/turbo'), ...command.slice(1), '--dry=json'],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    )
  );
  const built = new Set(dryRun.tasks.map(({ package: name }) => name));
  const owners = importedOwners();
  assert.ok(owners.has('@prodivix/nodegraph'));
  assert.ok(owners.has('@prodivix/animation'));
  assert.ok(owners.has('@prodivix/workspace-sync'));
  const pending = [...owners];
  for (const owner of pending) {
    assert.ok(packages.has(owner), `Public owner ${owner} has a manifest.`);
    assert.ok(built.has(owner), `Wire generation must first build ${owner}.`);
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      for (const [dependency, selector] of Object.entries(
        packages.get(owner).manifest[field] ?? {}
      )) {
        if (!selector.startsWith('workspace:') || owners.has(dependency))
          continue;
        owners.add(dependency);
        pending.push(dependency);
      }
    }
  }
  assert.ok(!built.has('@prodivix/golden-conformance'));
});
