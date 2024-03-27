# 🥨 Pretzel

[![License](https://img.shields.io/github/license/pretzelai/pretzelai)](https://github.com/pretzelai/pretzelai/blob/main/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/pretzelai/pretzelai?style=social)](https://github.com/pretzelai/pretzelai)

Live deployed build: [https://pretzelai.github.io](https://pretzelai.github.io)

Pretzel is an open-source, offline browser-based tool for fast and intuitive data exploration and visualization. It can handle large data files, runs locally in your browser, and requires no backend setup. Pretzel makes it easy to manipulate data via visual chained data transform blocks. It's also reactive - changing a transform block in the chain automatically updates all transform blocks, and charts that follow.

![demo.gif](https://github.com/pretzelai/pretzelai/assets/121360087/e7f20a16-b19c-4a29-b468-88d42eaa9b43)

## Features

- 🚀 Blazing-fast performance with WebAssembly-based [DuckDB](https://duckdb.org/) and [PRQL](https://prql-lang.org/)
- 🔍 Intuitive data exploration with a visual, top-down pipeline of data transformations and visualizations
- 🧠 AI-powered transformation block to help with fast data manipulation
- 🔒 Privacy-first design: run Pretzel AI locally or host it yourself for full control over your data
- 📊 Upcoming features: Local LLM support, API calls, in-browser Python support with [Pyodide](https://github.com/pyodide/pyodide), save and share workflows securely and canvas-based table rendering

## Table of Contents

- [Demo video](#demo-video)
- [Getting started](#getting-started)
  - [Website (Easiest)](#website-easiest)
  - [Offline standalone app](#offline-standalone-app)
  - [Developers](#developers)
    - [Run locally](#run-locally)
    - [Host Pretzel](#host-pretzel)
- [Optional Configuration](#optional-configuration)
- [Implemented Transformation Blocks](#implemented-transformation-blocks)
- [Known Bugs](#known-bugs)
- [Contact](#contact)

## Demo video

https://github.com/pretzelai/pretzelai/assets/161899563/cb5b0f00-4add-40e8-b0c8-f59a0186e3ff

## Getting Started

### Website (Easiest)

The easiest way to use Pretzel is to visit [https://pretzelai.github.io](https://pretzelai.github.io)

### Offline standalone app

Since Pretzel doesn't have a backend, you can easily install it as a Chrome app and it will work even without internet (for those long flights!)

1. Visit [https://pretzelai.github.io](https://pretzelai.github.io) in Chrome

2. Click the install app icon
<img width="521" alt="pretzel_chrome_install" src="https://github.com/pretzelai/pretzelai/assets/121360087/c6276699-5109-4e59-8bf5-2858c51cb4c3">

3. Now you can launch Pretzel as a standalone app. It will also work offline, though it may error if you try to use some internet feature (like the AI Block). Just close it and open it again to fix it.
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

2. Upload the contents of the `dist` folder to your hosting. This is what you can find live at [https://pretzelai.github.io](https://pretzelai.github.io)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## Optional configuration

- Bug report box: Update `/src/lib/config.ts` with your PostHog config to let users report bugs directly on the website
- AI Endpoint: Deploy a cloud function to provide an AI endpoint for users without an OpenAI API key. Check the `cloud` folder for instructions.

## Implemented transformation blocks

- **Upload:** accepts CSV / Excel (XLSX) files
- **Filter**: string/number/date filtering including nested filters
- **Ask AI**: connects to OpenAI to transform user command to SQL
- **Pivot**: to create a pivot table (you can also go group-by using this - only use the `Rows` and `Values` fields)
- **Sort**: sorts ascending or descending on multiple columns
- **Chart**: supports line (including multi-line) charts, bar charts (grouped and stacked) and scatter plot
- **Create column**: make a new column with basic math or use [PRQL functions](https://prql-lang.org/book/reference/declarations/functions.html)
- **Remove columns**: easily add/remove columns with visual toggles
- **Table**: add a table in the middle of your workflow to visualize data in a intermediate step
- **Download**: export your transformed data in CSV

## Known Bugs

- Dates are sometimes parsed incorrectly - existing GH issue [here](https://github.com/pretzelai/pretzelai/issues/23)
- Table panel is slow for large datasets. We're planning on moving to a canvas-based table.
- [Rare] Charts axes can sometimes not be ordered correctly

Please report any bugs you find in [GitHub issues](https://github.com/pretzelai/pretzelai). 

## Contact

You can email us at founders [at] withpretzel [dot] com.

We also read all the feedback and bugs you report at the top left of [https://pretzelai.github.io](https://pretzelai.github.io)
