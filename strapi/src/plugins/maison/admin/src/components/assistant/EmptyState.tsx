import { Box, Button, Flex, Typography } from '@strapi/design-system';
import styled from 'styled-components';

import { STARTERS } from '../../assistant';

/**
 * What the message list shows before the first message: a title, one sentence, and the three starters. Centred in both directions, as in
 * strapi-plugin-tanstack-ai 1.6.0 (`MessageList.tsx`), which has no starters: they are Maison's.
 */
const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
`;

const Sentence = styled.div`
  max-width: 520px;
`;

interface EmptyStateProps {
  /** A starter was pressed: its text is sent as it is. */
  onStarter: (text: string) => void;
  /** Whether a send of this text would work now. A starter that would not is switched off. */
  canStart: (text: string) => boolean;
}

export const EmptyState = ({ onStarter, canStart }: EmptyStateProps) => (
  <Wrapper>
    <Typography variant="beta" textColor="neutral400">
      Ask Maison
    </Typography>
    <Box paddingTop={2}>
      <Sentence>
        <Typography variant="omega" textColor="neutral500">
          Ask about visit requests, customer questions and inquiries. The assistant looks things up and never sends, confirms or changes anything.
        </Typography>
      </Sentence>
    </Box>
    <Box paddingTop={5}>
      <Flex role="group" aria-label="Suggestions" gap={2} wrap="wrap" justifyContent="center">
        {STARTERS.map((starter) => (
          <Button key={starter} size="S" variant="secondary" disabled={!canStart(starter)} onClick={() => onStarter(starter)}>
            {starter}
          </Button>
        ))}
      </Flex>
    </Box>
  </Wrapper>
);
