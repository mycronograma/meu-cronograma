'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') || '');
    setEmail((params.get('email') || '').trim().toLowerCase());
  }, []);

  const hasValidParams = Boolean(token && email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!hasValidParams) {
      setErrorMessage('Link de recuperação inválido.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('As senhas não conferem.');
      return;
    }

    setIsLoading(true);

    const response = await fetch('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, password }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setErrorMessage(payload?.message || 'Não foi possível redefinir a senha.');
      setIsLoading(false);
      return;
    }

    setSuccessMessage('Senha redefinida com sucesso. Você será redirecionado.');
    setIsLoading(false);
    window.setTimeout(() => {
      router.push('/login?reset=success');
    }, 1200);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-neon-blue to-neon-purple blur-lg opacity-40" />
          </div>
          <span className="text-2xl font-heading font-bold gradient-text">Nexora</span>
        </div>

        <div className="glass-card p-6 sm:p-8">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-heading font-bold text-white">Redefinir senha</h1>
            <p className="mt-1 text-text-secondary">Defina uma nova senha para sua conta</p>
          </div>

          {!hasValidParams && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              Link de recuperação inválido. Solicite um novo link.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                {successMessage}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Nova senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="No minimo 8 caracteres"
                  className="input-field pl-12"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  disabled={!hasValidParams}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Confirmar senha
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="input-field pl-12"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  disabled={!hasValidParams}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isLoading}
              rightIcon={!isLoading && <ArrowRight className="w-4 h-4" />}
              disabled={!hasValidParams}
            >
              Redefinir senha
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-text-secondary">
            Precisa de novo link?{' '}
            <Link href="/forgot-password" className="text-neon-blue hover:underline">
              Recuperar acesso
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
