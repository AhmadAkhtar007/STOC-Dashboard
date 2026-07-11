import type { ProfileId, TestProfile } from './types';

const profiles = {
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
} satisfies Record<ProfileId, TestProfile>;

for (const profile of Object.values(profiles)) Object.freeze(profile);

export const PROFILES: Readonly<Record<ProfileId, Readonly<TestProfile>>> = Object.freeze(profiles);
