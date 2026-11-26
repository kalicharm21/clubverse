import React, {useEffect, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Eye,
  Plus,
  Rocket,
  Save,
  Trash2,
  Wrench,
} from 'lucide-react';
import {useSearchParams} from 'react-router-dom';
import type {FormField, FormFieldType} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {LoadingSkeleton} from '../../components/ui/Feedback.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

const CHOICE_TYPES: FormFieldType[] = ['select', 'radio', 'checkboxes'];

const FIELD_TYPE_OPTIONS: Array<{value: FormFieldType; label: string}> = [
  {value: 'text', label: 'Short Text'},
  {value: 'textarea', label: 'Long Text'},
  {value: 'email', label: 'Email'},
  {value: 'phone', label: 'Phone Number'},
  {value: 'number', label: 'Number'},
  {value: 'select', label: 'Dropdown Select'},
  {value: 'radio', label: 'Radio Choice'},
  {value: 'checkboxes', label: 'Multiple Checkboxes'},
  {value: 'checkbox', label: 'Single Checkbox'},
  {value: 'url', label: 'Website / Portfolio URL'},
];

export const FormBuilderPage: React.FC = () => {
  const {activeClubId} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const {data: events = [], isLoading: eventsLoading} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  const [selectedEventId, setSelectedEventId] = useState(searchParams.get('eventId') || '');
  const [fields, setFields] = useState<FormField[]>([]);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [mode, setMode] = useState<'builder' | 'preview'>('builder');
  const [formActionError, setFormActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const {data: form, isLoading: formLoading} = useQuery({
    queryKey: ['event-form', selectedEventId],
    queryFn: () => apiClient.getEventForm(selectedEventId),
    enabled: Boolean(selectedEventId),
  });

  useEffect(() => {
    if (form) {
      setFields(form.fields);
      setFormTitle(form.title || 'Event Registration Form');
      setFormDescription(form.description || '');
    }
    setFormActionError(null);
  }, [form, selectedEventId]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.saveEventForm(selectedEventId, fields, {
        title: formTitle.trim() || undefined,
        description: formDescription.trim() || undefined,
      }),
    onSuccess: async (saved) => {
      setFormActionError(null);
      await queryClient.invalidateQueries({queryKey: ['event-form', selectedEventId]});
      toast.success(`Draft saved (v${saved.version})`);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Unable to save form draft';
      setFormActionError(message);
      toast.error('Failed to save form draft', message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      await apiClient.saveEventForm(selectedEventId, fields, {
        title: formTitle.trim() || undefined,
        description: formDescription.trim() || undefined,
      });
      return apiClient.publishEventForm(selectedEventId);
    },
    onSuccess: async (snapshot) => {
      setFormActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['event-form', selectedEventId]}),
        queryClient.invalidateQueries({queryKey: ['event-form', selectedEventId, 'published']}),
      ]);
      toast.success(
        `Published immutable snapshot v${snapshot.version}`,
        'New student registrations will record answers against this locked version.',
      );
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Unable to publish form';
      setFormActionError(message);
      toast.error('Failed to publish form', message);
    },
  });

  const addField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: `fld-${Date.now()}-${prev.length + 1}`,
        label: 'New Question',
        type: 'text',
        required: false,
        placeholder: 'Enter response',
      },
    ]);
  };

  const updateField = (idx: number, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? {...f, ...patch} : f)));
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    setFields((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const removeField = (idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  if (eventsLoading) return <LoadingSkeleton rows={3} />;

  const publishedVersion = form?.publishedVersion ?? 0;
  const publicationBadgeText =
    form?.status === 'published' && publishedVersion > 0
      ? `Published v${publishedVersion}`
      : publishedVersion > 0
        ? `Draft modified since Published v${publishedVersion}`
        : 'Unpublished Draft';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold text-slate-900">
              Registration Form Builder
            </h1>
            {form && (
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                  form.status === 'published'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {publicationBadgeText}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Design 10-type intake schemas, save drafts, and publish immutable form snapshots (draft
            v{form?.version || 1}
            {publishedVersion > 0 ? ` · live student snapshot v${publishedVersion}` : ' · not yet published to students'}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('builder')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                mode === 'builder' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              Builder
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                mode === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>

          <Button variant="outline" onClick={addField}>
            <Plus className="h-4 w-4" />
            Add Field
          </Button>
          <Button
            variant="outline"
            loading={saveMutation.isPending}
            disabled={!selectedEventId || fields.length === 0}
            onClick={() => saveMutation.mutate()}
          >
            <Save className="h-4 w-4" />
            Save Draft
          </Button>
          <Button
            loading={publishMutation.isPending}
            disabled={!selectedEventId || fields.length === 0}
            onClick={() => publishMutation.mutate()}
          >
            <Rocket className="h-4 w-4" />
            Publish Version
          </Button>
        </div>
      </div>

      {formActionError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <div>
            <p className="font-semibold">Form Update Error</p>
            <p className="mt-0.5">{formActionError}</p>
          </div>
        </div>
      )}

      <Card className="p-4 space-y-4">
        <div>
          <label htmlFor="form-builder-event" className="block text-xs font-medium text-slate-500">
            Target Event
          </label>
          <select
            id="form-builder-event"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({ev.status.replace(/_/g, ' ')})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600">Form Title</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Form Instructions (optional)
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Guidelines shown to registering students..."
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
            />
          </div>
        </div>
      </Card>

      {formLoading ? (
        <LoadingSkeleton rows={3} />
      ) : mode === 'preview' ? (
        <Card className="p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">{formTitle}</h2>
            {formDescription && <p className="mt-1 text-xs text-slate-600">{formDescription}</p>}
          </div>
          {fields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              {field.type === 'checkbox' ? (
                <label className="flex items-start gap-2 text-xs text-slate-800">
                  <input type="checkbox" disabled className="mt-0.5" />
                  <span>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </span>
                </label>
              ) : (
                <>
                  <label className="block text-xs font-medium text-slate-800">
                    {field.label}
                    {field.required ? ' *' : ''}
                  </label>
                  {field.description && (
                    <p className="text-[11px] text-slate-500">{field.description}</p>
                  )}
                  {field.type === 'textarea' ? (
                    <textarea
                      disabled
                      rows={2}
                      placeholder={field.placeholder}
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      disabled
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    >
                      {(field.options || []).map((opt) => (
                        <option key={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === 'radio' ? (
                    <div className="space-y-1">
                      {(field.options || []).map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-xs text-slate-700">
                          <input type="radio" disabled name={`preview-${field.id}`} />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : field.type === 'checkboxes' ? (
                    <div className="space-y-1">
                      {(field.options || []).map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-xs text-slate-700">
                          <input type="checkbox" disabled />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      disabled
                      type={field.type === 'number' ? 'number' : 'text'}
                      placeholder={field.placeholder}
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <div className="space-y-3">
          {fields.map((field, idx) => (
            <Card key={field.id} className="p-5 space-y-3">
              <div className="grid gap-4 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-4">
                  <label className="block text-xs font-medium text-slate-700">Field Label</label>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateField(idx, {label: e.target.value})}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-700">Field Type</label>
                  <select
                    value={field.type}
                    onChange={(e) => {
                      const nextType = e.target.value as FormFieldType;
                      updateField(idx, {
                        type: nextType,
                        options:
                          CHOICE_TYPES.includes(nextType) && !field.options?.length
                            ? ['Option A', 'Option B']
                            : field.options,
                      });
                    }}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                  >
                    {FIELD_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer py-2">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(idx, {required: e.target.checked})}
                    />
                    Required
                  </label>
                </div>
                <div className="sm:col-span-3 flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={idx === 0}
                    aria-label="Move field up"
                    onClick={() => moveField(idx, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={idx === fields.length - 1}
                    aria-label="Move field down"
                    onClick={() => moveField(idx, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={fields.length <= 1}
                    onClick={() => removeField(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    Helper Description (optional)
                  </label>
                  <input
                    type="text"
                    value={field.description || ''}
                    onChange={(e) => updateField(idx, {description: e.target.value})}
                    placeholder="Shown below the field label"
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
                {field.type !== 'checkbox' &&
                  field.type !== 'radio' &&
                  field.type !== 'checkboxes' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600">
                        Placeholder
                      </label>
                      <input
                        type="text"
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(idx, {placeholder: e.target.value})}
                        className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                  )}
              </div>

              {CHOICE_TYPES.includes(field.type) && (
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    Choice Options (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={(field.options || []).join(', ')}
                    onChange={(e) =>
                      updateField(idx, {
                        options: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              )}

              {(field.type === 'text' ||
                field.type === 'textarea' ||
                field.type === 'email' ||
                field.type === 'phone' ||
                field.type === 'url' ||
                field.type === 'number') && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  {field.type === 'number' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">
                          Min Value
                        </label>
                        <input
                          type="number"
                          value={field.validationRules?.min ?? ''}
                          onChange={(e) =>
                            updateField(idx, {
                              validationRules: {
                                ...field.validationRules,
                                min: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">
                          Max Value
                        </label>
                        <input
                          type="number"
                          value={field.validationRules?.max ?? ''}
                          onChange={(e) =>
                            updateField(idx, {
                              validationRules: {
                                ...field.validationRules,
                                max: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(field.type === 'text' || field.type === 'textarea') && (
                        <>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600">
                              Min Length
                            </label>
                            <input
                              type="number"
                              value={field.validationRules?.minLength ?? ''}
                              onChange={(e) =>
                                updateField(idx, {
                                  validationRules: {
                                    ...field.validationRules,
                                    minLength: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                              className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600">
                              Max Length
                            </label>
                            <input
                              type="number"
                              value={field.validationRules?.maxLength ?? ''}
                              onChange={(e) =>
                                updateField(idx, {
                                  validationRules: {
                                    ...field.validationRules,
                                    maxLength: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                              className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                            />
                          </div>
                        </>
                      )}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">
                          Regex Pattern (optional)
                        </label>
                        <input
                          type="text"
                          value={field.validationRules?.pattern ?? ''}
                          placeholder="e.g. ^[A-Z0-9]{6,10}$"
                          onChange={(e) =>
                            updateField(idx, {
                              validationRules: {
                                ...field.validationRules,
                                pattern: e.target.value || undefined,
                              },
                            })
                          }
                          className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">
                          Regex Error Message (optional)
                        </label>
                        <input
                          type="text"
                          value={field.validationRules?.patternMessage ?? ''}
                          placeholder="e.g. Enter a valid 8-char student code"
                          onChange={(e) =>
                            updateField(idx, {
                              validationRules: {
                                ...field.validationRules,
                                patternMessage: e.target.value || undefined,
                              },
                            })
                          }
                          className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
