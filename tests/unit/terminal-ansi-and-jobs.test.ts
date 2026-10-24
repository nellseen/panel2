import { describe, expect, it } from 'vitest';
import { parseAnsi, processCarriageReturns, stripAnsi } from '../../src/utils/ansi';

describe('ANSI Terminal Engine & Text Processing', () => {
  it('strips ANSI escape codes and terminal cursor controls cleanly', () => {
    const raw = '\x1b[32m✔ Success:\x1b[0m \x1b[1mService started\x1b[22m on port \x1b[36m3001\x1b[39m';
    expect(stripAnsi(raw)).toBe('✔ Success: Service started on port 3001');

    const controlCodes = '\x1b[2K\x1b[1AProcessing step...\x1b[0m';
    expect(stripAnsi(controlCodes)).toBe('Processing step...');
  });

  it('correctly handles carriage returns (\\r) for overwriting progress bars', () => {
    const progressLog = 'Downloading: [==        ] 20%\rDownloading: [====      ] 40%\rDownloading: [==========] 100%';
    expect(processCarriageReturns(progressLog)).toBe('Downloading: [==========] 100%');

    const multilineWithCarriageReturns = 'Step 1: Init\nProgress: 0%\rProgress: 50%\rProgress: 100%\nStep 2: Done';
    expect(processCarriageReturns(multilineWithCarriageReturns)).toBe(
      'Step 1: Init\nProgress: 100%\nStep 2: Done'
    );
  });

  it('parses standard 16 foreground and background colors into styled spans', () => {
    const redText = '\x1b[31mError: Connection refused\x1b[0m';
    const spans = parseAnsi(redText);
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('Error: Connection refused');
    expect(spans[0].color).toBe('#EF4444');

    const greenBold = '\x1b[1;32mREADY\x1b[0m';
    const greenSpans = parseAnsi(greenBold);
    expect(greenSpans).toHaveLength(1);
    expect(greenSpans[0].text).toBe('READY');
    expect(greenSpans[0].bold).toBe(true);
    expect(greenSpans[0].color).toBe('#10B981');
  });

  it('handles multiple contiguous styled segments in a single line', () => {
    const combined = '\x1b[34minfo\x1b[0m - \x1b[33m[warn]\x1b[0m high latency: \x1b[1;31m500ms\x1b[0m';
    const spans = parseAnsi(combined);
    expect(spans.length).toBeGreaterThanOrEqual(4);

    expect(spans[0].text).toBe('info');
    expect(spans[0].color).toBe('#3B82F6');

    expect(spans[1].text).toBe(' - ');

    expect(spans[2].text).toBe('[warn]');
    expect(spans[2].color).toBe('#F59E0B');

    const msSpan = spans.find((s) => s.text === '500ms');
    expect(msSpan).toBeDefined();
    expect(msSpan?.bold).toBe(true);
    expect(msSpan?.color).toBe('#EF4444');
  });
});
