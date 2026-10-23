/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
        sage: {
          50: 'rgb(var(--color-sage-50) / <alpha-value>)',
          100: 'rgb(var(--color-sage-100) / <alpha-value>)',
          200: 'rgb(var(--color-sage-200) / <alpha-value>)',
          300: 'rgb(var(--color-sage-300) / <alpha-value>)',
          400: 'rgb(var(--color-sage-400) / <alpha-value>)',
          500: 'rgb(var(--color-sage-500) / <alpha-value>)',
          600: 'rgb(var(--color-sage-600) / <alpha-value>)',
          700: 'rgb(var(--color-sage-700) / <alpha-value>)',
          800: 'rgb(var(--color-sage-800) / <alpha-value>)',
          900: 'rgb(var(--color-sage-900) / <alpha-value>)'
        },
        bark: {
          300: 'rgb(var(--color-bark-300) / <alpha-value>)',
          400: 'rgb(var(--color-bark-400) / <alpha-value>)',
          500: 'rgb(var(--color-bark-500) / <alpha-value>)',
          600: 'rgb(var(--color-bark-600) / <alpha-value>)',
          700: 'rgb(var(--color-bark-700) / <alpha-value>)',
          800: 'rgb(var(--color-bark-800) / <alpha-value>)'
        },
        terracotta: {
          400: 'rgb(var(--color-terracotta-400) / <alpha-value>)',
          500: 'rgb(var(--color-terracotta-500) / <alpha-value>)',
          600: 'rgb(var(--color-terracotta-600) / <alpha-value>)'
        }
      },
      fontFamily: {
        // System stacks for now — swap for self-hosted Inter/Lora files later
        // (no network fonts, since the app runs fully offline under a strict CSP).
        sans: ['-apple-system', 'system-ui', 'sans-serif'],
        serif: ['Iowan Old Style', 'Palatino', 'Georgia', 'serif']
      }
    }
  },
  plugins: []
}
