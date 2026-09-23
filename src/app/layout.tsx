/**
 * Root Layout
 * Provides the main app structure with sidebar and responsive design
 */

import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthProvider from '@/components/providers/AuthProvider';
import ThemeBootstrap from '@/components/providers/ThemeBootstrap';
import PWARegister from '@/components/PWARegister';

export const metadata: Metadata = {
  title: 'Nexora - AI Study Optimization',
  description: 'Transform your learning with AI-powered study planning, smart scheduling, and gamified progress tracking.',
  keywords: ['study', 'learning', 'AI', 'productivity', 'education', 'planning'],
  authors: [{ name: 'Nexora Team' }],
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#05080F' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark theme-dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const root = document.documentElement;
                  const savedTheme = localStorage.getItem('nexora_theme');
                  const settings = JSON.parse(localStorage.getItem('nexora_user_settings') || '{}');
                  const theme = savedTheme === 'light' || savedTheme === 'dark'
                    ? savedTheme
                    : settings.theme === 'light'
                      ? 'light'
                      : 'dark';
                  root.classList.toggle('theme-light', theme === 'light');
                  root.classList.toggle('theme-dark', theme !== 'light');
                  root.classList.toggle('dark', theme !== 'light');
                  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
                } catch {}
              })();
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="font-body antialiased">
        <ThemeBootstrap />
        <AuthProvider>
          {children}
          <PWARegister />
        </AuthProvider>
      </body>
    </html>
  );
}
