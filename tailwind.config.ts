import type { Config } from 'tailwindcss';

export default {
  content: ['./entrypoints/popup/**/*.{tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        myanmar: ['Noto Sans Myanmar', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
