import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('Proteus workstation setup', () => {
  it('dry-runs asset validation, legacy firmware copy, build commands, and serial next steps without writing', () => {
    const repositoryRoot = process.cwd();
    const legacyHex = join(
      repositoryRoot,
      'Downloads',
      'STOC_Firmware',
      'build',
      'arduino.avr.mega',
      'STOC_Firmware.ino.hex',
    );
    const existedBefore = existsSync(legacyHex);

    const run = spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(repositoryRoot, 'scripts', 'setup-proteus.ps1'),
      '-DryRun',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 15_000,
    });

    expect(run.status, run.stderr || run.stdout).toBe(0);
    expect(run.stdout).toContain('Validated Proteus project: projectsuccessfullyruned\\EMP.pdsprj');
    expect(run.stdout).toContain('Validated firmware HEX: projectsuccessfullyruned\\STOC_Firmware.ino.hex');
    expect(run.stdout).toContain('[DRY RUN] Copy firmware to Downloads\\STOC_Firmware\\build\\arduino.avr.mega\\STOC_Firmware.ino.hex');
    expect(run.stdout).toContain('[DRY RUN] npm ci');
    expect(run.stdout).toContain('[DRY RUN] npm run build:desktop');
    expect(run.stdout).toContain('Proteus: COM10');
    expect(run.stdout).toContain('Dashboard: COM11');
    expect(run.stdout).toContain('9600 8N1, no flow control');
    expect(existsSync(legacyHex)).toBe(existedBefore);
  });
});
