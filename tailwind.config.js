/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
        line: {
          50: 'rgb(var(--color-line-50) / <alpha-value>)',
          100: 'rgb(var(--color-line-100) / <alpha-value>)',
          200: 'rgb(var(--color-line-200) / <alpha-value>)',
          300: 'rgb(var(--color-line-300) / <alpha-value>)'
        },
        ink: {
          300: 'rgb(var(--color-ink-300) / <alpha-value>)',
          400: 'rgb(var(--color-ink-400) / <alpha-value>)',
          500: 'rgb(var(--color-ink-500) / <alpha-value>)',
          600: 'rgb(var(--color-ink-600) / <alpha-value>)',
          700: 'rgb(var(--color-ink-700) / <alpha-value>)',
          800: 'rgb(var(--color-ink-800) / <alpha-value>)',
          900: 'rgb(var(--color-ink-900) / <alpha-value>)'
        },
        accent: {
          400: 'rgb(var(--color-accent-400) / <alpha-value>)',
          500: 'rgb(var(--color-accent-500) / <alpha-value>)',
          600: 'rgb(var(--color-accent-600) / <alpha-value>)'
        },
        rose: {
          600: 'rgb(var(--color-rose-600) / <alpha-value>)'
        }
      },
      fontFamily: {
        // Inter and Newsreader are bundled from @fontsource-variable (imported in main.tsx), since
        // the app runs fully offline under a strict CSP.
        sans: ['"Inter Variable"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['"Newsreader Variable"', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
}
