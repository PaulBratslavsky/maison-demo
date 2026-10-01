import type { Config } from 'tailwindcss';

// The black-and-white design: the approved mockup's colours. Rules and borders are hairline unless a class says ink.
const colors = {
  paper: '#ffffff',
  ink: '#0a0a0a',
  graphite: '#555555', // secondary text
  mist: '#737373', // captions: 4.6:1 on white
  hairline: '#e7e7e7', // rules and borders
  wash: '#f4f4f4', // image placeholders and quiet surfaces
  error: '#b42318', // a readable red on white
};

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    // No rounded corners and no shadows: only `rounded-none` and `shadow-none` exist, so a stray `rounded-lg` or
    // `shadow-md` draws nothing. (The booking sheet's grab handle, the one rounded thing allowed, can take an arbitrary
    // value.)
    borderRadius: { none: '0px' },
    boxShadow: { none: 'none' },
    // Self-hosted from @fontsource (app/layout.tsx), so nothing comes from a CDN: the app works inside LINE and offline
    // on stage. Jost for everything Latin, Zen Kaku Gothic New for Japanese. There's no serif: `font-serif` draws
    // nothing, so the text stays in Jost.
    fontFamily: {
      sans: ['Jost', '"Zen Kaku Gothic New"', '"Hiragino Sans"', 'system-ui', 'sans-serif'],
      // Tool names and the agent view's log. Japanese in them (an argument, a note) takes the app's Japanese face.
      mono: ['ui-monospace', '"SF Mono"', 'Menlo', '"Zen Kaku Gothic New"', 'monospace'],
    },
    extend: {
      colors,
      borderColor: { DEFAULT: colors.hairline },
      // The type scale, from the mockup: [size, { lineHeight, letterSpacing, fontWeight }].
      fontSize: {
        wordmark: ['17px', { lineHeight: '1', letterSpacing: '0.42em', fontWeight: '500' }],
        nav: ['11px', { lineHeight: '1.4', letterSpacing: '0.14em' }], // the header's link and EN/JA
        eyebrow: ['11px', { lineHeight: '1.4', letterSpacing: '0.18em' }], // eyebrows and labels
        button: ['12px', { lineHeight: '1', letterSpacing: '0.2em', fontWeight: '500' }],
        body: ['14px', { lineHeight: '1.6' }],
        title: ['24px', { lineHeight: '1.25', letterSpacing: '0.01em', fontWeight: '400' }], // a product's name
        headline: ['31px', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '300' }], // a page's headline
      },
      screens: {
        // The stage laptop: a wide screen with a mouse or trackpad, where the app sits in a phone-sized frame
        // (components/phone-frame.tsx). A phone in landscape is wide too, but has no fine pointer, so it stays full screen.
        stage: { raw: '(min-width: 500px) and (hover: hover) and (pointer: fine)' },
        // A phone turned to landscape: at least 500 px wide, as app/globals.css has it, and under 500 px high. The concierge
        // hides its suggestion row there once the conversation has begun, so the conversation gets the room. A phone held
        // upright stays under 500 px wide, so its soft keyboard, which can leave a window wider than high, doesn't hide it.
        // (The stage laptop is tall, and keeps it: "Yes, please." is a tap.)
        short: { raw: '(orientation: landscape) and (min-width: 500px) and (max-height: 500px)' },
      },
    },
  },
  plugins: [],
} satisfies Config;
