import React from 'react';
import {AlertCircle, CheckCircle2, Clock, X, XCircle} from 'lucide-react';

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({icon, title, description, action}) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-500">{icon}</div>
    <h3 className="text-base font-semibold text-slate-900">{title}</h3>
    <p className="mt-1 max-w-md text-sm text-slate-600 leading-relaxed">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const LoadingSkeleton: React.FC<{rows?: number}> = ({rows = 4}) => (
  <div className="space-y-3" aria-busy="true" aria-label="Loading content">
    {Array.from({length: rows}).map((_, idx) => (
      <div
        key={idx}
        className="h-14 w-full animate-pulse rounded-xl border border-slate-200 bg-slate-100/80"
      />
    ))}
  </div>
);

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({open, onClose, title, subtitle, children, maxWidth = 'max-w-lg'}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
};

export const SafeExternalLink: React.FC<{
  href?: string | null;
  className?: string;
  children: React.ReactNode;
}> = ({href, className = '', children}) => {
  if (!href) return null;
  let safeUrl: string | null = null;
  try {
    const parsed = new URL(href);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      safeUrl = parsed.toString();
    }
  } catch {
    safeUrl = null;
  }
  if (!safeUrl) return null;
  return (
    <a href={safeUrl} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
};

/**
 * Semantic status indicator pairing explicit icon + text label (zero pill clutter, WCAG compliant).
 */
export const StatusLabel: React.FC<{
  status: string;
}> = ({status}) => {
  const normalized = status.toLowerCase();
  if (
    [
      'active',
      'published',
      'registration_open',
      'confirmed',
      'attended',
      'completed',
      'accepted',
      'released',
      'approved',
    ].includes(normalized)
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 capitalize whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {status.replace(/_/g, ' ')}
      </span>
    );
  }
  if (
    [
      'pending_review',
      'pending_verification',
      'pending',
      'draft',
      'waitlisted',
      'partial',
      'not_released',
      'submitted',
      'under_review',
      'changes_requested',
    ].includes(normalized)
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 capitalize whitespace-nowrap">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {status.replace(/_/g, ' ')}
      </span>
    );
  }
  if (['suspended', 'cancelled', 'revoked', 'expired', 'rejected'].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 capitalize whitespace-nowrap">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        {status.replace(/_/g, ' ')}
      </span>
    );
  }
  if (['inactive', 'registration_closed'].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 capitalize whitespace-nowrap">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {status.replace(/_/g, ' ')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 capitalize whitespace-nowrap">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export const ClubLogo: React.FC<{
  name: string;
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({name, logoUrl, size = 'md'}) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const sizeClass =
    size === 'lg' ? 'h-16 w-16 text-lg' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-12 w-12 text-sm';

  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
        alt={`${name} emblem`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${sizeClass} rounded-xl border border-slate-200 object-cover shrink-0 bg-slate-50`}
      />
    );
  }

  return (
    <div
      aria-label={`${name} monogram`}
      className={`${sizeClass} flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 font-display font-semibold text-slate-700 shrink-0`}
    >
      {initials}
    </div>
  );
};
