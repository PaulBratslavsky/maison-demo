import { afterEach, describe, expect, it, vi } from 'vitest';
import { askTheChat, chatReport, pendingAsk, reportChat, subscribeAsk, takeAsk, wantChatStatus, chatStatusWanted } from '../../admin/src/askStore';

/*
 * The first of the two links between the Maison page and the assistant's drawer: the page writes "ask about this item", the chat reads it. The page
 * and the chat are in separate React roots, so they share this module and not a context.
 */
afterEach(() => reportChat(null));

describe('the store of Ask about this', () => {
  it('has no chat until the chat reports one, and refuses an ask then', () => {
    expect(chatReport()).toBeNull();
    expect(askTheChat('Tell me about request APT-4821.')).toBe(false);
    expect(pendingAsk()).toBeNull();
  });

  it('refuses an ask while the assistant is not ready', () => {
    reportChat({ ready: false, busy: false });
    expect(askTheChat('Tell me about request APT-4821.')).toBe(false);
    expect(pendingAsk()).toBeNull();
  });

  it('refuses an ask while an answer is on its way: it is ignored, not kept for later', () => {
    reportChat({ ready: true, busy: true });
    expect(askTheChat('Tell me about request APT-4821.')).toBe(false);
    reportChat({ ready: true, busy: false });
    expect(pendingAsk()).toBeNull();
  });

  it('keeps one ask for the chat to take, and the chat takes it once', () => {
    reportChat({ ready: true, busy: false });
    expect(askTheChat('Tell me about request APT-4821.')).toBe(true);
    expect(pendingAsk()).toBe('Tell me about request APT-4821.');
    expect(takeAsk()).toBe('Tell me about request APT-4821.');
    expect(pendingAsk()).toBeNull();
    expect(takeAsk()).toBeNull();
  });

  it('refuses a second ask while the first is waiting to be taken: a double click sends one message', () => {
    reportChat({ ready: true, busy: false });
    expect(askTheChat('Tell me about request APT-4821.')).toBe(true);
    expect(askTheChat('Tell me about request APT-4822.')).toBe(false);
    expect(takeAsk()).toBe('Tell me about request APT-4821.');
  });

  it('drops an ask that nobody took when the chat goes away', () => {
    reportChat({ ready: true, busy: false });
    askTheChat('Tell me about request APT-4821.');
    reportChat(null);
    expect(pendingAsk()).toBeNull();
  });

  it('tells a listener when the report or the ask changes, and not when nothing changed', () => {
    const listener = vi.fn();
    const stop = subscribeAsk(listener);
    reportChat({ ready: true, busy: false });
    expect(listener).toHaveBeenCalledTimes(1);
    reportChat({ ready: true, busy: false });
    expect(listener).toHaveBeenCalledTimes(1);
    askTheChat('Tell me about request APT-4821.');
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    takeAsk();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('counts the lists that want the assistant checked: the check is wanted while one is on the screen', () => {
    expect(chatStatusWanted()).toBe(false);
    const first = wantChatStatus();
    const second = wantChatStatus();
    expect(chatStatusWanted()).toBe(true);
    first();
    expect(chatStatusWanted()).toBe(true);
    second();
    expect(chatStatusWanted()).toBe(false);
    // Letting go twice does not take away another list's turn.
    const other = wantChatStatus();
    second();
    expect(chatStatusWanted()).toBe(true);
    other();
  });
});
