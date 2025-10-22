import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../../../core/auth/use-auth';
import {
  completeSignup,
  confirmSignupToken,
  fetchActiveSession
} from '../../../core/auth/auth-api';
import { buildAuthUserFromSession } from '../../../core/auth/auth-mappers';
import { Input } from '../../../design-system/components/Input';
import { Button } from '../../../design-system/components/Button';
import { BrandMark } from '../../../logo/BrandMark';
import { setTenantContextHeaders } from '../../../core/api/http-client';

const passwordSchema = z
  .string({ required_error: 'Defina uma senha.' })
  .min(12, 'Use pelo menos 12 caracteres.');

const schema = z
  .object({
    password: passwordSchema,
    confirmPassword: passwordSchema
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'As senhas devem coincidir.',
    path: ['confirmPassword']
  });

type FormValues = z.infer<typeof schema>;

const ONBOARDING_USER_STORAGE_KEY = 'datainova:onboarding-user';

const persistOnboardingUser = (user: { id: string; email: string }) => {
  try {
    window.sessionStorage.setItem(ONBOARDING_USER_STORAGE_KEY, JSON.stringify(user));
  } catch (error) {
    console.warn('Não foi possível armazenar dados para o onboarding', error);
  }
};

const clearOnboardingUser = () => {
  try {
    window.sessionStorage.removeItem(ONBOARDING_USER_STORAGE_KEY);
  } catch (error) {
    console.warn('Não foi possível limpar dados do onboarding', error);
  }
};

const mapTokenError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 410 || error.response?.status === 400) {
      return 'Este link é inválido ou expirou. Solicite um novo convite.';
    }
  }
  return 'Não foi possível validar o link. Tente novamente em instantes.';
};

const mapCompletionError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 400 || error.response?.status === 410) {
      return 'O link expirou. Solicite um novo convite para concluir o cadastro.';
    }
  }
  return 'Não foi possível concluir o cadastro agora. Tente novamente.';
};

const SignupCompletePage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'requiresSetup' | 'error'>(
    'loading'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const token = searchParams.get('token');

  useEffect(() => {
    let cancelled = false;

    const validateToken = async () => {
      if (!token) {
        setErrorMessage('Link inválido. Solicite um novo convite.');
        setStatus('error');
        return;
      }

      try {
        const result = await confirmSignupToken(token);
        if (cancelled) return;
        setEmail(result.email);
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(mapTokenError(error));
        setStatus('error');
      }
    };

    void validateToken();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: '',
      confirmPassword: ''
    }
  });

  const completionMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!token) {
        throw new Error('token ausente');
      }
      return completeSignup({ token, password: values.password });
    },
    onSuccess: async (response) => {
      if (response.requiresOrgSetup) {
        if (response.user) {
          persistOnboardingUser(response.user);
          setUserId(response.user.id);
          setEmail(response.user.email);
        }
        setErrorMessage(null);
        setStatus('requiresSetup');
        return;
      }

      clearOnboardingUser();
      setUserId(null);

      if (!response.accessToken) {
        setErrorMessage('Não foi possível autenticar após o cadastro. Faça login novamente.');
        setStatus('ready');
        return;
      }

      try {
        setTenantContextHeaders({ token: response.accessToken });
        const session = await fetchActiveSession();
        const authUser = buildAuthUserFromSession({ session, accessToken: response.accessToken });
        if (!authUser) {
          setTenantContextHeaders(null);
          setErrorMessage('Cadastro concluído, mas não foi possível carregar sua conta. Faça login novamente.');
          setStatus('ready');
          return;
        }
        login(authUser);
        navigate('/dashboard', { replace: true });
      } catch (error) {
        setTenantContextHeaders(null);
        setErrorMessage(mapCompletionError(error));
        setStatus('ready');
      }
    },
    onError: (error) => {
      setErrorMessage(mapCompletionError(error));
      setStatus('ready');
    }
  });

  const handleSubmit = form.handleSubmit((values) => {
    setErrorMessage(null);
    setStatus('submitting');
    completionMutation.mutate(values);
  });

  const isSubmitting = completionMutation.isPending || status === 'submitting';

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6 py-12 dark:bg-[rgba(18,18,18,0.92)]">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-white p-8 shadow-soft dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.85)]">
        <div className="flex items-center gap-3">
          <BrandMark className="h-8" />
          <div>
            <h1 className="text-2xl font-semibold text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">
              Finalizar cadastro
            </h1>
            <p className="text-sm text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.7)]">
              Defina uma senha para ativar sua conta.
            </p>
          </div>
        </div>

        {status === 'loading' ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-[rgba(45,41,38,0.65)] dark:text-[rgba(230,224,220,0.7)]">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <span>Validando convite…</span>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="space-y-4 text-sm text-[rgba(45,41,38,0.7)] dark:text-[rgba(230,224,220,0.75)]">
            <p>{errorMessage}</p>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="primary" fullWidth onClick={() => navigate('/signup')}>
                Solicitar novo convite
              </Button>
              <Button type="button" variant="secondary" fullWidth onClick={() => navigate('/login')}>
                Voltar para login
              </Button>
            </div>
          </div>
        ) : null}

        {status === 'ready' && email ? (
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1 text-sm text-[rgba(45,41,38,0.65)] dark:text-[rgba(230,224,220,0.75)]">
              <p className="font-medium text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.92)]">
                {email}
              </p>
              <p>Este será seu email de acesso.</p>
            </div>
            <Input
              id="password"
              label="Senha"
              type="password"
              placeholder="Crie uma senha"
              autoComplete="new-password"
              error={form.formState.errors.password?.message}
              disabled={isSubmitting}
              {...form.register('password')}
            />
            <Input
              id="confirmPassword"
              label="Confirmar senha"
              type="password"
              placeholder="Repita a senha"
              autoComplete="new-password"
              error={form.formState.errors.confirmPassword?.message}
              disabled={isSubmitting}
              {...form.register('confirmPassword')}
            />
            {errorMessage ? (
              <p className="text-sm font-medium text-danger-500" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <Button type="submit" variant="primary" fullWidth isLoading={isSubmitting}>
              Concluir cadastro
            </Button>
          </form>
        ) : null}

        {status === 'requiresSetup' ? (
          <div className="space-y-4 text-sm text-[rgba(45,41,38,0.7)] dark:text-[rgba(230,224,220,0.75)]">
            <p>
              Cadastro confirmado! Agora precisamos criar a organização. Clique abaixo para iniciar o onboarding e
              configurar o workspace.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={() => navigate('/onboarding', { state: { email, userId } })}
              >
                Iniciar onboarding
              </Button>
              <Button type="button" variant="secondary" fullWidth onClick={() => navigate('/login')}>
                Voltar para login
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SignupCompletePage;
