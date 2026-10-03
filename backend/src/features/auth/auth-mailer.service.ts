import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class AuthMailerService {
  async sendPasswordRecovery(email: string, token: string): Promise<boolean> {
    const from = process.env.MAIL_FROM;
    const appOrigin = process.env.APP_ORIGIN;
    const smtpUrl = process.env.SMTP_URL;
    const smtpHost = process.env.SMTP_HOST;
    if (!from || !appOrigin || (!smtpUrl && !smtpHost)) return false;

    const transport = smtpUrl
      ? nodemailer.createTransport(smtpUrl)
      : nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
    const link = new URL('/recuperar-senha', appOrigin);
    link.searchParams.set('token', token);
    await transport.sendMail({
      from,
      to: email,
      subject: 'Redefina sua senha',
      text: 'Use este link para redefinir sua senha: ' + link.toString() + '\nO link expira em 30 minutos.',
    });
    return true;
  }
}
