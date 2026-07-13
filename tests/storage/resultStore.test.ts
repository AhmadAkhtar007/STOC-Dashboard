import { beforeEach, describe, expect, it } from 'vitest';

import type { TestResult } from '../../src/domain/types';
import { loadResults, ResultStorageError, saveResult } from '../../src/storage/resultStore';

function result(id: string, completedAt = Number(id.replace(/\D/g, '')) || 1): TestResult {
  return {
    id,
    startedAt: completedAt - 1,
    completedAt,
    adapterKind: 'simulator',
    metadata: { meterSerialNumber: `meter-${id}` },
    profile: {
      id: 'single-phase',
      name: 'Single Phase',
      targetAmps: 20,
      durationMs: 500,
      serialCommand: '1',
    },
    samples: [512, 700],
    rawPeak: 700,
    outcome: 'sequence-complete',
  };
}

function failedResult(id: string): TestResult {
  return {
    ...result(id),
    outcome: 'failed',
    failureMessage: 'Waveform completion timed out',
    diagnosticTrace: [
      { timestamp: 10, level: 'diagnostic', message: 'waiting for waveform' },
      { timestamp: 20, level: 'error', message: 'Waveform completion timed out' },
    ],
  };
}

describe('resultStore', () => {
  beforeEach(() => localStorage.clear());

  it('stores results newest-first under the versioned key', () => {
    saveResult(result('run-1'));
    const latest = result('run-2');
    const saved = saveResult(latest);

    expect(saved.map(({ id }) => id)).toEqual(['run-2', 'run-1']);
    expect(JSON.parse(localStorage.getItem('stoc:test-results:v1') ?? 'null')).toHaveLength(2);
  });

  it('retains at most 50 results', () => {
    for (let index = 1; index <= 51; index += 1) saveResult(result(`run-${index}`));

    const loaded = loadResults();
    expect(loaded).toHaveLength(50);
    expect(loaded[0].id).toBe('run-51');
    expect(loaded.at(-1)?.id).toBe('run-2');
  });

  it('recovers from invalid JSON', () => {
    localStorage.setItem('stoc:test-results:v1', '{invalid');
    expect(loadResults()).toEqual([]);
  });

  it('ignores malformed stored records without rejecting valid records', () => {
    localStorage.setItem('stoc:test-results:v1', JSON.stringify([
      result('valid'),
      { ...result('bad-profile'), profile: { ...result('x').profile, id: 'unknown' } },
      { ...result('bad-samples'), samples: [1, '2'] },
      null,
    ]));

    expect(loadResults()).toEqual([result('valid')]);
  });

  it('stores valid failed runs and rejects failed records without diagnostics', () => {
    const failed = failedResult('failed-1');
    localStorage.setItem('stoc:test-results:v1', JSON.stringify([
      failed,
      { ...failed, id: 'missing-trace', diagnosticTrace: undefined },
      { ...failed, id: 'bad-trace', diagnosticTrace: [{ timestamp: 1, level: 'unknown', message: 'bad' }] },
    ]));

    expect(loadResults()).toEqual([failed]);
  });

  it('returns defensive copies of failed diagnostic traces', () => {
    const failed = failedResult('failed-1');
    const saved = saveResult(failed);
    saved[0].diagnosticTrace![0].message = 'changed';
    failed.diagnosticTrace![1].message = 'changed input';

    expect(loadResults()[0].diagnosticTrace).toEqual([
      { timestamp: 10, level: 'diagnostic', message: 'waiting for waveform' },
      { timestamp: 20, level: 'error', message: 'Waveform completion timed out' },
    ]);
  });

  it('returns defensive copies that cannot mutate storage or input', () => {
    const input = result('run-1');
    const saved = saveResult(input);
    input.samples[0] = 999;
    input.metadata.meterSerialNumber = 'changed';
    saved[0].samples[1] = 999;

    const firstLoad = loadResults();
    expect(firstLoad[0].samples).toEqual([512, 700]);
    expect(firstLoad[0].metadata.meterSerialNumber).toBe('meter-run-1');
    firstLoad[0].profile.name = 'changed';
    expect(loadResults()[0].profile.name).toBe('Single Phase');
  });

  it('evicts oldest results until a quota-limited write succeeds', () => {
    const storage = new ThresholdStorage();
    saveResult(result('run-1'), storage);
    saveResult(result('run-2'), storage);
    const twoResultSize = storage.byteLength;
    saveResult(result('run-3'), storage);
    storage.maximumBytes = twoResultSize;

    const saved = saveResult(result('run-4'), storage);

    expect(saved.map(({ id }) => id)).toEqual(['run-4', 'run-3']);
    expect(loadResults(storage).map(({ id }) => id)).toEqual(['run-4', 'run-3']);
  });

  it('throws a domain error and preserves existing data when no write can succeed', () => {
    const storage = new ThresholdStorage();
    saveResult(result('existing'), storage);
    const previous = storage.getItem('stoc:test-results:v1');
    const securityError = new DOMException('Access denied', 'SecurityError');
    storage.alwaysThrow = securityError;

    let thrown: unknown;
    try {
      saveResult(result('new'), storage);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ResultStorageError);
    expect(thrown).toMatchObject({
      message: expect.stringMatching(/could not be saved/i),
      cause: securityError,
    });
    expect(storage.getItem('stoc:test-results:v1')).toBe(previous);
  });
});

class ThresholdStorage implements Storage {
  private readonly values = new Map<string, string>();
  maximumBytes = Number.POSITIVE_INFINITY;
  alwaysThrow?: Error;

  get length(): number { return this.values.size; }
  get byteLength(): number {
    return [...this.values.values()].reduce((total, value) => total + value.length, 0);
  }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void {
    if (this.alwaysThrow) throw this.alwaysThrow;
    if (value.length > this.maximumBytes) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.values.set(key, value);
  }
}
