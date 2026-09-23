'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';

type PermissionStatus = NotificationPermission | 'unsupported';
type FeedbackType = 'success' | 'error' | 'info';

interface FeedbackState {
  type: FeedbackType;
  message: string;
}

interface PushConfigResponse {
  success: boolean;
  enabled: boolean;
  publicKey: string | null;
  error?: string;
}

const base64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

const feedbackClassName: Record<FeedbackType, string> = {
  success: 'text-neon-cyan',
  error: 'text-red-300',
  info: 'text-text-secondary',
};

const getPermissionDescription = (
  permission: PermissionStatus,
  isSubscribed: boolean,
  isSupported: boolean
) => {
  if (!isSupported || permission === 'unsupported') {
    return 'Este dispositivo não suporta notificações push neste navegador.';
  }

  if (permission === 'denied') {
    return 'Permissão bloqueada. Reative nas configurações do navegador para receber notificações.';
  }

  if (permission === 'granted' && isSubscribed) {
    return 'Dispositivo inscrito para receber alertas mesmo com o app fechado.';
  }

  if (permission === 'granted') {
    return 'Permissão concedida, mas sem inscrição ativa. Toque em ativar notificações.';
  }

  return 'Ative para receber lembretes e alertas da Nexora no seu dispositivo.';
};

export default function SystemNotificationsCard() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<PermissionStatus>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const syncPushStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const supportsPush =
      'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supportsPush);

    if (!supportsPush) {
      setPermission('unsupported');
      setIsSubscribed(false);
      return;
    }

    setPermission(Notification.permission);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(Boolean(subscription));
    } catch {
      setIsSubscribed(false);
    }
  }, []);

  useEffect(() => {
    void syncPushStatus();
  }, [syncPushStatus]);

  const statusMeta = useMemo(() => {
    if (!isSupported || permission === 'unsupported') {
      return { label: 'Indisponível', variant: 'danger' as const };
    }

    if (permission === 'denied') {
      return { label: 'Bloqueado', variant: 'danger' as const };
    }

    if (permission === 'granted' && isSubscribed) {
      return { label: 'Ativo', variant: 'success' as const };
    }

    if (permission === 'granted') {
      return { label: 'Sem inscrição', variant: 'warning' as const };
    }

    return { label: 'Desativado', variant: 'warning' as const };
  }, [isSupported, permission, isSubscribed]);

  const ensureServiceWorkerRegistration = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('SERVICE_WORKER_UNSUPPORTED');
    }

    const existingRegistration = await navigator.serviceWorker.getRegistration();
    if (existingRegistration) return existingRegistration;

    return navigator.serviceWorker.register('/sw.js');
  }, []);

  const handleEnablePush = useCallback(async () => {
    if (!isSupported || isLoading) return;

    setFeedback(null);
    setIsLoading(true);

    try {
      let nextPermission = Notification.permission;
      if (nextPermission !== 'granted') {
        nextPermission = await Notification.requestPermission();
      }

      setPermission(nextPermission);

      if (nextPermission !== 'granted') {
        setIsSubscribed(false);
        setFeedback({
          type: 'error',
          message: 'Permissão negada. Ative manualmente nas configurações do navegador.',
        });
        return;
      }

      const configResponse = await fetch('/api/notifications/config', {
        method: 'GET',
        cache: 'no-store',
      });
      const configPayload = (await configResponse.json().catch(() => ({}))) as Partial<PushConfigResponse>;

      if (!configResponse.ok || !configPayload.enabled || !configPayload.publicKey) {
        setFeedback({
          type: 'error',
          message: 'Configuração de push indisponível no servidor.',
        });
        return;
      }

      const registration = await ensureServiceWorkerRegistration();
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(configPayload.publicKey),
        });
      }

      const subscribeResponse = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
        }),
      });

      const subscribePayload = (await subscribeResponse.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };

      if (!subscribeResponse.ok || !subscribePayload.success) {
        setFeedback({
          type: 'error',
          message: subscribePayload.error || 'Não foi possível ativar notificações.',
        });
        return;
      }

      setIsSubscribed(true);
      await fetch('/api/notifications/sync', { method: 'POST' }).catch(() => undefined);

      let activationFeedback: FeedbackState = {
        type: 'success',
        message: 'Notificações do dispositivo ativadas.',
      };

      try {
        const testResponse = await fetch('/api/notifications/test', {
          method: 'POST',
        });
        const testPayload = (await testResponse.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };

        if (testResponse.ok && testPayload.success) {
          activationFeedback = {
            type: 'success',
            message: 'Notificações ativadas e teste enviado com sucesso.',
          };
        } else if (testResponse.status === 410) {
          activationFeedback = {
            type: 'error',
            message: 'Assinatura expirada. Toque em reativar para cadastrar novamente.',
          };
          setIsSubscribed(false);
        } else {
          activationFeedback = {
            type: 'info',
            message: 'Notificações ativadas. O teste pode demorar alguns segundos.',
          };
        }
      } catch {
        activationFeedback = {
          type: 'info',
          message: 'Notificações ativadas. O teste pode demorar alguns segundos.',
        };
      }

      setFeedback({
        type: activationFeedback.type,
        message: activationFeedback.message,
      });
    } catch (error) {
      console.error('Erro ao ativar push:', error);
      setFeedback({
        type: 'error',
        message: 'Falha ao ativar notificações no dispositivo.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [ensureServiceWorkerRegistration, isLoading, isSupported]);

  const handleDisablePush = useCallback(async () => {
    if (!isSupported || isLoading || !isSubscribed) return;

    setFeedback(null);
    setIsLoading(true);

    try {
      const registration = await ensureServiceWorkerRegistration();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });

        await subscription.unsubscribe();
      } else {
        await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
        });
      }

      setIsSubscribed(false);
      setFeedback({
        type: 'info',
        message: 'Notificações do dispositivo desativadas.',
      });
    } catch (error) {
      console.error('Erro ao desativar push:', error);
      setFeedback({
        type: 'error',
        message: 'Falha ao desativar notificações do dispositivo.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [ensureServiceWorkerRegistration, isLoading, isSubscribed, isSupported]);

  const handleSendTest = useCallback(async () => {
    if (!isSupported || !isSubscribed || isSendingTest) return;

    setFeedback(null);
    setIsSendingTest(true);

    try {
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        setFeedback({
          type: 'error',
          message: payload.error || 'Falha ao enviar notificação de teste.',
        });

        if (response.status === 410) {
          setIsSubscribed(false);
        }
        return;
      }

      setFeedback({
        type: 'success',
        message: payload.message || 'Notificação de teste enviada.',
      });
    } catch (error) {
      console.error('Erro ao enviar push de teste:', error);
      setFeedback({
        type: 'error',
        message: 'Falha ao enviar notificação de teste.',
      });
    } finally {
      setIsSendingTest(false);
    }
  }, [isSendingTest, isSubscribed, isSupported]);

  return (
    <div className="p-4 rounded-xl bg-card-bg border border-card-border space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-white">Notificações do dispositivo</div>
          <div className="text-sm text-text-secondary">
            {getPermissionDescription(permission, isSubscribed, isSupported)}
          </div>
        </div>
        <Badge variant={statusMeta.variant} size="sm">
          {statusMeta.label}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          variant={isSubscribed ? 'secondary' : 'primary'}
          onClick={handleEnablePush}
          loading={isLoading}
          disabled={!isSupported || permission === 'denied' || isSendingTest}
          leftIcon={<Bell className="w-4 h-4" />}
        >
          {isSubscribed ? 'Reativar' : 'Ativar notificações'}
        </Button>

        <Button
          variant="ghost"
          className="border border-card-border text-text-secondary hover:text-white"
          onClick={handleSendTest}
          loading={isSendingTest}
          disabled={!isSupported || !isSubscribed || isLoading}
          leftIcon={<Send className="w-4 h-4" />}
        >
          Enviar teste
        </Button>

        <Button
          variant="ghost"
          className="border border-card-border text-text-secondary hover:text-white"
          onClick={handleDisablePush}
          disabled={!isSupported || !isSubscribed || isLoading || isSendingTest}
          leftIcon={<BellOff className="w-4 h-4" />}
        >
          Desativar
        </Button>
      </div>

      {feedback && (
        <p className={cn('text-xs', feedbackClassName[feedback.type])}>{feedback.message}</p>
      )}
    </div>
  );
}
