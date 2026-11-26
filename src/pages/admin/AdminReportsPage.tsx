import React, {useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {CheckCircle2, Download, ExternalLink, FileText, History} from 'lucide-react';
import type {EventReport} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Select, Textarea} from '../../components/ui/FormControls.tsx';
import {
  EmptyState,
  LoadingSkeleton,
  Modal,
  SafeExternalLink,
  StatusLabel,
} from '../../components/ui/Feedback.tsx';
import {useToast} from '../../context/ToastContext.tsx';
import {triggerBlobDownload} from '../../lib/download.ts';

export const AdminReportsPage: React.FC = () => {
  const {toast} = useToast();
  const queryClient = useQueryClient();

  const [reviewTarget, setReviewTarget] = useState<EventReport | null>(null);
  const [reviewStatus, setReviewStatus] = useState<
    'under_review' | 'changes_requested' | 'approved' | 'rejected'
  >('approved');
  const [reviewNotes, setReviewNotes] = useState('');
  const [exporting, setExporting] = useState(false);

  const {data: reports = [], isLoading} = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => apiClient.listAdminReports(),
  });

  const reviewMutation = useMutation({
    mutationFn: (vars: {
      reportId: string;
      status: 'under_review' | 'changes_requested' | 'approved' | 'rejected';
      reviewNotes: string;
    }) =>
      apiClient.reviewAdminReport(vars.reportId, {
        status: vars.status,
        reviewNotes: vars.reviewNotes,
      }),
    onSuccess: async (updated) => {
      setReviewTarget(null);
      setReviewNotes('');
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['admin-reports']}),
        queryClient.invalidateQueries({queryKey: ['admin-dashboard']}),
        queryClient.invalidateQueries({queryKey: ['admin-analytics']}),
        queryClient.invalidateQueries({queryKey: ['event-report', updated.eventId]}),
      ]);
      toast.success(`Report marked ${updated.status.replace(/_/g, ' ')}`);
    },
    onError: (err) => {
      toast.error('Review update failed', err instanceof Error ? err.message : undefined);
    },
  });

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const {blob, filename} = await apiClient.downloadAdminCsv('reports');
      triggerBlobDownload(blob, filename);
      toast.success('Reports CSV exported', filename);
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Post-Event Completion Reports &amp; Review
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Review submitted post-event reports, request revisions or approve records, and export
            institutional summaries.
          </p>
        </div>

        <Button
          variant="outline"
          loading={exporting}
          disabled={reports.length === 0}
          onClick={() => void handleExportCsv()}
        >
          <Download className="h-4 w-4" />
          Export Reports CSV
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No event reports submitted yet"
          description="Submitted completion reports from club teams will appear here."
        />
      ) : (
        <div className="space-y-4">
          {reports.map((rep) => (
            <Card key={rep.id} className="p-6 space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-medium text-violet-700">{rep.clubName}</p>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    {rep.eventTitle}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-slate-600 tabular-nums">
                    Attendance: {rep.actualAttendance} / {rep.registeredTotal}
                  </span>
                  <StatusLabel status={rep.completionStatus} />
                  <StatusLabel status={rep.status} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReviewTarget(rep);
                      setReviewStatus(
                        rep.status === 'submitted' || rep.status === 'under_review'
                          ? 'approved'
                          : 'under_review',
                      );
                      setReviewNotes(rep.reviewNotes || '');
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Review
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 text-sm">
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Outcome Summary</p>
                    <p className="mt-1 text-slate-700 leading-relaxed">{rep.outcomeSummary}</p>
                  </div>
                  {rep.objectives && (
                    <div>
                      <p className="text-xs font-medium text-slate-500">Objectives</p>
                      <p className="mt-0.5 text-xs text-slate-600">{rep.objectives}</p>
                    </div>
                  )}
                  {rep.participationSummary && (
                    <div>
                      <p className="text-xs font-medium text-slate-500">Participation Summary</p>
                      <p className="mt-0.5 text-xs text-slate-600">{rep.participationSummary}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Highlights &amp; Challenges</p>
                    <p className="mt-1 text-slate-700 leading-relaxed">{rep.highlights}</p>
                    <p className="mt-1 text-xs text-slate-500">Challenges: {rep.challenges}</p>
                  </div>
                  {rep.feedbackObservations && (
                    <div>
                      <p className="text-xs font-medium text-slate-500">Feedback &amp; Observations</p>
                      <p className="mt-0.5 text-xs text-slate-600">{rep.feedbackObservations}</p>
                    </div>
                  )}
                  {rep.evidenceUrl && (
                    <SafeExternalLink
                      href={rep.evidenceUrl}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                    >
                      View Supporting Evidence <ExternalLink className="h-3 w-3" />
                    </SafeExternalLink>
                  )}
                </div>
              </div>

              {rep.reviewNotes && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
                  <span className="font-semibold">Latest Review Notes:</span> {rep.reviewNotes}
                </div>
              )}

              {rep.history && rep.history.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <History className="h-3.5 w-3.5" />
                    Audit History ({rep.history.length})
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {rep.history.map((entry, idx) => (
                      <div
                        key={`${entry.timestamp}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"
                      >
                        <span>
                          <strong>{entry.actorName}</strong> ({entry.actorRole}) · {entry.action}
                          {entry.notes ? ` — "${entry.notes}"` : ''}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400">
                Submitted by {rep.submittedByName} on {new Date(rep.submittedAt).toLocaleString()}
                {rep.actualEventDate ? ` · Event date ${rep.actualEventDate}` : ''}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title={`Review Report · ${reviewTarget?.eventTitle || ''}`}
        subtitle={reviewTarget?.clubName}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reviewTarget) return;
            reviewMutation.mutate({
              reportId: reviewTarget.id,
              status: reviewStatus,
              reviewNotes: reviewNotes.trim(),
            });
          }}
          className="space-y-4"
        >
          <Select
            label="Review Decision"
            value={reviewStatus}
            onChange={(e) =>
              setReviewStatus(
                e.target.value as 'under_review' | 'changes_requested' | 'approved' | 'rejected',
              )
            }
            options={[
              {label: 'Under Review', value: 'under_review'},
              {label: 'Approve Report', value: 'approved'},
              {label: 'Request Changes', value: 'changes_requested'},
              {label: 'Reject Report', value: 'rejected'},
            ]}
          />
          <Textarea
            label="Review Notes & Feedback"
            rows={3}
            required={reviewStatus === 'changes_requested' || reviewStatus === 'rejected'}
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Provide audit remarks or required corrections for club officers..."
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReviewTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={reviewMutation.isPending}>
              Save Review Decision
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
