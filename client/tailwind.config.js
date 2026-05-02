/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#10b981',
        'primary-dark': '#059669',
        surface: '#1e293b',
        'surface-light': '#334155',
        bg: '#0f172a',
      },
    },
  },
  plugins: [],
};
