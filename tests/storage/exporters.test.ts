import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TestResult } from '../../src/domain/types';
import { downloadFile, resultToCsv, resultToJson } from '../../src/storage/exporters';

const result: TestResult = {
  id: 'run-1',
  startedAt: 1_000,
  completedAt: 2_000,
  adapterKind: 'simulator',
  metadata: {
    meterSerialNumber: '=CMD("unsafe")',
    operatorName: 'Doe, "Jane"',
    notes: '-2 is entered text\nsecond line',
  },
  profile: {
    id: 'single-phase',
    name: 'Single, "Phase"',
    targetAmps: 20,
    durationMs: 500,
    serialCommand: '1',
  },
  samples: [-2, 0, 512.5],
  rawPeak: 512.5,
  outcome: 'sequence-complete',
};

describe('exporters', () => {
  afterEach(() => vi.restoreAllMocks());

  it('round-trips the full result through JSON', () => {
    expect(JSON.parse(resultToJson(result))).toEqual(result);
  });

  it('exports a failed outcome, reason, and diagnostic trace without claiming completion', () => {
    const failed: TestResult = {
      ...result,
      outcome: 'failed',
      failureMessage: 'SCR feedback lost',
      diagnosticTrace: [
        { timestamp: 1_500, level: 'diagnostic', message: 'gate enabled' },
        { timestamp: 1_750, level: 'error', message: 'SCR feedback lost' },
      ],
    };

    expect(JSON.parse(resultToJson(failed))).toEqual(failed);
    const csv = resultToCsv(failed);
    expect(csv).toContain('# Outcome,failed');
    expect(csv).toContain('# Failure message,SCR feedback lost');
    expect(csv).toContain('diagnostic_timestamp,level,message');
    expect(csv).toContain('1970-01-01T00:00:01.750Z,error,SCR feedback lost');
    expect(csv).not.toContain('sequence-complete');
  });

  it('writes escaped human-readable metadata comments before the exact sample header', () => {
    const csv = resultToCsv(result);
    const lines = csv.split('\r\n');

    expect(lines).toContain('# Meter serial number,"\'=CMD(""unsafe"")"');
    expect(lines).toContain('# Operator name,"Doe, ""Jane"""');
    expect(lines).toContain('# Notes,"\'-2 is entered text\nsecond line"');
    expect(lines).toContain('# Profile,"Single, ""Phase"""');
    expect(lines.indexOf('sample_index,raw_adc')).toBeGreaterThan(0);
    expect(lines.slice(-3)).toEqual(['0,-2', '1,0', '2,512.5']);
  });

  it('sanitizes every formula-leading metadata character but leaves numeric data unchanged', () => {
    for (const prefix of ['=', '+', '-', '@']) {
      const csv = resultToCsv({
        ...result,
        metadata: { meterSerialNumber: `${prefix}unsafe` },
      });
      expect(csv).toContain(`# Meter serial number,'${prefix}unsafe`);
    }
    expect(resultToCsv(result)).toContain('\r\n0,-2\r\n');
  });

  it('downloads a Blob through an object URL and revokes it', () => {
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: () => '' },
      revokeObjectURL: { configurable: true, value: () => undefined },
    });
    const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadFile('result.json', '{}', 'application/json');

    expect(url).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    expect(document.querySelector('a[download="result.json"]')).toBeNull();
  });
});
