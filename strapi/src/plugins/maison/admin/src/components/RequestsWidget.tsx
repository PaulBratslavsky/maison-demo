import { Badge, Box, Flex, Table, Tbody, Td, Th, Thead, Tr, Typography } from '@strapi/design-system';
import { Widget } from '@strapi/strapi/admin';

import { fullTime, timeAgo, visitTime } from '../time';
import { useRequestsSummary } from '../useRequestsSummary';
import { RequestCounts } from './RequestCounts';

/** The board's words and colours for a request's status, so staff who read one read the other. */
const STATUS_VARIANT = { requested: 'warning', confirmed: 'success' } as const;

const COLUMNS = ['Requested', 'Reference', 'Customer', 'Boutique', 'Visit', 'Note', 'Status', 'LINE'];

const RequestsWidget = () => {
  const { summary, loadError } = useRequestsSummary();

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

  // Each refresh renders again, so "12 min ago" moves on with the clock.
  const now = new Date();

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      <RequestCounts counts={summary.counts} />

      {/*
        The table keeps its own width and scrolls sideways inside the widget when that is wider than the widget. Strapi
        sizes the widget's body to its content, so a table that is wider would widen the body and the cards with it. The
        width of 0 makes the table add nothing to that size, and the minimum width of 100% then gives it the widget's.
      */}
      <Box width="0" minWidth="100%">
        <Table colCount={COLUMNS.length} rowCount={summary.recent.length + 1} aria-label="Newest requests">
          <Thead>
            <Tr>
              {COLUMNS.map((column) => (
                <Th key={column}>
                  <Typography variant="sigma">{column}</Typography>
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {summary.recent.map((request) => (
              <Tr key={request.reference}>
                <Td title={fullTime(request.createdAt)}>
                  <Typography>{timeAgo(request.createdAt, now)}</Typography>
                </Td>
                <Td>
                  <Typography fontWeight="bold">{request.reference}</Typography>
                </Td>
                <Td>
                  <Typography>{request.customer}</Typography>
                </Td>
                <Td>
                  <Typography>{request.boutique?.name ?? '—'}</Typography>
                </Td>
                <Td>
                  <Typography>{visitTime(request.requestedFor)}</Typography>
                </Td>
                {/* The customer's own words, as plain text. One line here, and all of it in the tooltip. */}
                <Td title={request.note || undefined}>
                  {request.note ? (
                    <Typography ellipsis maxWidth="16rem">
                      {request.note}
                    </Typography>
                  ) : (
                    <Typography textColor="neutral600">—</Typography>
                  )}
                </Td>
                <Td>
                  <Badge size="S" variant={STATUS_VARIANT[request.status]}>
                    {request.status}
                  </Badge>
                </Td>
                <Td>
                  <Badge size="S" variant={request.confirmationSent ? 'success' : 'neutral'}>
                    {request.confirmationSent ? 'LINE sent' : 'not sent'}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      {staleNote}
    </Flex>
  );
};

export default RequestsWidget;
