import type { TestAction, TestState } from './types';

export const initialTestState: TestState = {
  status: 'disconnected',
  samples: [],
};

function requireStatus(state: TestState, expected: TestState['status'], message: string): void {
  if (state.status !== expected) throw new Error(message);
}

function assertNever(action: never): never {
  throw new Error(`Unknown test action: ${JSON.stringify(action)}`);
}

export function transition(state: TestState, action: TestAction): TestState {
  if (action.type === 'DISCONNECT') return { ...initialTestState, samples: [] };

  if (action.type === 'FAIL') {
    return {
      status: 'error',
      ...(state.profileId ? { profileId: state.profileId } : {}),
      samples: [...state.samples],
      error: action.message,
    };
  }

  switch (action.type) {
    case 'CONNECT':
      requireStatus(state, 'disconnected', 'Can only connect while disconnected');
      return { status: 'connecting', samples: [] };
    case 'CONNECTED':
      requireStatus(state, 'connecting', 'Connection was not in progress');
      return { status: 'connected', samples: [] };
    case 'SELECT_PROFILE':
      requireStatus(state, 'connected', 'A profile can only be selected while connected');
      return { status: 'configured', profileId: action.profileId, samples: [] };
    case 'ARM':
      requireStatus(state, 'configured', 'Test is not configured');
      return { ...state, status: 'armed', samples: [] };
    case 'FIRE':
      requireStatus(state, 'armed', 'Test is not armed');
      return { ...state, status: 'firing', samples: [] };
    case 'FIRING_ACK':
      requireStatus(state, 'firing', 'Test is not firing');
      return { ...state };
    case 'FIRE_COMPLETE':
      requireStatus(state, 'firing', 'Test is not firing');
      return { ...state, status: 'capturing', samples: [] };
    case 'WAVEFORM':
      requireStatus(state, 'capturing', 'Waveform can only be accepted while capturing');
      if (action.samples.length === 0) throw new Error('Waveform must contain at least one sample');
      return { ...state, status: 'complete', samples: [...action.samples] };
    case 'RESET':
      requireStatus(state, 'error', 'Only an errored test can be reset');
      return state.profileId
        ? { status: 'configured', profileId: state.profileId, samples: [] }
        : { status: 'connected', samples: [] };
    default:
      return assertNever(action);
  }
}
