import { useEffect, useState } from 'react';

import { useMaison } from '@/components/maison-provider';
import { toolErrorOf } from './mcp';
import { errorOf, type ScreenError } from './status';

/**
 * Calls one Maison tool once the customer is signed in, and again whenever `args` change.
 * Pass `null` as args to wait. Returns the structured result, or the tool's error.
 */
export function useTool<T>(screen: string, name: string, args: Record<string, unknown> | null) {
  const { status, maison } = useMaison();
  const [state, setState] = useState<{ loading: boolean; data: T | null; error: ScreenError | null }>({ loading: true, data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(args);

  useEffect(() => {
    if (status !== 'ready' || !maison || args === null) return;
    let cancelled = false;
    // A retry shows the spinner, not the error it's retrying.
    setState((previous) => ({ ...previous, loading: true, error: null }));
    maison.callTool(screen, name, args).then(
      (result) => {
        if (!cancelled) setState({ loading: false, data: (result.structuredContent as T | undefined) ?? null, error: toolErrorOf(result) });
      },
      (error: unknown) => {
        // A sign-in problem keeps its OAuth code (temporarily_unavailable, invalid_grant), so the screen can say what to do.
        if (!cancelled) setState({ loading: false, data: null, error: errorOf(error) });
      }
    );
    return () => {
      cancelled = true;
    };
    // `key` stands in for `args`, whose identity changes on every render.
  }, [status, maison, screen, name, key, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
