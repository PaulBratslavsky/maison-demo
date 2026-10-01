import { createMCPClient } from '@ai-sdk/mcp';

import { handleConcierge } from '@/lib/concierge';
import { conciergeModel } from '@/lib/model';

export const maxDuration = 60;

export async function POST(request: Request) {
  const { model, label } = conciergeModel();
  return handleConcierge(request, {
    model,
    modelLabel: label,
    createMcpClient: createMCPClient,
    strapiUrl: (process.env.STRAPI_URL ?? process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1338').replace(/\/+$/, ''),
  });
}
