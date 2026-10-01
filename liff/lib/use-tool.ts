import { useEffect, useState } from 'react';

import { useMaison } from '@/components/maison-provider';
import { toolErrorOf, type ToolError } from './mcp';
import { SessionError } from './session';

/**
 * Calls one Maison tool once the customer is signed in, and again whenever `args` change.
 * Pass `null` as args to wait. Returns the structured result, or the tool's error.
 */
export function useTool<T>(screen: string, name: string, args: Record<string, unknown> | null) {
  const { status, maison } = useMaison();
  const [state, setState] = useState<{ loading: boolean; data: T | null; error: ToolError | null }>({ loading: true, data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(args);

  useEffect(() => {
    if (status !== 'ready' || !maison || args === null) return;
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true }));
    maison.callTool(screen, name, args).then(
      (result) => {
        if (!cancelled) setState({ loading: false, data: (result.structuredContent as T | undefined) ?? null, error: toolErrorOf(result) });
      },
      (error: Error) => {
        // A sign-in problem keeps its OAuth code (temporarily_unavailable, invalid_grant), so the screen can say what to do.
        const code = error instanceof SessionError ? error.code : 'network';
        if (!cancelled) setState({ loading: false, data: null, error: { code, message: error.message, hint: '' } });
      }
    );
    return () => {
      cancelled = true;
    };
    // `key` stands in for `args`, whose identity changes on every render.
  }, [status, maison, screen, name, key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
