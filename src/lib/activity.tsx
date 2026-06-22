import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface ActivityContextValue {
  active: boolean;
  begin: () => () => void;
  error: string;
  reportError: (message: string) => void;
  track: <T>(operation: () => Promise<T>) => Promise<T>;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [activeCount, setActiveCount] = useState(0);
  const [error, setError] = useState('');
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const begin = useCallback(() => {
    let finished = false;
    setActiveCount((count) => count + 1);
    return () => {
      if (finished) return;
      finished = true;
      setActiveCount((count) => Math.max(0, count - 1));
    };
  }, []);

  const track = useCallback(async <T,>(operation: () => Promise<T>) => {
    const finish = begin();
    try {
      return await operation();
    } finally {
      finish();
    }
  }, [begin]);

  const reportError = useCallback((message: string) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setError(message);
    errorTimer.current = setTimeout(() => {
      setError('');
      errorTimer.current = null;
    }, 5_000);
  }, []);

  useEffect(() => () => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
  }, []);

  return <ActivityContext.Provider value={{ active: activeCount > 0, begin, error, reportError, track }}>{children}</ActivityContext.Provider>;
}

export function useActivity() {
  const context = useContext(ActivityContext);
  if (!context) throw new Error('useActivity must be used inside ActivityProvider.');
  return context;
}
