import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/mail';
import {
  REGISTER_2FA_TTL_MS,
  buildRegister2FAIdentifier,
  generateRegister2FACode,
  hashRegister2FACode,
} from '@/lib/register-2fa';

const MIN_NAME_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 8;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowLocalVerificationCode = process.env.NODE_ENV !== 'production';

const sendRegisterCodeEmail = async ({
  name,
  email,
  code,
}: {
  name: string;
  email: string;
  code: string;
}) => {
  const firstName = name.trim().split(' ')[0] || 'Estudante';

  await sendEmail({
    to: email,
    subject: 'Código de verificação - Nexora',
    text: `Oi, ${firstName}. Seu código de verificação da Nexora é ${code}. Ele expira em 10 minutos.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
        <h2>Verificação de conta</h2>
        <p>Oi, ${firstName}.</p>
        <p>Seu código de verificação da Nexora é:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">${code}</p>
        <p>Este código expira em 10 minutos.</p>
      </div>
    `,
  });
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (name.length < MIN_NAME_LENGTH) {
      return NextResponse.json(
        { message: 'Informe um nome com pelo menos 2 caracteres.' },
        { status: 400 }
      );
    }

    if (!emailRegex.test(email)) {
      return NextResponse.json({ message: 'Informe um e-mail válido.' }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { message: 'A senha deve ter no mínimo 8 caracteres.' },
        { status: 400 }
      );
    }

    if (!allowLocalVerificationCode && (!env.emailServer || !env.emailFrom)) {
      return NextResponse.json(
        { message: 'Envio de e-mail não configurado no servidor.' },
        { status: 503 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'Este e-mail já está cadastrado.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    const rawCode = generateRegister2FACode();
    const hashedCode = hashRegister2FACode(rawCode);
    const identifier = buildRegister2FAIdentifier(email);
    const expiresAt = new Date(Date.now() + REGISTER_2FA_TTL_MS);

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
      try {
        await sendRegisterCodeEmail({
          name: user.name,
          email: user.email,
          code: rawCode,
        });
        codeSent = true;
      } catch (mailError) {
        console.error('Erro ao enviar código 2FA de cadastro:', mailError);
      }
    }

    if (!codeSent && !allowLocalVerificationCode) {
      await prisma.$transaction([
        prisma.verificationToken.deleteMany({ where: { identifier } }),
        prisma.user.delete({ where: { id: user.id } }),
      ]);

      return NextResponse.json(
        { message: 'Não foi possível enviar o código de verificação agora.' },
        { status: 503 }
      );
    }

    const localCodeMessage = `Conta criada. Ambiente local sem envio de e-mail: use o código ${rawCode}.`;

    return NextResponse.json(
      {
        success: true,
        requires2FA: true,
        email,
        codeSent,
        ...(codeSent || !allowLocalVerificationCode ? {} : { devVerificationCode: rawCode }),
        message: codeSent
          ? 'Conta criada. Enviamos o código de verificação para seu e-mail.'
          : localCodeMessage,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao cadastrar usuário:', error);
    return NextResponse.json(
      { message: 'Não foi possível concluir o cadastro agora.' },
      { status: 500 }
    );
  }
}
