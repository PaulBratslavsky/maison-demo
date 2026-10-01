import * as React from 'react';

import { Badge, Divider, Flex, Typography } from '@strapi/design-system';
import { useFetchClient, Widget } from '@strapi/strapi/admin';

import { startPolling } from '../poll';

/** GET /maison/appointments/summary (RequestsSummary on the server). */
interface RequestsSummary {
  counts: { waitingForStaff: number; confirmedUpcoming: number; confirmationsSent: number };
  /** The newest requests, newest first. Each is a row of the board's All requests view, without the products and the note. */
  recent: Array<{
    reference: string;
    status: 'requested' | 'confirmed';
    /** Masked on the server, like line:U4af…88. */
    customer: string;
    boutique: { slug: string; name: string } | null;
    requestedFor: string;
    confirmationSent: boolean;
  }>;
}

const REFRESH_MS = 5000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The board's words and colours for a request's status, so staff who read one read the other. */
const STATUS_VARIANT = { requested: 'warning', confirmed: 'success' } as const;

const COUNTS = [
  { key: 'waitingForStaff', label: 'Waiting for staff', tone: 'warning700' },
  { key: 'confirmedUpcoming', label: 'Confirmed, upcoming', tone: 'success700' },
  { key: 'confirmationsSent', label: 'LINE sent', tone: 'success700' },
] as const;

/** "2026-10-10T14:00:00+09:00" → "Oct 10, 14:00": the boutique's own time, whatever the browser's time zone. */
const visitTime = (iso: string) => {
  const parts = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(iso);
  return parts ? `${MONTHS[Number(parts[1]) - 1]} ${Number(parts[2])}, ${parts[3]}` : iso;
};

const RequestsWidget = () => {
  const { get } = useFetchClient();
  const [summary, setSummary] = React.useState<RequestsSummary | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data } = await get<RequestsSummary>('/maison/appointments/summary');
        if (!data?.counts || !Array.isArray(data.recent)) throw new Error('The server sent something else than a summary.');
        if (!mounted) return;
        setSummary(data);
        setLoadError(null);
      } catch (error) {
        // The last summary stays on screen, with a note, until a refresh works again.
        if (mounted) setLoadError((error as Error).message);
      }
    };
    // The next refresh starts only after the last one finished, so a slow server never gets overlapping requests.
    const stop = startPolling(load, REFRESH_MS);
    return () => {
      mounted = false;
      stop();
    };
  }, [get]);

  if (summary === null) {
    return loadError === null ? <Widget.Loading /> : <Widget.Error>{`Couldn't load the requests: ${loadError}`}</Widget.Error>;
  }

  // After a failed refresh, the last summary stays on screen with this note, until a refresh works again.
  const staleNote = loadError && (
    <Typography variant="pi" textColor="danger600">
      Couldn't refresh: {loadError}. Showing the last result.
    </Typography>
  );

  if (summary.recent.length === 0) {
    return (
      <Flex direction="column" alignItems="stretch" gap={3} height="100%">
        <Widget.NoData>No requests yet</Widget.NoData>
        {staleNote}
      </Flex>
    );
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      <Flex gap={4} alignItems="flex-start">
        {COUNTS.map(({ key, label, tone }) => (
          <Flex key={key} direction="column" alignItems="flex-start" grow={1} basis={0} minWidth="0">
            <Typography variant="alpha" textColor={tone}>
              {summary.counts[key]}
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {label}
            </Typography>
          </Flex>
        ))}
      </Flex>

      <Divider />

      <Flex tag="ul" aria-label="Newest requests" direction="column" alignItems="stretch">
        {summary.recent.map((request) => (
          // One line at the widget's default width. In a narrower widget the customer and status drop to a second line,
          // because the boutique keeps room for most of its name.
          <Flex key={request.reference} tag="li" alignItems="center" wrap="wrap" gap={2} paddingTop={1} paddingBottom={1}>
            <Typography variant="pi" textColor="neutral600">
              {visitTime(request.requestedFor)}
            </Typography>
            <Typography fontWeight="semiBold" ellipsis grow={1} basis={0} minWidth="8rem" title={request.boutique?.name}>
              {request.boutique?.name ?? '—'}
            </Typography>
            <Flex gap={2} alignItems="center" marginLeft="auto">
              <Typography variant="pi" textColor="neutral600">
                {request.customer}
              </Typography>
              <Badge size="S" variant={STATUS_VARIANT[request.status]}>
                {request.status}
              </Badge>
            </Flex>
          </Flex>
        ))}
      </Flex>

      {staleNote}
    </Flex>
  );
};

export default RequestsWidget;
