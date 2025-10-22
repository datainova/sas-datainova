import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../../../core/auth/use-auth';
import {
  exchangeAccessToken,
  fetchActiveSession,
  loginWithEmailPassword,
  type LoginResponse,
  type SessionResponse
} from '../../../core/auth/auth-api';
import { buildAuthUserFromSession, mapOrganizations } from '../../../core/auth/auth-mappers';
import type { OrganizationMembership, UserRole } from '../../../core/auth/auth.types';
import { Input } from '../../../design-system/components/Input';
import { Button } from '../../../design-system/components/Button';
import { BrandMark } from '../../../logo/BrandMark';
import { setTenantContextHeaders } from '../../../core/api/http-client';

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Informe o email corporativo.' })
    .email('Informe um email válido.'),
  password: z.string({ required_error: 'Informe sua senha.' }).min(1, 'Informe sua senha.')
});

type LoginFormValues = z.infer<typeof loginSchema>;

type SessionContext = {
  session: SessionResponse;
  organizations: OrganizationMembership[];
  accessToken: string;
};

type Step = 'form' | 'select-org' | 'requires-setup';

const roleLabels: Record<UserRole, string> = {
  OWNER: 'Proprietário(a)',
  MANAGER: 'Gestor(a)',
  CONTRIBUTOR: 'Colaborador(a)',
  VIEWER: 'Visualizador(a)',
  DATA_ADMIN: 'Administrador(a) de dados'
};

const planLabels: Record<string, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise'
};

const mapErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      return 'Credenciais inválidas. Verifique seu email e senha.';
    }
    if (error.response?.status === 429) {
      return 'Detectamos muitas tentativas. Aguarde alguns instantes e tente novamente.';
    }
    if (error.response?.status === 403) {
      return 'Não foi possível entrar agora. Tente novamente em instantes.';
    }
    if (error.response?.status === 503) {
      return 'Serviço temporariamente indisponível. Tente novamente em instantes.';
    }
  }
  return 'Não foi possível entrar agora. Tente novamente.';
};

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333';
  const frontendOrigin = useMemo(() => {
    try {
      return import.meta.env.VITE_FRONTEND_URL
        ? new URL(import.meta.env.VITE_FRONTEND_URL).origin
        : window.location.origin;
    } catch (error) {
      console.warn('FRONTEND_URL inválida, usando origin atual.', error);
      return window.location.origin;
    }
  }, []);

  const [step, setStep] = useState<Step>('form');
  const [sessionContext, setSessionContext] = useState<SessionContext | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [oidcPending, setOidcPending] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const popupMonitorRef = useRef<number | null>(null);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);

  const cleanupOidcFlow = useCallback(() => {
    if (messageHandlerRef.current) {
      window.removeEventListener('message', messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    if (popupMonitorRef.current) {
      window.clearInterval(popupMonitorRef.current);
      popupMonitorRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
  }, []);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  });

  const redirectTo = (location.state as { from?: Location })?.from?.pathname ?? '/dashboard';

  useEffect(() => () => {
    cleanupOidcFlow();
  }, [cleanupOidcFlow]);

  const finalizeSessionLogin = useCallback(
    (session: SessionResponse, accessToken: string, preferredOrgId?: string | null) => {
      const authUser = buildAuthUserFromSession({
        session,
        accessToken,
        preferredOrgId
      });

      if (!authUser) {
        setErrorMessage('Não foi possível determinar sua organização ativa. Contate o administrador.');
        return;
      }

      setErrorMessage(null);
      login(authUser);
      setSessionContext(null);
      setSelectedOrgId('');
      setStep('form');
      navigate(redirectTo, { replace: true });
    },
    [login, navigate, redirectTo]
  );

  const loginMutation = useMutation({
    mutationFn: async (values: LoginFormValues) => loginWithEmailPassword(values),
    onSuccess: async (response) => {
      if (response.requiresOrgSetup) {
        setSessionContext(null);
        setErrorMessage(null);
        setStep('requires-setup');
        return;
      }

      if (!response.accessToken) {
        setErrorMessage('Não foi possível completar a autenticação. Tente novamente.');
        return;
      }

      try {
        setTenantContextHeaders({ token: response.accessToken });
        const session = await fetchActiveSession();
        const organizations = mapOrganizations(session.orgs);

        if (!organizations.length) {
          setTenantContextHeaders(null);
          setErrorMessage('Esta conta não possui organizações disponíveis. Contate o administrador.');
          return;
        }

        const activeOrgId = session.activeOrgId ?? organizations[0]?.id ?? null;

        if (organizations.length > 1) {
          setErrorMessage(null);
          setSessionContext({
            session,
            organizations,
            accessToken: response.accessToken
          });
          setSelectedOrgId(activeOrgId ?? '');
          setStep('select-org');
          return;
        }

        setErrorMessage(null);
        setSessionContext(null);
        finalizeSessionLogin(session, response.accessToken, activeOrgId);
      } catch (error) {
        setTenantContextHeaders(null);
        setErrorMessage(mapErrorMessage(error));
      }
    },
    onError: (error) => {
      setErrorMessage(mapErrorMessage(error));
    }
  });

  const exchangeMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const { accessToken } = await exchangeAccessToken({ orgId });
      return accessToken;
    },
    onError: (error) => {
      setErrorMessage(mapErrorMessage(error));
    }
  });

  const handleSubmit = form.handleSubmit((values) => {
    setErrorMessage(null);
    loginMutation.mutate(values);
  });

  const handleConfirmOrganization = async () => {
    if (!sessionContext) return;

    const { session, organizations, accessToken } = sessionContext;
    setErrorMessage(null);
    const selected = organizations.find((org) => org.id === selectedOrgId) ?? organizations[0];

    if (!selected) {
      setErrorMessage('Selecione uma organização para continuar.');
      return;
    }

    try {
      let tokenToUse = accessToken;
      let sessionToUse = session;

      if (!session.activeOrgId || session.activeOrgId !== selected.id) {
        tokenToUse = await exchangeMutation.mutateAsync(selected.id);
        setTenantContextHeaders({ token: tokenToUse });
        sessionToUse = await fetchActiveSession();
      }

      finalizeSessionLogin(sessionToUse, tokenToUse, selected.id);
    } catch (error) {
      setTenantContextHeaders(null);
      setErrorMessage(mapErrorMessage(error));
    }
  };

  const isLoading = loginMutation.isPending || exchangeMutation.isPending || oidcPending;
  const isFormDisabled = loginMutation.isPending || oidcPending;
  const isOrgSelectionDisabled = exchangeMutation.isPending || oidcPending;

  const handleGoogleLogin = useCallback(() => {
    if (oidcPending) return;

    setErrorMessage(null);
    setOidcPending(true);

    const width = 520;
    const height = 640;
    const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
    const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
    const screenWidth = window.innerWidth ?? document.documentElement.clientWidth;
    const screenHeight = window.innerHeight ?? document.documentElement.clientHeight;
    const systemZoom = screenWidth / window.screen.availWidth;
    const left = (screenWidth - width) / 2 / systemZoom + dualScreenLeft;
    const top = (screenHeight - height) / 2 / systemZoom + dualScreenTop;

    const popup = window.open(
      `${apiBaseUrl}/auth/oidc/google/init`,
      'datainova-google-login',
      `scrollbars=yes,width=${width},height=${height},top=${top},left=${left}`
    );

    if (!popup) {
      setOidcPending(false);
      setErrorMessage('Não foi possível abrir a janela do Google. Verifique o bloqueio de pop-ups.');
      return;
    }

    popupRef.current = popup;

    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== frontendOrigin) return;
      const data = event.data as { type?: string; data?: { status?: string; accessToken?: string; orgId?: string } };
      if (!data || data.type !== 'oidc-result') return;

      cleanupOidcFlow();
      setOidcPending(false);

      const payload = data.data ?? {};

      if (payload.status === 'success' && typeof payload.accessToken === 'string') {
        try {
          setTenantContextHeaders({ token: payload.accessToken });
          const session = await fetchActiveSession();
          finalizeSessionLogin(
            session,
            payload.accessToken,
            typeof payload.orgId === 'string' ? payload.orgId : undefined
          );
        } catch (error) {
          setTenantContextHeaders(null);
          setErrorMessage(mapErrorMessage(error));
        }
        return;
      }

      if (payload.status === 'requires_org_setup') {
        setSessionContext(null);
        setStep('requires-setup');
        return;
      }

      setErrorMessage('Não foi possível autenticar com o Google. Tente novamente.');
    };

    messageHandlerRef.current = handleMessage;
    window.addEventListener('message', handleMessage);

    popupMonitorRef.current = window.setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        cleanupOidcFlow();
        setOidcPending(false);
        setErrorMessage('Login com Google cancelado.');
      }
    }, 500);
  }, [apiBaseUrl, cleanupOidcFlow, finalizeSessionLogin, frontendOrigin, oidcPending]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6 py-12 dark:bg-[rgba(18,18,18,0.92)]">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-white p-8 shadow-soft dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.85)]">
        <div className="flex items-center gap-3">
          <BrandMark className="h-8" />
          <div>
            <h1 className="text-2xl font-semibold text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">
              Acessar sua conta
            </h1>
            <p className="text-sm text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.7)]">
              Use o email corporativo para continuar.
            </p>
          </div>
        </div>

        {step === 'form' ? (
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="seu.nome@empresa.com"
              autoComplete="email"
              error={form.formState.errors.email?.message}
              disabled={isFormDisabled}
              {...form.register('email')}
            />
            <Input
              id="password"
              label="Senha"
              type="password"
              placeholder="Digite sua senha"
              autoComplete="current-password"
              error={form.formState.errors.password?.message}
              disabled={isFormDisabled}
              {...form.register('password')}
            />

            {errorMessage ? (
              <p className="text-sm font-medium text-danger-500" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={loginMutation.isPending}
              disabled={oidcPending}
            >
              Entrar
            </Button>
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <span className="w-full border-t border-border dark:border-[rgba(230,224,220,0.24)]" />
              </div>
              <span className="relative mx-auto block w-fit bg-white px-3 text-xs uppercase tracking-[0.16em] text-[rgba(45,41,38,0.55)] dark:bg-[rgba(18,18,18,0.85)] dark:text-[rgba(230,224,220,0.6)]">
                ou
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={handleGoogleLogin}
              isLoading={oidcPending}
              disabled={loginMutation.isPending}
            >
              Entrar com Google
            </Button>
          </form>
        ) : null}

        {step === 'select-org' && sessionContext ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">
                Selecione uma organização
              </h2>
              <p className="mt-1 text-sm text-[rgba(45,41,38,0.65)] dark:text-[rgba(230,224,220,0.7)]">
                Você participa de mais de uma organização. Escolha qual deseja acessar agora.
              </p>
            </div>
            <div className="space-y-3">
              {sessionContext.organizations.map((org) => (
                <label
                  key={org.id}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left transition hover:border-brand focus-within:border-brand dark:border-[rgba(230,224,220,0.24)]"
                >
                  <input
                    type="radio"
                    name="organization"
                    value={org.id}
                    checked={selectedOrgId === org.id}
                    onChange={(event) => setSelectedOrgId(event.target.value)}
                    className="h-4 w-4 border border-border accent-brand"
                  />
                  <div>
                    <p className="text-sm font-medium text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.92)]">
                      {org.name}
                    </p>
                    <p className="text-xs text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.65)]">
                      {roleLabels[org.role]} · Plano {planLabels[org.plan ?? 'FREE'] ?? 'Free'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            {errorMessage ? (
              <p className="text-sm font-medium text-danger-500" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={handleConfirmOrganization}
              isLoading={exchangeMutation.isPending}
              disabled={isOrgSelectionDisabled}
            >
              Continuar
            </Button>
          </div>
        ) : null}

        {step === 'requires-setup' ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">
              Complete o cadastro
            </h2>
            <p className="text-sm text-[rgba(45,41,38,0.65)] dark:text-[rgba(230,224,220,0.7)]">
              Encontramos seu usuário, mas ele ainda não está vinculado a uma organização.
              Conclua o onboarding pelo link enviado por email ou peça acesso ao administrador.
            </p>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => {
                setErrorMessage(null);
                setStep('form');
              }}
            >
              Voltar para o login
            </Button>
          </div>
        ) : null}

        <div className="space-y-3 text-center text-sm text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.7)]">
          <p>
            Precisa criar uma conta?{' '}
            <Link to="/signup" className="font-semibold text-brand hover:underline dark:text-brand-foreground">
              Criar conta
            </Link>
          </p>
          <p>
            Esqueceu sua senha?{' '}
            <Link
              to="/password/forgot"
              className="font-semibold text-brand hover:underline dark:text-brand-foreground"
            >
              Recuperar acesso
            </Link>
          </p>
        </div>
        {isLoading ? (
          <span className="sr-only" aria-live="polite">
            Autenticando
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default LoginPage;
