import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nexora - AI Study Optimization',
    short_name: 'Nexora',
    description: 'Planejamento de estudos com IA, cronogramas e progresso inteligente.',
    start_url: '/',
    display: 'standalone',
    background_color: '#05080F',
    theme_color: '#05080F',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
