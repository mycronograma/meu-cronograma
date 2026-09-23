import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/mail';
import {
  PASSWORD_RESET_TTL_MS,
  buildPasswordResetIdentifier,
  generatePasswordResetToken,
  hashPasswordResetToken,
} from '@/lib/password-reset';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const genericSuccessMessage =
  'Se o e-mail existir, enviaremos instruções de recuperação.';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!emailRegex.test(email)) {
      return NextResponse.json({ message: genericSuccessMessage });
    }

    if (!env.emailServer || !env.emailFrom) {
      return NextResponse.json(
        { message: 'Recuperação de acesso indisponível no momento.' },
        { status: 503 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ message: genericSuccessMessage });
    }

    const rawToken = generatePasswordResetToken();
    const hashedToken = hashPasswordResetToken(rawToken);
    const identifier = buildPasswordResetIdentifier(email);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await prisma.verificationToken.deleteMany({
      where: { identifier },
    });

    await prisma.verificationToken.create({
      data: {
        identifier,
        token: hashedToken,
        expires: expiresAt,
      },
    });

    const baseUrl = (env.nextAuthUrl || new URL(request.url).origin).replace(/\/$/, '');
    const resetLink = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
    const firstName = user.name?.trim().split(' ')[0] || 'Estudante';

    await sendEmail({
      to: email,
      subject: 'Recuperação de acesso - Nexora',
      text: `Oi, ${firstName}. Para redefinir sua senha, acesse: ${resetLink}. Este link expira em 1 hora.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
          <h2>Recuperação de acesso</h2>
          <p>Oi, ${firstName}.</p>
          <p>Recebemos uma solicitação para redefinir sua senha na Nexora.</p>
          <p>
            <a href="${resetLink}" style="display:inline-block;padding:10px 14px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:8px;">
              Redefinir senha
            </a>
          </p>
          <p>Se você não solicitou essa alteração, pode ignorar este e-mail.</p>
          <p>Este link expira em 1 hora.</p>
        </div>
      `,
    });

    return NextResponse.json({ message: genericSuccessMessage });
  } catch (error) {
    console.error('Erro ao solicitar recuperação de senha:', error);
    return NextResponse.json(
      { message: 'Não foi possível processar sua solicitação.' },
      { status: 500 }
    );
  }
}
