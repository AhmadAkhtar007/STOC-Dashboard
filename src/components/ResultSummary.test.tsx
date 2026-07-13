import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TestResult } from '../domain/types';
import { ResultSummary } from './ResultSummary';

const result: TestResult = {
  id: 'run-1',
  startedAt: 1_000,
  completedAt: 1_137,
  adapterKind: 'simulator',
  metadata: {},
  profile: {
    id: 'single-phase',
    name: 'Single Phase',
    targetAmps: 1_200,
    durationMs: 10,
    serialCommand: '1',
  },
  samples: [512, 700],
  rawPeak: 700,
  outcome: 'sequence-complete',
};

describe('ResultSummary', () => {
  it('distinguishes observed elapsed time from the intended profile duration', () => {
    render(
      <ResultSummary
        result={result}
        onJson={vi.fn()}
        onCsv={vi.fn()}
        onPrint={vi.fn()}
      />,
    );

    expect(screen.getByText('Observed elapsed')).toBeInTheDocument();
    expect(screen.getByText('137 ms')).toBeInTheDocument();
    expect(screen.getByText('10 ms')).toBeInTheDocument();
  });
});
