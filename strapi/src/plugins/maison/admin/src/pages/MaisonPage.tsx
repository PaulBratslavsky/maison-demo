import { useState } from 'react';

import { Flex } from '@strapi/design-system';
import { Layouts, Page, useRBAC } from '@strapi/strapi/admin';

import { DemoData } from '../components/DemoData';
import { QuestionsList } from '../components/QuestionsList';
import { RequestCounts } from '../components/RequestCounts';
import { RequestsBoard } from '../components/RequestsBoard';
import { PERMISSIONS } from '../permissions';
import { useRequestsSummary } from '../useRequestsSummary';

/** The request counts above the board. Nothing until a summary has loaded: the board shows its own loading and errors. */
const BoardCounts = ({ refreshKey }: { refreshKey: number }) => {
  const { summary } = useRequestsSummary(refreshKey);
  return summary ? <RequestCounts counts={summary.counts} /> : null;
};

const MaisonPage = () => {
  const { allowedActions, isLoading } = useRBAC(PERMISSIONS.sections);
  const [refreshKey, setRefreshKey] = useState(0);

  if (isLoading) return <Page.Loading />;

  /** A new refreshKey makes the board and the counts load again at once. */
  const refresh = () => setRefreshKey((key) => key + 1);

  return (
    <Page.Main>
      <Page.Title>Maison</Page.Title>
      <Layouts.Header title="Maison" subtitle="Boutique appointment requests and customer questions, as they arrive." />
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={8}>
          {allowedActions.canReview && (
            // The counts come from the review route, so only these admins get them.
            <>
              <BoardCounts refreshKey={refreshKey} />
              <RequestsBoard canConfirm={allowedActions.canConfirm} refreshKey={refreshKey} onChange={refresh} />
            </>
          )}
          {allowedActions.canRead && <QuestionsList canAnswer={allowedActions.canAnswer} refreshKey={refreshKey} />}
          {allowedActions.canManage && <DemoData onChange={refresh} />}
        </Flex>
      </Layouts.Content>
    </Page.Main>
  );
};

const ProtectedMaisonPage = () => (
  <Page.Protect permissions={PERMISSIONS.page}>
    <MaisonPage />
  </Page.Protect>
);

export default ProtectedMaisonPage;
