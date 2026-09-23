import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { env, hasGoogleAuth } from '@/lib/env';

const providers = [] as NextAuthOptions['providers'];

providers.push(
  CredentialsProvider({
    name: 'Email e senha',
    credentials: {
      email: { label: 'E-mail', type: 'email' },
      password: { label: 'Senha', type: 'password' },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password ?? '';

      if (!email || !password) return null;

      let user;
      try {
        user = await prisma.user.findUnique({
          where: { email },
        });
      } catch (error) {
        console.error('Erro ao consultar usuario para login:', error);
        throw new Error('Configuration');
      }

      if (!user) return null;
      if (!user.passwordHash) {
        throw new Error('OAuthAccountNotLinked');
      }
      if (!user.emailVerified) {
        throw new Error('EmailNotVerified');
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image || user.avatar || null,
      };
    },
  })
);

if (hasGoogleAuth) {
  providers.push(
    GoogleProvider({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      // Permite vincular automaticamente a conta Google a uma conta existente
      // com o mesmo e-mail (ex.: cadastro prévio por e-mail/senha).
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: env.nextAuthSecret || undefined,
  session: {
    strategy: 'jwt',
  },
  providers,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    signIn: async ({ account, profile }) => {
      // Exige e-mail verificado no Google antes de permitir login/link da conta.
      if (account?.provider === 'google') {
        const googleProfile = profile as { email_verified?: boolean } | undefined;
        if (googleProfile && googleProfile.email_verified === false) {
          return false;
        }
      }
      return true;
    },
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      return token;
    },
    session: async ({ session, token, user }) => {
      const sessionUserId = user?.id ?? (typeof token?.sub === 'string' ? token.sub : undefined);

      if (session.user) {
        session.user.id = sessionUserId || '';
        session.user.name = session.user.name || token?.name || user?.name || '';
        session.user.email = session.user.email || token?.email || user?.email || '';
        session.user.image =
          session.user.image || (typeof token?.picture === 'string' ? token.picture : null) || user?.image || undefined;
      }
      return session;
    },
  },
};
