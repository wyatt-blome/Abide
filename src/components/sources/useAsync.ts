"use client";

import { useEffect, useEffectEvent, useState } from "react";

export interface AsyncState<T> {
  loading: boolean;
  data?: T;
  error?: unknown;
}

/**
 * Run `fn` whenever `key` changes (null = not yet). Results for an older key are discarded, so a
 * fast range change never shows the previous passage's data.
 */
export function useAsync<T>(key: string | null, fn: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: unknown }>({ key: null });
  const run = useEffectEvent(fn);
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    run().then(
      (data) => {
        if (alive) setState({ key, data });
      },
      (error: unknown) => {
        if (alive) setState({ key, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [key]);
  if (key === null || state.key !== key) return { loading: true };
  return { loading: false, data: state.data, error: state.error };
}
