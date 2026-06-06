import { program } from 'commander';

export function cli(argv: string[]) {
  program
    .name('prodivix')
    .description('Prodivix CLI')
    .version('0.0.1')
    .command('build', 'build project', {
      executableFile: 'commands/build.js',
    })
    .command('export', 'export static site', {
      executableFile: 'commands/export.js',
    })
    .parse(argv);
}

if (import.meta.url === `file://${process.argv[1]}`) cli(process.argv);
