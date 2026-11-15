import { useCallback, useEffect, useRef, useState } from "react";

export type Remote<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Ask again with the same key. */
  retry: () => void;
};

/**
 * Load something from the backend whenever `key` changes; a null key loads
 * nothing. A newer request aborts the older one, so a stale answer can never
 * overwrite a fresh one. The loader reads the latest props through a ref, so
 * the key alone decides when to fetch.
 */
export function useRemote<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): Remote<T> {
  const [state, setState] = useState<Omit<Remote<T>, "retry">>({ data: null, loading: key !== null, error: null });
  const [attempt, setAttempt] = useState(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    if (key === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    loader
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
