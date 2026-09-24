import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Moldura das páginas públicas de Termos e Privacidade.
 * Antes os links do login apontavam para "#": clicar não fazia nada (e o app não
 * tinha os documentos). Ficam fora da área logada, com leitura confortável.
 */
export default function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href="/login"
          className="text-sm text-neon-blue hover:underline"
        >
          ← Voltar para o login
        </Link>

        <h1 className="mt-6 font-heading text-2xl font-bold text-white sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-text-muted">Última atualização: {updatedAt}</p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-text-secondary [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-2 [&_li]:mb-1.5 [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>

        <p className="mt-10 rounded-xl border border-card-border bg-card-bg p-4 text-xs text-text-muted">
          Documento em revisão antes do lançamento comercial. Se você encontrar algo incorreto ou
          precisar de esclarecimento, escreva para o suporte pelo mesmo e-mail da sua conta.
        </p>
      </div>
    </div>
  );
}
