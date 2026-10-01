import * as React from 'react';

import {
  Badge,
  Box,
  Button,
  Flex,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

import { startPolling } from '../poll';

type Status = 'requested' | 'confirmed' | 'all';

/** One row of GET /maison/appointments (StaffAppointmentView on the server). */
interface StaffAppointment {
  reference: string;
  status: 'requested' | 'confirmed';
  customer: string;
  boutique: { slug: string; name: string } | null;
  requestedFor: string;
  products: Array<{ slug: string; name: string }>;
  note: string;
  createdVia: 'concierge' | 'app';
  confirmationSent: boolean;
  createdAt: string;
}

const REFRESH_MS = 5000;
const STATUS_LABELS: Record<Status, string> = { requested: 'Waiting for staff', confirmed: 'Confirmed', all: 'All requests' };
const EMPTY: Record<Status, string> = {
  requested: 'No requests are waiting for staff.',
  confirmed: 'No confirmed requests yet.',
  all: 'No requests yet.',
};

/** "2026-10-10T14:00:00+09:00" → "2026-10-10 14:00": the boutique's own time, whatever the browser's time zone. */
const visitTime = (iso: string) => iso.slice(0, 16).replace('T', ' ');
const canStillConfirm = (appointment: StaffAppointment) =>
  appointment.status === 'requested' && Date.parse(appointment.requestedFor) > Date.now();

export const RequestsBoard = ({ canConfirm, refreshKey }: { canConfirm: boolean; refreshKey: number }) => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [status, setStatus] = React.useState<Status>('requested');
  const [appointments, setAppointments] = React.useState<StaffAppointment[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  /** The filter on screen, updated the moment staff pick another. A response for any other filter is dropped. */
  const shownStatus = React.useRef<Status>(status);

  const load = React.useCallback(async () => {
    const requested = status;
    try {
      const { data } = await get<{ appointments?: StaffAppointment[] }>('/maison/appointments', { params: { status: requested } });
      if (shownStatus.current !== requested) return; // the filter changed while this load was in flight
      setAppointments(data.appointments ?? []);
      setLoadError(null);
    } catch (error) {
      if (shownStatus.current === requested) setLoadError((error as Error).message);
    }
  }, [get, status]);

  // The next refresh starts only after the last one finished, so a slow server never gets overlapping requests.
  React.useEffect(() => startPolling(load, REFRESH_MS), [load, refreshKey]);

  const changeStatus = (value: Status) => {
    shownStatus.current = value;
    setStatus(value);
  };

  const confirm = async (reference: string) => {
    setConfirming(reference);
    try {
      await post(`/maison/appointments/${reference}/confirm`);
      toggleNotification({ type: 'success', message: `Confirmed ${reference}. The LINE ops agent sends the customer's confirmation.` });
      await load();
    } catch (error) {
      toggleNotification({ type: 'danger', message: (error as Error).message });
    } finally {
      setConfirming(null);
    }
  };

  const columns = ['Reference', 'Customer', 'Boutique', 'Visit', 'Products', 'Status', 'LINE', 'Created via', ...(canConfirm ? [''] : [])];

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Flex justifyContent="space-between" alignItems="flex-end" gap={4}>
        <Flex direction="column" alignItems="flex-start" gap={1}>
          <Typography variant="delta" tag="h2">
            Appointment requests
          </Typography>
          <Typography variant="pi" textColor="neutral600">
            Refreshes every {REFRESH_MS / 1000} seconds. {loadError && appointments !== null ? `Last refresh failed: ${loadError}` : ''}
          </Typography>
        </Flex>
        <Box width="20rem">
          <SingleSelect aria-label="Status" size="S" value={status} onChange={(value) => changeStatus(value as Status)}>
            {(Object.keys(STATUS_LABELS) as Status[]).map((key) => (
              <SingleSelectOption key={key} value={key}>
                {STATUS_LABELS[key]}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
      </Flex>

      {appointments === null ? (
        loadError ? (
          <Box background="danger100" padding={6} hasRadius>
            <Flex direction="column" alignItems="flex-start" gap={1}>
              <Typography textColor="danger700">Couldn't load the requests: {loadError}</Typography>
              <Typography variant="pi" textColor="neutral600">
                Trying again every {REFRESH_MS / 1000} seconds.
              </Typography>
            </Flex>
          </Box>
        ) : (
          <Typography textColor="neutral600">Loading requests…</Typography>
        )
      ) : appointments.length === 0 ? (
        <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
          <Typography textColor="neutral600">{EMPTY[status]}</Typography>
        </Box>
      ) : (
        <Table colCount={columns.length} rowCount={appointments.length + 1}>
          <Thead>
            <Tr>
              {columns.map((column) => (
                <Th key={column}>
                  <Typography variant="sigma">{column}</Typography>
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {appointments.map((appointment) => (
              <Tr key={appointment.reference}>
                <Td>
                  <Typography fontWeight="bold">{appointment.reference}</Typography>
                </Td>
                <Td>
                  <Typography>{appointment.customer}</Typography>
                </Td>
                <Td>
                  <Typography>{appointment.boutique?.name ?? '—'}</Typography>
                </Td>
                <Td>
                  <Typography>{visitTime(appointment.requestedFor)}</Typography>
                </Td>
                <Td>
                  <Typography>{appointment.products.map((product) => product.name).join(', ') || '—'}</Typography>
                </Td>
                <Td>
                  <Badge variant={appointment.status === 'confirmed' ? 'success' : 'warning'}>{appointment.status}</Badge>
                </Td>
                <Td>
                  <Badge variant={appointment.confirmationSent ? 'success' : 'neutral'}>
                    {appointment.confirmationSent ? 'LINE sent' : 'not sent'}
                  </Badge>
                </Td>
                <Td>
                  <Typography>{appointment.createdVia}</Typography>
                </Td>
                {canConfirm && (
                  <Td>
                    {canStillConfirm(appointment) && (
                      <Button
                        size="S"
                        loading={confirming === appointment.reference}
                        disabled={confirming !== null}
                        onClick={() => confirm(appointment.reference)}
                      >
                        Confirm
                      </Button>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Flex>
  );
};
