import React from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import type {PaginationMeta} from '../../../shared/types/domain.ts';
import {Button} from './Button.tsx';

export const PaginationBar: React.FC<{
  pagination?: PaginationMeta;
  onPageChange: (nextPage: number) => void;
}> = ({pagination, onPageChange}) => {
  if (!pagination || pagination.totalPages <= 1) return null;

  const {page, totalPages, total, pageSize} = pagination;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-5 py-3 text-xs text-slate-600 sm:flex-row">
      <p className="font-mono tabular-nums">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </Button>
        <span className="px-2 font-mono tabular-nums">
          Page {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
