# Pretzel Data

We’ve built a tool for point-and-click data exploration and visualization. It’s open-source, runs locally in your browser and can handle large data files.

Demo video
[![Demo Video](https://img.youtube.com/vi/73wNEun_L7w/0.jpg)](https://youtu.be/73wNEun_L7w)


Live demo at [https://pretzelai.github.io](https://pretzelai.github.io)

Tech Stack: DuckDB, PRQL, TypeScript, React, Shadcn, OpenAI

## Developer experience

Develop locally by `npm run start`

Deploy by just running `npm run build` and uploading the contents of the `build` folder to your hosting.

## Configuration

- (optional) PostHog: update `/srs/lib/config.ts`
- (optional) AI Enpoint: deploy a cloud function so your users don't have to add an OpenAI API key. Check `cloud` folder for instructions.
