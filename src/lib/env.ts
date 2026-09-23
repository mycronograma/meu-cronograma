const allowLocalAuthFallback =
  process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
const fallbackAuthSecret =
  process.env.NEXTAUTH_SECRET ??
  process.env.CRON_SECRET ??
  process.env.NOTIFICATIONS_CRON_SECRET ??
  '';

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  nextAuthUrl: process.env.NEXTAUTH_URL ?? '',
  nextAuthSecret:
    fallbackAuthSecret || (allowLocalAuthFallback ? 'nexora-local-auth-secret' : ''),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  emailServer: process.env.EMAIL_SERVER ?? '',
  emailFrom: process.env.EMAIL_FROM ?? '',
  vapidPublicKey: (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim(),
  vapidPrivateKey: (process.env.VAPID_PRIVATE_KEY ?? '').trim(),
  vapidSubject: (process.env.VAPID_SUBJECT ?? '').trim(),
  notificationsCronSecret: (
    process.env.NOTIFICATIONS_CRON_SECRET ??
    process.env.CRON_SECRET ??
    ''
  ).trim(),
};

export const hasGoogleAuth = Boolean(env.googleClientId && env.googleClientSecret);
export const hasEmailAuth = Boolean(env.emailServer && env.emailFrom);
export const hasWebPush = Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);

export const missingAuthEnv = () => {
  const missing: string[] = [];
  if (!env.nextAuthUrl) missing.push('NEXTAUTH_URL');
  if (!env.nextAuthSecret) missing.push('NEXTAUTH_SECRET');
  if (!hasGoogleAuth) missing.push('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET');
  return missing;
};

if (process.env.NODE_ENV !== 'production') {
  const missing = missingAuthEnv();
  if (missing.length > 0) {
    console.warn('[env] Missing auth env vars:', missing.join(', '));
  }
}
