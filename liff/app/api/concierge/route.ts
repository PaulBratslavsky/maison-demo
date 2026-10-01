import { createMCPClient } from '@ai-sdk/mcp';

import { handleConcierge } from '@/lib/concierge';
import { conciergeModel } from '@/lib/model';
import { strapiOrigin } from '@/lib/strapi-proxy';

export const maxDuration = 60;

export async function POST(request: Request) {
  const { model, label, fix } = conciergeModel();
  return handleConcierge(request, {
    model,
    modelLabel: label,
    modelFix: fix,
    createMcpClient: createMCPClient,
    // Strapi on this machine, as the proxy reaches it: never NEXT_PUBLIC_STRAPI_URL, which in LINE mode is the tunnel.
    strapiUrl: strapiOrigin(),
  });
}
