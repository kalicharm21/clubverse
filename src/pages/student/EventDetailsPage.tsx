import React, {useEffect, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  MapPin,
  QrCode,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {QRCodeSVG} from 'qrcode.react';
import {Link, useParams} from 'react-router-dom';
import type {FormAnswerValue} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, Modal, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const EventDetailsPage: React.FC = () => {
  const {eventId = ''} = useParams();
  const {user} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();

  const [answers, setAnswers] = useState<Record<string, FormAnswerValue>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const {data: event, isLoading: eventLoading} = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => apiClient.getEventDetail(eventId),
    enabled: Boolean(eventId),
  });

  const {
    data: form,
    error: formQueryError,
    isLoading: formLoading,
  } = useQuery({
    queryKey: ['event-form', eventId, 'published'],
    queryFn: () => apiClient.getEventForm(eventId, {publishedOnly: true}),
    enabled: Boolean(eventId),
    retry: false,
  });

  const {data: myRegistrations = []} = useQuery({
    queryKey: ['my-registrations', user?.id],
    queryFn: () => apiClient.listMyRegistrations(),
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!form) return;
    const defaults: Record<string, FormAnswerValue> = {};
    for (const field of form.fields) {
      if (field.type === 'select' && field.options?.length) {
        defaults[field.id] = field.options[0];
      } else if (field.type === 'checkbox') {
        defaults[field.id] = false;
      } else if (field.type === 'checkboxes') {
        defaults[field.id] = [];
      } else {
        defaults[field.id] = '';
      }
    }
    setAnswers(defaults);
  }, [form]);

  const registerMutation = useMutation({
    mutationFn: () => apiClient.submitRegistration(eventId, answers),
    onSuccess: async (reg) => {
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['my-registrations']}),
        queryClient.invalidateQueries({queryKey: ['event', eventId]}),
        queryClient.invalidateQueries({queryKey: ['events']}),
        queryClient.invalidateQueries({queryKey: ['notifications']}),
      ]);
      if (reg.status === 'waitlisted') {
        toast.info(
          'Added to FIFO waitlist',
          `You are #${reg.waitlistPosition ?? ''} in queue. If a seat opens, you will be automatically promoted.`,
        );
      } else if (reg.ticketStatus === 'released' && reg.qrToken) {
        toast.success('Registration confirmed', 'Your opaque QR entry pass is ready.');
      } else {
        toast.success(
          'Registration confirmed',
          'Your registration is confirmed. Your ticket will be available once the club releases tickets.',
        );
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to submit registration';
      setFormError(msg);
      toast.error('Registration error', msg);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.cancelMyRegistration(eventId),
    onSuccess: async () => {
      setConfirmCancel(false);
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['my-registrations']}),
        queryClient.invalidateQueries({queryKey: ['event', eventId]}),
        queryClient.invalidateQueries({queryKey: ['events']}),
        queryClient.invalidateQueries({queryKey: ['notifications']}),
      ]);
      toast.info('Registration cancelled', 'Your spot has been released.');
    },
    onError: (err) => {
      toast.error('Cancellation failed', err instanceof Error ? err.message : undefined);
    },
  });

  if (eventLoading) return <LoadingSkeleton rows={4} />;
  if (!event) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium text-slate-800">Event not found.</p>
        <Link to="/app/student/events" className="mt-3 inline-block text-xs font-medium text-blue-600">
          Back to Events
        </Link>
      </Card>
    );
  }

  const existingRegistration = myRegistrations.find(
    (r) => r.eventId === event.id && r.status !== 'cancelled',
  );

  const nowMs = Date.now();
  const opensAtMs = event.registrationOpensAt ? new Date(event.registrationOpensAt).getTime() : null;
  const deadlineMs = new Date(event.registrationDeadline).getTime();
  const statusAcceptsRegistration =
    event.status === 'published' || event.status === 'registration_open';
  const beforeWindow = Boolean(opensAtMs && nowMs < opensAtMs);
  const pastDeadline = nowMs > deadlineMs;
  const isFull = event.registeredCount >= event.capacity;

  const eligibility = event.eligibilityRules;
  const hasEligibility = Boolean(
    eligibility &&
      (eligibility.allowedDomains?.length ||
        eligibility.allowedDepartments?.length ||
        eligibility.allowedYears?.length ||
        eligibility.notes),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    registerMutation.mutate();
  };

  const toggleMultiCheckbox = (fieldId: string, option: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[fieldId]) ? (prev[fieldId] as string[]) : [];
      const exists = current.includes(option);
      return {
        ...prev,
        [fieldId]: exists ? current.filter((item) => item !== option) : [...current, option],
      };
    });
  };

  return (
    <div className="space-y-6">
      <Link
        to="/app/student/events"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Events
      </Link>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 sm:p-8 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <Link
              to={`/app/student/clubs/${event.clubId}`}
              className="text-xs font-semibold text-violet-700 hover:underline"
            >
              {event.clubName}
            </Link>
            <StatusLabel status={event.status} />
          </div>

          <h1 className="mt-2 font-display text-2xl font-bold text-slate-900">{event.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {event.category} ·{' '}
            {event.isPaid ? `Registration Fee: INR ${event.feeAmount}` : 'Free Entry'}
          </p>

          <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
              <span>
                {new Date(event.startTime).toLocaleDateString()} ·{' '}
                {new Date(event.startTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
              <span>{event.venue}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500 shrink-0" />
              <span className="font-mono tabular-nums">
                {event.registeredCount} / {event.capacity} seats filled
                {event.waitlistedCount ? ` · ${event.waitlistedCount} waitlisted` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
              <span>
                Closes {new Date(event.registrationDeadline).toLocaleDateString()}
              </span>
            </div>
          </div>

          {hasEligibility && eligibility && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-700">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-violet-700" />
                Eligibility Requirements
              </div>
              <ul className="mt-2 space-y-1 text-slate-600">
                {eligibility.allowedDomains?.length ? (
                  <li>Allowed Email Domains: {eligibility.allowedDomains.join(', ')}</li>
                ) : null}
                {eligibility.allowedDepartments?.length ? (
                  <li>Allowed Departments: {eligibility.allowedDepartments.join(', ')}</li>
                ) : null}
                {eligibility.allowedYears?.length ? (
                  <li>Allowed Years: {eligibility.allowedYears.join(', ')}</li>
                ) : null}
                {eligibility.notes ? <li>{eligibility.notes}</li> : null}
              </ul>
            </div>
          )}

          <div className="mt-6">
            <h2 className="font-display text-sm font-semibold text-slate-900">Event Description</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{event.description}</p>
          </div>
        </Card>

        <Card className="p-6 sm:p-8 lg:col-span-5">
          {existingRegistration ? (
            <div className="text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
                {existingRegistration.status === 'waitlisted'
                  ? 'You are on the Waitlist'
                  : 'You are registered'}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {existingRegistration.status === 'waitlisted'
                  ? `Waitlist Queue Position #${existingRegistration.waitlistPosition ?? '—'}. You will be automatically promoted if a confirmed seat opens.`
                  : existingRegistration.ticketStatus === 'released' && existingRegistration.qrToken
                    ? `Present this single-use opaque QR pass at ${event.venue}. No personal PII is encoded inside the token.`
                    : existingRegistration.ticketStatus === 'revoked'
                      ? 'Your event ticket has been revoked by club organizers.'
                      : 'Your registration is confirmed. Your QR pass will appear here once club organizers release tickets.'}
              </p>

              {existingRegistration.ticketStatus === 'released' && existingRegistration.qrToken ? (
                <>
                  <div className="mt-5 inline-flex rounded-xl border border-slate-200 bg-white p-4">
                    <QRCodeSVG value={existingRegistration.qrToken} size={160} level="M" />
                  </div>
                  {existingRegistration.ticketCode && (
                    <p className="mt-3 font-mono text-xs font-semibold text-slate-600">
                      Ticket Code: {existingRegistration.ticketCode}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                    {existingRegistration.qrToken}
                  </p>
                </>
              ) : existingRegistration.ticketStatus === 'revoked' ? (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                  Ticket Revoked — contact {event.clubName} organizers if you believe this is an error.
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  <p className="font-semibold">Ticket Pending Release</p>
                  <p className="mt-1 text-amber-800">
                    No QR pass has been issued yet. Check back or watch notifications once tickets are released.
                  </p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Registration:</span>
                  <StatusLabel status={existingRegistration.status} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Ticket:</span>
                  <StatusLabel status={existingRegistration.ticketStatus || 'not_released'} />
                </div>
                {existingRegistration.qrUsedAt || existingRegistration.status === 'attended' ? (
                  <span className="text-xs font-medium text-emerald-700">
                    Checked in{' '}
                    {existingRegistration.qrUsedAt
                      ? new Date(existingRegistration.qrUsedAt).toLocaleString()
                      : ''}
                  </span>
                ) : existingRegistration.ticketStatus === 'released' &&
                  existingRegistration.status === 'confirmed' ? (
                  <span className="text-xs text-slate-500">Awaiting gate scan</span>
                ) : null}
              </div>

              {!existingRegistration.qrUsedAt &&
                (existingRegistration.status === 'confirmed' ||
                  existingRegistration.status === 'waitlisted') && (
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancel Registration
                    </Button>
                  </div>
                )}
            </div>
          ) : !statusAcceptsRegistration || beforeWindow || pastDeadline ? (
            <div className="py-8 text-center">
              <QrCode className="mx-auto h-8 w-8 text-slate-400" />
              <h2 className="mt-3 font-display text-base font-semibold text-slate-900">
                {beforeWindow ? 'Registration Not Yet Open' : 'Registration Closed'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {beforeWindow && event.registrationOpensAt
                  ? `Registration opens on ${new Date(event.registrationOpensAt).toLocaleString()}.`
                  : pastDeadline
                    ? `The registration deadline (${new Date(event.registrationDeadline).toLocaleString()}) has passed.`
                    : `This event is currently in ${event.status.replace(/_/g, ' ')} state.`}
              </p>
            </div>
          ) : formLoading ? (
            <LoadingSkeleton rows={3} />
          ) : formQueryError || !form ? (
            <div role="alert" className="py-8 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-amber-600" />
              <h2 className="mt-3 font-display text-base font-semibold text-slate-900">
                Registration Form Not Published Yet
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {formQueryError instanceof Error
                  ? formQueryError.message
                  : 'Club organizers have not published the registration form for this event yet.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  {form?.title || 'Register for Event'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Form version v{form?.publishedVersion || form?.version || 1} configured by{' '}
                  {event.clubName}
                </p>
                {form?.description && (
                  <p className="mt-1.5 text-xs text-slate-600">{form.description}</p>
                )}
              </div>

              {isFull && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <span>
                    All {event.capacity} confirmed seats are filled. Submitting this form joins the
                    automatic FIFO waitlist.
                  </span>
                </div>
              )}

              {formError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {formError}
                </p>
              )}

              {form?.fields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  {field.type === 'checkbox' ? (
                    <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(answers[field.id])}
                        onChange={(e) =>
                          setAnswers((prev) => ({...prev, [field.id]: e.target.checked}))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-700"
                      />
                      <span>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </span>
                    </label>
                  ) : field.type === 'checkboxes' ? (
                    <fieldset className="space-y-1.5">
                      <legend className="block text-xs font-medium text-slate-800">
                        {field.label}
                        {field.required ? ' *' : ''}
                      </legend>
                      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        {(field.options || []).map((opt) => {
                          const selectedList = Array.isArray(answers[field.id])
                            ? (answers[field.id] as string[])
                            : [];
                          return (
                            <label
                              key={opt}
                              className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedList.includes(opt)}
                                onChange={() => toggleMultiCheckbox(field.id, opt)}
                                className="h-4 w-4 rounded border-slate-300 text-violet-700"
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : field.type === 'radio' ? (
                    <fieldset className="space-y-1.5">
                      <legend className="block text-xs font-medium text-slate-800">
                        {field.label}
                        {field.required ? ' *' : ''}
                      </legend>
                      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        {(field.options || []).map((opt) => (
                          <label
                            key={opt}
                            className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={`field-${field.id}`}
                              value={opt}
                              checked={answers[field.id] === opt}
                              onChange={() =>
                                setAnswers((prev) => ({...prev, [field.id]: opt}))
                              }
                              className="h-4 w-4 border-slate-300 text-violet-700"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
                    <>
                      <label className="block text-xs font-medium text-slate-800">
                        {field.label}
                        {field.required ? ' *' : ''}
                      </label>
                      {field.type === 'select' ? (
                        <select
                          value={String(answers[field.id] || '')}
                          onChange={(e) =>
                            setAnswers((prev) => ({...prev, [field.id]: e.target.value}))
                          }
                          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          {(field.options || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'textarea' ? (
                        <textarea
                          rows={3}
                          value={String(answers[field.id] || '')}
                          placeholder={field.placeholder}
                          onChange={(e) =>
                            setAnswers((prev) => ({...prev, [field.id]: e.target.value}))
                          }
                          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      ) : (
                        <input
                          type={
                            field.type === 'number'
                              ? 'number'
                              : field.type === 'email'
                                ? 'email'
                                : field.type === 'phone'
                                  ? 'tel'
                                  : field.type === 'url'
                                    ? 'url'
                                    : 'text'
                          }
                          value={String(answers[field.id] ?? '')}
                          placeholder={field.placeholder}
                          onChange={(e) =>
                            setAnswers((prev) => ({...prev, [field.id]: e.target.value}))
                          }
                          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      )}
                    </>
                  )}
                  {field.description && (
                    <p className="text-[11px] text-slate-500">{field.description}</p>
                  )}
                </div>
              ))}

              <Button type="submit" loading={registerMutation.isPending} className="w-full">
                {isFull ? 'Join FIFO Waitlist' : 'Confirm Registration'}
              </Button>
            </form>
          )}
        </Card>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel Event Registration"
        subtitle={event.title}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Cancelling releases your seat immediately and automatically promotes the next student in
            the FIFO waitlist.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep Registration
            </Button>
            <Button
              variant="danger"
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
