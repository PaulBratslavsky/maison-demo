import { Typography } from '@strapi/design-system';

import { DRAFTED_LINE } from '../drafts';

/**
 * The line over the box of a dialog that opened with a draft: the assistant wrote the text, and staff are told to check it. The dialog moves the focus
 * straight into the box, so the line is also part of what describes the box, and a screen reader reads it with the box's label and hint.
 */
export const DraftedLine = ({ id }: { id: string }) => (
  <Typography id={id} variant="pi" textColor="warning700">
    {DRAFTED_LINE}
  </Typography>
);

/**
 * The ids that describe the box of a dialog: the line about the draft first, then what the design system describes a field's box by, which is the
 * field's error when it has one and otherwise its hint, with the ids it builds from the field's own: `<id>-error` or `<id>-hint`. They are props to spread
 * on the box. A box with no draft gets none, and keeps the design system's own description: an `aria-describedby` that is passed, even as undefined, replaces
 * it. A test holds these ids to the elements that carry the words.
 */
export const describedByDraft = ({ drafted, lineId, fieldId, hasError }: { drafted: boolean; lineId: string; fieldId: string; hasError: boolean }): { 'aria-describedby'?: string } =>
  drafted ? { 'aria-describedby': `${lineId} ${fieldId}-${hasError ? 'error' : 'hint'}` } : {};
