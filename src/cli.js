import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

/**
 * Parse command-line arguments
 * @returns {Object} Parsed options: { config?: string, database?: string[] }
 */
export function parseArguments() {
  const program = new Command();

  program
    .name('cronos')
    .description('Database backup tool for MySQL, MariaDB, and PostgreSQL')
    .version(packageJson.version);

  program
    .option('-c, --config <path>', 'path to configuration file (default: config.yaml or CONFIG_PATH env var)')
    .option('-d, --database <name>', 'backup specific database(s) - can be used multiple times', (value, previous) => {
      return previous ? [...previous, value] : [value];
    })
    .option('-l, --list', 'list all databases in configuration and exit');

  program.parse();

  return program.opts();
}
