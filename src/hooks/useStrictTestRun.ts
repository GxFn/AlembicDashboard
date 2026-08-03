import { useCallback, useEffect, useMemo, useState } from 'react';
import { strictTestApi } from '../api/strictTest';
import {
  StrictTestRunController,
  type StrictTestRunState,
  type StrictTestStorage,
} from '../strictTest/StrictTestRunController';

const INITIAL_STATE: StrictTestRunState = {
  kind: 'idle',
  authority: null,
  preflight: null,
  status: null,
  report: null,
  problem: null,
};

const browserSessionStorage: StrictTestStorage = {
  getItem(key) {
    return window.sessionStorage.getItem(key);
  },
  setItem(key, value) {
    window.sessionStorage.setItem(key, value);
  },
  removeItem(key) {
    window.sessionStorage.removeItem(key);
  },
};

function browserRandomUUID(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('crypto.randomUUID is required for strict-test run authority.');
  }
  return globalThis.crypto.randomUUID();
}

export function useStrictTestRun(projectRoot: string | null) {
  const [state, setState] = useState<StrictTestRunState>(INITIAL_STATE);
  const controller = useMemo(() => new StrictTestRunController({
    api: strictTestApi,
    storage: browserSessionStorage,
    randomUUID: browserRandomUUID,
    onStateChange: setState,
  }), [projectRoot]);

  useEffect(() => {
    setState(controller.getState());
    if (projectRoot) {
      void controller.restore(projectRoot);
    }
    return () => controller.dispose();
  }, [controller, projectRoot]);

  const start = useCallback(() => controller.start(projectRoot ?? ''), [controller, projectRoot]);
  const isBusy = state.kind === 'preflight' || state.kind === 'starting' || state.kind === 'running';

  return { state, start, isBusy };
}
