import { config } from '@/lib/config';
import { errorDetail, type ScreenError } from '@/lib/status';

/**
 * The technical cause under an error's copy, in mock mode only (the stage and development): the raw message, and the
 * likely fix when there's a known one. Inside LINE, customers see the copy alone.
 */
export function ErrorDetail({ error }: { error: Pick<ScreenError, 'code' | 'message'> }) {
  const detail = config.liffMock ? errorDetail(error) : null;
  return detail ? <p className="mt-1 break-words font-mono text-[11px] leading-snug opacity-70">{detail}</p> : null;
}
