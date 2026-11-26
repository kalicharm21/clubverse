import React, {useEffect, useState} from 'react';
import {RefreshCw, WifiOff, X} from 'lucide-react';
import {useOnlineStatus} from '../../hooks/useOnlineStatus.ts';

export const OfflineStatusBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 shadow-md"
    >
      <WifiOff className="h-4 w-4 text-amber-700 shrink-0" />
      <span>Offline mode — app shell cached; server mutations require connectivity.</span>
    </div>
  );
};

export const PWAUpdateBanner: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateFn, setUpdateFn] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let active = true;
    import('virtual:pwa-register')
      .then(({registerSW}) => {
        if (!active) return;
        const updateSW = registerSW({
          onNeedRefresh() {
            if (active) setNeedRefresh(true);
          },
        });
        setUpdateFn(() => () => updateSW(true));
      })
      .catch(() => {
        // Ignore in Vitest / SSR environments without virtual:pwa-register
      });
    return () => {
      active = false;
    };
  }, []);

  if (!needRefresh || !updateFn) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-xs text-slate-800 shadow-lg"
    >
      <RefreshCw className="h-4 w-4 text-blue-600 shrink-0" />
      <span>A newer CampusVerse version is available.</span>
      <button
        type="button"
        onClick={() => void updateFn()}
        className="rounded-md bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss update prompt"
        className="rounded p-0.5 text-slate-400 hover:text-slate-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
