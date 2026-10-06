import styled from 'styled-components';

/**
 * The chat area and its pieces, copied from strapi-plugin-tanstack-ai 1.6.0 (`ChatPanel.tsx`): a white rectangle with a 4px radius and the
 * table shadow, holding the sidebar and the chat column, and in the column the top bar, the messages and the composer.
 */

/**
 * Takes the height the page has left, with no calc() against 100vh: that was a guess at the height of what is above it, and it drifted.
 * The page is a flex column while Ask is open, so this takes what remains. `min-height: 0` is the part that is easy to leave out: a flex
 * child will not shrink below its content, so without it the messages would push the composer off the bottom instead of scrolling.
 *
 * Below the large breakpoint (1080px) the admin's content area has no height of its own, so there is nothing to fill: the chat area is
 * then 70% of the window's height, and never less than 420px.
 */
export const ChatLayout = styled.div`
  display: flex;
  flex-direction: row;
  flex: 0 0 auto;
  height: 70vh;
  min-height: 420px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.tableShadow};
  background: ${({ theme }) => theme.colors.neutral0};

  ${({ theme }) => theme.breakpoints.large} {
    flex: 1 1 0%;
    height: auto;
    min-height: 0;
  }
`;

export const ChatColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

export const ChatTopBar = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral200};
  gap: 8px;
`;

/** Pushes what follows to the right-hand end of the bar. */
export const TopBarSpacer = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;
