import type { TestResult } from '../domain/types';

function protectMetadata(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function resultToJson(result: TestResult): string {
  return JSON.stringify(result, null, 2);
}

export function resultToCsv(result: TestResult): string {
  const metadata: Array<[string, string | number | undefined]> = [
    ['Result ID', result.id],
    ['Started at', new Date(result.startedAt).toISOString()],
    ['Completed at', new Date(result.completedAt).toISOString()],
    ['Adapter', result.adapterKind],
    ['Profile', result.profile.name],
    ['Meter serial number', result.metadata.meterSerialNumber],
    ['Operator name', result.metadata.operatorName],
    ['Notes', result.metadata.notes],
    ['Target amps', result.profile.targetAmps],
    ['Duration ms', result.profile.durationMs],
    ['Outcome', result.outcome],
    ['Failure message', result.outcome === 'failed' ? result.failureMessage : undefined],
    ['Raw peak', result.rawPeak],
  ];
  const comments = metadata
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([label, value]) => {
      const safeValue = typeof value === 'string' ? protectMetadata(value) : value;
      return `# ${label},${csvField(safeValue)}`;
    });
  const samples = result.samples.map((sample, index) => `${index},${sample}`);
  const diagnostics = result.outcome === 'failed'
    ? [
        'diagnostic_timestamp,level,message',
        ...result.diagnosticTrace.map((entry) => [
          new Date(entry.timestamp).toISOString(),
          entry.level,
          protectMetadata(entry.message),
        ].map(csvField).join(',')),
      ]
    : [];
  return [...comments, ...diagnostics, 'sample_index,raw_adc', ...samples].join('\r\n');
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
