import { useState } from 'react';

import { Flex } from '@strapi/design-system';
import { Layouts, Page, useRBAC } from '@strapi/strapi/admin';

import { DemoData } from '../components/DemoData';
import { RequestsBoard } from '../components/RequestsBoard';
import { PERMISSIONS } from '../permissions';

const MaisonPage = () => {
  const { allowedActions, isLoading } = useRBAC(PERMISSIONS.sections);
  const [refreshKey, setRefreshKey] = useState(0);

  if (isLoading) return <Page.Loading />;

  return (
    <Page.Main>
      <Page.Title>Maison</Page.Title>
      <Layouts.Header title="Maison" subtitle="Boutique appointment requests from the app and the concierge, as they arrive." />
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={8}>
          {allowedActions.canReview && <RequestsBoard canConfirm={allowedActions.canConfirm} refreshKey={refreshKey} />}
          {allowedActions.canManage && <DemoData onChange={() => setRefreshKey((key) => key + 1)} />}
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
