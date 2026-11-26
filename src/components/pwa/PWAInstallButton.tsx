import React, {useState} from 'react';
import {Download, Share2, X} from 'lucide-react';
import {usePWAInstall} from '../../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC = () => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 transition-colors"
      >
        <Download className="h-3.5 w-3.5 text-violet-700" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 transition-colors"
        >
          <Share2 className="h-3.5 w-3.5 text-violet-700" />
          Install on iOS
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Install CampusVerse on iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-slate-600 list-decimal list-inside">
                <li>Tap the Share icon in Safari&apos;s toolbar.</li>
                <li>Scroll down and choose Add to Home Screen.</li>
                <li>Tap Add to launch CampusVerse as a standalone app.</li>
              </ol>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
