import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/mail';
import {
  REGISTER_2FA_TTL_MS,
  buildRegister2FAIdentifier,
  generateRegister2FACode,
  hashRegister2FACode,
} from '@/lib/register-2fa';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowLocalVerificationCode = process.env.NODE_ENV !== 'production';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!emailRegex.test(email)) {
      return NextResponse.json({ message: 'E-mail inválido.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { name: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ message: 'Conta não encontrada.' }, { status: 404 });
    }

    if (!allowLocalVerificationCode && (!env.emailServer || !env.emailFrom)) {
      return NextResponse.json(
        { message: 'Não foi possível reenviar o código agora.' },
        { status: 503 }
      );
    }

    const rawCode = generateRegister2FACode();
    const hashedCode = hashRegister2FACode(rawCode);
    const identifier = buildRegister2FAIdentifier(email);
    const expiresAt = new Date(Date.now() + REGISTER_2FA_TTL_MS);
    const firstName = user.name?.trim().split(' ')[0] || 'Estudante';

    await prisma.verificationToken.deleteMany({
      where: { identifier },
    });

    await prisma.verificationToken.create({
      data: {
        identifier,
        token: hashedCode,
        expires: expiresAt,
      },
    });

    let codeSent = false;

    if (env.emailServer && env.emailFrom) {
      await sendEmail({
        to: email,
        subject: 'Novo código de verificação - Nexora',
        text: `Oi, ${firstName}. Seu novo código de verificação da Nexora é ${rawCode}. Ele expira em 10 minutos.`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
            <h2>Novo código de verificação</h2>
            <p>Oi, ${firstName}.</p>
            <p>Seu novo código de verificação da Nexora é:</p>
            <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">${rawCode}</p>
            <p>Este código expira em 10 minutos.</p>
          </div>
        `,
      });
      codeSent = true;
    }

    return NextResponse.json({
      success: true,
      codeSent,
      ...(codeSent || !allowLocalVerificationCode ? {} : { devVerificationCode: rawCode }),
      message: codeSent
        ? 'Novo código enviado para seu e-mail.'
        : `Ambiente local sem envio de e-mail: use o código ${rawCode}.`,
    });
  } catch (error) {
    console.error('Erro ao reenviar 2FA de cadastro:', error);
    return NextResponse.json(
      { message: 'Não foi possível reenviar o código agora.' },
      { status: 500 }
    );
  }
}
