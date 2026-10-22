This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Emotion-aware Kokoro delivery

ClearVoice Studio can analyze English sentences locally and make conservative per-sentence pacing and pause adjustments for neutral, happy, excited, sad, angry, fearful, surprised, and tender delivery. Enable it from **Voice & Tuning → Emotion-aware delivery** and use the intensity control to keep the effect subtle (the default is `0.70`). The selected Kokoro voice is never substituted or blended.

Turn the setting off to use the exact pre-emotion Kokoro path. This is useful for factual narration, strict timing, or comparing output. The feature adds no dependency or remote service: its sentence splitter and classifier are built into the app, and all synthesis remains on-device with `kokoro-js` (Apache-2.0).

The installed `kokoro-js` API accepts voice IDs and speed only; it does not provide a supported public style-tensor input. For that reason the app intentionally does not emulate voice blending in a way that could change accent, gender, or voice quality unexpectedly.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
