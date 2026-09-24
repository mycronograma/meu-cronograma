'use client';

/**
 * StorageWarningBanner
 * Mostra um aviso quando o navegador recusa salvar os dados do app
 * (cota de armazenamento cheia). Sem isso a falha ficava só no console e o
 * estudante perdia progresso silenciosamente ao recarregar a página.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { LOCAL_STORAGE_ERROR_EVENT } from '@/hooks/useLocalStorage';

type StorageErrorDetail = {
  key: string;
  failedBytes: number;
};

export default function StorageWarningBanner() {
  const [detail, setDetail] = useState<StorageErrorDetail | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent<StorageErrorDetail>;
      if (!customEvent.detail) return;
      setDetail(customEvent.detail);
      setIsDismissed(false);
    };

    window.addEventListener(LOCAL_STORAGE_ERROR_EVENT, handleError);
    return () => window.removeEventListener(LOCAL_STORAGE_ERROR_EVENT, handleError);
  }, []);

  if (!detail || isDismissed) return null;

  const sizeLabel =
    detail.failedBytes > 0 ? ` (${Math.round(detail.failedBytes / 1024)} KB não salvos)` : '';

  return (
    <div
      role="alert"
      className="mx-3 mt-3 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-100 sm:mx-4"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-amber-100">
          Não foi possível salvar seus dados neste navegador{sizeLabel}.
        </p>
        <p className="mt-0.5 text-[13px] text-amber-200/90">
          O armazenamento local está cheio. Libere espaço em Configurações &gt; Zona de risco
          (resetar progresso) ou exporte o que precisa antes de continuar — mudanças novas podem não
          ser mantidas ao recarregar.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setIsDismissed(true)}
        className="rounded-lg p-1 text-amber-200/80 transition-colors hover:bg-amber-400/10 hover:text-amber-100"
        aria-label="Fechar aviso de armazenamento"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
