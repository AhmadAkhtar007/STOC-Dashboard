import type { AdapterKind, ProfileId, TestProfile, TestResult } from '../domain/types';

const KEY = 'stoc:test-results:v1';
const LIMIT = 50;

const PROFILE_IDS: readonly ProfileId[] = ['single-phase', 'three-phase', 'ltct'];
const ADAPTER_KINDS: readonly AdapterKind[] = ['simulator', 'serial'];

export class ResultStorageError extends Error {
  constructor(cause: unknown) {
    super('The test result could not be saved to local storage.', { cause });
    this.name = 'ResultStorageError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isProfile(value: unknown): value is TestProfile {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && PROFILE_IDS.includes(value.id as ProfileId)
    && typeof value.name === 'string'
    && isFiniteNumber(value.targetAmps)
    && isFiniteNumber(value.durationMs)
    && (value.serialCommand === '1' || value.serialCommand === '2' || value.serialCommand === '3');
}

function isMetadata(value: unknown): value is TestResult['metadata'] {
  if (!isRecord(value)) return false;
  return ['meterSerialNumber', 'operatorName', 'notes'].every((key) => {
    const field = value[key];
    return field === undefined || typeof field === 'string';
  });
}

function isTestResult(value: unknown): value is TestResult {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && isFiniteNumber(value.startedAt)
    && isFiniteNumber(value.completedAt)
    && typeof value.adapterKind === 'string'
    && ADAPTER_KINDS.includes(value.adapterKind as AdapterKind)
    && isMetadata(value.metadata)
    && isProfile(value.profile)
    && Array.isArray(value.samples)
    && value.samples.every(isFiniteNumber)
    && isFiniteNumber(value.rawPeak)
    && value.outcome === 'sequence-complete';
}

function cloneResult(result: TestResult): TestResult {
  return {
    ...result,
    metadata: { ...result.metadata },
    profile: { ...result.profile },
    samples: [...result.samples],
  };
}

export function loadResults(storage: Storage = localStorage): TestResult[] {
  try {
    const stored: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter(isTestResult).slice(0, LIMIT).map(cloneResult);
  } catch {
    return [];
  }
}

export function saveResult(result: TestResult, storage: Storage = localStorage): TestResult[] {
  const results = [cloneResult(result), ...loadResults(storage)].slice(0, LIMIT);
  let lastFailure: unknown;
  for (let length = results.length; length >= 1; length -= 1) {
    const retained = results.slice(0, length);
    try {
      storage.setItem(KEY, JSON.stringify(retained));
      return retained.map(cloneResult);
    } catch (error) {
      lastFailure = error;
    }
  }
  throw new ResultStorageError(lastFailure);
}
