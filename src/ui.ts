import type { ScanResult } from './scanner.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inverse: '\x1b[7m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  white: '\x1b[37m',
};

const TITLE = [
  `${C.cyan}${C.bold}`,
  ` ┳━┓┏━╸┏━┓┏━┓  ┏━┓╻ ╻┏━╸┏━╸┏━┓`,
  ` ┣┳┛┣╸ ┣━┛┃ ┃  ┗━┓┃╻┃┣╸ ┣╸ ┣━┛`,
  ` ╹┗╸┗━╸╹  ┗━┛  ┗━┛┗┻┛┗━╸┗━╸╹  `,
  `${C.reset}`,
].join('\n');

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

function formatAge(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  if (days < 60) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function padRight(str: string, len: number): string {
  if (str.length >= len) return str;
  return str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  if (str.length >= len) return str;
  return ' '.repeat(len - str.length) + str;
}

export async function selectItems(
  items: ScanResult[],
  rootDir: string,
): Promise<ScanResult[]> {
  return new Promise((resolve) => {
    const selected = new Array(items.length).fill(true);
    let cursor = 0;
    let scrollOffset = 0;

    const getViewportHeight = () => {
      const termHeight = process.stdout.rows || 24;
      return Math.max(5, termHeight - 14); // reserve lines for header/footer
    };

    const render = () => {
      const viewportHeight = getViewportHeight();
      const out: string[] = [];

      // move cursor to top-left
      out.push('\x1b[H\x1b[2J');
      out.push(TITLE);
      out.push('');
      out.push(
        `  ${C.dim}Scanned ${C.reset}${rootDir}`,
      );
      out.push(
        `  ${C.dim}Found ${C.bold}${C.white}${items.length}${C.reset}${C.dim} deletable directories${C.reset}`,
      );
      out.push('');

      // calculate column widths
      const termWidth = process.stdout.columns || 80;
      const maxSizeLen = Math.max(
        ...items.map((i) => formatSize(i.size).length),
      );
      const maxCountLen = Math.max(
        ...items.map((i) => (formatCount(i.fileCount) + ' files').length),
      );
      const maxDescLen = Math.max(
        ...items.map((i) => `${i.description} · ${formatAge(i.lastModified)}`.length),
      );
      // line layout: "  [✓]  path  size  count  desc"
      // fixed chars:  2 + 3 + 2 + 2 + 2 + 2 + 2 = 15
      const availablePathLen = termWidth - 15 - maxSizeLen - maxCountLen - maxDescLen;
      const actualMaxPathLen = Math.max(
        ...items.map((i) => i.relativePath.length + 1),
      );
      const maxPathLen = Math.max(10, Math.min(actualMaxPathLen, availablePathLen));

      // ensure cursor is visible
      if (cursor < scrollOffset) scrollOffset = cursor;
      if (cursor >= scrollOffset + viewportHeight)
        scrollOffset = cursor - viewportHeight + 1;

      // scroll indicators
      if (scrollOffset > 0) {
        out.push(
          `  ${C.dim}  ▲ ${scrollOffset} more above${C.reset}`,
        );
      }

      const visibleEnd = Math.min(
        items.length,
        scrollOffset + viewportHeight,
      );

      for (let i = scrollOffset; i < visibleEnd; i++) {
        const item = items[i];
        const isCursor = i === cursor;
        const isSelected = selected[i];

        const checkbox = isSelected
          ? `${C.green}[✓]${C.reset}`
          : `${C.dim}[ ]${C.reset}`;

        let displayPath = item.relativePath + '/';
        if (displayPath.length > maxPathLen) {
          displayPath =
            '...' + displayPath.slice(displayPath.length - maxPathLen + 3);
        }

        const size = padLeft(formatSize(item.size), maxSizeLen);
        const count = padLeft(
          formatCount(item.fileCount) + ' files',
          maxCountLen,
        );
        const age = formatAge(item.lastModified);
        const desc = `${item.description} · ${age}`;

        let line = `  ${checkbox}  ${padRight(displayPath, maxPathLen)}  ${C.yellow}${size}${C.reset}  ${C.blue}${count}${C.reset}  ${C.dim}${desc}${C.reset}`;

        if (isCursor) {
          line = `${C.inverse}${line}${C.reset}`;
        }

        out.push(line);
      }

      if (visibleEnd < items.length) {
        out.push(
          `  ${C.dim}  ▼ ${items.length - visibleEnd} more below${C.reset}`,
        );
      }

      // footer
      out.push('');
      out.push(
        `  ${C.dim}↑↓${C.reset} Navigate  ${C.dim}␣${C.reset} Toggle  ${C.dim}a${C.reset} All  ${C.dim}n${C.reset} None  ${C.dim}⏎${C.reset} Confirm  ${C.dim}q${C.reset} Quit`,
      );

      // summary
      const selectedCount = selected.filter(Boolean).length;
      const selectedSize = items
        .filter((_, i) => selected[i])
        .reduce((sum, item) => sum + item.size, 0);
      const selectedFiles = items
        .filter((_, i) => selected[i])
        .reduce((sum, item) => sum + item.fileCount, 0);

      if (selectedCount > 0) {
        out.push('');
        out.push(
          `  ${C.bold}Selected: ${selectedCount}/${items.length}${C.reset}  ${C.dim}│${C.reset}  ${C.yellow}${C.bold}${formatSize(selectedSize)}${C.reset}  ${C.dim}│${C.reset}  ${C.blue}${C.bold}${formatCount(selectedFiles)} files${C.reset} ${C.dim}will be removed${C.reset}`,
        );
      } else {
        out.push('');
        out.push(`  ${C.dim}Nothing selected${C.reset}`);
      }

      process.stdout.write(out.join('\n') + '\n');
    };

    const cleanup = () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.removeAllListeners('data');
    };

    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    render();

    process.stdin.on('data', (key: string) => {
      // ctrl+c
      if (key === '\x03') {
        cleanup();
        process.stdout.write('\x1b[H\x1b[2J');
        process.exit(0);
      }

      // q
      if (key === 'q') {
        cleanup();
        process.stdout.write('\x1b[H\x1b[2J');
        resolve([]);
        return;
      }

      // up arrow or k
      if (key === '\x1b[A' || key === 'k') {
        cursor = Math.max(0, cursor - 1);
      }

      // down arrow or j
      if (key === '\x1b[B' || key === 'j') {
        cursor = Math.min(items.length - 1, cursor + 1);
      }

      // space - toggle
      if (key === ' ') {
        selected[cursor] = !selected[cursor];
      }

      // a - select all
      if (key === 'a') {
        selected.fill(true);
      }

      // n - select none
      if (key === 'n') {
        selected.fill(false);
      }

      // enter - confirm
      if (key === '\r') {
        cleanup();
        const result = items.filter((_, i) => selected[i]);
        resolve(result);
        return;
      }

      render();
    });
  });
}
