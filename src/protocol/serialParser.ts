export type ProtocolEvent =
  | { type: 'mode'; mode: string }
  | { type: 'firing' }
  | { type: 'fire-complete' }
  | { type: 'waveform'; samples: number[] }
  | { type: 'device-error'; message: string }
  | { type: 'diagnostic'; message: string }
  | { type: 'protocol-error'; message: string; raw: string };

export const MAX_SERIAL_LINE_LENGTH = 8192;
export const MAX_WAVEFORM_SAMPLES = 512;

export class SerialParser {
  private buffer = '';
  private discardingOversizedLine = false;

  push(chunk: string): ProtocolEvent[] {
    const events: ProtocolEvent[] = [];
    let offset = 0;

    while (offset < chunk.length) {
      const newlineIndex = chunk.indexOf('\n', offset);
      const lineEnds = newlineIndex !== -1;
      const segmentEnd = lineEnds ? newlineIndex : chunk.length;
      const segmentLength = segmentEnd - offset;

      if (!this.discardingOversizedLine) {
        const remainingCapacity = MAX_SERIAL_LINE_LENGTH - this.buffer.length;
        if (segmentLength > remainingCapacity) {
          const raw = this.buffer + chunk.slice(offset, offset + remainingCapacity);
          this.buffer = '';
          this.discardingOversizedLine = true;
          events.push({
            type: 'protocol-error',
            message: 'Serial line exceeds maximum length',
            raw,
          });
        } else {
          this.buffer += chunk.slice(offset, segmentEnd);
        }
      }

      if (lineEnds) {
        if (!this.discardingOversizedLine) {
          const line = this.buffer.endsWith('\r') ? this.buffer.slice(0, -1) : this.buffer;
          if (line.trim().length > 0) events.push(this.parseLine(line));
          this.buffer = '';
        }
        this.discardingOversizedLine = false;
        offset = newlineIndex + 1;
      } else {
        offset = chunk.length;
      }
    }

    return events;
  }

  private parseLine(line: string): ProtocolEvent {
    const normalizedLine = line.trim();
    if (normalizedLine.startsWith('MODE:')) {
      return { type: 'mode', mode: normalizedLine.slice('MODE:'.length).trim() };
    }
    if (normalizedLine === 'FIRING') return { type: 'firing' };
    if (normalizedLine === 'FIRE_COMPLETE') return { type: 'fire-complete' };
    if (normalizedLine.startsWith('ERROR:')) {
      return {
        type: 'device-error',
        message: normalizedLine.slice('ERROR:'.length).trim(),
      };
    }
    if (!line.startsWith('WAVEFORM:')) {
      return { type: 'diagnostic', message: normalizedLine };
    }

    const payload = line.slice('WAVEFORM:'.length);
    let sampleCount = 1;
    for (const character of payload) {
      if (character === ',') sampleCount += 1;
      if (sampleCount > MAX_WAVEFORM_SAMPLES) {
        return {
          type: 'protocol-error',
          message: 'Waveform exceeds maximum sample count',
          raw: line,
        };
      }
    }

    const fields = payload.split(',');
    const samples = fields.map(Number);
    if (
      !payload ||
      fields.some((field) => !/^\d+$/.test(field)) ||
      samples.some((sample) => !Number.isInteger(sample) || sample < 0 || sample > 1023)
    ) {
      return { type: 'protocol-error', message: 'Invalid waveform payload', raw: line };
    }

    return { type: 'waveform', samples };
  }
}
