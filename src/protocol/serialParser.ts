export type ProtocolEvent =
  | { type: 'mode'; mode: string }
  | { type: 'firing' }
  | { type: 'fire-complete' }
  | { type: 'waveform'; samples: number[] }
  | { type: 'device-error'; message: string }
  | { type: 'diagnostic'; message: string }
  | { type: 'protocol-error'; message: string; raw: string };

export class SerialParser {
  private buffer = '';

  push(chunk: string): ProtocolEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';

    return lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => this.parseLine(line));
  }

  private parseLine(line: string): ProtocolEvent {
    if (line.startsWith('MODE:')) {
      return { type: 'mode', mode: line.slice('MODE:'.length).trim() };
    }
    if (line === 'FIRING') return { type: 'firing' };
    if (line === 'FIRE_COMPLETE') return { type: 'fire-complete' };
    if (line.startsWith('ERROR:')) {
      return { type: 'device-error', message: line.slice('ERROR:'.length).trim() };
    }
    if (!line.startsWith('WAVEFORM:')) {
      return { type: 'diagnostic', message: line };
    }

    const payload = line.slice('WAVEFORM:'.length);
    const fields = payload.split(',');
    const samples = fields.map(Number);
    if (
      !payload ||
      fields.some((field) => field.trim() === '') ||
      samples.some((sample) => !Number.isInteger(sample) || sample < 0 || sample > 1023)
    ) {
      return { type: 'protocol-error', message: 'Invalid waveform payload', raw: line };
    }

    return { type: 'waveform', samples };
  }
}
