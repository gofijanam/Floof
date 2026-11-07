/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#0E0818', plum: '#1A0F2E', plum2: '#24163D', ink: '#1B0E2C',
        pink: '#FF5FB8', blue: '#5FD4FF', lav: '#B69CFF', cream: '#FFF4FB',
        mint: '#7CF5C8', peach: '#FFB86B', danger: '#FF6B8B',
      },
      fontFamily: {
        display: ['"Baloo 2"', 'Nunito', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'system-ui', 'sans-serif'],
        num: ['Fredoka', 'Nunito', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem', '5xl': '2.5rem' },
      boxShadow: {
        glowp: '0 0 0 1px rgba(255,95,184,.35), 0 10px 40px -10px rgba(255,95,184,.55)',
        glowb: '0 0 0 1px rgba(95,212,255,.35), 0 10px 40px -10px rgba(95,212,255,.55)',
        card: '0 1px 0 0 rgba(255,244,251,.06) inset, 0 30px 60px -30px rgba(0,0,0,.8)',
      },
    },
  },
  plugins: [],
}
