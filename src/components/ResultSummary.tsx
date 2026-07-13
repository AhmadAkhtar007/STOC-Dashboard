import type { TestResult } from '../domain/types';
export function ResultSummary({ result, onJson, onCsv, onPrint }: { result?: TestResult; onJson: () => void; onCsv: () => void; onPrint: () => void }) {
  if (!result) return <section className="panel result-empty"><p className="eyebrow">Run result</p><h2>Awaiting sequence</h2><p>Connect, configure and arm the system to begin acquisition.</p></section>;
  return <section className="panel result-panel" aria-labelledby="result-title">
    <div role="status" aria-label="Test outcome"><p className="eyebrow">Verified controller sequence</p><h2 id="result-title">Sequence complete</h2></div>
    <dl role="group" aria-label="Run instrumentation"><div><dt>Profile</dt><dd>{result.profile.name}</dd></div><div><dt>Adapter type</dt><dd>{result.adapterKind}</dd></div><div><dt>Design target</dt><dd>{result.profile.targetAmps.toLocaleString()} A</dd></div><div><dt>Intended duration</dt><dd>{result.profile.durationMs} ms</dd></div><div><dt>Sample count</dt><dd>{result.samples.length}</dd></div><div><dt>Raw peak</dt><dd>{result.rawPeak} ADC</dd></div></dl>
    <p className="honesty-note">This confirms command and capture completion only. It is not a certified meter pass/fail result.</p>
    <div className="export-actions"><button onClick={onJson}>Export JSON</button><button onClick={onCsv}>Export CSV</button><button onClick={onPrint}>Print summary</button></div>
  </section>;
}
