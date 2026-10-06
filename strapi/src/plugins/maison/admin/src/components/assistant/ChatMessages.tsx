import { Box, Flex, Typography } from '@strapi/design-system';
import type { UIMessage } from '@tanstack/ai-client';

import { toolLineOf, toolResultOf, type PartLike } from '../../assistant';
import { ToolLine } from './ToolLine';

/** Plain text, with its line breaks and no Markdown. A long word wraps instead of widening the chat. */
const PLAIN_TEXT = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;

/**
 * The messages of the chat, each part in order: text as plain text, a tool call as its line, and nothing for any other part
 * (thinking, and a tool's result, which its line already reports). Staff's messages and the assistant's are told apart.
 */
export const ChatMessages = ({ messages }: { messages: readonly UIMessage[] }) => (
  <Flex direction="column" alignItems="stretch" gap={4}>
    {messages.map((message) => {
      const fromStaff = message.role === 'user';
      const parts = message.parts as readonly PartLike[];
      return (
        <Box key={message.id} background={fromStaff ? 'primary100' : 'neutral100'} padding={4} hasRadius>
          <Flex direction="column" alignItems="stretch" gap={2}>
            <Typography variant="sigma" textColor="neutral600">
              {fromStaff ? 'You' : 'Assistant'}
            </Typography>
            {parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <Typography key={index} display="block" style={PLAIN_TEXT}>
                    {part.content}
                  </Typography>
                );
              }
              if (part.type === 'tool-call') {
                const line = toolLineOf(part, toolResultOf(parts, part.id));
                return line ? <ToolLine key={part.id} line={line} /> : null;
              }
              return null;
            })}
          </Flex>
        </Box>
      );
    })}
  </Flex>
);
