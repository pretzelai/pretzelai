import {
  CompletionHandler,
  IInlineCompletionContext,
  IInlineCompletionItem,
  IInlineCompletionList,
  IInlineCompletionProvider
} from '@jupyterlab/completer';

export class PretzelInlineProvider implements IInlineCompletionProvider {
  readonly identifier = '@pretzelai/inline-completer';
  readonly name = 'Pretzel AI inline completion';
  private debounceTimer: any;

  private _prefixFromRequest(request: CompletionHandler.IRequest): string {
    return request.text.slice(0, request.offset);
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
    // Don't return empty
    if (completion.trim().length <= 0) {
      return '';
    }
    // Remove trailing whitespace
    completion = completion.trimEnd();
    // Codestral sometimes starts with an extra space
    if (completion[0] === ' ' && completion[1] !== ' ') {
      if (prefix.endsWith(' ')) {
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
    return completion;
  }

  private _isMultiLine(prefix: string): boolean {
    if ([':'].includes(prefix.split('\n').slice(-2)[0]?.trim().slice(-1)[0])) {
      return true;
    }
    // Not multiline in comments
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('#')) {
      return false;
    }
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('class')) {
      return false;
    }
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('def')) {
      return false;
    }
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('if')) {
      return false;
    }
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('for')) {
      return false;
    }
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('while')) {
      return false;
    }
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('with')) {
      return false;
    }
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('try')) {
      return false;
    }
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('except')) {
      return false;
    }
    if (prefix.split('\n').slice(-1)[0]?.trimStart().startsWith('raise')) {
      return false;
    }
    if (!prefix.split('\n').slice(-1)[0]?.trimStart()) {
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
          const response = await fetch('https://api.pretzelai.app/inline', {
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

          const data = await response.json();
          resolve({
            items: [
              {
                insertText: this._fixCompletion({
                  completion: data.completion,
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
