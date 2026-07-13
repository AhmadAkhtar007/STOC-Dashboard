import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectionPanel } from './ConnectionPanel';

afterEach(cleanup);

describe('ConnectionPanel', () => {
  it('keeps disconnect available while a run is busy', () => {
    render(
      <ConnectionPanel
        connected
        busy
        adapterKind="simulator"
        connectionLabel="Built-in simulator"
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /disconnect simulator/i })).toBeEnabled();
  });
});
