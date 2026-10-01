'use client';

import Link from 'next/link';

import { COPY } from '@/lib/copy';
import type { ToolError } from '@/lib/mcp';
import { errorText } from '@/lib/status';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

/**
 * Loading and error states for one tool call. People see plain copy for the error's code; the tool's own message
 * and hint are written for agents, and the agent view shows them. not_found offers a way back, not a retry.
 */
export function StatusNote({ loading, error, retry }: { loading: boolean; error: ToolError | null; retry: () => void }) {
  const { locale } = useMaison();
  const t = COPY[locale];
  if (error) {
    return (
      <div role="alert" className="mx-5 my-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <p>{errorText(error, locale)}</p>
        {error.code === 'not_found' ? (
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
