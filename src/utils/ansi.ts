/* eslint-disable no-control-regex */
/**
 * High-performance, zero-dependency ANSI escape code parser and text formatter
 * Tailored for live developer terminals (Node.js, Termux, Git, npm, curl).
 */

export interface AnsiSpan {
  text: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: '#1F242D', // Black
  31: '#EF4444', // Red
  32: '#10B981', // Green
  33: '#F59E0B', // Yellow
  34: '#3B82F6', // Blue
  35: '#EC4899', // Magenta
  36: '#06B6D4', // Cyan
  37: '#E2E8F0', // White
  90: '#64748B', // Bright Black / Gray
  91: '#F87171', // Bright Red
  92: '#34D399', // Bright Green
  93: '#FBBF24', // Bright Yellow
  94: '#60A5FA', // Bright Blue
  95: '#F472B6', // Bright Magenta
  96: '#38BDF8', // Bright Cyan
  97: '#F8FAFC', // Bright White
};

const ANSI_BG_MAP: Record<number, string> = {
  40: '#08090B',
  41: '#7F1D1D',
  42: '#064E3B',
  43: '#78350F',
  44: '#1E3A8A',
  45: '#701A75',
  46: '#164E63',
  47: '#334155',
  100: '#1E293B',
  101: '#991B1B',
  102: '#065F46',
  103: '#92400E',
  104: '#1E40AF',
  105: '#86198F',
  106: '#155E75',
  107: '#475569',
};

const ANSI_REGEX = /\u001b\[([0-9;]*)m/g;
const CONTROL_REGEX = /\u001b\[(?:\?25[hl]|2K|1K|K|[0-9;]*[A-LN-Za-ln-z])/g;

/**
 * Strips all ANSI escape and terminal control codes to obtain pure plain text.
 */
export function stripAnsi(str: string): string {
  if (!str) return '';
  return str.replace(CONTROL_REGEX, '').replace(ANSI_REGEX, '');
}

/**
 * Handles carriage return `\r` updates:
 * Resolves inline overwriting (e.g. for npm/curl progress updates) line-by-line.
 */
export function processCarriageReturns(text: string): string {
  if (!text || !text.includes('\r')) return text;
  return text
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      const segments = line.split('\r');
      return segments[segments.length - 1];
    })
    .join('\n');
}

/**
 * Parses an ANSI formatted string into an array of typed styled spans.
 */
export function parseAnsi(raw: string): AnsiSpan[] {
  if (!raw) return [];
  const clean = raw.replace(CONTROL_REGEX, '');
  if (!clean.includes('\u001b[')) {
    return [{ text: clean }];
  }

  const spans: AnsiSpan[] = [];
  let currentColor: string | undefined;
  let currentBgColor: string | undefined;
  let isBold = false;
  let isDim = false;
  let isItalic = false;
  let isUnderline = false;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  ANSI_REGEX.lastIndex = 0;

  while ((match = ANSI_REGEX.exec(clean)) !== null) {
    const textChunk = clean.slice(lastIndex, match.index);
    if (textChunk.length > 0) {
      spans.push({
        text: textChunk,
        color: currentColor,
        bgColor: currentBgColor,
        bold: isBold,
        dim: isDim,
        italic: isItalic,
        underline: isUnderline,
      });
    }

    const codeStr = match[1] || '0';
    const codes = codeStr.split(';').map((c) => parseInt(c, 10) || 0);

    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) {
        // Reset all
        currentColor = undefined;
        currentBgColor = undefined;
        isBold = false;
        isDim = false;
        isItalic = false;
        isUnderline = false;
      } else if (c === 1) {
        isBold = true;
      } else if (c === 2) {
        isDim = true;
      } else if (c === 3) {
        isItalic = true;
      } else if (c === 4) {
        isUnderline = true;
      } else if (c === 22) {
        isBold = false;
        isDim = false;
      } else if (c === 23) {
        isItalic = false;
      } else if (c === 24) {
        isUnderline = false;
      } else if (c >= 30 && c <= 37) {
        currentColor = ANSI_COLOR_MAP[c];
      } else if (c === 39) {
        currentColor = undefined;
      } else if (c >= 40 && c <= 47) {
        currentBgColor = ANSI_BG_MAP[c];
      } else if (c === 49) {
        currentBgColor = undefined;
      } else if (c >= 90 && c <= 97) {
        currentColor = ANSI_COLOR_MAP[c];
      } else if (c >= 100 && c <= 107) {
        currentBgColor = ANSI_BG_MAP[c];
      } else if (c === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        // 256 color foreground fallback
        const colorIdx = codes[i + 2];
        if (ANSI_COLOR_MAP[colorIdx]) {
          currentColor = ANSI_COLOR_MAP[colorIdx];
        }
        i += 2;
      }
    }

    lastIndex = ANSI_REGEX.lastIndex;
  }

  const remaining = clean.slice(lastIndex);
  if (remaining.length > 0) {
    spans.push({
      text: remaining,
      color: currentColor,
      bgColor: currentBgColor,
      bold: isBold,
      dim: isDim,
      italic: isItalic,
      underline: isUnderline,
    });
  }

  return spans.length > 0 ? spans : [{ text: clean }];
}
