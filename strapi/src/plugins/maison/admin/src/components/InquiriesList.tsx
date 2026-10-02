import * as React from 'react';

import {
  Badge,
  Box,
  Button,
  Flex,
  MenuItem,
  SimpleMenu,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
  VisuallyHidden,
} from '@strapi/design-system';
import { CaretDown, CaretUp } from '@strapi/icons';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

import {
  CLOSE_REASON_OPTIONS,
  DEFAULT_FILTER,
  FILTERS,
  FILTER_LABELS,
  LIST_LIMIT,
  canClose,
  canLabelAgain,
  canReplyTo,
  handOffText,
  kindLabel,
  labelNote,
  lineFailure,
  quotaText,
  sentimentText,
  statusLabel,
  type ActionAnswer,
  type CloseReason,
  type InquiryFilter,
  type Quota,
  type StaffInquiry,
} from '../inquiries';
import { startPolling } from '../poll';
import { askedAt, replyNotice } from '../questions';
import { useInquiriesSummary } from '../useInquiriesSummary';
import { ChangeLabelDialog } from './ChangeLabelDialog';
import { InquiryCounts } from './InquiryCounts';
import { InquiryReplyDialog } from './InquiryReplyDialog';

const REFRESH_MS = 5000;
const EMPTY: Record<InquiryFilter, string> = {
  'needs-answer': 'No inquiries need an answer.',
  complaint: 'No open complaints.',
  praise: 'No open praise.',
  'not-labelled': 'Every open inquiry has a label.',
  all: 'No inquiries yet.',
};
const STATUS_BADGES = { open: 'warning', replied: 'success', closed: 'neutral' } as const;
const KIND_BADGES = { question: 'primary', complaint: 'danger', praise: 'success', other: 'secondary' } as const;
const SENTIMENT_COLORS = { positive: 'success600', neutral: 'neutral800', negative: 'danger600' } as const;
/**
 * The table keeps its cells on one line, so the customer's words wrap instead, within about 24rem. They keep their line
 * breaks, and a long message (a customer can send a thousand blank lines) scrolls in its box instead of stretching the row.
 */
const TEXT = {
  display: 'block',
  maxWidth: '24rem',
  style: { whiteSpace: 'pre-wrap', overflowWrap: 'break-word', maxHeight: '12rem', overflowY: 'auto' },
} as const;
/** LINE's reasons, the model's words and a hand-off's question wrap within about 18rem. */
const WRAPPED = { display: 'block', maxWidth: '18rem', style: { whiteSpace: 'normal', overflowWrap: 'break-word' } } as const;

/** What can be sent for an inquiry, as the last word of its route. */
type Action = 'reply' | 'close' | 'label' | 'label-again';
/** What is on its way to the server: one action, for one inquiry. */
type Acting = { documentId: string; action: Action };

interface RowProps {
  inquiry: StaffInquiry;
  /** Whether the admin may reply to customers, close inquiries and change labels. */
  canReply: boolean;
  acting: Acting | null;
  onReply: () => void;
  onCloseInquiry: (reason: CloseReason) => void;
  onChangeLabel: () => void;
  onLabelAgain: () => void;
}

const InquiryRow = ({ inquiry, canReply, acting, onReply, onCloseInquiry, onChangeLabel, onLabelAgain }: RowProps) => {
  /** Whether "What the concierge said" is open. The row keeps it across the 5-second refreshes, which keep its key. */
  const [showReply, setShowReply] = React.useState(false);
  const busy = acting !== null;
  const isActing = (action: Action) => acting?.documentId === inquiry.documentId && acting.action === action;
  const note = labelNote(inquiry);
  const failure = lineFailure(inquiry.line);

  return (
    <Tr>
      <Td>
        <Flex direction="column" alignItems="flex-start" gap={1}>
          <Typography>{askedAt(inquiry.createdAt)}</Typography>
          <Typography variant="pi" textColor="neutral600">
            {inquiry.customer}
          </Typography>
        </Flex>
      </Td>
      <Td>
        <Flex direction="column" alignItems="flex-start" gap={2}>
          {/* The customer's own words, as plain text. */}
          <Typography {...TEXT}>{inquiry.message}</Typography>
          <Button
            variant="ghost"
            size="S"
            aria-expanded={showReply}
            endIcon={showReply ? <CaretUp aria-hidden /> : <CaretDown aria-hidden />}
            onClick={() => setShowReply(!showReply)}
          >
            What the concierge said
          </Button>
          {showReply && (
            <Box background="neutral100" padding={3} hasRadius maxWidth="24rem">
              <Flex direction="column" alignItems="stretch" gap={2}>
                {inquiry.reply ? (
                  <Typography {...TEXT}>{inquiry.reply}</Typography>
                ) : (
                  <Typography textColor="neutral600">The concierge gave no reply.</Typography>
                )}
                {/* The labels are a model's, and so are its reason and topic: they are never shown as a person's words. */}
                {inquiry.topic && (
                  <Typography variant="pi" textColor="neutral600" {...WRAPPED}>
                    The model's topic: {inquiry.topic}
                  </Typography>
                )}
                {inquiry.reason && (
                  <Typography variant="pi" textColor="neutral600" {...WRAPPED}>
                    The model's reason: {inquiry.reason}
                  </Typography>
                )}
              </Flex>
            </Box>
          )}
        </Flex>
      </Td>
      <Td>
        <Typography>{inquiry.product?.name ?? '—'}</Typography>
      </Td>
      <Td>
        <Flex direction="column" alignItems="flex-start" gap={1}>
          <Badge variant={inquiry.kind ? KIND_BADGES[inquiry.kind] : 'neutral'}>{kindLabel(inquiry.kind)}</Badge>
          {/* An inquiry with no labels at all has nothing to say about its sentiment: the badge and the note do. */}
          {(inquiry.kind !== null || inquiry.sentimentLabel !== null) && (
            <Typography textColor={inquiry.sentimentLabel ? SENTIMENT_COLORS[inquiry.sentimentLabel] : 'neutral600'}>
              {sentimentText(inquiry.sentimentScore, inquiry.sentimentLabel)}
            </Typography>
          )}
          {note && (
            <Typography variant="pi" textColor="neutral600">
              {note}
            </Typography>
          )}
        </Flex>
      </Td>
      <Td>
        <Flex direction="column" alignItems="flex-start" gap={1}>
          <Badge variant={STATUS_BADGES[inquiry.status]}>{statusLabel(inquiry)}</Badge>
          {/* A hand-off is answered under Questions, so there is no Reply on LINE for it: this says where to go. */}
          {inquiry.question && (
            <Typography variant="pi" textColor="neutral600" {...WRAPPED}>
              {handOffText(inquiry.question)}
            </Typography>
          )}
          {failure && (
            <Typography variant="pi" textColor="danger600" {...WRAPPED}>
              {failure}
            </Typography>
          )}
        </Flex>
      </Td>
      {canReply && (
        <Td>
          <Flex gap={2} wrap="wrap">
            {canReplyTo(inquiry) && (
              <Button size="S" disabled={busy} onClick={onReply}>
                Reply on LINE
              </Button>
            )}
            {canClose(inquiry) && (
              <SimpleMenu label="Close" size="S" variant="tertiary" loading={isActing('close')} disabled={busy}>
                {CLOSE_REASON_OPTIONS.map(({ value, label }) => (
                  <MenuItem key={value} onSelect={() => onCloseInquiry(value)}>
                    {label}
                  </MenuItem>
                ))}
              </SimpleMenu>
            )}
            <Button size="S" variant="tertiary" disabled={busy} onClick={onChangeLabel}>
              Change label
            </Button>
            {canLabelAgain(inquiry) && (
              <Button size="S" variant="tertiary" loading={isActing('label-again')} disabled={busy} onClick={onLabelAgain}>
                Label again
              </Button>
            )}
          </Flex>
        </Td>
      )}
    </Tr>
  );
};

export const InquiriesList = ({ canReply, refreshKey }: { canReply: boolean; refreshKey: number }) => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { summary, loadError: summaryError, reload: reloadSummary } = useInquiriesSummary(refreshKey);
  const [filter, setFilter] = React.useState<InquiryFilter>(DEFAULT_FILTER);
  const [inquiries, setInquiries] = React.useState<StaffInquiry[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [quota, setQuota] = React.useState<Quota | null>(null);
  /**
   * From the click until the server has answered and the rows have reloaded, nothing else can be sent: the server has
   * no guard against a second click, so a reply sent twice would reach the customer twice. `working` closes the gap
   * before the next render, and `acting` is what the buttons show.
   */
  const [acting, setActing] = React.useState<Acting | null>(null);
  const working = React.useRef(false);
  /** The inquiry whose Reply on LINE dialog is open, and the one whose Change label dialog is open. */
  const [replying, setReplying] = React.useState<StaffInquiry | null>(null);
  const [relabelling, setRelabelling] = React.useState<StaffInquiry | null>(null);
  /** The filter on screen, updated the moment staff pick another. A response for any other filter is dropped. */
  const shownFilter = React.useRef<InquiryFilter>(filter);

  const load = React.useCallback(async (): Promise<void> => {
    const requested = filter;
    try {
      const { data } = await get<{ inquiries?: StaffInquiry[] }>('/maison/inquiries', { params: { filter: requested, limit: LIST_LIMIT } });
      if (shownFilter.current !== requested) return; // the filter changed while this load was in flight
      setInquiries(data.inquiries ?? []);
      setLoadError(null);
    } catch (error) {
      if (shownFilter.current === requested) setLoadError((error as Error).message);
    }
  }, [get, filter]);

  // The next refresh starts only after the last one finished, so a slow server never gets overlapping requests.
  React.useEffect(() => startPolling(load, REFRESH_MS), [load, refreshKey]);

  /**
   * This month's LINE messages. Each call makes two requests to LINE, so it isn't part of the 5-second refresh: it loads
   * when the tab opens, and again after a reply, which is what changes it.
   */
  const loadQuota = React.useCallback(async (): Promise<void> => {
    try {
      const { data } = await get<Quota>('/maison/inquiries/quota');
      setQuota(data);
    } catch {
      // The line is a courtesy: without it, the tab shows nothing about the quota.
    }
  }, [get]);

  React.useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  const changeFilter = (value: InquiryFilter) => {
    shownFilter.current = value;
    // The rows on screen are the old filter's: they go, and the new filter's rows load at once.
    setInquiries(null);
    setLoadError(null);
    setFilter(value);
  };

  /**
   * Reply on LINE, Close, Change label or Label again, for one inquiry (with its body, for the three that take one). The
   * notice is the server's own message: a warning when it says the customer has the reply but something after it went
   * wrong, a success otherwise, and when the server refused, why, in its words. `onSuccess` runs as soon as it went, so a
   * dialog closes at once; a refused one stays open, with what was written. Then the rows and the counts reload.
   */
  const run = async (documentId: string, action: Action, body?: unknown, onSuccess?: () => void): Promise<void> => {
    if (working.current) return;
    working.current = true;
    setActing({ documentId, action });
    try {
      try {
        const { data } = await post<ActionAnswer>(`/maison/inquiries/${documentId}/${action}`, body);
        toggleNotification(replyNotice(data));
        onSuccess?.();
      } catch (error) {
        toggleNotification({ type: 'danger', message: (error as Error).message });
      }
      await load(); // load reports its own errors
      reloadSummary();
    } finally {
      setActing(null);
      working.current = false;
    }
  };

  const columns = ['Received', 'Message', 'Piece', 'Kind and sentiment', 'Status'];
  const quotaLine = quota ? quotaText(quota) : '';

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Flex direction="column" alignItems="flex-start" gap={1}>
        <Typography variant="delta" tag="h2">
          Customer inquiries
        </Typography>
        <Typography variant="pi" textColor="neutral600">
          What customers ask the concierge, in queues. A model labels each inquiry, and you can change its label. Refreshes every{' '}
          {REFRESH_MS / 1000} seconds. {loadError && inquiries !== null ? `Last refresh failed: ${loadError}` : ''}
        </Typography>
      </Flex>

      {summary ? (
        <InquiryCounts counts={summary} />
      ) : (
        summaryError && (
          <Typography variant="pi" textColor="danger600">
            Couldn't load the counts: {summaryError}
          </Typography>
        )
      )}

      {/* The filter on screen is the pressed one. Pills, not tabs: they change what the list shows, not what is on the page. */}
      <Flex role="group" aria-label="Filter inquiries" gap={2} wrap="wrap">
        {FILTERS.map((key) => (
          <Button key={key} size="S" variant={filter === key ? 'default' : 'tertiary'} aria-pressed={filter === key} onClick={() => changeFilter(key)}>
            {FILTER_LABELS[key]}
          </Button>
        ))}
      </Flex>

      {quotaLine && (
        <Typography variant="pi" textColor="neutral600">
          {quotaLine}
        </Typography>
      )}

      {inquiries === null ? (
        loadError ? (
          <Box background="danger100" padding={6} hasRadius>
            <Flex direction="column" alignItems="flex-start" gap={1}>
              <Typography textColor="danger700">Couldn't load the inquiries: {loadError}</Typography>
              <Typography variant="pi" textColor="neutral600">
                Trying again every {REFRESH_MS / 1000} seconds.
              </Typography>
            </Flex>
          </Box>
        ) : (
          <Typography textColor="neutral600">Loading inquiries…</Typography>
        )
      ) : inquiries.length === 0 ? (
        <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
          <Typography textColor="neutral600">{EMPTY[filter]}</Typography>
        </Box>
      ) : (
        <>
          <Table colCount={columns.length + (canReply ? 1 : 0)} rowCount={inquiries.length + 1}>
            <Thead>
              <Tr>
                {columns.map((column) => (
                  <Th key={column}>
                    <Typography variant="sigma">{column}</Typography>
                  </Th>
                ))}
                {canReply && (
                  <Th>
                    <VisuallyHidden>Actions</VisuallyHidden>
                  </Th>
                )}
              </Tr>
            </Thead>
            <Tbody>
              {inquiries.map((inquiry) => (
                <InquiryRow
                  key={inquiry.documentId}
                  inquiry={inquiry}
                  canReply={canReply}
                  acting={acting}
                  onReply={() => setReplying(inquiry)}
                  onCloseInquiry={(reason) => run(inquiry.documentId, 'close', { reason })}
                  onChangeLabel={() => setRelabelling(inquiry)}
                  onLabelAgain={() => run(inquiry.documentId, 'label-again')}
                />
              ))}
            </Tbody>
          </Table>
          {inquiries.length >= LIST_LIMIT && (
            <Typography variant="pi" textColor="neutral600">
              Showing the newest {LIST_LIMIT}.
            </Typography>
          )}
        </>
      )}

      {replying && (
        <InquiryReplyDialog
          key={replying.documentId}
          inquiry={replying}
          sending={acting !== null}
          onSend={(body) =>
            run(replying.documentId, 'reply', body, () => {
              setReplying(null);
              void loadQuota();
            })
          }
          onClose={() => setReplying(null)}
        />
      )}
      {relabelling && (
        <ChangeLabelDialog
          key={relabelling.documentId}
          inquiry={relabelling}
          sending={acting !== null}
          onSave={(body) => run(relabelling.documentId, 'label', body, () => setRelabelling(null))}
          onClose={() => setRelabelling(null)}
        />
      )}
    </Flex>
  );
};
