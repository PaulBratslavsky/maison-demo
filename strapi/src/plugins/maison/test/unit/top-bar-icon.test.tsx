// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HistoryIcon, NewChatIcon, ToolsIcon, TopBarIcon } from '../../admin/src/components/assistant/TopBarIcon';
import { renderInTheme } from './render';

describe('TopBarIcon', () => {
  it('is a button named by its label, which is also its tooltip text', () => {
    renderInTheme(
      <TopBarIcon label="Tools (7)" onClick={() => {}}>
        <ToolsIcon />
      </TopBarIcon>
    );
    const button = screen.getByRole('button', { name: 'Tools (7)' });
    expect(button.getAttribute('data-tip')).toBe('Tools (7)');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('calls onClick when pressed, and not when it is disabled', async () => {
    const onClick = vi.fn();
    renderInTheme(
      <>
        <TopBarIcon label="Open" onClick={onClick}>
          <HistoryIcon />
        </TopBarIcon>
        <TopBarIcon label="Off" disabled onClick={onClick}>
          <NewChatIcon />
        </TopBarIcon>
      </>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onClick).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: 'Off' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says whether it is open with aria-expanded, for a button that opens something, and says nothing for any other', () => {
    renderInTheme(
      <>
        <TopBarIcon label="Closed" expanded={false} onClick={() => {}}>
          <ToolsIcon />
        </TopBarIcon>
        <TopBarIcon label="Opened" expanded onClick={() => {}}>
          <ToolsIcon />
        </TopBarIcon>
        <TopBarIcon label="Plain" onClick={() => {}}>
          <ToolsIcon />
        </TopBarIcon>
      </>
    );
    expect(screen.getByRole('button', { name: 'Closed' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Opened' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Plain' }).hasAttribute('aria-expanded')).toBe(false);
  });

  it('shows the words of its emphasis after the icon, and keeps its label as the accessible name', () => {
    renderInTheme(
      <TopBarIcon label="New chat" emphasis="New chat" onClick={() => {}}>
        <NewChatIcon />
      </TopBarIcon>
    );
    const button = screen.getByRole('button', { name: 'New chat' });
    expect(button.textContent).toBe('New chat');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('shows no words without an emphasis: the icon alone', () => {
    renderInTheme(
      <TopBarIcon label="New chat" onClick={() => {}}>
        <NewChatIcon />
      </TopBarIcon>
    );
    expect(screen.getByRole('button', { name: 'New chat' }).textContent).toBe('');
  });

  it('draws in the dark theme too', () => {
    renderInTheme(
      <TopBarIcon label="Open" active onClick={() => {}}>
        <HistoryIcon />
      </TopBarIcon>,
      { dark: true }
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
  });

  it('has three icons, each an SVG that screen readers skip: the button already has its name', () => {
    renderInTheme(
      <>
        <HistoryIcon />
        <ToolsIcon />
        <NewChatIcon />
      </>
    );
    const icons = document.querySelectorAll('svg');
    expect(icons).toHaveLength(3);
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true');
  });
});
