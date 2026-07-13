import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

export function WaveformChart({ samples, simulated }: { samples: number[]; simulated: boolean }) {
  const data = samples.map((rawAdc, sample) => ({ sample, rawAdc }));
  return <section className="panel waveform-panel" aria-labelledby="waveform-title">
    <div className="panel-heading"><div><p className="eyebrow">Acquisition channel A0</p><h2 id="waveform-title">Raw ADC waveform</h2></div><span className="sample-badge" role="status" aria-label="Waveform sample count">{samples.length} samples</span></div>
    <div className="chart-shell" role="img" aria-label="Raw ADC waveform" aria-describedby="waveform-description">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 18, left: 4 }}>
          <CartesianGrid stroke="rgba(67,216,236,.08)" vertical={false} />
          <XAxis type="number" dataKey="sample" domain={[0, Math.max(1, samples.length - 1)]} tick={{ fill: '#819097', fontSize: 10 }} label={{ value: 'Sample', position: 'insideBottom', fill: '#819097', fontSize: 10 }} />
          <YAxis type="number" domain={[0, 1023]} ticks={[0, 256, 512, 768, 1023]} tick={{ fill: '#819097', fontSize: 10 }} label={{ value: 'Raw ADC', angle: -90, position: 'insideLeft', fill: '#819097', fontSize: 10 }} />
          <Line type="linear" dataKey="rawAdc" stroke="#43d8ec" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <p id="waveform-description" className="sr-only">Raw ADC scale 0 to 1023 counts by sample index.</p>
    <p className="data-disclaimer" role="note" aria-label="Measurement limitation">{simulated ? 'SIMULATED DATA' : 'SERIAL DEVICE DATA'} · RAW 10-BIT ADC COUNTS · NOT CALIBRATED AMPERES</p>
  </section>;
}
