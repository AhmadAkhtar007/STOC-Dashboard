export type ProfileId = 'single-phase' | 'three-phase' | 'ltct';

export type TestStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'configured'
  | 'armed'
  | 'firing'
  | 'capturing'
  | 'complete'
  | 'error';

export interface TestProfile {
  id: ProfileId;
  name: string;
  targetAmps: number;
  durationMs: number;
  serialCommand: '1' | '2' | '3';
}

type UnconfiguredStatus = 'disconnected' | 'connecting' | 'connected';
type ProfileStatus = 'configured' | 'armed' | 'firing' | 'capturing' | 'complete';

type UnconfiguredState = {
  [Status in UnconfiguredStatus]: { status: Status; samples: number[] };
}[UnconfiguredStatus];

type ProfileState = {
  [Status in ProfileStatus]: { status: Status; profileId: ProfileId; samples: number[] };
}[ProfileStatus];

type ErrorState =
  | {
      status: 'error';
      resetStatus: 'disconnected' | 'connected';
      samples: number[];
      error: string;
    }
  | {
      status: 'error';
      resetStatus: 'configured';
      profileId: ProfileId;
      samples: number[];
      error: string;
    };

export type TestState = UnconfiguredState | ProfileState | ErrorState;

export type TestAction =
  | { type: 'CONNECT' }
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECT' }
  | { type: 'SELECT_PROFILE'; profileId: ProfileId }
  | { type: 'ARM' }
  | { type: 'FIRE' }
  | { type: 'FIRING_ACK' }
  | { type: 'FIRE_COMPLETE' }
  | { type: 'WAVEFORM'; samples: number[] }
  | { type: 'FAIL'; message: string }
  | { type: 'RESET' };
