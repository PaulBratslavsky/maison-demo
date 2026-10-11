import { Button } from '@strapi/design-system';
import styled from 'styled-components';

import type { DraftCardModel } from '../../assistant';
import type { PageDraft } from '../../drafts';

/**
 * A draft in the chat, inside the assistant's bubble beside the tool boxes: what it is for, the text as plain text with its line breaks, and Use this
 * draft when the admin may use it. Nothing here sends anything. Use this draft hands the draft to the page, which opens the item's own dialog.
 * It is drawn like a tool box: a bordered frame with the theme's colours, and the text is never Markdown, so what the model wrote is what staff read
 * and what the dialog starts with.
 */
const Frame = styled.div`
  margin-top: 8px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.neutral0};
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Title = styled.div`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.neutral800};
  overflow-wrap: anywhere;
`;

const Body = styled.div`
  color: ${({ theme }) => theme.colors.neutral800};
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Actions = styled.div`
  display: flex;
`;

export const DraftCard = ({
  model,
  title,
  canUse,
  onUse,
}: {
  model: DraftCardModel;
  title: string;
  canUse: boolean;
  onUse: (draft: PageDraft) => void;
}) => (
  <Frame role="group" aria-label={title} data-message-part="draft">
    <Title>{title}</Title>
    <Body>{model.draft.text}</Body>
    {canUse && (
      <Actions>
        <Button type="button" size="S" onClick={() => onUse(model.draft)}>
          Use this draft
        </Button>
      </Actions>
    )}
  </Frame>
);
