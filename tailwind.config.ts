import type { Config } from 'tailwindcss';

export default {
  content: ['./entrypoints/popup/**/*.{tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        myanmar: ['Padauk', 'Noto Sans Myanmar', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
