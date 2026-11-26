import React, {useState} from 'react';
import {zodResolver} from '@hookform/resolvers/zod';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  Ban,
  CalendarPlus,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  Edit3,
  RotateCcw,
  Rocket,
} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {Link} from 'react-router-dom';
import {z} from 'zod';
import {EVENT_CATEGORIES} from '../../../shared/constants/permissions.ts';
import {createEventSchema} from '../../../shared/schemas/validation.ts';
import type {EventItem} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import type {EventLifecycleAction} from '../../adapters/DataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {EmptyState, LoadingSkeleton, Modal, StatusLabel} from '../../components/ui/Feedback.tsx';
import {Card, Input, Select, Textarea} from '../../components/ui/FormControls.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

type EventFormValues = z.input<typeof createEventSchema>;

export const ClubEventsPage: React.FC = () => {
  const {activeClubId, activeContext} = useAuth();
  const {toast, confirm} = useToast();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [allowedDomainsText, setAllowedDomainsText] = useState('');
  const [allowedDeptsText, setAllowedDeptsText] = useState('');
  const [allowedYearsText, setAllowedYearsText] = useState('');
  const [eligibilityNotes, setEligibilityNotes] = useState('');

  const prefix = activeContext === 'core_member' ? '/app/core' : '/app/club-admin';

  const {data: events = [], isLoading} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: {errors, isSubmitting},
  } = useForm<EventFormValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      category: 'Workshop',
      capacity: 60,
      isPaid: false,
      feeAmount: 0,
      startTime: '2026-12-20T14:00',
      endTime: '2026-12-20T17:00',
      registrationOpensAt: '',
      registrationDeadline: '2026-12-19T23:59',
    },
  });

  const isPaid = watch('isPaid');

  const openCreateModal = () => {
    setEditingEvent(null);
    setAllowedDomainsText('');
    setAllowedDeptsText('');
    setAllowedYearsText('');
    setEligibilityNotes('');
    reset({
      title: '',
      category: 'Workshop',
      description: '',
      venue: '',
      capacity: 60,
      isPaid: false,
      feeAmount: 0,
      startTime: '2026-12-20T14:00',
      endTime: '2026-12-20T17:00',
      registrationOpensAt: '',
      registrationDeadline: '2026-12-19T23:59',
    });
    setModalOpen(true);
  };

  const openEditModal = (ev: EventItem) => {
    setEditingEvent(ev);
    setAllowedDomainsText((ev.eligibilityRules?.allowedDomains || []).join(', '));
    setAllowedDeptsText((ev.eligibilityRules?.allowedDepartments || []).join(', '));
    setAllowedYearsText((ev.eligibilityRules?.allowedYears || []).join(', '));
    setEligibilityNotes(ev.eligibilityRules?.notes || '');
    reset({
      title: ev.title,
      category: ev.category,
      description: ev.description,
      venue: ev.venue,
      capacity: ev.capacity,
      isPaid: ev.isPaid,
      feeAmount: ev.feeAmount,
      startTime: ev.startTime.slice(0, 16),
      endTime: ev.endTime.slice(0, 16),
      registrationOpensAt: ev.registrationOpensAt ? ev.registrationOpensAt.slice(0, 16) : '',
      registrationDeadline: ev.registrationDeadline.slice(0, 16),
    });
    setModalOpen(true);
  };

  const parseCsvList = (raw: string) =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const saveMutation = useMutation({
    mutationFn: (vals: EventFormValues) => {
      const parsed = createEventSchema.parse(vals);
      const domains = parseCsvList(allowedDomainsText).map((d) => d.toLowerCase());
      const depts = parseCsvList(allowedDeptsText);
      const years = parseCsvList(allowedYearsText);
      const eligibilityRules =
        domains.length || depts.length || years.length || eligibilityNotes.trim()
          ? {
              allowedDomains: domains.length ? domains : undefined,
              allowedDepartments: depts.length ? depts : undefined,
              allowedYears: years.length ? years : undefined,
              notes: eligibilityNotes.trim() || undefined,
            }
          : undefined;

      const payload = {
        ...parsed,
        startTime: new Date(parsed.startTime).toISOString(),
        endTime: new Date(parsed.endTime).toISOString(),
        registrationOpensAt: parsed.registrationOpensAt
          ? new Date(parsed.registrationOpensAt).toISOString()
          : null,
        registrationDeadline: new Date(parsed.registrationDeadline).toISOString(),
        eligibilityRules,
      };
      if (editingEvent) {
        return apiClient.updateEvent(editingEvent.id, payload);
      }
      return apiClient.createEvent(activeClubId!, payload);
    },
    onSuccess: async () => {
      setModalOpen(false);
      await queryClient.invalidateQueries({queryKey: ['club-events', activeClubId]});
      await queryClient.invalidateQueries({queryKey: ['events']});
      toast.success(editingEvent ? 'Event updated' : 'Draft event created');
    },
    onError: (err) => {
      toast.error('Could not save event', err instanceof Error ? err.message : undefined);
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: (vars: {eventId: string; action: EventLifecycleAction}) =>
      apiClient.transitionEventLifecycle(vars.eventId, vars.action),
    onSuccess: async (ev) => {
      await queryClient.invalidateQueries({queryKey: ['club-events', activeClubId]});
      await queryClient.invalidateQueries({queryKey: ['events']});
      await queryClient.invalidateQueries({queryKey: ['event', ev.id]});
      toast.success(`Event status updated to ${ev.status.replace(/_/g, ' ')}`);
    },
    onError: (err) => {
      toast.error('Lifecycle transition failed', err instanceof Error ? err.message : undefined);
    },
  });

  const handleCancelEvent = async (ev: EventItem) => {
    const ok = await confirm({
      title: `Cancel "${ev.title}"?`,
      description:
        'Registered students will be notified and check-ins will be blocked. This action stops all new registrations.',
      confirmLabel: 'Cancel Event',
      destructive: true,
    });
    if (ok) lifecycleMutation.mutate({eventId: ev.id, action: 'cancel'});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Club Event Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure registration windows, eligibility rules, and full 6-state event lifecycles.
          </p>
        </div>

        <Button onClick={openCreateModal}>
          <CalendarPlus className="h-4 w-4" />
          Create Event
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus className="h-6 w-6" />}
          title="No events created yet"
          description="Draft your club's first workshop, seminar, or hackathon."
          action={<Button onClick={openCreateModal}>Create First Event</Button>}
        />
      ) : (
        <div className="space-y-4">
          {events.map((ev) => {
            const busy =
              lifecycleMutation.isPending && lifecycleMutation.variables?.eventId === ev.id;
            return (
              <Card key={ev.id} className="p-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-medium text-violet-700">{ev.category}</span>
                      <StatusLabel status={ev.status} />
                      <StatusLabel status={ev.ticketsReleasedAt ? 'released' : 'not_released'} />
                      {ev.eligibilityRules && (
                        <span className="text-[11px] font-medium text-slate-500">
                          Eligibility rules configured
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1.5 font-display text-lg font-semibold text-slate-900">
                      {ev.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(ev.startTime).toLocaleString()} · {ev.venue} ·{' '}
                      <span className="font-mono tabular-nums">
                        {ev.registeredCount}/{ev.capacity} registered
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEditModal(ev)}>
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </Button>

                    {ev.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy}
                        onClick={() =>
                          lifecycleMutation.mutate({eventId: ev.id, action: 'publish'})
                        }
                      >
                        <Rocket className="h-3.5 w-3.5" />
                        Publish
                      </Button>
                    )}

                    {ev.status === 'published' && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy}
                          onClick={() =>
                            lifecycleMutation.mutate({
                              eventId: ev.id,
                              action: 'open-registration',
                            })
                          }
                        >
                          <DoorOpen className="h-3.5 w-3.5" />
                          Open Reg
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy}
                          onClick={() =>
                            lifecycleMutation.mutate({eventId: ev.id, action: 'unpublish'})
                          }
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Unpublish
                        </Button>
                      </>
                    )}

                    {ev.status === 'registration_open' && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy}
                        onClick={() =>
                          lifecycleMutation.mutate({
                            eventId: ev.id,
                            action: 'close-registration',
                          })
                        }
                      >
                        <DoorClosed className="h-3.5 w-3.5" />
                        Close Reg
                      </Button>
                    )}

                    {ev.status === 'registration_closed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy}
                        onClick={() =>
                          lifecycleMutation.mutate({
                            eventId: ev.id,
                            action: 'open-registration',
                          })
                        }
                      >
                        <DoorOpen className="h-3.5 w-3.5" />
                        Reopen Reg
                      </Button>
                    )}

                    {(ev.status === 'published' ||
                      ev.status === 'registration_open' ||
                      ev.status === 'registration_closed') && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy}
                          onClick={() =>
                            lifecycleMutation.mutate({eventId: ev.id, action: 'complete'})
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy}
                          onClick={() => void handleCancelEvent(ev)}
                        >
                          <Ban className="h-3.5 w-3.5 text-red-600" />
                          Cancel
                        </Button>
                      </>
                    )}

                    <Link
                      to={`${prefix}/forms?eventId=${ev.id}`}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Form
                    </Link>
                    <Link
                      to={`${prefix}/registrations?eventId=${ev.id}`}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Tickets
                    </Link>
                    <Link
                      to={`${prefix}/attendance?eventId=${ev.id}`}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Attendance
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingEvent ? `Edit: ${editingEvent.title}` : 'Create Club Event'}
        subtitle="New events begin in draft state until published"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit((vals) => saveMutation.mutate(vals))} className="space-y-4">
          <Input label="Event Title" error={errors.title?.message} {...register('title')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              error={errors.category?.message}
              options={EVENT_CATEGORIES.map((c) => ({label: c, value: c}))}
              {...register('category')}
            />
            <Input label="Venue" error={errors.venue?.message} {...register('venue')} />
          </div>
          <Textarea
            label="Event Description"
            rows={3}
            error={errors.description?.message}
            {...register('description')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Start Time"
              type="datetime-local"
              error={errors.startTime?.message}
              {...register('startTime')}
            />
            <Input
              label="End Time"
              type="datetime-local"
              error={errors.endTime?.message}
              {...register('endTime')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Registration Opens At (optional)"
              type="datetime-local"
              error={errors.registrationOpensAt?.message}
              {...register('registrationOpensAt')}
            />
            <Input
              label="Registration Deadline"
              type="datetime-local"
              error={errors.registrationDeadline?.message}
              {...register('registrationDeadline')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <Input
              label="Capacity"
              type="number"
              error={errors.capacity?.message}
              {...register('capacity')}
            />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 cursor-pointer">
              <input type="checkbox" {...register('isPaid')} />
              Paid Event
            </label>
            {isPaid && (
              <Input
                label="Fee (INR)"
                type="number"
                error={errors.feeAmount?.message}
                {...register('feeAmount')}
              />
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold text-slate-900">
              Eligibility Rules (Optional Restrictions)
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Allowed Domains"
                placeholder="vitbhopal.ac.in"
                value={allowedDomainsText}
                onChange={(e) => setAllowedDomainsText(e.target.value)}
              />
              <Input
                label="Allowed Departments"
                placeholder="CSE, ECE"
                value={allowedDeptsText}
                onChange={(e) => setAllowedDeptsText(e.target.value)}
              />
              <Input
                label="Allowed Years"
                placeholder="Year 2, Year 3"
                value={allowedYearsText}
                onChange={(e) => setAllowedYearsText(e.target.value)}
              />
            </div>
            <Input
              label="Eligibility Notes"
              placeholder="e.g. Open to all undergraduate engineering cohorts"
              value={eligibilityNotes}
              onChange={(e) => setEligibilityNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || saveMutation.isPending}>
              {editingEvent ? 'Save Changes' : 'Create Draft Event'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
