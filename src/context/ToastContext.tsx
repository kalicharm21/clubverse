import React, {createContext, useCallback, useContext, useState} from 'react';
import {AlertTriangle, CheckCircle2, Info, X} from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ToastContextValue {
  toast: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
    info: (title: string, description?: string) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({children}: {children: React.ReactNode}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);

  const pushToast = useCallback((variant: ToastVariant, title: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, {id, title, description, variant}]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({options, resolve});
    });
  }, []);

  const handleConfirmChoice = (accepted: boolean) => {
    if (!confirmState) return;
    confirmState.resolve(accepted);
    setConfirmState(null);
  };

  const value: ToastContextValue = {
    toast: {
      success: (title, description) => pushToast('success', title, description),
      error: (title, description) => pushToast('error', title, description),
      info: (title, description) => pushToast('info', title, description),
    },
    confirm,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast stack */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
          >
            {item.variant === 'success' && (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            )}
            {item.variant === 'error' && (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            )}
            {item.variant === 'info' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              {item.description && (
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== item.id))}
              aria-label="Dismiss notification"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation dialog */}
      {confirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900">
              {confirmState.options.title}
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {confirmState.options.description}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => handleConfirmChoice(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {confirmState.options.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmChoice(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  confirmState.options.destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-violet-700 hover:bg-violet-800'
                }`}
              >
                {confirmState.options.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
