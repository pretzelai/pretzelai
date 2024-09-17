/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import {
  CompletionHandler,
  IInlineCompletionContext,
  IInlineCompletionItem,
  IInlineCompletionList,
  IInlineCompletionProvider
} from '@jupyterlab/completer';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PLUGIN_ID, streamAnthropicCompletion } from './utils';
import OpenAI from 'openai';
import { JupyterFrontEnd } from '@jupyterlab/application';
import posthog from 'posthog-js';
import { AzureKeyCredential, OpenAIClient } from '@azure/openai';
import MistralClient from '@mistralai/mistralai';
import { fixInlineCompletion } from './postprocessing';
import Groq from 'groq-sdk';
import { Signal } from '@lumino/signaling';
import { getInlinePrompt } from './prompt';

const DEBOUNCE_TIME = 1000;

export class PretzelInlineProvider implements IInlineCompletionProvider {
  constructor(
    protected notebookTracker: INotebookTracker,
    protected settingRegistry: ISettingRegistry,
    protected app: JupyterFrontEnd
  ) {
    this.notebookTracker = notebookTracker;
    this.settingRegistry = settingRegistry;
    this.app = app;

    this.app.commands.commandExecuted.connect((sender, args) => {
      if (args.id === 'inline-completer:accept') {
        posthog.capture('Tab Completion Accepted');
      }
    });
  }
  readonly identifier = '@pretzelai/inline-completer';
  readonly name = 'Pretzel AI inline completion';
  private debounceTimer: any;
  private abortController: AbortController | null = null;

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

  private _isMultiLine(prefix: string): boolean {
    const currentLine = prefix.split('\n').slice(-1)[0];
    const lines = prefix.split('\n');
    const prevLine = lines.length > 1 ? prefix.split('\n').slice(-2)[0] : '';

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
      if (currentLine?.trimEnd().endsWith('):')) {
        return true;
      }
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
    // If current line is empty, multiline true
    if (currentLine?.trim().length === 0) {
      return true;
    }
    return false;
  }

  public isFetchingChanged = new Signal<this, boolean>(this);

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ): Promise<IInlineCompletionList<IInlineCompletionItem>> {
    // Cancel previous fetch if it exists
    if (this.abortController) {
      this.abortController.abort();
    }

    // Create new AbortController for this fetch
    this.abortController = new AbortController();

    clearTimeout(this.debounceTimer);
    const settings = await this.settingRegistry.load(PLUGIN_ID);
    const pretzelSettingsJSON = settings.get('pretzelSettingsJSON').composite as any;
    const inlineCopilotSettings = pretzelSettingsJSON.features?.inlineCompletion || {};
    const isEnabled = inlineCopilotSettings.enabled ?? false;
    if (!isEnabled) {
      return { items: [] };
    }
    const copilotProvider = inlineCopilotSettings.modelProvider || 'Pretzel AI';
    const copilotModel = inlineCopilotSettings.modelString || 'pretzelai'; // FIXME: use this in code
    const providers = pretzelSettingsJSON.providers || {};
    const mistralSettings = providers['Mistral']?.apiSettings || {};
    const mistralApiKey = mistralSettings?.apiKey?.value || '';
    const openAiSettings = providers['OpenAI']?.apiSettings || {};
    const openAiApiKey = openAiSettings?.apiKey?.value || '';
    const azureSettings = providers['Azure']?.apiSettings || {};
    const azureApiKey = azureSettings?.apiKey?.value || '';
    const azureBaseUrl = azureSettings?.baseUrl?.value || '';
    const azureDeploymentName = azureSettings?.deploymentName?.value || '';
    const anthropicSettings = providers['Anthropic']?.apiSettings || {};
    const anthropicApiKey = anthropicSettings?.apiKey?.value || '';
    const ollamaBaseUrl = providers['Ollama']?.apiSettings?.baseUrl?.value || '';
    const groqApiKey = providers['Groq']?.apiSettings?.apiKey?.value || '';

    return new Promise(resolve => {
      this.debounceTimer = setTimeout(async () => {
        this.isFetchingChanged.emit(true);

        let prompt = this._prefixFromRequest(request);

        const suffix = this._suffixFromRequest(request);

        const stops = ['\ndef', '\nclass'];
        if (this._isMultiLine(prompt)) {
          stops.push('\n\n');
        } else {
          stops.push('\n');
        }

        // Don't trigger completion if empty line and first line of notebook
        if (!prompt && !suffix) {
          resolve({
            items: []
          });
          this.isFetchingChanged.emit(false);
          return;
        }

        // Hardcoded completion without AI for first line of notebook
        // TODO: We can add more hardcoded imports for common libraries
        if (prompt.indexOf('\n') === -1 && !suffix && 'import pandas as pd'.startsWith(prompt)) {
          resolve({
            items: [
              {
                insertText: 'import pandas as pd'.slice(prompt.length)
              }
            ]
          });
          // Spinner will not show because it emits false before the UI can react
          this.isFetchingChanged.emit(false);
          return;
        }

        prompt = `# python code for jupyter notebook\n\n${prompt}`;

        try {
          let completion;
          if (copilotProvider === 'Pretzel AI') {
            const fetchResponse = await fetch('https://api.pretzelai.app/inline_v2', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
              },
              body: JSON.stringify({
                prompt,
                suffix,
                max_tokens: 500,
                stop: stops
              }),
              signal: this.abortController?.signal // Add abort signal to fetch
            });
            completion = (await fetchResponse.json()).completion;
          } else if (copilotProvider === 'OpenAI' && openAiApiKey) {
            const openai = new OpenAI({ apiKey: openAiApiKey, dangerouslyAllowBrowser: true });
            const openaiResponse = await openai.chat.completions.create(
              {
                model: copilotModel,
                stop: stops,
                max_tokens: this._isMultiLine(prompt) ? 500 : 100,
                messages: [
                  {
                    role: 'system',
                    content: 'You are a staff software engineer'
                  },
                  {
                    role: 'user',
                    content: getInlinePrompt(prompt, suffix)
                  }
                ]
              },
              {
                signal: this.abortController?.signal
              }
            );
            completion = openaiResponse.choices[0].message.content;
          } else if (copilotProvider === 'Mistral' && mistralApiKey) {
            // FIXME: Allow for newer model types
            if (copilotModel === 'codestral-latest') {
              const data = await fetch('https://api.mistral.ai/v1/fim/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  Authorization: `Bearer ${mistralApiKey}`
                },
                body: JSON.stringify({
                  model: copilotModel,
                  prompt,
                  suffix,
                  stop: stops,
                  max_tokens: 500,
                  temperature: 0
                })
              });
              // Note: Response parsing might not work as expected due to 'no-cors' mode, which can lead to an opaque response.
              completion = (await data.json()).choices[0].message.content;
            } else {
              const mistral = new MistralClient(mistralApiKey);
              const mistralResponse = await mistral.chat({
                model: copilotModel,
                messages: [
                  {
                    role: 'system',
                    content: 'You are a staff software engineer'
                  },
                  {
                    role: 'user',
                    content: getInlinePrompt(prompt, suffix)
                  }
                ],
                temperature: 0.7,
                topP: 1,
                maxTokens: 500,
                safePrompt: false
              });
              completion = mistralResponse.choices[0].message.content;
            }
          } else if (copilotProvider === 'Azure' && azureApiKey && azureBaseUrl && azureDeploymentName) {
            const client = new OpenAIClient(azureBaseUrl, new AzureKeyCredential(azureApiKey));
            const result = await client.getCompletions(azureDeploymentName, [getInlinePrompt(prompt, suffix)]);
            completion = result.choices[0].text;
          } else if (copilotProvider === 'Anthropic' && anthropicApiKey) {
            const messages = [
              {
                role: 'user',
                content: getInlinePrompt(prompt, suffix)
              }
            ];
            const stream = await streamAnthropicCompletion(anthropicApiKey, messages, copilotModel, 500);
            let completionContent = '';
            for await (const chunk of stream) {
              completionContent += chunk.choices[0].delta.content;
            }
            completion = completionContent.trim();
          } else if (copilotProvider === 'Ollama' && ollamaBaseUrl) {
            const messages = [
              {
                role: 'user',
                content: getInlinePrompt(prompt, suffix)
              }
            ];
            const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: copilotModel,
                messages: messages,
                stream: true
              }),
              signal: this.abortController?.signal
            });
            const reader = response.body!.getReader();
            const decoder = new TextDecoder('utf-8');
            let isReading = true;
            let completionContent = '';
            while (isReading) {
              const { done, value } = await reader.read();
              if (done) {
                isReading = false;
              } else {
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                  if (line.trim() !== '') {
                    const jsonResponse = JSON.parse(line);
                    completionContent += jsonResponse.message?.content || '';
                  }
                }
              }
            }
            completion = completionContent.trim();
          } else if (copilotProvider === 'Groq' && groqApiKey) {
            const groq = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });
            const groqResponse = await groq.chat.completions.create(
              {
                model: copilotModel,
                stop: stops,
                max_tokens: this._isMultiLine(prompt) ? 500 : 100,
                messages: [
                  {
                    role: 'system',
                    content: 'You are a staff software engineer'
                  },
                  {
                    role: 'user',
                    content: getInlinePrompt(prompt, suffix)
                  }
                ]
              },
              {
                signal: this.abortController?.signal
              }
            );
            completion = groqResponse.choices[0].message.content;
          } else {
            completion = '';
          }
          resolve({
            items: [
              {
                insertText: fixInlineCompletion({
                  completion,
                  prefix: prompt,
                  suffix
                })
              }
            ]
          });
        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.log('Fetch aborted');
          } else {
            console.error('Error:', JSON.stringify(error));
          }
          resolve({
            items: []
          });
        } finally {
          this.isFetchingChanged.emit(false);
          this.abortController = null; // Reset the abort controller
        }
      }, DEBOUNCE_TIME);
    });
  }
}
