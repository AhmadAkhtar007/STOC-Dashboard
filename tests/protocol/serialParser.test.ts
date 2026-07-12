import { describe, expect, it } from 'vitest';

import {
  MAX_SERIAL_LINE_LENGTH,
  MAX_WAVEFORM_SAMPLES,
  SerialParser,
} from '../../src/protocol/serialParser';

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

  it('parses a waveform line padded with surrounding whitespace', () => {
    const parser = new SerialParser();

    expect(parser.push('  WAVEFORM:0,512,1023  \n')).toEqual([
      { type: 'waveform', samples: [0, 512, 1023] },
    ]);
  });

  it('accepts whitespace around comma-separated decimal samples', () => {
    const parser = new SerialParser();

    expect(parser.push('WAVEFORM: 0 , 512 , 1023 \n')).toEqual([
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

  it.each([
    ['hexadecimal', '0x10'],
    ['exponent', '1e2'],
    ['leading plus', '+1'],
    ['float', '1.0'],
    ['blank', ' '],
  ])('rejects %s waveform tokens outside decimal integer grammar', (_case, token) => {
    expect(new SerialParser().push(`WAVEFORM:${token}\n`)).toEqual([
      {
        type: 'protocol-error',
        message: 'Invalid waveform payload',
        raw: `WAVEFORM:${token}`,
      },
    ]);
  });

  it('bounds retained unterminated input and resynchronizes at the next line', () => {
    const parser = new SerialParser();

    expect(parser.push('x'.repeat(MAX_SERIAL_LINE_LENGTH + 1))).toEqual([
      {
        type: 'protocol-error',
        message: 'Serial line exceeds maximum length',
        raw: 'x'.repeat(MAX_SERIAL_LINE_LENGTH),
      },
    ]);
    expect(parser.push('discarded remainder\nFIRING\n')).toEqual([{ type: 'firing' }]);
  });

  it('rejects an oversized terminated line and continues parsing the chunk', () => {
    const parser = new SerialParser();
    const oversized = 'x'.repeat(MAX_SERIAL_LINE_LENGTH + 1);

    expect(parser.push(`${oversized}\nFIRE_COMPLETE\n`)).toEqual([
      {
        type: 'protocol-error',
        message: 'Serial line exceeds maximum length',
        raw: 'x'.repeat(MAX_SERIAL_LINE_LENGTH),
      },
      { type: 'fire-complete' },
    ]);
  });

  it('bounds waveform sample allocation and parses a later valid line', () => {
    const parser = new SerialParser();
    const oversized = Array.from({ length: MAX_WAVEFORM_SAMPLES + 1 }, () => '1').join(',');

    expect(parser.push(`WAVEFORM:${oversized}\nWAVEFORM:0,1023\n`)).toEqual([
      {
        type: 'protocol-error',
        message: 'Waveform exceeds maximum sample count',
        raw: `WAVEFORM:${oversized}`,
      },
      { type: 'waveform', samples: [0, 1023] },
    ]);
  });
});
