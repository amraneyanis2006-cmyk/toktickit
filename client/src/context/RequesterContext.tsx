import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Requester {
  id: number;
  name: string;
  email: string;
}

interface RequesterContextValue {
  requester: Requester | null;
  selectRequester: (requester: Requester) => void;
  clearRequester: () => void;
}

const STORAGE_KEY = 'toktickit.devRequester';

const RequesterContext = createContext<RequesterContextValue | undefined>(undefined);

function loadStoredRequester(): Requester | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Requester) : null;
  } catch {
    return null;
  }
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(loadStoredRequester);

  const selectRequester = useCallback((next: Requester) => {
    setRequester(next);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const clearRequester = useCallback(() => {
    setRequester(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <RequesterContext.Provider value={{ requester, selectRequester, clearRequester }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester(): RequesterContextValue {
  const ctx = useContext(RequesterContext);
  if (!ctx) {
    throw new Error('useRequester must be used within a RequesterProvider');
  }
  return ctx;
}
