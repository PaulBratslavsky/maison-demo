import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1c1c1c',
        ivory: '#f7f4ee',
        gold: '#b89b5e',
        mist: '#8a8a8a',
      },
      fontFamily: {
        // Self-hosted from @fontsource (app/layout.tsx), so nothing is downloaded at build or run time.
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Hiragino Sans"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      screens: {
        // The stage laptop: a wide screen with a mouse or trackpad, where the app sits in a phone-sized frame
        // (components/phone-frame.tsx). A phone in landscape is wide too, but has no fine pointer, so it stays full screen.
        stage: { raw: '(min-width: 500px) and (hover: hover) and (pointer: fine)' },
      },
    },
  },
  plugins: [],
} satisfies Config;
