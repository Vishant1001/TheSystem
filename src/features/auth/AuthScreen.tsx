import { useState, type FormEvent } from 'react';
import { SystemButton } from '../../components/SystemButton';
import { SystemField, SystemInput } from '../../components/SystemField';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { signIn, signUp } from '../../lib/auth';
import { credentialsSchema } from '../../lib/schemas';
import { systemMessage } from '../../lib/systemError';

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: flattened.email?.[0], password: flattened.password?.[0] });
      return;
    }
    setFieldErrors({});
    setPending(true);

    try {
      if (mode === 'signin') {
        await signIn(parsed.data);
      } else {
        const { needsConfirmation } = await signUp(parsed.data);
        if (needsConfirmation) {
          setNotice(systemCopy.auth.checkInbox);
          setMode('signin');
        }
      }
      // On success the session listener redirects; nothing to do here.
    } catch (error) {
      setFormError(systemMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <SystemWindow title={systemCopy.windows.access}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        noValidate
      >
        <p className="text-sm text-steel">{systemCopy.auth.prompt}</p>

        <SystemField label={systemCopy.auth.email} htmlFor="email" error={fieldErrors.email}>
          <SystemInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            disabled={pending}
          />
        </SystemField>

        <SystemField
          label={systemCopy.auth.password}
          htmlFor="password"
          error={fieldErrors.password}
        >
          <SystemInput
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            disabled={pending}
          />
        </SystemField>

        {notice !== null && <p className="text-sm text-system-glow">{notice}</p>}
        {formError !== null && (
          <p
            role="alert"
            className="border border-penalty/50 bg-penalty-bg/80 px-3 py-2 text-sm text-penalty-text"
          >
            {formError}
          </p>
        )}

        <SystemButton type="submit" disabled={pending} className="w-full">
          {pending
            ? systemCopy.auth.working
            : mode === 'signin'
              ? systemCopy.auth.signIn
              : systemCopy.auth.signUp}
        </SystemButton>

        <button
          type="button"
          className="text-xs tracking-wide text-steel underline-offset-4 hover:text-hunter hover:underline"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setFormError(null);
            setNotice(null);
            setFieldErrors({});
          }}
          disabled={pending}
        >
          {mode === 'signin' ? systemCopy.auth.toSignUp : systemCopy.auth.toSignIn}
        </button>
      </form>
    </SystemWindow>
  );
}
