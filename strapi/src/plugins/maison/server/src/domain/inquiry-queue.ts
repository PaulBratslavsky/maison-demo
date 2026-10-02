import type { InquiryKind, InquiryQueue } from '../constants';

export interface QueueFacts {
  handedOff: boolean;
  kind: InquiryKind | null;
  answered: boolean | null;
}

/** The spec's queue rule, in code and never by the model: a hand-off or an unanswered question needs an answer. */
export const queueFor = ({ handedOff, kind, answered }: QueueFacts): InquiryQueue => {
  if (handedOff) return 'needs-answer';
  if (kind === 'question' && answered === false) return 'needs-answer';
  if (kind === 'complaint') return 'complaint';
  if (kind === 'praise') return 'praise';
  return 'none';
};
