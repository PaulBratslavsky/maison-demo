import * as React from 'react';

import { Box, Button, Checkbox, Field, Flex, Modal, SingleSelect, SingleSelectOption, Textarea, Typography } from '@strapi/design-system';

import { CATEGORY_OPTIONS, answerBody, canSendAnswer, type AnswerBody, type StaffQuestion } from '../questions';

const HINT = "It's sent on LINE in your name. With the box ticked, it's also saved as product knowledge, so write it for any customer.";

/**
 * Answer: the question, a box for the answer, and whether it also becomes product knowledge, under a category. It
 * sends nothing itself: `onSend` gets the body, and whoever opened the dialog posts it and closes the dialog once it went.
 */
export const AnswerDialog = ({
  question,
  sending,
  onSend,
  onClose,
}: {
  question: StaffQuestion;
  /** True from the click on Send on LINE until the answer comes back. Nothing in the dialog can be pressed then, and it stays open. */
  sending: boolean;
  onSend: (body: AnswerBody) => void;
  onClose: () => void;
}) => {
  // Never pre-filled: whatever staff write is what the customer gets. Ticked, because most answers are worth keeping.
  const [text, setText] = React.useState('');
  const [addToKnowledge, setAddToKnowledge] = React.useState(true);
  const [category, setCategory] = React.useState('');
  const form = { text, addToKnowledge, category };

  return (
    <Modal.Root
      open
      onOpenChange={(open) => {
        if (!open && !sending) onClose();
      }}
    >
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>Answer {question.reference}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={6}>
            {/* The customer's own words, as plain text. */}
            <Box background="neutral100" padding={4} hasRadius>
              <Flex direction="column" alignItems="stretch" gap={1}>
                <Typography display="block" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
                  &ldquo;{question.question}&rdquo;
                </Typography>
                {question.product && (
                  <Typography variant="pi" textColor="neutral600">
                    About the {question.product.name}
                  </Typography>
                )}
              </Flex>
            </Box>

            <Field.Root hint={HINT}>
              <Field.Label>Your answer</Field.Label>
              <Textarea
                value={text}
                disabled={sending}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
              />
              <Field.Hint />
            </Field.Root>

            <Checkbox checked={addToKnowledge} disabled={sending} onCheckedChange={(checked) => setAddToKnowledge(checked === true)}>
              Add to product knowledge
            </Checkbox>

            {/* Only an answer that becomes product knowledge has a category. */}
            {addToKnowledge && (
              <Field.Root>
                <Field.Label>Category</Field.Label>
                <SingleSelect value={category} disabled={sending} onChange={(value) => setCategory(String(value))}>
                  {CATEGORY_OPTIONS.map(({ value, label }) => (
                    <SingleSelectOption key={value} value={value}>
                      {label}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Field.Root>
            )}
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" disabled={sending} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={sending} disabled={!canSendAnswer(form)} onClick={() => onSend(answerBody(form))}>
            Send on LINE
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};
