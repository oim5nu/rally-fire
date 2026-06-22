import React from 'react';
import { useActivity } from '../lib/activity';

export default function GlobalFeedback() {
  const { active, error } = useActivity();
  if (!active && !error) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] pt-[env(safe-area-inset-top)]">
      {active && (
        <div role="progressbar" aria-label="Processing" className="h-1 overflow-hidden bg-primary-fixed/20">
          <div className="processing-bar h-full w-2/5 bg-primary-fixed shadow-[0_0_10px_rgba(195,244,0,0.8)]" />
        </div>
      )}
      {error && (
        <div className="mx-auto mt-2 w-[calc(100%-2rem)] max-w-xl">
          <div role="alert" className="rounded-lg border border-red-400/40 bg-red-950/95 px-4 py-3 text-sm font-medium text-red-100 shadow-2xl backdrop-blur">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
