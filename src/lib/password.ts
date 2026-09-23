import bcrypt from 'bcryptjs';

const PASSWORD_SALT_ROUNDS = 12;

export const hashPassword = (plainPassword: string) =>
  bcrypt.hash(plainPassword, PASSWORD_SALT_ROUNDS);

export const verifyPassword = (plainPassword: string, passwordHash: string) =>
  bcrypt.compare(plainPassword, passwordHash);
