import { cpSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const assets = [
  [
    'src/schema/themeManifest.schema.json',
    'dist/schema/themeManifest.schema.json',
  ],
  ['src/palette/defaultPalette.json', 'dist/palette/defaultPalette.json'],
  ['src/css/font-stacks.css', 'dist/css/font-stacks.css'],
];

for (const [, destination] of assets) {
  mkdirSync(dirname(destination), { recursive: true });
}

for (const [source, destination] of assets) {
  cpSync(source, destination);
}
