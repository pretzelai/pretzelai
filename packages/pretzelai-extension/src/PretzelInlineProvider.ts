import {
  CompletionHandler,
  IInlineCompletionContext,
  IInlineCompletionItem,
  IInlineCompletionList,
  IInlineCompletionProvider
} from '@jupyterlab/completer';
import { INotebookTracker } from '@jupyterlab/notebook';
import { OpenAI } from 'openai';
const openai = new OpenAI({
  apiKey: '',
  dangerouslyAllowBrowser: true
});

export class PretzelInlineProvider implements IInlineCompletionProvider {
  constructor(protected notebookTracker: INotebookTracker) {
    this.notebookTracker = notebookTracker;
  }
  readonly identifier = '@pretzelai/inline-completer';
  readonly name = 'Pretzel AI inline completion';
  private debounceTimer: any;

  private _prefixFromRequest(request: CompletionHandler.IRequest): string {
    const currentCellIndex = this.notebookTracker?.currentWidget?.model!.sharedModel.cells.findIndex(
      cell => cell.id === this.notebookTracker?.activeCell?.model.sharedModel.id
    );

    const previousCells = this.notebookTracker?.currentWidget?.model!.sharedModel.cells.slice(0, currentCellIndex);
    const prevCode = previousCells?.map((cell, i) => cell.source).join('\n');
    let prefix = request.text.slice(0, request.offset);
    if (prevCode && previousCells) {
      prefix = prevCode + '\n' + prefix;
    }
    return prefix;
  }

  private _suffixFromRequest(request: CompletionHandler.IRequest): string {
    return request.text.slice(request.offset);
  }

  private _fixCompletion({
    completion,
    prefix,
    suffix
  }: {
    completion: string;
    prefix: string;
    suffix: string;
  }): string {
    // remove backticks
    if (completion.startsWith('```python')) {
      if (completion.endsWith('```')) {
        completion = completion.slice(9, -3);
      } else if (completion.endsWith('```\n')) {
        completion = completion.slice(9, -4);
      }
    }
    // OpenAI sometimes includes the prefix in the completion
    const prefixLastLine = prefix.split('\n').slice(-1)[0];
    if (completion.startsWith(prefixLastLine)) {
      completion = completion.slice(prefixLastLine.length);
    }
    const completionLines = completion.split('\n');
    const completionLastLine = completionLines.slice(-1)[0];
    if (completionLines.length === 2 && completionLines[1] === '\n' && completionLastLine.startsWith(prefixLastLine)) {
      completion = completionLastLine.slice(prefixLastLine.length);
    }
    // Don't return empty
    if (completion.trim().length <= 0) {
      return '';
    }
    // Remove trailing whitespace
    completion = completion.trimEnd();
    // Codestral sometimes starts with an extra space
    // Check that there is only 1 extra space and no comment line
    if (completion[0] === ' ' && ![' ', '#'].includes(completion[1])) {
      // check if there are spaces before completion
      if (prefix.endsWith(' ')) {
        // remove 1 extra space from all completion lines (codestral bug)
        completion = completion
          .split('\n')
          .map(line => {
            if (line[0] === ' ') {
              return line.slice(1);
            }
            return line;
          })
          .join('\n');
      }
    }
    // Sometime extra space is added before comment line but the rest of indentation is OK
    if (completion[0] === ' ' && completion[1] === '#') {
      if (prefix.endsWith(' ')) {
        completion = completion.slice(1);
      }
    }
    console.log('completion', completion);
    return completion;
  }

  private _isMultiLine(prefix: string): boolean {
    const currentLine = prefix.split('\n').slice(-1)[0];
    const prevLine = prefix.split('\n').slice(-2)[0];

    // If prev line is a function definition, multiline
    if ([':'].includes(prevLine?.trim().slice(-1)[0])) {
      return true;
    }
    // If prev line is a comment, multiline
    if (prevLine?.trimStart().startsWith('#')) {
      return true;
    }
    // If current line is comment, no multiline
    if (currentLine?.trimStart().startsWith('#')) {
      return false;
    }
    // No multiline when defining functions, classes, conditions, etc
    if (currentLine?.trimStart().startsWith('class')) {
      return false;
    }
    if (currentLine?.trimStart().startsWith('def')) {
      return false;
    }
    if (currentLine?.trimStart().startsWith('if')) {
      return false;
    }
    if (currentLine?.trimStart().startsWith('for')) {
      return false;
    }
    if (currentLine?.trimStart().startsWith('while')) {
      return false;
    }
    if (currentLine?.trimStart().startsWith('with')) {
      return false;
    }
    if (currentLine?.trimStart().startsWith('try')) {
      return false;
    }
    if (currentLine?.trimStart().startsWith('except')) {
      return false;
    }
    if (currentLine?.trimStart().startsWith('raise')) {
      return false;
    }
    return true;
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ): Promise<IInlineCompletionList<IInlineCompletionItem>> {
    clearTimeout(this.debounceTimer);
    return new Promise(resolve => {
      this.debounceTimer = setTimeout(async () => {
        const prompt = this._prefixFromRequest(request);
        const suffix = this._suffixFromRequest(request);
        const stops = ['\ndef', '\nclass'];
        if (this._isMultiLine(prompt)) {
          stops.push('\n\n');
        } else {
          stops.push('\n');
        }
        try {
          const fetchPromise = fetch('https://api.pretzelai.app/inline', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({
              prompt,
              suffix,
              // eslint-disable-next-line
              max_tokens: 500,
              stop: stops
            })
          }).then(response => response.json());

          const openaiPromise = openai.chat.completions
            .create({
              model: 'gpt-4o',
              // stop: stops,
              messages: [
                {
                  role: 'system',
                  content: 'You are a staff software engineer'
                },
                {
                  role: 'user',
                  content: `\`\`\`python
${prompt}[BLANK]${suffix}
\`\`\`

Fill in the blank to complete the code block. Your response should include only the code to replace [BLANK], without surrounding backticks.`
                }
              ]
            })
            .then(completion => completion.choices[0].message.content);

          const [codestralCompletion, openaiCompletion] = await Promise.all([fetchPromise, openaiPromise]);

          resolve({
            items: [
              {
                insertText: this._fixCompletion({
                  completion: (await codestralCompletion).completion,
                  prefix: prompt,
                  suffix
                })
              },
              {
                insertText: this._fixCompletion({
                  completion: openaiCompletion as string,
                  prefix: prompt,
                  suffix
                })
              }
            ]
          });
        } catch (error) {
          console.error('Error:', error);
          resolve({
            items: []
          });
        }
      }, 1000);
    });
  }
}
