import { useState } from 'react';

import { Box, Button, Dialog, Flex, Typography } from '@strapi/design-system';
import { WarningCircle } from '@strapi/icons';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

import { describeSeed, type SeedResult } from '../seed-result';

type ResetResult = { appointments: number; notifications: number };
type Action = 'seed' | 'reset';

const describeReset = (result: ResetResult) => `Deleted ${result.appointments} appointments and ${result.notifications} notifications.`;

/** Load the catalog, or clear appointments between rehearsals. `onChange` lets the board refresh at once. */
export const DemoData = ({ onChange }: { onChange: () => void }) => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [running, setRunning] = useState<Action | null>(null);

  const run = async <T,>(action: Action, describe: (result: T) => string) => {
    setRunning(action);
    try {
      const { data } = await post<T>(`/maison/demo/${action}`);
      toggleNotification({ type: 'success', message: describe(data) });
      onChange();
    } catch (error) {
      toggleNotification({ type: 'danger', message: `That didn't work: ${(error as Error).message}` });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
      <Flex direction="column" alignItems="flex-start" gap={3}>
        <Typography variant="delta" tag="h2">
          Demo data
        </Typography>
        <Typography variant="omega" textColor="neutral600">
          Load demo catalog creates 3 collections, 12 products and 3 boutiques in Japanese and English, publishes them and sets
          stock, and adds 16 product knowledge entries in English. Whatever is there already stays as it is. Reset deletes every
          appointment and delivery record and keeps the catalog.
        </Typography>
        <Flex gap={2}>
          <Button loading={running === 'seed'} disabled={running !== null} onClick={() => run<SeedResult>('seed', describeSeed)}>
            Load demo catalog
          </Button>
          {/* Resetting can't be undone, so it asks first. */}
          <Dialog.Root>
            <Dialog.Trigger>
              <Button variant="danger-light" loading={running === 'reset'} disabled={running !== null}>
                Reset demo appointments
              </Button>
            </Dialog.Trigger>
            <Dialog.Content>
              <Dialog.Header>Reset demo appointments?</Dialog.Header>
              <Dialog.Body icon={<WarningCircle fill="danger600" />}>
                Deletes every appointment and LINE confirmation record. The catalog stays.
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.Cancel>
                  <Button fullWidth variant="tertiary">
                    Cancel
                  </Button>
                </Dialog.Cancel>
                <Dialog.Action>
                  <Button fullWidth variant="danger-light" onClick={() => run<ResetResult>('reset', describeReset)}>
                    Reset
                  </Button>
                </Dialog.Action>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Root>
        </Flex>
      </Flex>
    </Box>
  );
};
