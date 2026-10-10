/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        category: {
          recruitment: {
            DEFAULT: '#2563eb',
            light: '#dbeafe',
            dark: '#1e40af',
            bg: '#eff6ff',
          },
          hackathon: {
            DEFAULT: '#9333ea',
            light: '#f3e8ff',
            dark: '#6b21a8',
            bg: '#faf5ff',
          },
          workshop: {
            DEFAULT: '#059669',
            light: '#d1fae5',
            dark: '#065f46',
            bg: '#ecfdf5',
          },
          exam: {
            DEFAULT: '#e11d48',
            light: '#ffe4e6',
            dark: '#9f1239',
            bg: '#fff1f2',
          },
          club: {
            DEFAULT: '#d97706',
            light: '#fef3c7',
            dark: '#92400e',
            bg: '#fffbeb',
          },
          class: {
            DEFAULT: '#0891b2',
            light: '#cffafe',
            dark: '#155e75',
            bg: '#ecfeff',
          },
          personal: {
            DEFAULT: '#db2777',
            light: '#fce7f3',
            dark: '#9d174d',
            bg: '#fdf2f8',
          },
          other: {
            DEFAULT: '#64748b',
            light: '#f1f5f9',
            dark: '#334155',
            bg: '#f8fafc',
          },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'bounce-dots': 'bounceDots 1.4s infinite ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        bounceDots: {
          '0%, 80%, 100%': { transform: 'scale(0)' },
          '40%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
