import * as React from 'react';

import { Box, Button, Field, Flex, Modal, Textarea, Typography } from '@strapi/design-system';

import { DraftedLine, describedByDraft } from './DraftedLine';
import {
  REPLY_LIMIT,
  canSendReply,
  insertSuggested,
  replyBody,
  replyTooLong,
  suggestedReply,
  type ReplyBody,
  type StaffInquiry,
} from '../inquiries';
import { CLAMPED_TEXT_STYLE } from './clampedText';

const HINT =
  "It's sent on LINE as Maison, with the customer's message quoted above it. Your name is saved on the inquiry, not sent. Only customers who have added Maison on LINE get it.";
// Sending is refused over the limit, so the dialog says why instead of only disabling Send on LINE.
const TOO_LONG = `A reply can have up to ${REPLY_LIMIT.toLocaleString('en-US')} characters.`;

/**
 * Reply on LINE: the customer's message, a box for the reply, and a button that puts in the suggested text when there is
 * one for the inquiry's queue and language. It sends nothing itself: `onSend` gets the body, and whoever opened the
 * dialog posts it and closes the dialog once it went. With `initialText`, the box starts with a draft the assistant wrote
 * (Use this draft), and a line above it says so.
 */
export const InquiryReplyDialog = ({
  inquiry,
  initialText,
  sending,
  cannotSendBecause,
  onSend,
  onClose,
}: {
  inquiry: StaffInquiry;
  /** The text of a draft from Use this draft. Read once, when the dialog opens. Without it the box starts empty. */
  initialText?: string;
  /** True from the click on Send on LINE until the answer comes back. Nothing in the dialog can be pressed then, and it stays open. */
  sending: boolean;
  /** Why no reply can be sent, whatever is written: shown above the box, with Send on LINE disabled. Null when one can. */
  cannotSendBecause: string | null;
  onSend: (body: ReplyBody) => void;
  onClose: () => void;
}) => {
  // Empty, unless staff chose Use this draft. Either way, what is in the box when staff press Send on LINE is what the customer gets.
  const [text, setText] = React.useState(initialText ?? '');
  const replyBox = React.useRef<HTMLTextAreaElement>(null);
  const fieldId = React.useId();
  const suggested = suggestedReply(inquiry.queue, inquiry.language);

  return (
    <Modal.Root
      open
      onOpenChange={(open) => {
        if (!open && !sending) onClose();
      }}
    >
      <Modal.Content
        // A click on the backdrop mustn't close the dialog and drop what was typed. Cancel, the cross and Escape still do.
        onInteractOutside={(event) => event.preventDefault()}
        // Focus starts in the reply, where staff begin, not on the cross that closes the dialog.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          replyBox.current?.focus();
        }}
      >
        <Modal.Header>
          <Modal.Title>Reply on LINE</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={6}>
            {/* Strapi can't message customers: the form says so before anything is written, not after Send. */}
            {cannotSendBecause !== null && (
              <Box background="danger100" padding={4} hasRadius>
                <Typography textColor="danger700">{cannotSendBecause}</Typography>
              </Box>
            )}

            {/* The customer's own words, as plain text. */}
            <Box background="neutral100" padding={4} hasRadius>
              <Flex direction="column" alignItems="stretch" gap={1}>
                <Typography display="block" style={CLAMPED_TEXT_STYLE}>
                  &ldquo;{inquiry.message}&rdquo;
                </Typography>
                {inquiry.product && (
                  <Typography variant="pi" textColor="neutral600">
                    About the {inquiry.product.name}
                  </Typography>
                )}
              </Flex>
            </Box>

            {/* A draft from the assistant: staff are told so before they read it, since what they send goes out as Maison's. */}
            {initialText !== undefined && <DraftedLine id={`${fieldId}-drafted`} />}

            <Field.Root id={fieldId} hint={HINT} error={replyTooLong(text) ? TOO_LONG : undefined}>
              <Field.Label>Your reply</Field.Label>
              <Textarea
                ref={replyBox}
                {...describedByDraft({ drafted: initialText !== undefined, lineId: `${fieldId}-drafted`, fieldId, hasError: replyTooLong(text) })}
                value={text}
                disabled={sending}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
              />
              <Field.Hint />
              <Field.Error />
            </Field.Root>

            {/* Only a complaint or praise has a text to suggest: a question needs an answer written for it. Staff edit it before they send. */}
            {suggested !== null && (
              <Flex>
                <Button
                  variant="secondary"
                  size="S"
                  disabled={sending}
                  onClick={() => {
                    setText(insertSuggested(text, suggested));
                    replyBox.current?.focus();
                  }}
                >
                  Use the suggested text
                </Button>
              </Flex>
            )}
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" disabled={sending} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={sending} disabled={sending || cannotSendBecause !== null || !canSendReply(text)} onClick={() => onSend(replyBody(text))}>
            Send on LINE
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};
