'use client';

import Link from 'next/link';

import { COPY } from '@/lib/copy';
import { errorText, leadsHome, type ScreenError } from '@/lib/status';
import { ErrorDetail } from './error-detail';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

/**
 * Loading and error states for one tool call. People see plain copy for the error's code; the tool's own message
 * and hint are written for agents, and the agent view shows them (mock mode adds them on a technical line).
 * An error that trying again can't fix offers a way back, not a retry: not_found, and invalid_input when the call's
 * input came from the URL (`fromUrl`).
 */
export function StatusNote({
  loading,
  error,
  retry,
  fromUrl = false,
}: {
  loading: boolean;
  error: ScreenError | null;
  retry: () => void;
  fromUrl?: boolean;
}) {
  const { locale } = useMaison();
  const t = COPY[locale];
  if (error) {
    return (
      <div role="alert" className="mx-5 my-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <p>{errorText(error, locale)}</p>
        <ErrorDetail error={error} />
        {leadsHome(error.code, fromUrl) ? (
          <Link href="/" className="mt-3 inline-flex min-h-[44px] items-center text-xs underline">
            {t.backHome}
          </Link>
        ) : (
          <button type="button" onClick={retry} className="mt-3 min-h-[44px] text-xs underline">
            {t.retry}
          </button>
        )}
      </div>
    );
  }
  return loading ? <Spinner label={t.loading} /> : null;
}
