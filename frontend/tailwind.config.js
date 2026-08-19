/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm amber/terracotta primary instead of a generic indigo-on-navy SaaS look.
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          300: '#fdba74',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          900: '#7c2d12'
        },
        surface: {
          DEFAULT: '#100d0a',
          raised: '#1c17124d'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
};
