import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        black: '#0f1014',
        ebony: '#1a1c23',
        mirage: '#27292D',
        blue: {
          50: '#ECEEFE',
          100: '#D8DDFD',
          200: '#ACB7FB',
          300: '#8695F9',
          400: '#5F73F7',
          500: '#364EF5',
          600: '#0B28E4',
          700: '#081EAA',
          800: '#061470',
          900: '#030A3A',
          950: '#01051D',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '3rem',
      },
      backgroundImage: {
        gradientdown:
          'radial-gradient(140% 107.13% at 50% 10%, transparent 37.41%, #364ef580 69.27%, #6698ff 100%)',
        gradientup:
          'radial-gradient(131.66% 109.77% at 50% 97.75%, transparent 37.41%, #364ef580 69.27%, #6698ff 100%)',
      },
      boxShadow: {
        thick: '0px 7px 32px rgb(0 0 0 / 35%)',
        inset:
          'inset 6px 84px 79px -40px hsla(0,0%,100%,.025), inset 0 -4px 1px -3px hsla(0,0%,100%,.25), inset 0 4px 1px -3px hsla(0,0%,100%,.25)',
      },
      animation: {
        'fade-in': 'fade-in 0.5s linear forwards',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
export default config
