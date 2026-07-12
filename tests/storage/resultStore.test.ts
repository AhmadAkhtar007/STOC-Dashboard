import { beforeEach, describe, expect, it } from 'vitest';

import type { TestResult } from '../../src/domain/types';
import { loadResults, saveResult } from '../../src/storage/resultStore';

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
});
