import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import {
  buildPasswordResetIdentifier,
  hashPasswordResetToken,
} from '@/lib/password-reset';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!emailRegex.test(email) || !token) {
      return NextResponse.json({ message: 'Link de recuperação inválido.' }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { message: 'A senha deve ter no mínimo 8 caracteres.' },
        { status: 400 }
      );
    }

    const identifier = buildPasswordResetIdentifier(email);
    const hashedToken = hashPasswordResetToken(token);

    const recoveryToken = await prisma.verificationToken.findFirst({
      where: {
        identifier,
        token: hashedToken,
        expires: { gt: new Date() },
      },
    });

    if (!recoveryToken) {
      return NextResponse.json(
        { message: 'Link de recuperação inválido ou expirado.' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { message: 'Link de recuperação inválido ou expirado.' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.verificationToken.deleteMany({
        where: { identifier },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return NextResponse.json(
      { message: 'Não foi possível redefinir sua senha agora.' },
      { status: 500 }
    );
  }
}
