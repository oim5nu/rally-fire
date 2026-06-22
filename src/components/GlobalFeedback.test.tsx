// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityProvider, useActivity } from '../lib/activity';
import GlobalFeedback from './GlobalFeedback';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function Harness() {
  const { reportError, track } = useActivity();
  const first = useRef<ReturnType<typeof deferred> | null>(null);
  const second = useRef<ReturnType<typeof deferred> | null>(null);
  first.current ??= deferred();
  second.current ??= deferred();
  return <>
    <button onClick={() => { void track(() => first.current!.promise); }}>First</button>
    <button onClick={() => { void track(() => second.current!.promise); }}>Second</button>
    <button onClick={() => first.current!.resolve()}>Finish first</button>
    <button onClick={() => second.current!.resolve()}>Finish second</button>
    <button onClick={() => reportError('First error')}>Error one</button>
    <button onClick={() => reportError('Replacement error')}>Error two</button>
  </>;
}

function renderFeedback() {
  render(<ActivityProvider><GlobalFeedback /><Harness /></ActivityProvider>);
}

describe('GlobalFeedback', () => {
  it('stays visible until overlapping operations finish', async () => {
    renderFeedback();
    fireEvent.click(screen.getByText('First'));
    fireEvent.click(screen.getByText('Second'));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Finish first'));
    await act(async () => {});
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Finish second'));
    await act(async () => {});
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('replaces errors and dismisses the latest error after five seconds', () => {
    vi.useFakeTimers();
    renderFeedback();
    fireEvent.click(screen.getByText('Error one'));
    expect(screen.getByRole('alert')).toHaveTextContent('First error');

    act(() => { vi.advanceTimersByTime(4_000); });
    fireEvent.click(screen.getByText('Error two'));
    expect(screen.getByRole('alert')).toHaveTextContent('Replacement error');

    act(() => { vi.advanceTimersByTime(4_999); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
