import crypto from 'crypto';

export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

export const generatePasswordResetToken = () =>
  crypto.randomBytes(32).toString('hex');

export const hashPasswordResetToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

export const buildPasswordResetIdentifier = (email: string) =>
  `password-reset:${email.trim().toLowerCase()}`;
