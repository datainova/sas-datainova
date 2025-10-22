import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { requestSignupLink } from '../../../core/auth/auth-api';
import { Input } from '../../../design-system/components/Input';
import { Button } from '../../../design-system/components/Button';
import { BrandMark } from '../../../logo/BrandMark';

const schema = z.object({
  email: z
    .string({ required_error: 'Informe seu email corporativo.' })
    .email('Informe um email válido.')
});

type FormValues = z.infer<typeof schema>;

const mapErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 429) {
    return 'Detectamos muitas tentativas. Aguarde alguns instantes e tente novamente.';
  }
  return 'Não foi possível enviar o link no momento. Tente novamente em instantes.';
};

const SignupRequestPage = () => {
  const [feedback, setFeedback] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: ''
    }
  });

  const signupMutation = useMutation({
    mutationFn: async (email: string) => requestSignupLink(email),
    onSuccess: (message) => {
      setFeedback(message);
    },
    onError: (error) => {
      setFeedback(mapErrorMessage(error));
    }
  });

  const handleSubmit = form.handleSubmit((values) => {
    setFeedback(null);
    signupMutation.mutate(values.email);
  });

  const isSubmitting = signupMutation.isPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6 py-12 dark:bg-[rgba(18,18,18,0.92)]">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-white p-8 shadow-soft dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.85)]">
        <div className="flex items-center gap-3">
          <BrandMark className="h-8" />
          <div>
            <h1 className="text-2xl font-semibold text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">
              Criar conta
            </h1>
            <p className="text-sm text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.7)]">
              Enviaremos um link para finalizar o cadastro.
            </p>
          </div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <Input
            id="email"
            label="Email corporativo"
            type="email"
            placeholder="seu.nome@empresa.com"
            autoComplete="email"
            error={form.formState.errors.email?.message}
            disabled={isSubmitting}
            {...form.register('email')}
          />

          {feedback ? (
            <p
              className={`text-sm ${
                signupMutation.isError ? 'text-danger-500' : 'text-[rgba(45,41,38,0.7)] dark:text-[rgba(230,224,220,0.75)]'
              }`}
              role="alert"
            >
              {feedback}
            </p>
          ) : null}

          <Button type="submit" variant="primary" fullWidth isLoading={isSubmitting}>
            Enviar link de confirmação
          </Button>
        </form>

        <div className="space-y-2 text-center text-sm text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.7)]">
          <p>
            Já possui conta?{' '}
            <Link to="/login" className="font-semibold text-brand hover:underline dark:text-brand-foreground">
              Fazer login
            </Link>
          </p>
          <p>
            Esqueceu sua senha?{' '}
            <Link to="/password/forgot" className="font-semibold text-brand hover:underline dark:text-brand-foreground">
              Recuperar acesso
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupRequestPage;
