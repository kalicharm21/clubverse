import React, {useState} from 'react';
import {zodResolver} from '@hookform/resolvers/zod';
import {ArrowLeft, CheckCircle2, Mail} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {z} from 'zod';
import {registerDemoSchema} from '../../../shared/schemas/validation.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Input, Select} from '../../components/ui/FormControls.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

type RegisterFormValues = z.infer<typeof registerDemoSchema>;

export const RegisterPage: React.FC = () => {
  const {registerAccount, isDemoMode, authConfig} = useAuth();
  const {toast} = useToast();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const allowedDomains = authConfig?.institutionalEmailDomains || [];
  const emailHint =
    allowedDomains.length > 0 ? `name@${allowedDomains[0]}` : 'name@vitbhopal.ac.in';

  const {
    register,
    handleSubmit,
    formState: {errors, isSubmitting},
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerDemoSchema),
    defaultValues: {
      yearOfStudy: 'Sophomore (Year 2)',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      const result = await registerAccount(values);
      if (result.requiresEmailVerification) {
        toast.success('Account created. Check your institutional inbox to verify your email.');
        navigate(`/verify-email?email=${encodeURIComponent(values.email)}`);
      } else {
        toast.success(isDemoMode ? 'Sandbox student account created' : 'Account created and signed in');
        navigate('/app/student/dashboard');
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-md">
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sign In
        </Link>

        <Card className="p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-slate-900">Student Registration</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {isDemoMode
              ? 'Register an institutional profile in the development sandbox.'
              : allowedDomains.length > 0
                ? `Register with your official ${allowedDomains.map((d) => `@${d}`).join(', ')} email address.`
                : 'Create your institutional CampusVerse account.'}
          </p>

          {serverError && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {serverError}
            </p>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <Input
              label="Full Name"
              placeholder="e.g. Maya Deshmukh"
              error={errors.name?.message}
              {...register('name')}
            />
            <Input
              label="Institutional Email"
              type="email"
              placeholder={emailHint}
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Department"
              placeholder="Computer Science & Engineering"
              error={errors.department?.message}
              {...register('department')}
            />
            <Select
              label="Year of Study"
              error={errors.yearOfStudy?.message}
              options={[
                {label: 'Freshman (Year 1)', value: 'Freshman (Year 1)'},
                {label: 'Sophomore (Year 2)', value: 'Sophomore (Year 2)'},
                {label: 'Junior (Year 3)', value: 'Junior (Year 3)'},
                {label: 'Senior (Year 4)', value: 'Senior (Year 4)'},
                {label: 'Graduate', value: 'Graduate'},
              ]}
              {...register('yearOfStudy')}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Minimum 8 characters"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" loading={isSubmitting} className="w-full">
              {isDemoMode ? 'Create Sandbox Account' : 'Create Institutional Account'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export const VerifyEmailPage: React.FC = () => {
  const {user, isAuthenticated, isDemoMode, resendVerificationEmail} = useAuth();
  const [searchParams] = useSearchParams();
  const [emailInput, setEmailInput] = useState(searchParams.get('email') || user?.email || '');
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResent(false);
    if (!isDemoMode && !emailInput.includes('@')) {
      setErrorMsg('Enter your institutional email address to resend verification.');
      return;
    }
    setSending(true);
    try {
      await resendVerificationEmail(emailInput);
      setResent(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to resend verification email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-md">
        <Card className="p-6 sm:p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <Mail className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold text-slate-900">
            Verify your institutional email
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {isDemoMode ? (
              <>
                In development sandbox mode, verification is simulated for{' '}
                <span className="font-medium text-slate-900">
                  {user?.email || 'your institutional address'}
                </span>
                .
              </>
            ) : (
              <>
                Click the verification link sent to{' '}
                <span className="font-medium text-slate-900">
                  {emailInput || user?.email || 'your institutional inbox'}
                </span>{' '}
                to activate your CampusVerse account, then sign in.
              </>
            )}
          </p>

          {errorMsg && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorMsg}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {isAuthenticated ? (
              <Link
                to="/app/student/dashboard"
                className="inline-flex items-center justify-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
              >
                Continue to Student Dashboard
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
              >
                Return to Sign In
              </Link>
            )}

            <form onSubmit={handleResend} className="space-y-2.5 pt-2 text-left">
              {!isDemoMode && (
                <Input
                  label="Institutional Email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@vitbhopal.ac.in"
                />
              )}
              <Button type="submit" variant="outline" loading={sending} className="w-full">
                {isDemoMode
                  ? resent
                    ? 'Verification Simulated'
                    : 'Simulate Verification Email'
                  : 'Resend Verification Email'}
              </Button>
            </form>
          </div>
          {resent && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isDemoMode
                ? 'Simulated verification notice dispatched in development mode.'
                : 'Verification email dispatched. Check your institutional inbox.'}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};

export const ForgotPasswordPage: React.FC = () => {
  const {requestPasswordReset, isDemoMode} = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.includes('@')) {
      setErrorMsg('Enter a valid institutional email address');
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-md">
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sign In
        </Link>
        <Card className="p-6 sm:p-8">
          <h1 className="font-display text-xl font-bold text-slate-900">Forgot Password</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Enter your institutional email to receive a password reset link.
          </p>
          {errorMsg && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorMsg}
            </p>
          )}
          {sent ? (
            <div className="mt-5 space-y-4">
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 leading-relaxed">
                {isDemoMode
                  ? `Recovery preview ready for ${email}.`
                  : `Password recovery link sent to ${email}. Open the link from your institutional inbox to set a new password.`}
              </p>
              {isDemoMode ? (
                <Link
                  to="/reset-password"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
                >
                  Open Reset Password Screen
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
                >
                  Return to Sign In
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <Input
                label="Institutional Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@vitbhopal.ac.in"
              />
              <Button type="submit" loading={loading} className="w-full">
                Request Password Reset
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export const ResetPasswordPage: React.FC = () => {
  const {completePasswordReset, isDemoMode} = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await completePasswordReset(password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update password. Open the recovery link from your email again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-md">
        <Card className="p-6 sm:p-8">
          <h1 className="font-display text-xl font-bold text-slate-900">Set New Password</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {isDemoMode
              ? 'Development preview for password reset completion.'
              : 'Enter a new strong password for your institutional account.'}
          </p>
          {done ? (
            <div className="mt-5 space-y-4">
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                {isDemoMode
                  ? 'Password validation succeeded in sandbox preview.'
                  : 'Your password has been updated successfully.'}
              </p>
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
              >
                Return to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  {error}
                </p>
              )}
              <Input
                label="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
              />
              <Button type="submit" loading={loading} className="w-full">
                Update Password
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};
