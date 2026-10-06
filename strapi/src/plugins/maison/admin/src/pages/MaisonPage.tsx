import { useState } from 'react';

import { Box, Flex, Tabs } from '@strapi/design-system';
import { Layouts, Page, useRBAC } from '@strapi/strapi/admin';
import { useSearchParams } from 'react-router-dom';

import { AskTab } from '../components/assistant/AskTab';
import { AssistantProvider } from '../components/assistant/AssistantProvider';
import { DemoData } from '../components/DemoData';
import { InquiriesList } from '../components/InquiriesList';
import { QuestionsList } from '../components/QuestionsList';
import { RequestCounts } from '../components/RequestCounts';
import { RequestsBoard } from '../components/RequestsBoard';
import { PERMISSIONS } from '../permissions';
import { PAGE_SUBTITLE, fillsPage, selectTab, showsDemoData, tabCounts, tabLabel, visibleTabs } from '../tabs';
import { useInquiriesSummary } from '../useInquiriesSummary';
import { useOpenQuestions } from '../useOpenQuestions';
import { useRequestsSummary } from '../useRequestsSummary';

/**
 * While Ask is open, each box from the page down to the chat area is a flex column that takes the height left under the one above it, and
 * may shrink below its content (`min-height: 0`). The admin's content area is a flex column with a height of its own, so the page fills it
 * and only the message list scrolls. No height is worked out from the header's: that is what drifts.
 */
const FILL = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } as const;

const MaisonPage = () => {
  const { allowedActions, isLoading } = useRBAC(PERMISSIONS.sections);
  const [refreshKey, setRefreshKey] = useState(0);
  // The tab is in the address (`?tab=inquiries`), so a link can open it. With none named, or one the admin may not see,
  // the page opens on the first tab they may see.
  const [searchParams, setSearchParams] = useSearchParams();

  // The number on each tab: polled for the admins who may see the tab, whichever tab is open, since staff land on one
  // tab and need to see where the work is on the others. The cards and the lists read these same answers, so each is
  // polled once. `allowedActions` holds only what is granted, so a flag the admin lacks is undefined, never false:
  // `=== true` keeps a hook switched off for them, instead of asking a route that refuses them every 5 seconds.
  const ready = !isLoading;
  const requests = useRequestsSummary(refreshKey, ready && allowedActions.canReview === true);
  const questions = useOpenQuestions(refreshKey, ready && allowedActions.canRead === true);
  const inquiries = useInquiriesSummary(refreshKey, ready && allowedActions.canView === true);

  if (isLoading) return <Page.Loading />;

  /** A new refreshKey makes the board, the counts and the lists load again at once. */
  const refresh = () => setRefreshKey((key) => key + 1);

  // Each tab is for the admins who may see what is in it.
  const tabs = visibleTabs({
    canReview: allowedActions.canReview,
    canRead: allowedActions.canRead,
    canView: allowedActions.canView,
    canUse: allowedActions.canUse,
  });
  const activeTab = selectTab(tabs, searchParams.get('tab'));
  const fill = fillsPage(activeTab);
  const waiting = tabCounts({ requests: requests.summary, questions: questions.count, inquiries: inquiries.summary });

  const tabsRoot = activeTab && (
    <Tabs.Root
      variant="simple"
      value={activeTab}
      // The address is replaced, not added to: switching tabs isn't a place to go back to.
      onValueChange={(tab) => setSearchParams({ tab }, { replace: true })}
      style={fill ? FILL : undefined}
    >
      <Tabs.List aria-label="Maison">
        {tabs.map((tab) => (
          <Tabs.Trigger key={tab} value={tab}>
            {tabLabel(tab, waiting[tab])}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.includes('requests') && (
        // The counts come from the review route, so only these admins get them.
        <Tabs.Content value="requests">
          <Box paddingTop={6}>
            <Flex direction="column" alignItems="stretch" gap={8}>
              {requests.summary && <RequestCounts counts={requests.summary.counts} />}
              <RequestsBoard canConfirm={allowedActions.canConfirm} refreshKey={refreshKey} onChange={refresh} />
            </Flex>
          </Box>
        </Tabs.Content>
      )}
      {tabs.includes('questions') && (
        <Tabs.Content value="questions">
          <Box paddingTop={6}>
            <QuestionsList canAnswer={allowedActions.canAnswer} refreshKey={refreshKey} onChange={questions.reload} />
          </Box>
        </Tabs.Content>
      )}
      {tabs.includes('inquiries') && (
        <Tabs.Content value="inquiries">
          <Box paddingTop={6}>
            <InquiriesList
              canReply={allowedActions.canReply}
              refreshKey={refreshKey}
              summary={inquiries.summary}
              summaryError={inquiries.loadError}
              onChange={inquiries.reload}
            />
          </Box>
        </Tabs.Content>
      )}
      {tabs.includes('ask') && (
        <Tabs.Content value="ask" style={FILL}>
          <Box paddingTop={6} style={FILL}>
            <AskTab />
          </Box>
        </Tabs.Content>
      )}
    </Tabs.Root>
  );

  return (
    <Page.Main style={fill ? FILL : undefined}>
      <Page.Title>Maison</Page.Title>
      <Layouts.Header title="Maison" subtitle={PAGE_SUBTITLE} />
      {/*
        What Layouts.Content is (the same side padding, and the top padding on a small screen), as a Box that can fill the height while Ask
        is open. It is always this Box, never Layouts.Content for one tab and this for another: a different element would unmount the
        chat's provider, which sits inside it, on every change of tab.
      */}
      <Box paddingLeft={{ initial: 4, medium: 6, large: 10 }} paddingRight={{ initial: 4, medium: 6, large: 10 }} paddingTop={{ initial: 4, medium: 0 }} paddingBottom={fill ? 6 : 0} style={fill ? FILL : undefined}>
        <Flex direction="column" alignItems="stretch" gap={8} style={fill ? { flex: 1, minHeight: 0 } : undefined}>
          {/* The chat lives above the tabs, so it stays when staff look at a list and come back. Only admins who may use it have one. */}
          {allowedActions.canUse === true ? <AssistantProvider>{tabsRoot}</AssistantProvider> : tabsRoot}
          {showsDemoData({ canManage: allowedActions.canManage === true, activeTab }) && <DemoData onChange={refresh} />}
        </Flex>
      </Box>
    </Page.Main>
  );
};

const ProtectedMaisonPage = () => (
  <Page.Protect permissions={PERMISSIONS.page}>
    <MaisonPage />
  </Page.Protect>
);

export default ProtectedMaisonPage;
