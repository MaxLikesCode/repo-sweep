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

const SKIP_DIRS = new Set(['.git']);
const MIN_SIZE = 100 * 1024; // 100 KB

export async function scan(
  rootDir: string,
  onProgress?: (msg: string) => void,
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  await findArtifacts(rootDir, rootDir, results, onProgress, 0);
  results.sort((a, b) => b.size - a.size);
  return results.filter((r) => r.size >= MIN_SIZE);
}

async function findArtifacts(
  dir: string,
  rootDir: string,
  results: ScanResult[],
  onProgress?: (msg: string) => void,
  depth: number = 0,
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

    if (PATTERNS[entry.name]) {
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

    await findArtifacts(fullPath, rootDir, results, onProgress, depth + 1);
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
