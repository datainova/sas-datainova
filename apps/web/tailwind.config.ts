import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2d2926',
          foreground: '#ffffff',
          50: '#f5f4f3',
          100: '#ece9e5',
          200: '#d9d4cd',
          300: '#c5bdb8',
          400: '#a8948a',
          500: '#2d2926',
          600: '#262321',
          700: '#211e1c',
          800: '#1b1816',
          900: '#14110f'
        },
        bg: '#ffffff',
        fg: '#2d2926',
        muted: '#f5f4f3',
        border: '#e0dcd8',
        info: '#2f6a9a',
        success: {
          50: '#e5f4ec',
          100: '#c2e4d1',
          200: '#8bcda7',
          300: '#54b57c',
          400: '#2c9656',
          500: '#1a7f37',
          600: '#15662c',
          700: '#114f23',
          800: '#0d3c1a',
          900: '#0a2d13'
        },
        warning: {
          50: '#fff5e6',
          100: '#ffdfb8',
          200: '#ffc27a',
          300: '#ffa33d',
          400: '#f1870f',
          500: '#b86e00',
          600: '#915600',
          700: '#6d4000',
          800: '#4c2d00',
          900: '#351f00'
        },
        danger: {
          50: '#fdeceb',
          100: '#f8cbc9',
          200: '#f19992',
          300: '#e9665a',
          400: '#dc3830',
          500: '#b3261e',
          600: '#8c1d17',
          700: '#661510',
          800: '#480f0c',
          900: '#320a07'
        },
        slate: {
          50: '#f5f4f3',
          100: '#ece9e5',
          200: '#ded4cd',
          300: '#c7bcb4',
          400: '#aa9b93',
          500: '#8d7b73',
          600: '#6e5f58',
          700: '#564944',
          800: '#403631',
          900: '#2b2421',
          950: '#1e1715'
        },
        focus: '#9fc9ff'
      },
      fontFamily: {
        display: ['"Jaapokki"', 'system-ui', 'sans-serif'],
        sans: ['"Exo 2 Variable"', '"Exo 2"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'monospace']
      },
      borderRadius: {
        lg: '16px',
        xl: '20px',
        '2xl': '24px'
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        elevated: 'var(--shadow-elevated)'
      },
      transitionTimingFunction: {
        brand: 'cubic-bezier(0.16, 1, 0.3, 1)'
      },
      keyframes: {
        'save-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(45, 41, 38, 0.4)' },
          '70%': { boxShadow: '0 0 0 12px rgba(45, 41, 38, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(45, 41, 38, 0)' }
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        'save-pulse': 'save-pulse 1.4s ease-out infinite',
        shimmer: 'shimmer 1.2s linear infinite'
      }
    }
  },
  plugins: []
};

export default config;
