import { __unstable__loadDesignSystem } from 'tailwindcss';
import fs from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = process.cwd();
const outputPath = path.join(
  workspaceRoot,
  'apps',
  'web',
  'src',
  'editor',
  'features',
  'design',
  'inspector',
  'classProtocol',
  'tailwind4.catalog.json'
);

const loadStylesheet = async (id, base) => {
  if (id === 'tailwindcss') {
    const file = path.join(
      workspaceRoot,
      'node_modules',
      'tailwindcss',
      'index.css'
    );
    return {
      path: file,
      base: path.dirname(file),
      content: await fs.readFile(file, 'utf8'),
    };
  }

  const resolved = path.resolve(base, id);
  return {
    path: resolved,
    base: path.dirname(resolved),
    content: await fs.readFile(resolved, 'utf8'),
  };
};

const designSystem = await __unstable__loadDesignSystem(
  '@import "tailwindcss";',
  {
    base: workspaceRoot,
    loadStylesheet,
  }
);

const classes = designSystem
  .getClassList()
  .map(([className]) => className)
  .filter((className) => typeof className === 'string' && className.length > 0)
  .sort((left, right) => left.localeCompare(right));

const variants = designSystem
  .getVariants()
  .map((variant) => variant.name)
  .filter((name) => typeof name === 'string' && name.length > 0)
  .sort((left, right) => left.localeCompare(right));

const payload = {
  generatedAt: new Date().toISOString(),
  tailwindVersion: '4.1.18',
  classes,
  variants,
};

await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(
  `Wrote ${classes.length} classes and ${variants.length} variants to ${outputPath}`
);
