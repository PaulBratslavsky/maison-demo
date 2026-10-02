import { useState } from 'react';

import { Box, Button, Dialog, Flex, Typography } from '@strapi/design-system';
import { WarningCircle } from '@strapi/icons';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

import { describeReset, describeSeed, type ResetResult, type SeedResult } from '../seed-result';

type Action = 'seed' | 'reset';

/** Load the catalog, or clear the rehearsal's appointments, questions and inquiries. `onChange` lets the board refresh at once. */
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
          appointment, delivery record, customer question and inquiry, and the product knowledge entries that staff added by
          answering questions. It keeps the catalog and the seeded product knowledge.
        </Typography>
        <Flex gap={2}>
          <Button loading={running === 'seed'} disabled={running !== null} onClick={() => run<SeedResult>('seed', describeSeed)}>
            Load demo catalog
          </Button>
          {/* Resetting can't be undone, so it asks first. */}
          <Dialog.Root>
            <Dialog.Trigger>
              <Button variant="danger-light" loading={running === 'reset'} disabled={running !== null}>
                Reset demo activity
              </Button>
            </Dialog.Trigger>
            <Dialog.Content>
              <Dialog.Header>Reset demo activity?</Dialog.Header>
              <Dialog.Body icon={<WarningCircle fill="danger600" />}>
                Deletes every appointment, LINE confirmation record, customer question and inquiry, and the product knowledge
                entries that staff added by answering questions. The catalog and the seeded product knowledge stay.
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
