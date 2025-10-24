import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Check,
  LinkIcon,
  Loader2,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  Wand2
} from "lucide-react";

import {
  finalizeGoogleLogin,
  initGoogleOidc,
  login,
  logout,
  requestPasswordReset,
  signupInitiate
} from "../api/auth";
import type { LoginRequest } from "../api/auth";
import type { PasswordForgotResponse, SignupInitiateResponse } from "../types/auth";
import { ApiError } from "../lib/http";
import { useAuthSession } from "../hooks/useAuthSession";

type ActivePanel = "signup" | "recovery" | null;

interface Notification {
  type: "success" | "error" | "info";
  title: string;
  description?: string;
}

const googleStorageKey = "datainova-connect.google-oidc";

const loginSchema = z.object({
  email: z
    .string({ required_error: "Informe o e-mail corporativo" })
    .email("E-mail inválido"),
  password: z.string().min(1, "Informe sua senha"),
  organizationNickname: z
    .string({ required_error: "Informe o apelido da organização" })
    .trim()
    .min(1, "Informe o apelido da organização")
});

const signupRequestSchema = z.object({
  email: z
    .string({ required_error: "Informe o e-mail corporativo" })
    .email("E-mail inválido")
});

const recoverySchema = z.object({
  email: z.string().email("Informe um e-mail válido")
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupRequestSchema>;
type RecoveryFormValues = z.infer<typeof recoverySchema>;

const problemCodeMessages: Record<string, string> = {
  E_AUTH_ORGANIZATION_NOT_FOUND:
    "Não encontramos nenhuma organização com esse apelido. Confira com o administrador.",
  E_AUTH_ORGANIZATION_MISMATCH:
    "O apelido informado não corresponde à organização cadastrada. Confirme e tente novamente.",
  E_AUTH_ORGANIZATION_REQUIRED:
    "Informe o apelido da organização antes de prosseguir.",
  E_AUTH_EMAIL_IN_USE:
    "Este e-mail já possui acesso ativo. Faça login com suas credenciais."
};

function extractErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const code = error.problem?.code;
    if (code && problemCodeMessages[code]) {
      return problemCodeMessages[code];
    }
    return (
      error.problem?.detail ?? error.problem?.title ?? error.message ?? "Erro inesperado."
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Erro inesperado.";
}

function clearOauthParams() {
  const { pathname, hash } = window.location;
  window.history.replaceState({}, document.title, pathname + hash);
}

function normalizeOrganizationNickname(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  return value.toLowerCase();
}

export function LoginPage() {
  const { session, isAuthenticated, setSession, clearSession } = useAuthSession();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [signupResult, setSignupResult] =
    useState<SignupInitiateResponse | null>(null);
  const [signupEmail, setSignupEmail] = useState<string>("");
  const [recoveryResult, setRecoveryResult] =
    useState<PasswordForgotResponse | null>(null);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      organizationNickname: ""
    }
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupRequestSchema),
    defaultValues: {
      email: ""
    }
  });

  const recoveryForm = useForm<RecoveryFormValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: {
      email: ""
    }
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setSession(data);
      setNotification({
        type: "success",
        title: "Autenticado com sucesso",
        description: `Bem-vindo de volta, ${
          data.user.name ?? data.user.email
        } · ${
          data.organization.nickname ?? data.organization.name
        }.`
      });
      loginForm.reset({
        email: data.user.email,
        password: "",
        organizationNickname: data.organization.nickname ?? ""
      });
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Não foi possível entrar",
        description: extractErrorMessage(error)
      });
    }
  });

  const signupMutation = useMutation({
    mutationFn: signupInitiate,
    onSuccess: (data, variables) => {
      setSignupEmail(variables.email);
      setSignupResult(data);
      signupForm.reset({ email: "" });
      setNotification({
        type: "info",
        title: "Link mágico enviado",
        description: `Enviamos um link de confirmação para ${variables.email}. Verifique sua caixa de entrada e finalize o cadastro por lá.`
      });
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Não foi possível enviar o link",
        description: extractErrorMessage(error)
      });
    }
  });

  const recoveryMutation = useMutation({
    mutationFn: async (values: RecoveryFormValues) =>
      requestPasswordReset(values.email),
    onSuccess: (data) => {
      setRecoveryResult(data);
      setNotification({
        type: "info",
        title: "Link mágico de recuperação enviado",
        description:
          "Verifique sua caixa de e-mail. Em ambientes de teste, utilize o token exibido abaixo."
      });
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Não foi possível enviar o link de recuperação",
        description: extractErrorMessage(error)
      });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (!session) {
        return { ok: true };
      }
      return logout(session.accessToken, session.refreshToken);
    },
    onSuccess: () => {
      clearSession();
      setNotification({
        type: "info",
        title: "Sessão encerrada",
        description: "Você saiu com segurança."
      });
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Falha ao encerrar sessão",
        description: extractErrorMessage(error)
      });
    }
  });

  const googleInitMutation = useMutation({
    mutationFn: async (variables: {
      email: string;
      organizationNickname: string;
    }) => {
      const response = await initGoogleOidc();
      return { response, variables };
    },
    onSuccess: ({ response, variables }) => {
      sessionStorage.setItem(
        googleStorageKey,
        JSON.stringify({
          state: response.state,
          codeVerifier: response.codeVerifier,
          email: variables.email,
          organizationNickname: variables.organizationNickname
        })
      );
      window.location.href = response.authorizationUrl;
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Não foi possível iniciar o login com o Google",
        description: extractErrorMessage(error)
      });
    }
  });

  const googleFinalizeMutation = useMutation({
    mutationFn: finalizeGoogleLogin,
    onSuccess: (data) => {
      setSession(data);
      setNotification({
        type: "success",
        title: "Login com Google concluído",
        description: `Olá, ${data.user.name ?? data.user.email}!`
      });
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Falha ao concluir login com Google",
        description: extractErrorMessage(error)
      });
    },
    onSettled: () => {
      sessionStorage.removeItem(googleStorageKey);
      clearOauthParams();
    }
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      setNotification({
        type: "error",
        title: "Login cancelado",
        description: `Google retornou: ${oauthError}`
      });
      clearOauthParams();
      return;
    }

    if (!state || !code) {
      return;
    }

    const storedRaw = sessionStorage.getItem(googleStorageKey);
    if (!storedRaw) {
      setNotification({
        type: "error",
        title: "Fluxo inválido",
        description:
          "Não encontramos o contexto da organização para concluir o login com Google."
      });
      clearOauthParams();
      return;
    }

    try {
      const stored = JSON.parse(storedRaw) as {
        state: string;
        email: string;
        organizationNickname: string | null;
      };

      if (stored.state !== state) {
        throw new Error("Estado do login não confere.");
      }

      const normalizedNickname = normalizeOrganizationNickname(
        stored.organizationNickname ?? ""
      );

      googleFinalizeMutation.mutate({
        state,
        code,
        email: stored.email,
        ...(normalizedNickname ? { organizationNickname: normalizedNickname } : {})
      });
    } catch (error) {
      setNotification({
        type: "error",
        title: "Não foi possível validar o retorno do Google",
        description: extractErrorMessage(error)
      });
      clearOauthParams();
    }
  }, [googleFinalizeMutation]);

  useEffect(() => {
    if (!session) {
      return;
    }
    loginForm.reset({
      email: session.user.email,
      password: "",
      organizationNickname: session.organization.nickname ?? ""
    });
  }, [session, loginForm]);

  const highlights = useMemo(
    () => [
      {
        title: "Observabilidade nativa",
        description: "Logs estruturados e rastros completos com OpenTelemetry."
      },
      {
        title: "Insights acionáveis",
        description:
          "Indicadores versionados com granularidade flexível e segmentação canônica."
      },
      {
        title: "Segurança multi-tenant",
        description: "RLS em todas as tabelas com políticas auditáveis."
      }
    ],
    []
  );

  const handleLoginSubmit = loginForm.handleSubmit((values) => {
    setNotification(null);
    const organizationNickname = normalizeOrganizationNickname(values.organizationNickname);
    const payload: LoginRequest = {
      email: values.email.trim(),
      password: values.password
    };

    if (organizationNickname) {
      payload.organizationNickname = organizationNickname;
    }

    loginMutation.mutate(payload);
  });

  const handleSignupSubmit = signupForm.handleSubmit((values) => {
    setNotification(null);
    setSignupResult(null);
    signupMutation.mutate({ email: values.email.trim() });
  });

  const handleRecoverySubmit = recoveryForm.handleSubmit((values) => {
    setNotification(null);
    setRecoveryResult(null);
    recoveryMutation.mutate(values);
  });

  const handleGoogleLogin = () => {
    setNotification(null);
    const { email, organizationNickname } = loginForm.getValues();

    if (!email) {
      loginForm.setError("email", {
        type: "manual",
        message: "Informe o e-mail corporativo antes de prosseguir."
      });
      return;
    }

    const normalizedNickname = normalizeOrganizationNickname(organizationNickname ?? "");

    if (!normalizedNickname) {
      loginForm.setError("organizationNickname", {
        type: "manual",
        message: "Informe o apelido da organização antes de prosseguir."
      });
      return;
    }

    googleInitMutation.mutate({
      email,
      organizationNickname: normalizedNickname
    });
  };

  const isAnyMutationPending =
    loginMutation.isPending ||
    signupMutation.isPending ||
    recoveryMutation.isPending ||
    googleInitMutation.isPending ||
    googleFinalizeMutation.isPending ||
    logoutMutation.isPending;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(45,41,38,0.12),_transparent_55%)]" />
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row">
        <aside className="relative flex flex-1 flex-col justify-between bg-[#f8f7f6] px-8 py-12 sm:px-14 lg:rounded-r-[48px]">
          <div className="mb-8 flex items-center gap-3 text-brand">
            <Sparkles className="h-5 w-5" />
            <span className="font-sans text-sm uppercase tracking-[0.35em]">
              DataInova Connect
            </span>
          </div>
          <div className="max-w-xl space-y-8">
            <div className="space-y-4">
              <h1 className="font-display text-4xl sm:text-5xl text-brand">
                Tenha clareza cirúrgica sobre a execução dos seus OKRs.
              </h1>
              <p className="text-lg text-foreground/80">
                Consolide objetivos, indicadores e valores com governança e
                autonomia — sem abrir mão da segurança multi-tenant.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {highlights.map((highlight) => (
                <div
                  key={highlight.title}
                  className="rounded-xl border border-brand/10 bg-white/80 p-5 shadow-soft backdrop-blur"
                >
                  <div className="flex items-center gap-2 text-brand">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-semibold uppercase tracking-wide">
                      {highlight.title}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground/70">
                    {highlight.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-6 text-sm text-foreground/50">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>PostgreSQL RLS &amp; partições</span>
            </div>
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              <span>Magic link para onboarding seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>Ready para ambientes corporativos</span>
            </div>
          </div>
        </aside>
        <main className="relative flex w-full max-w-xl flex-col justify-center px-6 py-12 sm:px-10">
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-3xl border border-brand/10 bg-white/90 p-8 shadow-soft backdrop-blur-lg">
              <div className="mb-8 space-y-2">
                <span className="font-sans text-xs uppercase tracking-[0.4em] text-brand">
                  Área restrita
                </span>
                <h2 className="font-display text-3xl text-brand">
                  Acesse sua organização
                </h2>
                <p className="text-sm text-foreground/70">
                  Utilize e-mail corporativo e informe o apelido da organização.
                  Se ainda não houver um apelido configurado, peça ao
                  administrador para gerar um antes de continuar. Você pode
                  alternar para o link mágico sempre que preferir.
                </p>
              </div>

              {notification ? (
                <div
                  className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
                    notification.type === "success"
                      ? "border-success/30 bg-success/10 text-success"
                      : notification.type === "error"
                      ? "border-danger/30 bg-danger/10 text-danger"
                      : "border-brand/20 bg-brand/10 text-brand"
                  }`}
                >
                  <div className="font-semibold">{notification.title}</div>
                  {notification.description ? (
                    <p className="mt-1 text-sm">{notification.description}</p>
                  ) : null}
                </div>
              ) : null}

              {isAuthenticated && session ? (
                <div className="mb-6 rounded-2xl border border-brand/15 bg-brand/5 p-4 text-sm text-foreground/80">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-success" />
                      <div>
                        <p className="font-semibold text-brand">
                          Sessão ativa
                        </p>
                        <p>
                          {session.user.name ?? session.user.email} · {" "}
                          {session.organization.nickname
                            ? `${session.organization.nickname} · ${session.organization.name}`
                            : session.organization.name}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => logoutMutation.mutate()}
                      className="rounded-full border border-brand/20 px-3 py-1 text-xs font-medium text-brand transition hover:border-brand hover:bg-brand hover:text-white"
                    >
                      {logoutMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <LogOut className="h-3 w-3" /> sair
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              ) : null}

              <form className="space-y-5" onSubmit={handleLoginSubmit}>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                    <Mail className="h-4 w-4 text-brand" />
                    E-mail corporativo
                  </label>
                  <input
                    type="email"
                    placeholder="nome.sobrenome@empresa.com"
                    className="w-full rounded-xl border border-brand/15 bg-white px-3.5 py-3 text-sm shadow-inner transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    {...loginForm.register("email")}
                    disabled={loginMutation.isPending || isAnyMutationPending}
                  />
                  {loginForm.formState.errors.email?.message ? (
                    <p className="text-xs text-danger">
                      {loginForm.formState.errors.email.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                    <Lock className="h-4 w-4 text-brand" />
                    Senha
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-brand/15 bg-white px-3.5 py-3 text-sm shadow-inner transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    {...loginForm.register("password")}
                    disabled={loginMutation.isPending || isAnyMutationPending}
                  />
                  {loginForm.formState.errors.password?.message ? (
                    <p className="text-xs text-danger">
                      {loginForm.formState.errors.password.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                    <Building2 className="h-4 w-4 text-brand" />
                    Apelido da organização
                  </label>
                  <input
                    type="text"
                    placeholder="ex.: data-inova"
                    className="w-full rounded-xl border border-brand/15 bg-white px-3.5 py-3 text-sm shadow-inner transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    {...loginForm.register("organizationNickname")}
                    disabled={loginMutation.isPending || isAnyMutationPending}
                  />
                  {loginForm.formState.errors.organizationNickname?.message ? (
                    <p className="text-xs text-danger">
                      {loginForm.formState.errors.organizationNickname.message}
                    </p>
                  ) : (
                    <p className="text-xs text-foreground/50">
                      Informe o apelido criado durante o cadastro para direcionar você ao ambiente correto.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 font-semibold text-white shadow-soft transition hover:translate-y-[-1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loginMutation.isPending || isAnyMutationPending}
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Entrar
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-brand/10" />
                <span className="text-xs uppercase tracking-[0.5em] text-foreground/40">
                  ou
                </span>
                <span className="h-px flex-1 bg-brand/10" />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-brand/15 bg-white px-4 py-3 text-sm font-medium text-foreground transition hover:border-brand hover:bg-brand/5 focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={googleInitMutation.isPending || isAnyMutationPending}
              >
                {googleInitMutation.isPending || googleFinalizeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                ) : (
                  <img
                    alt="Google"
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    className="h-4 w-4"
                  />
                )}
                Entrar com Google
              </button>

              <div className="mt-6 flex flex-col gap-2 text-sm text-foreground/70">
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel("signup");
                    setNotification(null);
                  }}
                  className="inline-flex items-center gap-2 text-left text-brand transition hover:underline"
                >
                  <LinkIcon className="h-4 w-4" />
                  Criar conta com link mágico
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel("recovery");
                    setNotification(null);
                  }}
                  className="inline-flex items-center gap-2 text-left text-foreground/70 transition hover:text-brand hover:underline"
                >
                  Esqueci minha senha · quero recuperar com link mágico
                </button>
              </div>
            </div>
          </div>

          {activePanel ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur">
              <div className="relative w-full max-w-lg rounded-3xl border border-brand/10 bg-white p-8 shadow-2xl">
                <button
                  type="button"
                  className="absolute right-6 top-6 inline-flex items-center gap-2 rounded-full border border-brand/15 px-3 py-1 text-xs font-medium text-foreground/70 transition hover:border-brand hover:text-brand"
                  onClick={() => setActivePanel(null)}
                >
                  <ArrowLeft className="h-3 w-3" />
                  voltar
                </button>

                {activePanel === "signup" ? (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <span className="font-sans text-xs uppercase tracking-[0.4em] text-brand">
                        Link mágico
                      </span>
                      <h3 className="font-display text-3xl text-brand">
                        Solicitar acesso
                      </h3>
                      <p className="text-sm text-foreground/70">
                        Informe seu e-mail corporativo e enviaremos um link mágico
                        para você concluir o cadastro quando for conveniente.
                      </p>
                    </div>

                    <form className="space-y-4" onSubmit={handleSignupSubmit}>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground/70">
                          E-mail corporativo
                        </label>
                        <input
                          type="email"
                          placeholder="nome.sobrenome@empresa.com"
                          className="w-full rounded-xl border border-brand/15 bg-white px-3 py-2 text-sm shadow-inner transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                          {...signupForm.register("email")}
                          disabled={signupMutation.isPending || isAnyMutationPending}
                        />
                        {signupForm.formState.errors.email?.message ? (
                          <p className="text-xs text-danger">
                            {signupForm.formState.errors.email.message}
                          </p>
                        ) : null}
                      </div>

                      <button
                        type="submit"
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-80"
                        disabled={signupMutation.isPending || isAnyMutationPending}
                      >
                        {signupMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Enviar link mágico
                      </button>
                    </form>

                    {signupResult ? (
                      <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-foreground/80">
                        <p className="font-semibold text-brand">
                          Link enviado
                        </p>
                        <p className="text-xs text-foreground/70">
                          Verifique <span className="font-medium text-brand">{signupEmail}</span> e procure pelo assunto "Confirme seu acesso ao DataInova Connect".
                        </p>
                        {signupResult.verification ? (
                          <p className="mt-2 text-xs text-foreground/60">
                            Ambiente de testes — token: <span className="break-all font-mono text-[11px] text-brand">{signupResult.verification.token}</span>.
                            Expira em {new Date(signupResult.verification.expiresAt).toLocaleString()}.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <span className="font-sans text-xs uppercase tracking-[0.4em] text-brand">
                        Recuperação
                      </span>
                      <h3 className="font-display text-3xl text-brand">
                        Receber link mágico de recuperação
                      </h3>
                      <p className="text-sm text-foreground/70">
                        Informe o e-mail da conta. Validaremos o vínculo com a
                        organização e enviaremos um link mágico seguro.
                      </p>
                    </div>

                    <form className="space-y-4" onSubmit={handleRecoverySubmit}>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground/70">
                          E-mail
                        </label>
                        <input
                          type="email"
                          className="w-full rounded-xl border border-brand/15 bg-white px-3 py-2 text-sm shadow-inner transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                          {...recoveryForm.register("email")}
                          disabled={recoveryMutation.isPending || isAnyMutationPending}
                        />
                        {recoveryForm.formState.errors.email?.message ? (
                          <p className="text-xs text-danger">
                            {recoveryForm.formState.errors.email.message}
                          </p>
                        ) : null}
                      </div>

                      <button
                        type="submit"
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-80"
                        disabled={recoveryMutation.isPending || isAnyMutationPending}
                      >
                        {recoveryMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        Enviar link mágico de recuperação
                      </button>
                    </form>

                    {recoveryResult ? (
                      <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-foreground/80">
                        <p className="font-semibold text-brand">
                          Token de recuperação (ambiente de testes)
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-brand">
                          {recoveryResult.resetToken ?? "Token enviado por e-mail (não retornado)."}
                        </p>
                        {recoveryResult.expiresAt ? (
                          <p className="mt-1 text-xs text-foreground/60">
                            Expira em {new Date(recoveryResult.expiresAt).toLocaleString()}.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {isAnyMutationPending ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-brand/20 bg-white px-4 py-2 text-xs font-medium text-brand shadow-soft">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sincronizando com a plataforma...
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LoginPage;
