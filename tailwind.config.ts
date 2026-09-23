import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Futuristic color palette
      colors: {
        background: '#05080F',
        'background-light': '#0A1020',
        'card-bg': 'rgba(15, 25, 45, 0.6)',
        'card-border': 'rgba(0, 180, 255, 0.15)',
        'neon-blue': '#00B4FF',
        'neon-purple': '#7F00FF',
        'neon-cyan': '#00FFC8',
        'neon-pink': '#FF00AA',
        'text-primary': '#FFFFFF',
        'text-secondary': '#8892A6',
        'text-muted': '#4A5568',
      },
      // Typography
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      // Border radius
      borderRadius: {
        'xl': '16px',
        '2xl': '24px',
      },
      // Box shadows with neon glow
      boxShadow: {
        'neon-blue': '0 0 20px rgba(0, 180, 255, 0.3)',
        'neon-purple': '0 0 20px rgba(127, 0, 255, 0.3)',
        'neon-cyan': '0 0 20px rgba(0, 255, 200, 0.3)',
        'card': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'glow': '0 0 40px rgba(0, 180, 255, 0.15)',
      },
      // Backdrop blur for glassmorphism
      backdropBlur: {
        'xs': '2px',
        'glass': '12px',
      },
      // Animations
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(0, 180, 255, 0.3)' },
          '100%': { boxShadow: '0 0 30px rgba(0, 180, 255, 0.5)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      // Background patterns
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(0, 180, 255, 0.03) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(0, 180, 255, 0.03) 1px, transparent 1px)`,
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      backgroundSize: {
        'grid': '50px 50px',
      },
    },
  },
  plugins: [],
}

export default config
