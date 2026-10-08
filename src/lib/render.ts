const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string) => (s: string): string => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);
export const c = {
  bold: paint('1'),
  dim: paint('2'),
  green: paint('32'),
  yellow: paint('33'),
  red: paint('31'),
  cyan: paint('36'),
};

const ANSI = /\u001b\[[0-9;]*m/g;
const visibleLength = (s: string): number => s.replace(ANSI, '').length;
const padCell = (s: string, width: number, right: boolean): string => {
  const gap = ' '.repeat(Math.max(0, width - visibleLength(s)));
  return right ? gap + s : s + gap;
};

export interface TableOptions {
  /** column indexes whose cells are right-aligned (numbers) */
  rightAlign?: number[];
  /** row indexes (0-based) that get a separator line above them (for example a Total row) */
  separatorBefore?: number[];
}

// A boxed table, drawn the same way as the verify command's tables.
export function table(headers: string[], rows: string[][], options: TableOptions = {}): string[] {
  const right = new Set(options.rightAlign ?? []);
  const sep = new Set(options.separatorBefore ?? []);
  const widths = headers.map((h, i) => Math.max(visibleLength(h), ...rows.map((r) => visibleLength(r[i] ?? ''))));
  const line = (left: string, mid: string, end: string): string => c.dim(`${left}${widths.map((w) => '─'.repeat(w + 2)).join(mid)}${end}`);
  const bar = c.dim('│');
  const renderRow = (cells: string[], isHeader = false): string =>
    `${bar} ${cells.map((cell, i) => padCell(isHeader ? c.bold(cell ?? '') : (cell ?? ''), widths[i], right.has(i))).join(` ${bar} `)} ${bar}`;

  const out: string[] = [line('┌', '┬', '┐'), renderRow(headers, true), line('├', '┼', '┤')];
  rows.forEach((row, idx) => {
    if (sep.has(idx)) out.push(line('├', '┼', '┤'));
    out.push(renderRow(row));
  });
  out.push(line('└', '┴', '┘'));
  return out;
}

/** A count: dim when zero, so the rows that matter stand out. */
export const num = (n: number, highlight?: (s: string) => string): string => (n === 0 ? c.dim('0') : highlight ? highlight(String(n)) : String(n));
