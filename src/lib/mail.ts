import nodemailer from 'nodemailer';
import { env } from '@/lib/env';

let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (!env.emailServer) {
    throw new Error('EMAIL_SERVER is not configured');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport(env.emailServer);
  }

  return transporter;
};

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const sendEmail = async ({ to, subject, text, html }: SendEmailInput) => {
  if (!env.emailFrom) {
    throw new Error('EMAIL_FROM is not configured');
  }

  const smtp = getTransporter();

  await smtp.sendMail({
    from: env.emailFrom,
    to,
    subject,
    text,
    html,
  });
};
