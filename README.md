# Pretzel

[![License](https://img.shields.io/github/license/pretzelai/pretzelai)](https://github.com/pretzelai/pretzelai/blob/main/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/pretzelai/pretzelai?style=social)](https://github.com/pretzelai/pretzelai)

Live deployed build: [https://pretzelai.github.io](https://pretzelai.github.io)

Pretzel is an open-source, offline browser-based tool for fast and intuitive data exploration and visualization. It can handle large data files, runs locally in your browser, and requires no backend setup. You can easily manipulate data without the limitations of traditional spreadsheet software.

![demo.gif](https://github.com/pretzelai/pretzelai/assets/121360087/e7f20a16-b19c-4a29-b468-88d42eaa9b43)

## Features

- 🚀 Blazing-fast performance with WebAssembly-based [DuckDB](https://duckdb.org/) and [PRQL](https://prql-lang.org/)
- 🔍 Intuitive data exploration with a visual, top-down pipeline of data transformations and visualizations
- 🧠 AI-powered transformation block to simplify data manipulation
- 🔒 Privacy-first design: run Pretzel AI locally or host it yourself for full control over your data
- 📊 Upcoming features: save workflows as PRQL files and share privacy-first URLs without leaking data


## Table of Contents

- [Getting started](#getting-started)
  - [Easiest way](#easiest-way)
  - [Offline standalone app](#offline-standalone-app)
  - [Developers](#developers)
    - [Run locally](#run-locally)
    - [Host Pretzel](#host-pretzel)
- [Optional Configuration](#optional-configuration)
- [Implemented Transformation Blocks](#implemented-transformation-blocks)

## Getting Started

### Easiest way

The easiest way to use Pretzel is to visit [https://pretzelai.github.io](https://pretzelai.github.io)

### Offline standalone app

Since Pretzel doesn't have a backend you can easily install it as a Chrome app and it will work even without internet (for those long flights!)

1. Visit [https://pretzelai.github.io](https://pretzelai.github.io) in Chrome

2. Click the install app icon
<img width="521" alt="pretzel_chrome_install" src="https://github.com/pretzelai/pretzelai/assets/121360087/c6276699-5109-4e59-8bf5-2858c51cb4c3">

3. Now you can launch Pretzel as a standalone app. It will also work offline, it may error if you try to use some internet feature (like the AI Block), just close it and open it again to fix it
<img width="268" alt="pretzel_app_icon" src="https://github.com/pretzelai/pretzelai/assets/121360087/cc13e552-d93a-4990-be22-1f6b5d906b15">


### Developers

#### Run locally

To run Pretzel locally, follow these steps:

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

#### Host Pretzel

To host Pretzel, follow these steps (it's just a static website!):

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
- **Sort**: sorts ascending or descending
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
