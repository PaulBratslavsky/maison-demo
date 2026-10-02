/**
 * A LINE ID with its @: a basic ID (@123abcde) or a premium ID, whose letters, digits, dots, hyphens and underscores
 * need no escaping in a link.
 */
const LINE_ID = /^@[a-z0-9._-]+$/i;

/**
 * "Chat with Maison on LINE" (components/line-chat.tsx): LINE's link to an Official Account, from its basic ID with the
 * @, as NEXT_PUBLIC_LINE_OA_ID holds it. LINE for iOS and Android open it themselves: a friend lands in the one-on-one
 * chat with Maison, anyone else on the account's add-friend screen (LINE for PC doesn't take LINE's URL scheme).
 * Null when the setting is unset or isn't an @ ID, and then there's no button anywhere.
 */
export const lineChatUrl = (basicId: string | undefined): string | null => {
  const id = basicId?.trim() ?? '';
  return LINE_ID.test(id) ? `https://line.me/R/ti/p/${encodeURIComponent(id)}` : null;
};
