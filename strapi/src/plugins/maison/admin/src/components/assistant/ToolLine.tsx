import { Typography } from '@strapi/design-system';

import type { ToolLineModel } from '../../assistant';

/** One tool call in the chat, such as `Maison · inquiries ✓ 12 results`. A failure is red, and says why. */
export const ToolLine = ({ line }: { line: ToolLineModel }) => (
  <Typography variant="pi" display="block" textColor={line.tone === 'error' ? 'danger600' : 'neutral600'}>
    {line.text}
  </Typography>
);
