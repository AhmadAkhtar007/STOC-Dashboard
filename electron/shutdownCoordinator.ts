export interface PreventableShutdownEvent {
  preventDefault(): void;
}

export interface ShutdownCoordinator {
  request(event: PreventableShutdownEvent): void;
}

export function createShutdownCoordinator(
  cleanup: () => Promise<void>,
  finish: () => void,
  reportError: (error: unknown) => void,
): ShutdownCoordinator {
  let cleanupStarted = false;
  let cleanupFinished = false;

  return {
    request(event) {
      if (cleanupFinished) return;
      event.preventDefault();
      if (cleanupStarted) return;
      cleanupStarted = true;
      void cleanup()
        .catch(reportError)
        .finally(() => {
          cleanupFinished = true;
          finish();
        });
    },
  };
}
