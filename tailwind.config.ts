import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f3ebd9',
        'bg-soft': '#f7f1e1',
        surface: '#ffffff',
        ink: {
          DEFAULT: '#2a2520',
          soft: '#8a8278',
          faint: '#c4bdb3',
        },
        coral: '#e88562',
        peach: { DEFAULT: '#fde0d4', deep: '#e88562' },
        butter: { DEFAULT: '#fbebbc', deep: '#e8c75f' },
        mint: { DEFAULT: '#d9ecdc', deep: '#7fb389' },
        lavender: { DEFAULT: '#e4dcf2', deep: '#a896d4' },
        sky: { DEFAULT: '#d9e7ef', deep: '#8db4c8' },
        rose: { DEFAULT: '#f5d6d6', deep: '#d48a8a' },
      },
      fontFamily: {
        serif: ['Fraunces', 'serif'],
        mono: ['VT323', 'monospace'],
        sans: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '3px 3px 0 #2a2520',
        'card-lg': '4px 4px 0 #2a2520',
        'card-sm': '2px 2px 0 #2a2520',
        coral: '3px 3px 0 #e88562',
        mint: '3px 3px 0 #7fb389',
        butter: '3px 3px 0 #e8c75f',
      },
      borderRadius: {
        card: '16px',
        pill: '100px',
      },
      letterSpacing: {
        mono: '0.1em',
        'mono-wide': '0.14em',
      },
      backgroundImage: {
        dots:
          'radial-gradient(circle at 1px 1px, rgba(42,37,32,0.08) 1px, transparent 0)',
      },
      backgroundSize: {
        dots: '22px 22px',
      },
      keyframes: {
        pageIn: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
      animation: {
        pageIn: 'pageIn 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
        fadeIn: 'fadeIn 0.25s ease-out',
        pulseDot: 'pulse 1.4s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
