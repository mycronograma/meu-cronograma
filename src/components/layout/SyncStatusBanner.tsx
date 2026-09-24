'use client';

/**
 * SyncStatusBanner
 *
 * Avisa quando o progresso parou de subir para a conta.
 *
 * Antes disso, uma falha de sincronização (rede, sessão expirada, servidor
 * fora) só aparecia no console: o estudante continuava usando o app achando que
 * os dados estavam salvos, e só descobria no outro aparelho que não estavam.
 * O sucesso limpa o aviso sozinho.
 */

import { useEffect, useState } from 'react';
import { CloudOff, X } from 'lucide-react';
import type { StoredSyncStatus } from '@/hooks/useServerProgressSync';

export const SYNC_STATUS_EVENT = 'nexora-sync-status';

export default function SyncStatusBanner() {
  const [status, setStatus] = useState<StoredSyncStatus | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const customEvent = event as CustomEvent<StoredSyncStatus>;
      if (!customEvent.detail) return;
      setStatus(customEvent.detail);
      if (customEvent.detail.ok) setIsDismissed(false);
    };

    window.addEventListener(SYNC_STATUS_EVENT, handleStatus);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, handleStatus);
  }, []);

  if (!status || status.ok || isDismissed) return null;

  return (
    <div
      role="status"
      className="mx-3 mt-3 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-100 sm:mx-4"
    >
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-amber-100">
          Seu progresso está salvo neste aparelho, mas ainda não subiu para a conta.
        </p>
        <p className="mt-0.5 text-[13px] text-amber-200/90">
          {status.error ?? 'Não foi possível sincronizar agora.'} Vamos tentar de novo sozinhos —
          se quiser forçar, use Configurações &gt; Preferências de estudo &gt; Sincronizar agora.
          Não feche o app em outro aparelho esperando ver estas alterações.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setIsDismissed(true)}
        className="rounded-lg p-1 text-amber-200/80 transition-colors hover:bg-amber-400/10 hover:text-amber-100"
        aria-label="Fechar aviso de sincronização"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
