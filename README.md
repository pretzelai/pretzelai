# Pretzel AI

[![License](https://img.shields.io/github/license/pretzelai/pretzelai)](https://github.com/pretzelai/pretzelai/blob/main/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/pretzelai/pretzelai?style=social)](https://github.com/pretzelai/pretzelai)

Live deployed build: [https://pretzelai.github.io](https://pretzelai.github.io)

![Demo GIF](demo.gif)

Pretzel AI is an open-source, browser-based tool for fast and intuitive data exploration and visualization. It can handle large data files, runs locally in your browser, and requires no backend setup. With Pretzel AI, you can easily manipulate data without the limitations of traditional spreadsheet software.

## Features

- 🚀 Blazing-fast performance with WebAssembly-based [DuckDB](https://duckdb.org/) and [PRQL](https://prql-lang.org/)
- 🔍 Intuitive data exploration with a visual, top-down pipeline of data transformations and visualizations
- 🧠 AI-powered transformation block to simplify data manipulation
- 🔒 Privacy-first design: run Pretzel AI locally or host it yourself for full control over your data
- 📊 Upcoming features: save workflows as PRQL files and share privacy-first URLs without leaking data

## Getting Started

To run Pretzel AI locally, follow these steps:

1. Clone the repository:

   ```
   git clone https://github.com/pretzelai/pretzelai.git
   ```

2. Install dependencies:

   ```
   cd pretzelai
   npm install
   ```

3. Start the development server:

   ```
   npm run start
   ```

4. Open your browser and navigate to `http://localhost:3000`

To host Pretzel AI, follow these steps (it's just a static website!):
1. Build the app
```
npm run build
```
2. Upload the contents of the `build` folder to your hosting. This is what you can find live at [https://pretzelai.github.io](https://pretzelai.github.io)

## Optional configuration

- PostHog: Update `/src/lib/config.ts` with your PostHog configuration
- AI Endpoint: Deploy a cloud function to provide an AI endpoint for users without an OpenAI API key. Check the `cloud` folder for instructions.

## Implemented transformation blocks
- **Upload:** accepts CSV / Excel
- **Filter**: string/number filtering and filter grouping
- **Ask AI**: connects to OpenAI to transform user command to SQL
- **Pivot**: to create a pivot table
- **Chart**: support line/bar/scatter
- **Create column**: make a new column with basic math
- **Remove columns**: easily add/remove columns with visual toggles
- **Table**: add a table in the middle of your workflow to visualize data in a intermediate step
- **Download**: export your transformed data in CSV

Transformation blocks demo video:

[![Demo Video](https://img.youtube.com/vi/73wNEun_L7w/0.jpg)](https://youtu.be/73wNEun_L7w)

## Contact

You can email us at founders@withpretzel.com

We read all the feedback and bugs you report at the top left of [https://pretzelai.github.io](https://pretzelai.github.io)