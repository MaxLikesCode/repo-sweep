# repo-sweep

Interactive CLI tool that finds and removes build artifacts from your project directories. Useful when you want to free up disk space or transfer repos between machines without carrying along gigabytes of `node_modules`, virtual environments, build caches, and other files that get regenerated anyway.

## Install

```
npm install -g repo-sweep
```

Or run it directly without installing:

```
npx repo-sweep
```

## Usage

```
repo-sweep [directory] [options]
```

If no directory is given, the current directory is scanned.

```bash
# Scan current directory
repo-sweep

# Scan a specific directory
repo-sweep ~/Projects

# Only clean Node.js artifacts
repo-sweep --only node

# Only clean Node.js and Python artifacts
repo-sweep --only node,python

# Clean everything except build output
repo-sweep --exclude build

# Only show artifacts from projects inactive for 30+ days
repo-sweep --stale 30d

# Combine filters: only Node.js artifacts from inactive projects
repo-sweep --only node --stale 2w

# List all available categories
repo-sweep --list-categories
```

## How it works

1. Recursively scans the target directory for known artifact folders
2. Shows an interactive list with sizes, file counts, and descriptions
3. You select what to delete (everything is pre-selected, deselect what you want to keep)
4. Deletes the selected directories and shows a summary of freed space

## Keyboard controls

| Key | Action |
|-----|--------|
| `Up` / `k` | Navigate up |
| `Down` / `j` | Navigate down |
| `Space` | Toggle selection |
| `a` | Select all |
| `n` | Select none |
| `Enter` | Confirm and delete |
| `q` | Quit without deleting |

## Categories

Filter what gets scanned with `--only` or `--exclude`:

| Category | Directories |
|----------|-------------|
| `node` | node_modules, bower_components, .pnpm-store |
| `python` | .venv, venv, \_\_pycache\_\_, .pytest_cache, .mypy_cache, .tox, .eggs |
| `rust` | target |
| `ios` | Pods, DerivedData |
| `frontend` | .next, .nuxt, .output, .svelte-kit, .angular, .astro, .docusaurus, .expo |
| `cache` | .cache, .parcel-cache, .turbo, .webpack, .sass-cache, .dart_tool, .gradle, .terraform, .playwright |
| `build` | build, dist, out, release, coverage |
| `deploy` | .vercel, .serverless |

## Stale project filtering

Use `--stale` to only target artifacts from projects you haven't worked on recently. The duration supports `d` (days), `w` (weeks), and `m` (months).

Activity is determined by checking the last modification time of files in the project directory (ignoring the artifact itself and `.git`).

Only artifacts larger than 100 KB are shown.

## Requirements

Node.js 18 or later.

## License

MIT
