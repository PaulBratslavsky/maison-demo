import type { ReactNode } from 'react';

import styled, { css } from 'styled-components';

/**
 * The chat's top-bar controls, copied from strapi-plugin-tanstack-ai 1.6.0 (`TopBarIcon.tsx`): a 32px square with a 16px icon, the same
 * hover and open looks, and a label that is both the accessible name and a tooltip, drawn in CSS from `data-tip`. The tooltip shows after
 * half a second on hover or keyboard focus, so it does not flicker as the pointer crosses the bar, and it goes at once on the way out.
 *
 * One addition: `emphasis`. A button that has words to say, such as New chat when the chat is too long to go on, shows them after its icon,
 * in the primary colour, so staff see what to press.
 */
const Button = styled.button<{ $active?: boolean; $emphasis?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 32px;
  height: 32px;
  padding: ${({ $emphasis }) => ($emphasis ? '0 12px 0 10px' : '0')};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary600 : theme.colors.neutral200)};
  border-radius: 4px;
  background: ${({ $active, theme }) => ($active ? theme.colors.primary100 : theme.colors.neutral0)};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary600 : theme.colors.neutral600)};
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral100};
    color: ${({ theme }) => theme.colors.primary600};
    border-color: ${({ theme }) => theme.colors.primary600};
  }

  ${({ $emphasis, theme }) =>
    $emphasis &&
    css`
      border-color: ${theme.colors.primary600};
      background: ${theme.colors.primary600};
      color: ${theme.colors.neutral0};

      &:hover:not(:disabled) {
        background: ${theme.colors.buttonPrimary500};
        border-color: ${theme.colors.buttonPrimary500};
        color: ${theme.colors.neutral0};
      }
    `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }

  /* The label, drawn from the same string as the accessible name. */
  &::after {
    content: attr(data-tip);
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    padding: 4px 8px;
    border-radius: 4px;
    background: ${({ theme }) => theme.colors.neutral800};
    color: ${({ theme }) => theme.colors.neutral0};
    font-size: 11px;
    font-weight: 400;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
  }

  &:hover::after,
  &:focus-visible::after {
    opacity: 1;
    /* Only on the way in. Leaving is immediate. */
    transition-delay: 0.5s;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      transition: none;
    }
  }
`;

interface TopBarIconProps {
  /** Used as both the accessible name and the tooltip text. */
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  /** For a button that opens something: whether it is open. Sets `aria-expanded`. */
  expanded?: boolean;
  /** Words to show after the icon, in the primary colour. The label stays the accessible name. */
  emphasis?: string;
}

export const TopBarIcon = ({ label, onClick, children, active, disabled, expanded, emphasis }: TopBarIconProps) => (
  <Button
    type="button"
    $active={active}
    $emphasis={Boolean(emphasis)}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    data-tip={label}
    {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
  >
    {children}
    {emphasis}
  </Button>
);

/*
 * The reference plugin's own icons, copied so the two panels look like siblings. They are inline and not from @strapi/icons, because
 * these are the exact shapes it uses, and picking near-equivalents from an icon set is how two things that should match stop matching.
 */

/** A panel beside a page: the history sidebar. */
export const HistoryIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <rect x="1" y="2" width="14" height="12" rx="1.5" />
    <line x1="5.5" y1="2" x2="5.5" y2="14" />
  </svg>
);

/** A pencil: the list of tools. */
export const ToolsIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.5 2.5L13 6l-7 7H2.5v-3.5l7-7z" />
    <path d="M8 4l4 4" />
  </svg>
);

/** A plus: a new chat. */
export const NewChatIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M8 3v10M3 8h10" />
  </svg>
);
