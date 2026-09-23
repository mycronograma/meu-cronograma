'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Mail, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { isLocalDemoAuthEnabled } from '@/lib/localDemoAuth';

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLoading(true);

    if (isLocalDemoAuthEnabled) {
      setStatusMessage('Modo teste local: recuperacao real depende do e-mail do servidor. Use qualquer e-mail e senha no login.');
      setIsLoading(false);
      return;
    }

    const response = await fetch('/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setErrorMessage(payload?.message || 'Não foi possível enviar o e-mail agora.');
      setIsLoading(false);
      return;
    }

    setStatusMessage(
      payload?.message || 'Se o e-mail existir, enviaremos instruções de recuperação.'
    );
    setIsLoading(false);
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
            <h1 className="text-2xl font-heading font-bold text-white">Recuperar acesso</h1>
            <p className="mt-1 text-text-secondary">Informe seu e-mail para receber o link</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isLocalDemoAuthEnabled && (
              <div className="rounded-xl border border-neon-blue/30 bg-neon-blue/10 p-3 text-sm text-sky-100">
                Modo teste local: esta tela confirma o fluxo sem enviar e-mail real.
              </div>
            )}
            {errorMessage && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {errorMessage}
              </div>
            )}
            {statusMessage && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                {statusMessage}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="input-field pl-12"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isLoading}
              rightIcon={!isLoading && <ArrowRight className="w-4 h-4" />}
            >
              Enviar recuperação
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-text-secondary">
            Lembrou a senha?{' '}
            <Link href="/login" className="text-neon-blue hover:underline">
              Voltar ao login
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
