import { describe, expect, it } from 'vitest';

import { SerialParser } from '../../src/protocol/serialParser';

describe('SerialParser', () => {
  it('reassembles fragmented messages and preserves a trailing partial line', () => {
    const parser = new SerialParser();

    expect(parser.push('FIRE_')).toEqual([]);
    expect(parser.push('COMPLETE\r\nFIR')).toEqual([{ type: 'fire-complete' }]);
    expect(parser.push('ING\n')).toEqual([{ type: 'firing' }]);
  });

  it('parses multiple CRLF and LF terminated messages from one chunk', () => {
    const parser = new SerialParser();

    expect(parser.push('MODE: 2\r\nFIRING\nFIRE_COMPLETE\r\n')).toEqual([
      { type: 'mode', mode: '2' },
      { type: 'firing' },
      { type: 'fire-complete' },
    ]);
  });

  it('parses device errors and unknown diagnostic lines', () => {
    const parser = new SerialParser();

    expect(parser.push('ERROR: SCR did not fire\nADC ready\n')).toEqual([
      { type: 'device-error', message: 'SCR did not fire' },
      { type: 'diagnostic', message: 'ADC ready' },
    ]);
  });

  it('parses valid waveform samples at the inclusive bounds', () => {
    const parser = new SerialParser();

    expect(parser.push('WAVEFORM:0,512,1023\n')).toEqual([
      { type: 'waveform', samples: [0, 512, 1023] },
    ]);
  });

  it.each([
    ['empty', 'WAVEFORM:\n'],
    ['empty sample', 'WAVEFORM:1,,2\n'],
    ['NaN', 'WAVEFORM:not-a-number\n'],
    ['float', 'WAVEFORM:1.5\n'],
    ['negative', 'WAVEFORM:-1\n'],
    ['above ADC range', 'WAVEFORM:1024\n'],
  ])('reports %s waveform payloads as protocol errors without throwing', (_case, line) => {
    const parser = new SerialParser();

    expect(() => parser.push(line)).not.toThrow();
    expect(new SerialParser().push(line)).toEqual([
      { type: 'protocol-error', message: 'Invalid waveform payload', raw: line.trim() },
    ]);
  });
});
