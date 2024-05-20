# [Pretzel](https://withpretzel.com)

Pretzel is a fork of Jupyter with the goal to improve Jupyter's capabilities.

Switching to Pretzel from Jupyter is extremely easy. We use your existing Jupyter
extensions, settings and keybindings.

We're building features such as:

- Native AI features similar to [Cursor](https://cursor.sh/)
- Frictionless realtime collaboration: pair-programming, comments, version history, etc.
- SQL support (both in code cells and as a standalone SQL IDE)
- Visual analysis builder (see more here)
- VSCode like code-writing experience using [Monaco](https://github.com/microsoft/monaco-editor)
- 1-click dashboard creation from data analysis results
- End-to-end analysis on datasets for non-data folks

## Installation

Just as with Jupyter, you can install Pretzel by using pip:

```
pip install pretzelai
```

If using conda, first install pip with `conda install pip` followed by `pip install pretzelai`.

Then, start Pretzel with:

```
pretzel lab
```

Just as with Jupyter, you should see a URL to access the Pretzel interface.

**Bleeding Edge Version**

Bugs possible. To use the latest version of Pretzel:

- Make sure Node.js is installed and is version 18 or above
- Clone and install the package

```
git clone https://github.com/pretzelai/pretzelai.git
cd pretzelai
pip install .
```

## Configuration

Pretzel comes with out-of-the-box support for a free AI server. You should be able to start using it with no configuration needed.

**OpenAI Support**
You can configure Pretzel to use your own OpenAI API key. To do so:

- Open the `Settings` menu in the top menubar
- Go down to `Settings Editor`, open it and search for `Pretzel` in the search box. Select `Pretzel AI Settings` on the left bar.
- From the `AI Service` dropdown, select `OpenAI API Key` and fill out your API key under `OpenAI Settings > API Key`
- If your company uses OpenAI Enterprise, then you can also enter the base URL for OpenAI call under `OpenAI Settings`

**Azure Support**
Just as with OpenAI settings, you can also use Azure hosted models if you select `Use Azure API` in the `AI Service` dropdown. _We haven't tested this so there may be bugs._

## Usage

- When in a cell, press `Cmd+K` (Mac)/`Ctrl+K` (Windows/Linux) to open AI prompting textbox to write your prompt
  - You can use `@variable` syntax to refer to variables and dataframes in memory. Press "Enter" to submit
- You can accept/reject the response or edit your prompt if you want to re-submit with modifications
- **Support for editing code**
  - If there's existing code in a cell, you can instruct the AI to edit code
  - Selecting some code in a cell only edits the selected code
- **Fix errors with AI**: When there's an error, you'll see a button on top-right "Fix Error with AI"

## Feedback, bugs and docs

- Please report bugs here: https://github.com/pretzelai/pretzelai/issues/
- Have any feedback? Any complains? We'd love feedback: founders@withpretzel.com
- Additional documentation will become available on our website by end of May!

## Jupyter specific information

The original Jupyter documentation is available [here](https://jupyter.org/) and
the Jupyterlab README is available [here](https://github.com/jupyterlab/jupyterlab).
