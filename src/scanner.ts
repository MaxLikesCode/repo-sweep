import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export interface ScanResult {
  path: string;
  relativePath: string;
  size: number;
  fileCount: number;
  description: string;
}

const PATTERNS: Record<string, string> = {
  'node_modules': 'Node.js dependencies',
  '.next': 'Next.js build cache',
  '.nuxt': 'Nuxt.js build cache',
  '.output': 'Nuxt/Nitro output',
  '.svelte-kit': 'SvelteKit build cache',
  '.angular': 'Angular build cache',
  '.cache': 'Build cache',
  '.parcel-cache': 'Parcel bundler cache',
  '.turbo': 'Turborepo cache',
  '.vercel': 'Vercel deployment cache',
  '.expo': 'Expo cache',
  '.webpack': 'Webpack cache',
  target: 'Rust/Cargo build output',
  Pods: 'CocoaPods dependencies',
  '.venv': 'Python virtual environment',
  venv: 'Python virtual environment',
  '__pycache__': 'Python bytecode cache',
  '.pytest_cache': 'Pytest cache',
  '.mypy_cache': 'Mypy type checker cache',
  '.tox': 'Tox testing cache',
  '.dart_tool': 'Dart build cache',
  '.gradle': 'Gradle build cache',
  build: 'Build output',
  dist: 'Build output',
  out: 'Build output',
  coverage: 'Test coverage reports',
  '.sass-cache': 'Sass compiler cache',
  bower_components: 'Bower dependencies',
  '.eggs': 'Python egg cache',
  DerivedData: 'Xcode build data',
  '.terraform': 'Terraform cache',
  '.serverless': 'Serverless Framework cache',
  '.docusaurus': 'Docusaurus build cache',
  '.astro': 'Astro build cache',
  '.pnpm-store': 'pnpm global store',
  '.playwright': 'Playwright browsers',
  release: 'Release builds',
};

const CATEGORIES: Record<string, string[]> = {
  node:     ['node_modules', 'bower_components', '.pnpm-store'],
  python:   ['.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.tox', '.eggs'],
  rust:     ['target'],
  ios:      ['Pods', 'DerivedData'],
  frontend: ['.next', '.nuxt', '.output', '.svelte-kit', '.angular', '.astro', '.docusaurus', '.expo'],
  cache:    ['.cache', '.parcel-cache', '.turbo', '.webpack', '.sass-cache', '.dart_tool', '.gradle', '.terraform', '.playwright'],
  build:    ['build', 'dist', 'out', 'release', 'coverage'],
  deploy:   ['.vercel', '.serverless'],
};

export function getCategories(): Record<string, string[]> {
  return CATEGORIES;
}

const SKIP_DIRS = new Set(['.git']);
const MIN_SIZE = 100 * 1024; // 100 KB

export interface ScanFilter {
  only?: string[];
  exclude?: string[];
}

function buildAllowedPatterns(filter?: ScanFilter): Set<string> | null {
  if (!filter?.only && !filter?.exclude) return null;

  if (filter.only) {
    const allowed = new Set<string>();
    for (const cat of filter.only) {
      for (const p of CATEGORIES[cat] ?? []) allowed.add(p);
    }
    return allowed;
  }

  // exclude: start with all patterns, remove excluded
  const allowed = new Set(Object.keys(PATTERNS));
  for (const cat of filter.exclude!) {
    for (const p of CATEGORIES[cat] ?? []) allowed.delete(p);
  }
  return allowed;
}

export async function scan(
  rootDir: string,
  onProgress?: (msg: string) => void,
  filter?: ScanFilter,
): Promise<ScanResult[]> {
  const allowed = buildAllowedPatterns(filter);
  const results: ScanResult[] = [];
  await findArtifacts(rootDir, rootDir, results, onProgress, 0, allowed);
  results.sort((a, b) => b.size - a.size);
  return results.filter((r) => r.size >= MIN_SIZE);
}

async function findArtifacts(
  dir: string,
  rootDir: string,
  results: ScanResult[],
  onProgress?: (msg: string) => void,
  depth: number = 0,
  allowed?: Set<string> | null,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const fullPath = join(dir, entry.name);

    if (SKIP_DIRS.has(entry.name)) continue;

    if (PATTERNS[entry.name] && (!allowed || allowed.has(entry.name))) {
      if (depth === 0) onProgress?.(`Checking ${entry.name}/`);
      else onProgress?.(`Checking ${relative(rootDir, fullPath)}`);

      const stats = await getDirStats(fullPath);
      results.push({
        path: fullPath,
        relativePath: relative(rootDir, fullPath),
        size: stats.size,
        fileCount: stats.fileCount,
        description: PATTERNS[entry.name],
      });
      continue; // don't recurse into matched dirs
    }

    if (depth === 0) onProgress?.(`Scanning ${entry.name}/`);

    await findArtifacts(fullPath, rootDir, results, onProgress, depth + 1, allowed);
  }
}

async function getDirStats(
  dir: string,
): Promise<{ size: number; fileCount: number }> {
  let size = 0;
  let fileCount = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() || entry.isSymbolicLink()) {
        fileCount++;
        const s = await stat(fullPath);
        size += s.size;
      } else if (entry.isDirectory()) {
        const sub = await getDirStats(fullPath);
        size += sub.size;
        fileCount += sub.fileCount;
      }
    }
  } catch {}
  return { size, fileCount };
}
