#!/usr/bin/env node
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { scan, getCategories } from './scanner.js';
import type { ScanFilter } from './scanner.js';
import { selectItems, formatSize } from './ui.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function parseDuration(val: string): number | null {
  const m = val.match(/^(\d+)(d|w|m)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === 'd') return n * 86400000;
  if (unit === 'w') return n * 7 * 86400000;
  if (unit === 'm') return n * 30 * 86400000;
  return null;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    const cats = Object.keys(getCategories()).join(', ');
    console.log(`
  ${C.cyan}${C.bold}repo-sweep${C.reset} - Clean build artifacts from project directories

  ${C.bold}Usage:${C.reset}
    repo-sweep [directory] [options]

  ${C.bold}Options:${C.reset}
    -h, --help             Show this help message
    --only <categories>    Only scan these categories (comma-separated)
    --exclude <categories> Skip these categories (comma-separated)
    --stale <duration>     Only show artifacts from inactive projects (e.g. 30d, 2w, 3m)
    --list-categories      List all available categories

  ${C.bold}Categories:${C.reset} ${cats}

  ${C.dim}If no directory is specified, the current directory is used.${C.reset}
`);
    process.exit(0);
  }

  if (args.includes('--list-categories')) {
    const categories = getCategories();
    console.log(`\n  ${C.bold}Available categories:${C.reset}\n`);
    for (const [name, patterns] of Object.entries(categories)) {
      console.log(`  ${C.cyan}${C.bold}${name}${C.reset}  ${C.dim}${patterns.join(', ')}${C.reset}`);
    }
    console.log('');
    process.exit(0);
  }

  // parse --only and --exclude
  const validCategories = new Set(Object.keys(getCategories()));
  let filter: ScanFilter | undefined;

  const onlyIdx = args.indexOf('--only');
  const excludeIdx = args.indexOf('--exclude');

  if (onlyIdx !== -1 && excludeIdx !== -1) {
    console.error(`${C.red}Error: --only and --exclude cannot be used together${C.reset}`);
    process.exit(1);
  }

  if (onlyIdx !== -1) {
    const val = args[onlyIdx + 1];
    if (!val || val.startsWith('--')) {
      console.error(`${C.red}Error: --only requires a comma-separated list of categories${C.reset}`);
      process.exit(1);
    }
    const cats = val.split(',');
    for (const cat of cats) {
      if (!validCategories.has(cat)) {
        console.error(`${C.red}Error: Unknown category "${cat}". Valid: ${[...validCategories].join(', ')}${C.reset}`);
        process.exit(1);
      }
    }
    filter = { only: cats };
  }

  if (excludeIdx !== -1) {
    const val = args[excludeIdx + 1];
    if (!val || val.startsWith('--')) {
      console.error(`${C.red}Error: --exclude requires a comma-separated list of categories${C.reset}`);
      process.exit(1);
    }
    const cats = val.split(',');
    for (const cat of cats) {
      if (!validCategories.has(cat)) {
        console.error(`${C.red}Error: Unknown category "${cat}". Valid: ${[...validCategories].join(', ')}${C.reset}`);
        process.exit(1);
      }
    }
    filter = { exclude: cats };
  }

  const staleIdx = args.indexOf('--stale');
  if (staleIdx !== -1) {
    const val = args[staleIdx + 1];
    if (!val || val.startsWith('--')) {
      console.error(`${C.red}Error: --stale requires a duration (e.g. 30d, 2w, 3m)${C.reset}`);
      process.exit(1);
    }
    const ms = parseDuration(val);
    if (ms === null) {
      console.error(`${C.red}Error: Invalid duration "${val}". Use a number followed by d (days), w (weeks), or m (months)${C.reset}`);
      process.exit(1);
    }
    if (!filter) filter = {};
    filter.staleMs = ms;
  }

  // find directory argument (first arg that isn't a flag or flag value)
  const flagIndices = new Set<number>();
  for (const flag of ['--only', '--exclude', '--stale']) {
    const idx = args.indexOf(flag);
    if (idx !== -1) { flagIndices.add(idx); flagIndices.add(idx + 1); }
  }
  const dirArg = args.find((a, i) => !flagIndices.has(i) && !a.startsWith('-'));
  const targetDir = resolve(dirArg || '.');

  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    console.error(`${C.red}Error: "${targetDir}" is not a valid directory${C.reset}`);
    process.exit(1);
  }

  // scanning phase with spinner
  let spinnerIdx = 0;
  let spinnerMsg = '';
  const spinnerInterval = setInterval(() => {
    const frame = SPINNER[spinnerIdx % SPINNER.length];
    process.stdout.write(
      `\r  ${C.cyan}${frame}${C.reset} ${C.dim}${spinnerMsg}${C.reset}\x1b[K`,
    );
    spinnerIdx++;
  }, 80);

  const results = await scan(targetDir, (msg) => {
    spinnerMsg = msg;
  }, filter);

  clearInterval(spinnerInterval);
  process.stdout.write('\r\x1b[K');

  if (results.length === 0) {
    console.log(`\n  ${C.green}${C.bold}All clean!${C.reset} No deletable artifacts found in ${targetDir}\n`);
    process.exit(0);
  }

  // interactive selection
  const toDelete = await selectItems(results, targetDir);

  if (toDelete.length === 0) {
    process.stdout.write('\x1b[H\x1b[2J');
    console.log(`\n  ${C.dim}Nothing to delete. Exiting.${C.reset}\n`);
    process.exit(0);
  }

  // deletion phase
  process.stdout.write('\x1b[H\x1b[2J');
  console.log(`\n  ${C.bold}Deleting ${toDelete.length} directories...${C.reset}\n`);

  let freedSize = 0;
  let freedFiles = 0;
  let errors = 0;

  for (const item of toDelete) {
    try {
      await rm(item.path, { recursive: true, force: true });
      freedSize += item.size;
      freedFiles += item.fileCount;
      console.log(
        `  ${C.green}✓${C.reset} ${item.relativePath}/  ${C.dim}${formatSize(item.size)}${C.reset}`,
      );
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `  ${C.red}✗${C.reset} ${item.relativePath}/  ${C.red}${msg}${C.reset}`,
      );
    }
  }

  console.log('');
  if (errors === 0) {
    console.log(
      `  ${C.green}${C.bold}Done!${C.reset} Removed ${C.bold}${toDelete.length}${C.reset} directories, freed ${C.yellow}${C.bold}${formatSize(freedSize)}${C.reset} (${C.bold}${freedFiles.toLocaleString('en-US')}${C.reset} files)`,
    );
  } else {
    console.log(
      `  ${C.yellow}${C.bold}Done with ${errors} error(s).${C.reset} Removed ${C.bold}${toDelete.length - errors}${C.reset} directories, freed ${C.yellow}${C.bold}${formatSize(freedSize)}${C.reset} (${C.bold}${freedFiles.toLocaleString('en-US')}${C.reset} files)`,
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(`${C.red}Fatal error: ${err.message}${C.reset}`);
  process.exit(1);
});
