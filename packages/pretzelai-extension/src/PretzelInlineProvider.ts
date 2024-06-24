import {
  CompletionHandler,
  IInlineCompletionContext,
  IInlineCompletionItem,
  IInlineCompletionList,
  IInlineCompletionProvider
} from '@jupyterlab/completer';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PLUGIN_ID } from './utils';
import OpenAI from 'openai';

export class PretzelInlineProvider implements IInlineCompletionProvider {
  constructor(protected notebookTracker: INotebookTracker, protected settingRegistry: ISettingRegistry) {
    this.notebookTracker = notebookTracker;
    this.settingRegistry = settingRegistry;
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
    // console.log('completion\n', completion);
    // remove backticks
    if (completion.startsWith('```python\n')) {
      if (completion.endsWith('\n```')) {
        completion = completion.slice(10, -4);
      } else if (completion.endsWith('\n```\n')) {
        completion = completion.slice(10, -5);
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
    // Fix extra space when space is already present
    if (
      completion[0] === ' ' &&
      completion[1] !== ' ' &&
      prefix[prefix.length - 1] === ' ' &&
      prefix[prefix.length - 2] !== ' '
    ) {
      completion = completion.slice(1);
    }
    // Sometimes the extra space messes up the indentation
    if (completion[0] === ' ' && completion[1] !== ' ') {
      // check if there are spaces before completion
      if (prefix.endsWith('  ')) {
        const lastLineOfPrefix = prefix.split('\n').slice(-1)[0];
        if (lastLineOfPrefix.trimStart().length === 0) {
          const indentation = lastLineOfPrefix.length;
          completion = completion
            .split('\n')
            .map(line => {
              const spaces = line.length - line.trimStart().length;
              const extraSpaces = spaces % indentation;
              return line.slice(extraSpaces);
            })
            .join('\n');
        }
      }
    }
    // console.log('completionfixed\n', completion);
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
    const settings = await this.settingRegistry.load(PLUGIN_ID);
    const inlineCopilotSettings = settings.get('inlineCopilotSettings').composite as any;
    const isEnabled = inlineCopilotSettings?.enabled;
    if (!isEnabled) {
      return {
        items: []
      };
    }
    const copilotProvider = inlineCopilotSettings?.provider || 'pretzelai';
    const mistralApiKey = inlineCopilotSettings?.mistralApiKey || '';
    const openAiSettings = settings.get('openAiSettings').composite as any;
    const openAiApiKey = openAiSettings?.openAiApiKey || '';

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
          let completion;
          if (copilotProvider === 'Pretzel AI') {
            const fetchResponse = await fetch('https://api.pretzelai.app/inline', {
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
            });
            completion = (await fetchResponse.json()).completion;
          } else if (copilotProvider === 'OpenAI' && openAiApiKey) {
            const openai = new OpenAI({ apiKey: openAiApiKey, dangerouslyAllowBrowser: true });
            const openaiResponse = await openai.chat.completions.create({
              model: 'gpt-4o',
              stop: stops,
              // eslint-disable-next-line
              max_tokens: this._isMultiLine(prompt) ? 500 : 100,
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

Fill in the blank to complete the code block. Your response should include only the code to replace [BLANK], without surrounding backticks. Do not return a linebreak at the beggining of your response.`
                }
              ]
            });
            completion = openaiResponse.choices[0].message.content;
          } else if (copilotProvider === 'Mistral' && mistralApiKey) {
            const data = await fetch('https://api.mistral.ai/v1/fim/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${mistralApiKey}`
              },
              body: JSON.stringify({
                model: 'codestral-latest',
                prompt,
                suffix,
                // eslint-disable-next-line
                max_tokens: 500,
                temperature: 0
              })
            });
            // Note: Response parsing might not work as expected due to 'no-cors' mode, which can lead to an opaque response.
            completion = (await data.json()).choices[0].message.content;
          } else {
            completion = '';
          }

          resolve({
            items: [
              {
                insertText: this._fixCompletion({
                  completion,
                  prefix: prompt,
                  suffix
                })
              }
            ]
          });
        } catch (error: any) {
          console.error('Error:', JSON.stringify(error));
          resolve({
            items: []
          });
        }
      }, 1000);
    });
  }
}
