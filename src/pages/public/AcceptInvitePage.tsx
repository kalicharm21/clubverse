import React, {useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import {AlertCircle, ArrowLeft, CheckCircle2, MailCheck, ShieldCheck} from 'lucide-react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {
  CLUB_ROLE_LABELS,
  PERMISSION_LABELS,
} from '../../../shared/constants/permissions.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';
import {Card, Input, Select} from '../../components/ui/FormControls.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const AcceptInvitePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();
  const navigate = useNavigate();
  const {toast} = useToast();
  const {
    user,
    isAuthenticated,
    isInitializing,
    isDemoMode,
    loginWithCredentials,
    registerAccount,
    refreshSession,
    switchContext,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('Sophomore (Year 2)');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [acceptedClubName, setAcceptedClubName] = useState<string | null>(null);

  const {
    data: preview,
    isLoading,
    error: previewError,
  } = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: () => apiClient.previewInvitation(token),
    enabled: token.length >= 16,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const result = await apiClient.acceptInvitation({
        token,
        name: name.trim() || undefined,
        department: department.trim() || undefined,
        yearOfStudy: yearOfStudy.trim() || undefined,
      });
      await refreshSession();
      return result;
    },
    onSuccess: (result) => {
      setAcceptedClubName(preview?.clubName || 'your club');
      toast.success(
        'Invitation accepted',
        `You now hold ${CLUB_ROLE_LABELS[result.membership.role]} access.`,
      );
      if (result.membership.role === 'core_member') {
        switchContext('core_member', result.membership.clubId);
        navigate('/app/core/dashboard');
      } else {
        switchContext('club_admin', result.membership.clubId);
        navigate('/app/club-admin/dashboard');
      }
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to accept invitation');
    },
  });

  const handleAuthAndAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;
    setErrorMsg(null);
    const invitedEmail = preview.invitation.inviteeEmail;
    try {
      if (mode === 'signin' || preview.hasExistingAccount) {
        await loginWithCredentials(invitedEmail, password);
        await acceptMutation.mutateAsync();
      } else {
        if (!name.trim() || !department.trim()) {
          setErrorMsg('Full name and department are required to complete your onboarding profile.');
          return;
        }
        const regResult = await registerAccount({
          name: name.trim(),
          email: invitedEmail,
          department: department.trim(),
          yearOfStudy,
          password,
        });
        if (regResult.requiresEmailVerification) {
          toast.info(
            'Verification email sent',
            'Verify your institutional email first, then reopen this invitation link to finalize access.',
          );
          return;
        }
        await acceptMutation.mutateAsync();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50/70 px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-lg">
          <Card className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
            <h1 className="mt-4 font-display text-xl font-bold text-slate-900">
              Missing Invitation Token
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Open the full invitation link sent to your institutional email inbox.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-800"
            >
              Return to Sign In
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/70 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CampusVerse
        </Link>

        {isLoading || isInitializing ? (
          <Card className="p-8">
            <LoadingSkeleton rows={4} />
          </Card>
        ) : previewError || !preview ? (
          <Card className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
            <h1 className="mt-4 font-display text-xl font-bold text-slate-900">
              Invitation Unavailable
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {previewError instanceof Error
                ? previewError.message
                : 'This invitation link is invalid, expired, or has already been revoked.'}
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white"
            >
              Go to Sign In
            </Link>
          </Card>
        ) : acceptedClubName ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h1 className="mt-4 font-display text-xl font-bold text-slate-900">
              Welcome to {acceptedClubName}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Your club leadership workspace is ready.
            </p>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <p className="text-xs font-medium text-violet-700">Club Leadership Invitation</p>
                <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
                  Join {preview.clubName}
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Invited Email:{' '}
                  <span className="font-mono text-slate-800">{preview.invitation.inviteeEmail}</span>
                </p>
              </div>
              <StatusLabel status={preview.invitation.status} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-600">Assigned Role</span>
                <span className="font-semibold text-slate-900">
                  {CLUB_ROLE_LABELS[preview.invitation.intendedRole]} · {preview.invitation.title}
                </span>
              </div>
              {preview.invitation.intendedRole === 'core_member' && (
                <div>
                  <span className="font-medium text-slate-600">Delegated Permissions:</span>
                  <p className="mt-1 text-slate-800">
                    {preview.invitation.permissions.length > 0
                      ? preview.invitation.permissions
                          .map((p) => PERMISSION_LABELS[p] || p)
                          .join(', ')
                      : 'None yet (assigned by club officers)'}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between text-slate-500">
                <span>Expires</span>
                <span className="font-mono">
                  {new Date(preview.invitation.expiresAt).toLocaleString()}
                </span>
              </div>
            </div>

            {preview.invitation.status !== 'pending' ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                This invitation has status <strong>{preview.invitation.status}</strong> and cannot be
                accepted. Contact your Club President or Super Admin for a fresh invitation.
              </div>
            ) : isAuthenticated && user ? (
              user.email.toLowerCase() === preview.invitation.inviteeEmail.toLowerCase() ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
                    <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                    <span>
                      Signed in as <strong>{user.email}</strong>. Click below to accept your role
                      and unlock your club workspace.
                    </span>
                  </div>
                  {errorMsg && (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      {errorMsg}
                    </p>
                  )}
                  <Button
                    className="w-full"
                    loading={acceptMutation.isPending}
                    onClick={() => acceptMutation.mutate()}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Accept Role &amp; Enter Club Workspace
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    You are currently signed in as <strong>{user.email}</strong>, but this
                    invitation is exclusively for{' '}
                    <strong>{preview.invitation.inviteeEmail}</strong>.
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => void logout()}>
                    Sign Out to Switch Account
                  </Button>
                </div>
              )
            ) : (
              <form onSubmit={handleAuthAndAccept} className="space-y-4">
                {!preview.hasExistingAccount && !isDemoMode && (
                  <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setMode('signup')}
                      className={`flex-1 rounded-md py-1.5 font-medium ${
                        mode === 'signup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      New Account Setup
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('signin')}
                      className={`flex-1 rounded-md py-1.5 font-medium ${
                        mode === 'signin' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Existing Account Sign In
                    </button>
                  </div>
                )}

                {errorMsg && (
                  <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {errorMsg}
                  </p>
                )}

                {!preview.hasExistingAccount && mode === 'signup' && (
                  <>
                    <Input
                      label="Full Name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Ananya Verma"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Department"
                        required
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder="Computer Science"
                      />
                      <Select
                        label="Year of Study"
                        value={yearOfStudy}
                        onChange={(e) => setYearOfStudy(e.target.value)}
                        options={[
                          {label: 'Freshman (Year 1)', value: 'Freshman (Year 1)'},
                          {label: 'Sophomore (Year 2)', value: 'Sophomore (Year 2)'},
                          {label: 'Junior (Year 3)', value: 'Junior (Year 3)'},
                          {label: 'Senior (Year 4)', value: 'Senior (Year 4)'},
                          {label: 'Graduate', value: 'Graduate'},
                        ]}
                      />
                    </div>
                  </>
                )}

                <Input
                  label="Password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                />

                <Button
                  type="submit"
                  className="w-full"
                  loading={acceptMutation.isPending}
                >
                  {preview.hasExistingAccount || mode === 'signin'
                    ? 'Sign In & Accept Invitation'
                    : 'Create Account & Accept Invitation'}
                </Button>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};
