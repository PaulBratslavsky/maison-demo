import { useState } from 'react';

import { Box, Flex, Tabs } from '@strapi/design-system';
import { Layouts, Page, useRBAC } from '@strapi/strapi/admin';

import { DemoData } from '../components/DemoData';
import { InquiriesList } from '../components/InquiriesList';
import { QuestionsList } from '../components/QuestionsList';
import { RequestCounts } from '../components/RequestCounts';
import { RequestsBoard } from '../components/RequestsBoard';
import { PERMISSIONS } from '../permissions';
import { TAB_LABELS, visibleTabs } from '../tabs';
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

  // Each tab is for the admins who may see what is in it. The page opens on the first of them.
  const tabs = visibleTabs({ canReview: allowedActions.canReview, canRead: allowedActions.canRead, canView: allowedActions.canView });

  return (
    <Page.Main>
      <Page.Title>Maison</Page.Title>
      <Layouts.Header title="Maison" subtitle="Boutique appointment requests and customer questions, as they arrive." />
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={8}>
          {tabs.length > 0 && (
            <Tabs.Root variant="simple" defaultValue={tabs[0]}>
              <Tabs.List aria-label="Maison">
                {tabs.map((tab) => (
                  <Tabs.Trigger key={tab} value={tab}>
                    {TAB_LABELS[tab]}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              {tabs.includes('requests') && (
                // The counts come from the review route, so only these admins get them.
                <Tabs.Content value="requests">
                  <Box paddingTop={6}>
                    <Flex direction="column" alignItems="stretch" gap={8}>
                      <BoardCounts refreshKey={refreshKey} />
                      <RequestsBoard canConfirm={allowedActions.canConfirm} refreshKey={refreshKey} onChange={refresh} />
                    </Flex>
                  </Box>
                </Tabs.Content>
              )}
              {tabs.includes('questions') && (
                <Tabs.Content value="questions">
                  <Box paddingTop={6}>
                    <QuestionsList canAnswer={allowedActions.canAnswer} refreshKey={refreshKey} />
                  </Box>
                </Tabs.Content>
              )}
              {tabs.includes('inquiries') && (
                <Tabs.Content value="inquiries">
                  <Box paddingTop={6}>
                    <InquiriesList canReply={allowedActions.canReply} refreshKey={refreshKey} />
                  </Box>
                </Tabs.Content>
              )}
            </Tabs.Root>
          )}
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
