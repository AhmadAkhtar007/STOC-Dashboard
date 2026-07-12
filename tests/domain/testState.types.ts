import type { TestState } from '../../src/domain/types';

const validConfiguredState: TestState = {
  status: 'configured',
  profileId: 'single-phase',
  samples: [],
};

// @ts-expect-error Configured states must identify their selected profile.
const configuredWithoutProfile: TestState = { status: 'configured', samples: [] };

// @ts-expect-error Armed states must identify their selected profile.
const armedWithoutProfile: TestState = { status: 'armed', samples: [] };

// @ts-expect-error Firing states must identify their selected profile.
const firingWithoutProfile: TestState = { status: 'firing', samples: [] };

// @ts-expect-error Capturing states must identify their selected profile.
const capturingWithoutProfile: TestState = { status: 'capturing', samples: [] };

// @ts-expect-error Complete states must identify their selected profile.
const completeWithoutProfile: TestState = { status: 'complete', samples: [512] };

void validConfiguredState;
void configuredWithoutProfile;
void armedWithoutProfile;
void firingWithoutProfile;
void capturingWithoutProfile;
void completeWithoutProfile;
