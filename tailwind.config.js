/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        muted: '#64748B',
        hairline: '#E2E8F0',
        canvas: '#F8FAFC',
        accent: {
          DEFAULT: '#059669',
          soft: '#D1FAE5',
          deep: '#047857'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      boxShadow: {
        sheet: '0 -8px 32px rgba(0,0,0,0.12)',
        card: '0 1px 3px rgba(0,0,0,0.06)'
      }
    }
  },
  plugins: []
};
