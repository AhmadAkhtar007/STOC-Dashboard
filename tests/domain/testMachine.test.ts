import { describe, expect, it } from 'vitest';

import { PROFILES } from '../../src/domain/profiles';
import { initialTestState, transition } from '../../src/domain/testMachine';

describe('test profiles', () => {
  it('defines immutable firmware profiles', () => {
    expect(PROFILES).toEqual({
      'single-phase': {
        id: 'single-phase',
        name: 'Single Phase',
        targetAmps: 1200,
        durationMs: 10,
        serialCommand: '1',
      },
      'three-phase': {
        id: 'three-phase',
        name: 'Three Phase Whole Current',
        targetAmps: 3000,
        durationMs: 10,
        serialCommand: '2',
      },
      ltct: {
        id: 'ltct',
        name: 'LTCT',
        targetAmps: 300,
        durationMs: 500,
        serialCommand: '3',
      },
    });
    expect(Object.isFrozen(PROFILES)).toBe(true);
    expect(Object.values(PROFILES).every(Object.isFrozen)).toBe(true);
  });
});

describe('test state machine', () => {
  it('completes the full legal operator sequence', () => {
    let state = transition(initialTestState, { type: 'CONNECT' });
    expect(state.status).toBe('connecting');

    state = transition(state, { type: 'CONNECTED' });
    expect(state.status).toBe('connected');

    state = transition(state, { type: 'SELECT_PROFILE', profileId: 'single-phase' });
    expect(state).toMatchObject({ status: 'configured', profileId: 'single-phase' });

    state = transition(state, { type: 'ARM' });
    expect(state.status).toBe('armed');

    state = transition(state, { type: 'FIRE' });
    expect(state.status).toBe('firing');

    state = transition(state, { type: 'FIRING_ACK' });
    expect(state.status).toBe('firing');

    state = transition(state, { type: 'FIRE_COMPLETE' });
    expect(state.status).toBe('capturing');

    state = transition(state, { type: 'WAVEFORM', samples: [512, 700, 512] });
    expect(state).toEqual({
      status: 'complete',
      profileId: 'single-phase',
      samples: [512, 700, 512],
    });
  });

  it('rejects firing before the test is armed', () => {
    expect(() => transition(initialTestState, { type: 'FIRE' })).toThrow('Test is not armed');
  });

  it('rejects an empty waveform while capturing', () => {
    const capturing = {
      status: 'capturing' as const,
      profileId: 'single-phase' as const,
      samples: [],
    };

    expect(() => transition(capturing, { type: 'WAVEFORM', samples: [] })).toThrow(
      'Waveform must contain at least one sample',
    );
  });

  it('rejects a repeated fire action', () => {
    const firing = {
      status: 'firing' as const,
      profileId: 'single-phase' as const,
      samples: [],
    };

    expect(() => transition(firing, { type: 'FIRE' })).toThrow('Test is not armed');
  });

  it('disconnects to a clean initial state from any status', () => {
    const complete = {
      status: 'complete' as const,
      profileId: 'ltct' as const,
      samples: [100, 200],
    };

    expect(transition(complete, { type: 'DISCONNECT' })).toEqual(initialTestState);
  });

  it('enters error from any status and resets while preserving a selected profile', () => {
    const configured = {
      status: 'configured' as const,
      profileId: 'three-phase' as const,
      samples: [],
    };
    const failed = transition(configured, { type: 'FAIL', message: 'Device timeout' });

    expect(failed).toEqual({
      status: 'error',
      resetStatus: 'configured',
      profileId: 'three-phase',
      samples: [],
      error: 'Device timeout',
    });
    expect(transition(failed, { type: 'RESET' })).toEqual(configured);
  });

  it('resets a connecting failure to disconnected', () => {
    const failed = transition(
      { status: 'connecting', samples: [] },
      { type: 'FAIL', message: 'Connection failed' },
    );

    expect(transition(failed, { type: 'RESET' })).toEqual(initialTestState);
  });

  it('resets a disconnected failure to disconnected', () => {
    const failed = transition(initialTestState, { type: 'FAIL', message: 'Unavailable' });

    expect(transition(failed, { type: 'RESET' })).toEqual(initialTestState);
  });

  it('rejects waveform data before capture starts', () => {
    expect(() =>
      transition(
        { status: 'firing', profileId: 'single-phase', samples: [] },
        { type: 'WAVEFORM', samples: [512] },
      ),
    ).toThrow('Waveform can only be accepted while capturing');
  });
});
