import crypto from 'crypto';

export const REGISTER_2FA_TTL_MS = 1000 * 60 * 10; // 10 minutes

export const buildRegister2FAIdentifier = (email: string) =>
  `register-2fa:${email.trim().toLowerCase()}`;

export const generateRegister2FACode = () =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

export const hashRegister2FACode = (code: string) =>
  crypto.createHash('sha256').update(code).digest('hex');
