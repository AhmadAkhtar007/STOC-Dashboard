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

export type AdapterKind = 'simulator' | 'serial';

export type DeviceEvent =
  | { type: 'connected'; label: string }
  | { type: 'disconnected' }
  | { type: 'mode-confirmed'; profileId: ProfileId }
  | { type: 'firing' }
  | { type: 'fire-complete' }
  | { type: 'waveform'; samples: number[] }
  | { type: 'diagnostic'; message: string }
  | { type: 'error'; message: string };

export interface DeviceAdapter {
  readonly kind: AdapterKind;
  connect(target?: string): Promise<void>;
  disconnect(): Promise<void>;
  selectProfile(profile: TestProfile): Promise<void>;
  fire(): Promise<void>;
  subscribe(listener: (event: DeviceEvent) => void): () => void;
}

export interface RunMetadata {
  meterSerialNumber?: string;
  operatorName?: string;
  notes?: string;
}

export interface ControllerLogEntry {
  timestamp: number;
  level: 'status' | 'diagnostic' | 'error';
  message: string;
}

interface TestResultBase {
  id: string;
  startedAt: number;
  completedAt: number;
  adapterKind: AdapterKind;
  metadata: RunMetadata;
  profile: TestProfile;
  samples: number[];
  rawPeak: number;
}

export interface SequenceCompleteTestResult extends TestResultBase {
  outcome: 'sequence-complete';
  failureMessage?: never;
  diagnosticTrace?: never;
}

export interface FailedTestResult extends TestResultBase {
  outcome: 'failed';
  failureMessage: string;
  diagnosticTrace: ControllerLogEntry[];
}

export type TestResult = SequenceCompleteTestResult | FailedTestResult;

export interface ControllerSnapshot {
  state: TestState;
  logs: ControllerLogEntry[];
  metadata?: RunMetadata;
  result?: TestResult;
  connectionLabel?: string;
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
