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

## FAQ

**Q.** _What happened to the old version of Pretzel AI - the visual, in-browser data manipulation tool?_

**A.** It's available in the [`pretzelai_visual` folder here](https://github.com/pretzelai/pretzelai/tree/main/pretzelai_visual). Please see [this PR](https://github.com/pretzelai/pretzelai/pull/76) for more info.

**Q.** _What AI model does Pretzel use?_

**A.** We currently use GPT-4o and it's been good so far. We will keep experimenting with the model, prompts and parameters to keep improving the code-gen experience.

**Q.** _What about feature X?_

**A.** There's a ton we want to build. Please [open an issue](https://github.com/pretzelai/pretzelai/issues) and tell us what you want us to build!

**Q.** _Where's the roadmap?_

**A.** There's so many features we'd like to build! But, there's just two of us and so, we're collecting feedback about what would be most helpful. As a result, we don't have a concrete roadmap just yet. We'd love your help with this! Please open an issue or just send us an email with your feedback!

**Q.** _What's the deal with the license?_

**A.** Our goal with building Pretzel is to make an amazing data tool that free for both individuals and companies to use. That said, we are a 2 person startup - and we don't want
some third party to just take our code and sell a hosted version of it without giving back to the community. Jupyter code is licensed as BSD-3 and if we keep our new code BSD-3 licensed, there would be no way to stop a company from doing this. As a result, we went with the AGPLv3 license for all the new code. This ensures that if someone else does want
to take our code and sell it, they have to open-source all of their modifications under AGPLv3 as well.

**Q.** _Why a fork of Jupyter? Why not contribute into Jupyter directly?_

**A.** This deserves a longer answer but here's the short answer: We've set out to make the de-facto, modern, open-source data tool. Initially, we wanted to start from scratch. However, after talking to several data professionals, we realized it will be very hard to get people to switch to a new tool, no matter how good. The best way to get people to switch is to not have them switch at all. That's why we decided to fork Jupyter - for the near zero switching costs. Also, Jupyter is a mature product and we're shipping feature really fast - frankly, at the pace we're shipping features, the code we write won't be accepted in the Jupyter codebase. There are also many downsides to this decision - we've had to spend considerable time understanding the whole Jupyter ecosystem and multiple codebases, the complex release processes, the various APIs etc. However, we think this is the right decision for us.

**Q.** _My company is worried about using an AGPLv3 licensed tool. What can I do?_

**A.** The AGPL specified that ONLY IF you're modifying Pretzel AND redistributing it to the public, then you need to share the modified code. If you're simply using it as a tool in your company (even with modifications), the AGPL DOES NOT ask you to share your code. Still, if AGPL is an issue for you, please contact us and we can figure out what works.

**Q.** _I'm worried about a "rug-pull" - that you will re-license the code to be under a paid license in the future? OR, how are you planning on making money?_

**A.** We're planning on selling a hosted version of the tool to companies to make money. This hosted version will probably have some company specific features that individuals don't want or need such as data access controls, connectors for data sources, integration with GitHub, hosted and shareable dashboard, scalable compute for large jobs etc. We will not retroactively make Pretzel's individual version paid.
