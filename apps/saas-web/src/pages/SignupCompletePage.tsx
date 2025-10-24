import { useEffect, useMemo, useState, type BaseSyntheticEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQuery,
  type UseMutationResult
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
  Wand2
} from "lucide-react";

import {
  signupConfirm,
  signupComplete,
  signupInitiate
} from "../api/auth";
import type {
  SignupInitiateResponse,
  SignupCompletePayload
} from "../types/auth";
import { ApiError } from "../lib/http";
import { useAuthSession } from "../hooks/useAuthSession";

interface Notification {
  type: "success" | "error" | "info";
  title: string;
  description?: string;
}

const organizationNicknameRegex =
  /^[\p{L}\p{N}][\p{L}\p{N}\s_-]*[\p{L}\p{N}]$/u;

const DEFAULT_TZ = "America/Sao_Paulo";
const DEFAULT_LOCALE = "pt-BR";
const DEFAULT_CURRENCY = "BRL";

function deriveNameFromEmail(email: string) {
  const [local] = email.split("@");
  if (!local) {
    return email;
  }
  const tokens = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase());
  return tokens.length > 0 ? tokens.join(" ") : email;
}

const organizationNicknameSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  return value.trim().replace(/\s{2,}/g, " ");
}, z
  .string()
  .min(3, { message: "Apelido deve ter pelo menos 3 caracteres." })
  .max(50, { message: "Apelido deve ter no máximo 50 caracteres." })
  .regex(organizationNicknameRegex, {
    message:
      "Apelido deve começar e terminar com letra ou número. Espaços, hífens e underscores são permitidos no meio."
  }));

const completionSchema = z
  .object({
    password: z
      .string()
      .min(8, "A senha precisa ter pelo menos 8 caracteres")
      .regex(/[0-9]/, "Inclua ao menos um número")
      .regex(/[A-Z]/, "Inclua ao menos uma letra maiúscula")
      .regex(/[a-z]/, "Inclua ao menos uma letra minúscula"),
    organizationNickname: organizationNicknameSchema
  });

const resendSchema = z.object({
  email: z.string().email("Informe um e-mail válido")
});

type CompletionFormValues = z.infer<typeof completionSchema>;
type ResendFormValues = z.infer<typeof resendSchema>;

const problemMessages: Record<string, string> = {
  E_VERIFICATION_INVALID:
    "Este link expirou ou não é mais válido. Solicite um novo para continuar.",
  E_VERIFICATION_ALREADY_COMPLETED:
    "Este link já foi utilizado. Faça login para acessar a plataforma.",
  E_AUTH_EMAIL_IN_USE:
    "Já existe uma conta ativa para este e-mail.",
  E_AUTH_ORGANIZATION_MISMATCH:
    "O apelido informado conflita com os dados cadastrados. Ajuste antes de prosseguir.",
  E_AUTH_ORGANIZATION_NOT_FOUND:
    "Não encontramos organização para o apelido informado. Revise ou deixe o campo vazio."
};

function extractErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const code = error.problem?.code;
    if (code && problemMessages[code]) {
      return problemMessages[code];
    }
    return (
      error.problem?.detail ??
      error.problem?.title ??
      error.message ??
      "Erro inesperado."
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Erro inesperado.";
}

export function SignupCompletePage() {
  const { setSession } = useAuthSession();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [resendInfo, setResendInfo] =
    useState<SignupInitiateResponse | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
    null
  );

  const token = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("token")?.trim() ?? "";
  }, []);

  const confirmQuery = useQuery({
    queryKey: ["signup-confirm", token],
    queryFn: async () => {
      if (!token) {
        throw new ApiError("Token ausente.", 400);
      }
      return signupConfirm(token);
    },
    enabled: Boolean(token),
    retry: false
  });

  const completionForm = useForm<CompletionFormValues>({
    resolver: zodResolver(completionSchema),
    defaultValues: {
      password: "",
      organizationNickname: ""
    }
  });

  const resendForm = useForm<ResendFormValues>({
    resolver: zodResolver(resendSchema),
    defaultValues: {
      email: ""
    }
  });

  useEffect(() => {
    if (confirmQuery.isSuccess) {
      resendForm.reset({ email: confirmQuery.data.email });
    }
  }, [confirmQuery.isSuccess, confirmQuery.data, resendForm]);

  const signupCompleteMutation = useMutation({
    mutationFn: (payload: SignupCompletePayload) => signupComplete(payload),
    onSuccess: (data) => {
      setSession(data);
      setNotification({
        type: "success",
        title: "Cadastro concluído!",
        description: "Estamos preparando sua primeira sessão."
      });
      let remaining = 3;
      setRedirectCountdown(remaining);
      const interval = window.setInterval(() => {
        remaining -= 1;
        setRedirectCountdown(remaining);
        if (remaining <= 0) {
          window.clearInterval(interval);
          window.location.replace("/");
        }
      }, 1000);
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Não foi possível concluir o cadastro",
        description: extractErrorMessage(error)
      });
    }
  });

  const resendMutation = useMutation({
    mutationFn: signupInitiate,
    onSuccess: (data, variables) => {
      setResendInfo(data);
      setNotification({
        type: "info",
        title: "Link reenviado",
        description: `Encaminhamos um novo link para ${variables.email}. Verifique sua caixa de entrada ou spam.`
      });
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Não foi possível reenviar o link",
        description: extractErrorMessage(error)
      });
    }
  });

  const handleCompletionSubmit = completionForm.handleSubmit((values) => {
    if (!token) {
      setNotification({
        type: "error",
        title: "Token ausente",
        description:
          "O link acessado está incompleto. Solicite um novo link para continuar."
      });
      return;
    }

    setNotification(null);
    const organizationNickname = values.organizationNickname.trim();
    const fallbackEmail = confirmData?.email ?? "";
    const derivedName =
      (fallbackEmail && deriveNameFromEmail(fallbackEmail)) ||
      "Novo usuário";

    const payload: SignupCompletePayload = {
      token,
      name: derivedName,
      password: values.password,
      organization: {
        name: organizationNickname,
        nickname: organizationNickname,
        tz: DEFAULT_TZ,
        currency: DEFAULT_CURRENCY,
        locale: DEFAULT_LOCALE
      }
    };

    signupCompleteMutation.mutate(payload);
  });

  const handleResendSubmit = resendForm.handleSubmit((values) => {
    setNotification(null);
    resendMutation.mutate({ email: values.email.trim() });
  });

  const isLoading = confirmQuery.isLoading;
  const hasToken = Boolean(token);
  const confirmError = confirmQuery.error as ApiError | undefined;
  const confirmData = confirmQuery.data;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(45,41,38,0.12),_transparent_55%)]" />
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-12 px-6 py-12 sm:px-10 lg:flex-row lg:items-center">
        <aside className="flex-1 space-y-6">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-brand/15 px-3 py-1 text-xs font-medium text-brand transition hover:border-brand hover:bg-brand hover:text-white"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            <ArrowLeft className="h-3 w-3" />
            Voltar para login
          </button>
          <div className="space-y-4">
            <span className="font-sans text-xs uppercase tracking-[0.35em] text-brand">
              DataInova Connect
            </span>
            <h1 className="font-display text-4xl text-brand sm:text-5xl">
              Falta pouco para você destravar OKRs e métricas com governança.
            </h1>
            <p className="text-sm text-foreground/70">
              Defina um apelido memorável para a sua organização, crie uma senha
              segura e ative o ambiente. Se estiver validando em staging, o link
              abaixo exibe o token para facilitar os testes.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-brand/10 bg-white/80 p-5 shadow-soft backdrop-blur">
              <div className="flex items-center gap-2 text-brand">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-sm font-semibold uppercase tracking-wide">
                  Segurança multi-tenant
                </span>
              </div>
              <p className="mt-2 text-sm text-foreground/70">
                Todo o processo é protegido por link único, expira em horas e
                mantém os dados isolados por organização.
              </p>
            </div>
            <div className="rounded-2xl border border-brand/10 bg-white/80 p-5 shadow-soft backdrop-blur">
              <div className="flex items-center gap-2 text-brand">
                <Building2 className="h-5 w-5" />
                <span className="text-sm font-semibold uppercase tracking-wide">
                  Configuração guiada
                </span>
              </div>
              <p className="mt-2 text-sm text-foreground/70">
                Defina um apelido em poucos minutos. Depois disso,
                basta convidar o time e começar a instrumentar indicadores.
              </p>
            </div>
          </div>
        </aside>

        <main className="w-full max-w-xl rounded-3xl border border-brand/10 bg-white/95 p-8 shadow-soft backdrop-blur-lg">
          <div className="space-y-4">
            <h2 className="font-display text-2xl text-brand">
              Concluir cadastro com link mágico
            </h2>
            {confirmData ? (
              <p className="text-sm text-foreground/70">
                Link validado para <span className="font-medium">{confirmData.email}</span>.
                Defina um apelido para a organização e crie sua senha para ativar sua conta.
              </p>
            ) : null}
          </div>

          {notification ? (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
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

          {isLoading ? (
            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-brand/20 bg-white px-4 py-3 text-sm text-brand shadow-inner">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando link mágico...
            </div>
          ) : !hasToken ? (
            <div className="mt-8 space-y-4">
              <p className="text-sm text-danger">
                Não encontramos o token do link mágico na URL. Solicite um novo
                convite para continuar.
              </p>
              <ResendSection
                resendForm={resendForm}
                resendMutation={resendMutation}
                onSubmit={handleResendSubmit}
              />
            </div>
          ) : confirmQuery.isError ? (
            <div className="mt-8 space-y-4">
              <p className="text-sm text-danger">
                {extractErrorMessage(confirmError ?? new Error("Link inválido."))}
              </p>
              <ResendSection
                resendForm={resendForm}
                resendMutation={resendMutation}
                onSubmit={handleResendSubmit}
              />
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              <form className="space-y-6" onSubmit={handleCompletionSubmit}>
                <fieldset className="grid gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground/70">
                      E-mail de acesso
                    </label>
                    <input
                      type="email"
                      value={confirmData?.email ?? ""}
                      readOnly
                      disabled
                      className="w-full rounded-xl border border-brand/15 bg-brand-muted px-3 py-2 text-sm text-foreground/80 shadow-inner"
                    />
                    <p className="text-xs text-foreground/50">
                      Este e-mail está vinculado ao convite e não pode ser alterado.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground/70">
                      Apelido da organização
                    </label>
                    <input
                      type="text"
                      placeholder="ex.: data-inova"
                      className="w-full rounded-xl border border-brand/15 bg-white px-3 py-2 text-sm shadow-inner transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                      {...completionForm.register("organizationNickname")}
                      disabled={signupCompleteMutation.isPending}
                    />
                    {completionForm.formState.errors.organizationNickname?.message ? (
                      <p className="text-xs text-danger">
                        {completionForm.formState.errors.organizationNickname.message}
                      </p>
                    ) : (
                      <p className="text-xs text-foreground/50">
                        Defina um identificador curto para facilitar o login do time.
                      </p>
                    )}
                  </div>
                </fieldset>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground/70">
                    Defina sua senha
                  </label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-brand/15 bg-white px-3 py-2 text-sm shadow-inner transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    {...completionForm.register("password")}
                    disabled={signupCompleteMutation.isPending}
                  />
                  {completionForm.formState.errors.password?.message ? (
                    <p className="text-xs text-danger">
                      {completionForm.formState.errors.password.message}
                    </p>
                  ) : (
                    <p className="text-xs text-foreground/50">
                      Use ao menos 8 caracteres, misturando letras maiúsculas,
                      minúsculas e números.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-80"
                  disabled={signupCompleteMutation.isPending}
                >
                  {signupCompleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Concluir cadastro
                  {redirectCountdown !== null ? ` · redirecionando em ${redirectCountdown}s` : null}
                </button>
              </form>

              <div className="space-y-3 rounded-2xl border border-brand/15 bg-brand/5 p-4 text-xs text-foreground/70">
                <div className="flex items-center gap-2 font-semibold text-brand">
                  <Mail className="h-4 w-4" />
                  <span>Não recebeu o link?</span>
                </div>
                <p>
                  O e-mail pode levar alguns minutos. Verifique pastas de spam e
                  quarentena. Caso precise, reenvie utilizando o botão abaixo.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmData?.email) {
                      resendMutation.mutate({ email: confirmData.email });
                    } else {
                      setNotification({
                        type: "info",
                        title: "Informe um e-mail para reenviar",
                        description:
                          "Link atual não contém o destinatário. Preencha o formulário abaixo para solicitar um novo."
                      });
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-brand/20 px-3 py-1 font-medium text-brand transition hover:border-brand hover:bg-brand hover:text-white"
                  disabled={resendMutation.isPending}
                >
                  {resendMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  Reenviar link
                </button>
                {resendInfo?.verification ? (
                  <p className="text-[11px] text-foreground/60">
                    Ambiente de testes — token reenviado:{" "}
                    <span className="font-mono text-brand">
                      {resendInfo.verification.token}
                    </span>{" "}
                    (expira em{" "}
                    {new Date(resendInfo.verification.expiresAt).toLocaleString()}
                    ).
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

interface ResendSectionProps {
  resendForm: UseFormReturn<ResendFormValues>;
  resendMutation: UseMutationResult<
    SignupInitiateResponse,
    unknown,
    { email: string }
  >;
  onSubmit: (event: BaseSyntheticEvent) => void;
}

function ResendSection({ resendForm, resendMutation, onSubmit }: ResendSectionProps) {
  return (
    <form
      className="space-y-3 rounded-2xl border border-brand/15 bg-white/90 p-4 shadow-inner"
      onSubmit={onSubmit}
    >
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground/70">
          E-mail corporativo
        </label>
        <input
          type="email"
          className="w-full rounded-xl border border-brand/15 bg-white px-3 py-2 text-sm shadow-inner transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          {...resendForm.register("email")}
          disabled={resendMutation.isPending}
        />
        {resendForm.formState.errors.email?.message ? (
          <p className="text-xs text-danger">
            {resendForm.formState.errors.email.message}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-80"
        disabled={resendMutation.isPending}
      >
        {resendMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Reenviar link mágico
      </button>
    </form>
  );
}

export default SignupCompletePage;
