import { describe, expect, it, vi } from 'vitest';

import { createShutdownCoordinator } from '../../electron/shutdownCoordinator';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('createShutdownCoordinator', () => {
  it('prevents shutdown until serial cleanup settles', async () => {
    const cleanup = deferred();
    const preventDefault = vi.fn();
    const finish = vi.fn();
    const coordinator = createShutdownCoordinator(() => cleanup.promise, finish, vi.fn());

    coordinator.request({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
    cleanup.resolve();
    await vi.waitFor(() => expect(finish).toHaveBeenCalledOnce());
  });

  it('runs one cleanup for repeated shutdown requests and permits the final event', async () => {
    const cleanup = deferred();
    const preventDefault = vi.fn();
    const finish = vi.fn();
    const coordinator = createShutdownCoordinator(() => cleanup.promise, finish, vi.fn());

    coordinator.request({ preventDefault });
    coordinator.request({ preventDefault });
    cleanup.resolve();
    await vi.waitFor(() => expect(finish).toHaveBeenCalledOnce());
    coordinator.request({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(2);
  });

  it('reports cleanup failure but still completes shutdown', async () => {
    const error = new Error('Close failed');
    const report = vi.fn();
    const finish = vi.fn();
    const coordinator = createShutdownCoordinator(async () => { throw error; }, finish, report);

    coordinator.request({ preventDefault: vi.fn() });

    await vi.waitFor(() => expect(finish).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith(error);
  });
});
