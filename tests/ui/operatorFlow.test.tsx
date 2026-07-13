import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/App';
import { SimulatorAdapter } from '../../src/adapters/simulatorAdapter';
import { TestController } from '../../src/controller/testController';

function renderDashboard() {
  const adapter = new SimulatorAdapter();
  const controller = new TestController({ createId: () => 'demo-run' });
  return render(<App adapter={adapter} controller={controller} />);
}

async function configureRun() {
  renderDashboard();
  const fire = screen.getByRole('button', { name: /hold to fire/i });
  expect(fire).toBeDisabled();

  await act(async () => screen.getByRole('button', { name: /connect simulator/i }).click());
  await act(async () => screen.getByRole('radio', { name: /single phase/i }).click());
  fireEvent.change(screen.getByRole('textbox', { name: /meter serial/i }), { target: { value: 'MTR-2048' } });
  fireEvent.change(screen.getByRole('textbox', { name: /operator name/i }), { target: { value: 'A. Operator' } });
  screen.getByRole('button', { name: /arm test/i }).click();
  return fire;
}

describe('STOC operator dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('completes a simulator run through the guarded operator flow', async () => {
    const fire = await configureRun();
    fireEvent.pointerDown(fire);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await act(async () => vi.advanceTimersByTimeAsync(10));

    expect(screen.getByRole('status', { name: /test outcome/i })).toHaveTextContent(/sequence complete/i);
    expect(screen.getByRole('img', { name: /raw adc waveform/i })).toBeInTheDocument();
    expect(screen.getByText('200 samples')).toBeInTheDocument();
    expect(screen.getByText(/simulated data/i)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /test history/i })).toHaveTextContent('MTR-2048');
    expect(screen.getByRole('button', { name: /export json/i })).toBeEnabled();
  }, 10_000);

  it('cancels an incomplete pointer hold and fires only after the full hold', async () => {
    const fire = await configureRun();
    fireEvent.pointerDown(fire);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    fireEvent.pointerUp(fire);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(screen.queryByRole('status', { name: /test outcome/i })).not.toBeInTheDocument();

    fireEvent.pointerDown(fire);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByText(/capturing|firing/i, { selector: '.monitor-strip strong' })).toBeInTheDocument();
  });

  it('offers an explicit keyboard confirmation instead of an inaccessible hold gesture', async () => {
    const fire = await configureRun();
    fire.focus();
    fireEvent.keyDown(fire, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: /confirm test firing/i })).toBeInTheDocument();
    screen.getByRole('button', { name: /confirm fire/i }).click();
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByRole('status', { name: /test outcome/i })).toHaveTextContent(/sequence complete/i);
  });

  it('surfaces controller errors as an alert', async () => {
    const controller = new TestController();
    render(<App adapter={new SimulatorAdapter()} controller={controller} />);
    await act(async () => screen.getByRole('button', { name: /connect simulator/i }).click());
    controller.disconnect = vi.fn(async () => { throw new Error('Transport close failed'); });
    await act(async () => screen.getByRole('button', { name: /^disconnect simulator$/i }).click());
    expect(screen.getByRole('alert')).toHaveTextContent('Transport close failed');
  });
});
