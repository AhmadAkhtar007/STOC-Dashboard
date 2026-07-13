import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HistoryPanel } from './HistoryPanel';
import type { TestResult } from '../domain/types';

const baseResult = {
  startedAt: 1_000,
  completedAt: 2_000,
  adapterKind: 'simulator' as const,
  metadata: { meterSerialNumber: 'MTR-42' },
  profile: {
    id: 'single-phase' as const,
    name: 'Single Phase',
    targetAmps: 20,
    durationMs: 500,
    serialCommand: '1' as const,
  },
  samples: [],
  rawPeak: 0,
};

describe('HistoryPanel', () => {
  it('labels failed runs with their reason without claiming sequence completion', () => {
    const failed: TestResult = {
      ...baseResult,
      id: 'failed-run',
      outcome: 'failed',
      failureMessage: 'Waveform completion timed out',
      diagnosticTrace: [],
    };

    render(<HistoryPanel results={[failed]} />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Waveform completion timed out')).toBeInTheDocument();
    expect(screen.queryByText('Sequence complete')).not.toBeInTheDocument();
  });
});
