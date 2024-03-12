# Pretzel Data

Open Source Data manipulation tool that runs in your browser with no backend

Live demo at [https://pretzelai.github.io](https://pretzelai.github.io)

Tech Stack: DuckDB, PRQL, TypeScript, React, Shadcn, OpenAI

## Developer experience

Develop locally by `npm run start`

Deploy by just running `npm run build` and uploading the contents of the `build` folder to your hosting.

## Configuration

- (optional) PostHog: update `/srs/lib/config.ts`
- (optional) AI Enpoint: deploy a cloud function so your users don't have to add an OpenAI API key. Check `cloud` folder for instructions.
