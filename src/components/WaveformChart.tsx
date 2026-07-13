export function WaveformChart({ samples }: { samples: number[] }) {
  const width = 1000, height = 280;
  const points = samples.length < 2 ? '' : samples.map((v, i) => `${(i / (samples.length - 1)) * width},${height - (v / 1023) * height}`).join(' ');
  return <section className="panel waveform-panel" aria-labelledby="waveform-title">
    <div className="panel-heading"><div><p className="eyebrow">Acquisition channel A0</p><h2 id="waveform-title">Raw ADC waveform</h2></div><span className="sample-badge">{samples.length} samples</span></div>
    <div className="chart-shell">
      <div className="y-label">Raw ADC</div>
      <svg role="img" aria-label="Raw ADC waveform" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <title>Raw ADC waveform, 0 to 1023 counts</title><line x1="0" y1={height / 2} x2={width} y2={height / 2} className="chart-midline" />
        {points && <polyline points={points} className="wave-line" vectorEffect="non-scaling-stroke" />}
      </svg><div className="axis-scale"><span>0</span><span>Sample</span><span>{Math.max(0, samples.length - 1)}</span></div>
    </div><p className="data-disclaimer">SIMULATED DATA · RAW 10-BIT ADC COUNTS · NOT CALIBRATED AMPERES</p>
  </section>;
}
