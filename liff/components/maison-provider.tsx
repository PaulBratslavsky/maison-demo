'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { config } from '@/lib/config';
import { toLocale } from '@/lib/liff';
import { getMaison, onToolCall, type Maison } from '@/lib/maison';
import type { ToolCallRecord } from '@/lib/mcp';
import { errorOf, type ScreenError } from '@/lib/status';
import type { Locale } from '@/lib/types';

interface MaisonContext {
  status: 'starting' | 'ready' | 'error';
  /** The message of a failed sign-in, or null. */
  error: string | null;
  /**
   * The code of a failed sign-in, or null: an OAuth error (temporarily_unavailable, invalid_grant), `network` when
   * Strapi can't be reached, or `error`.
   */
  errorCode: string | null;
  /** A failed sign-in as the screens show it (errorText), with any wait the server named, or null. */
  signInError: ScreenError | null;
  maison: Maison | null;
  locale: Locale;
  calls: ToolCallRecord[];
  agentView: boolean;
  setAgentView: (on: boolean) => void;
  retrySignIn: () => void;
}

type SignIn = Pick<MaisonContext, 'status' | 'signInError' | 'maison'>;

const Context = createContext<MaisonContext | null>(null);
const AGENT_VIEW_KEY = 'maison.agentView';

export function MaisonProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SignIn>({ status: 'starting', signInError: null, maison: null });
  const [attempt, setAttempt] = useState(0);
  const [calls, setCalls] = useState<ToolCallRecord[]>([]);
  const [agentView, setAgentViewState] = useState(false);

  useEffect(() => {
    try {
      setAgentViewState(window.localStorage.getItem(AGENT_VIEW_KEY) === 'on');
    } catch {
      // storage unavailable: start with the agent view off
    }
    return onToolCall((record) => setCalls((previous) => [...previous.slice(-49), record]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'starting', signInError: null, maison: null });
    getMaison().then(
      (maison) => {
        if (!cancelled) setState({ status: 'ready', signInError: null, maison });
      },
      (error: unknown) => {
        // A failed fetch (Strapi unreachable) is `network`; a token-endpoint refusal keeps its OAuth code.
        if (!cancelled) setState({ status: 'error', signInError: errorOf(error), maison: null });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const setAgentView = useCallback((on: boolean) => {
    setAgentViewState(on);
    try {
      window.localStorage.setItem(AGENT_VIEW_KEY, on ? 'on' : 'off');
    } catch {
      // not remembered this time
    }
  }, []);
  const retrySignIn = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo<MaisonContext>(
    () => ({
      ...state,
      error: state.signInError?.message ?? null,
      errorCode: state.signInError?.code ?? null,
      locale: state.maison?.locale ?? toLocale(config.demoLocale),
      calls,
      agentView,
      setAgentView,
      retrySignIn,
    }),
    [state, calls, agentView, setAgentView, retrySignIn]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useMaison = (): MaisonContext => {
  const context = useContext(Context);
  if (!context) throw new Error('useMaison must be used inside <MaisonProvider>');
  return context;
};
