/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import { INotebookTracker } from '@jupyterlab/notebook';
import { IIOPubMessage } from '@jupyterlab/services/src/kernel/messages';
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { Embedding, generatePrompt, openaiEmbeddings } from './prompt';
import OpenAI from 'openai';
import { AzureKeyCredential, OpenAIClient } from '@azure/openai';
import posthog from 'posthog-js';
import { showErrorDialog } from './components/ErrorDialog';
import MistralClient from '@mistralai/mistralai';
import Groq from 'groq-sdk';
import { IKernelConnection } from '@jupyterlab/services/src/kernel/kernel';
import * as monaco from 'monaco-editor';
import { globalState } from './globalState';

export const PLUGIN_ID = '@jupyterlab/pretzelai-extension:plugin';

export async function calculateHash(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  const dotProduct = vecA.reduce((acc: number, current: number, index: number) => acc + current * vecB[index], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((acc: number, val: number) => acc + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((acc: number, val: number) => acc + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
};

export const isSetsEqual = (xs: Set<any>, ys: Set<any>) => xs.size === ys.size && [...xs].every(x => ys.has(x));

export const getSelectedCode = (notebookTracker: INotebookTracker) => {
  const selection = notebookTracker.activeCell?.editor?.getSelection();
  const cellCode = notebookTracker.activeCell?.model.sharedModel.source;
  let extractedCode = '';
  if (selection && (selection.start.line !== selection.end.line || selection.start.column !== selection.end.column)) {
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const startColumn = selection.start.column;
    const endColumn = selection.end.column;
    for (let i = startLine; i <= endLine; i++) {
      const lineContent = cellCode!.split('\n')[i];
      if (lineContent !== undefined) {
        if (i === startLine && i === endLine) {
          extractedCode += lineContent.substring(startColumn, endColumn);
        } else if (i === startLine) {
          extractedCode += lineContent.substring(startColumn);
        } else if (i === endLine) {
          extractedCode += '\n' + lineContent.substring(0, endColumn);
        } else {
          extractedCode += '\n' + lineContent;
        }
      }
    }
  }
  // also return the selection
  return { extractedCode: extractedCode.trimEnd(), selection };
};

export async function executeCode(kernel: IKernelConnection, code: string): Promise<string | null> {
  const executeRequest = kernel.requestExecute({ code });
  let variableValue: string | null = null;

  kernel.registerMessageHook(executeRequest.msg.header.msg_id, (msg: IIOPubMessage) => {
    if (
      msg.header.msg_type === 'stream' &&
      // @ts-expect-error tserror
      msg.content.name === 'stdout'
    ) {
      // @ts-expect-error tserror
      variableValue = msg.content.text.trim();
    }
    return true;
  });

  const reply = await executeRequest.done;
  if (reply && reply.content.status === 'ok') {
    return variableValue;
  } else {
    console.error('Failed to retrieve variable value');
    return null;
  }
}

export async function getVariableValue(
  variableName: string,
  notebookTracker: INotebookTracker
): Promise<string | null> {
  const notebook = notebookTracker.currentWidget;
  if (notebook && notebook.sessionContext.session?.kernel) {
    const kernel = notebook.sessionContext.session.kernel;
    try {
      return await executeCode(kernel, `print(${variableName})`);
    } catch (error) {
      console.error('Error retrieving variable value:', error);
      return null;
    }
  } else {
    console.error('No active kernel found');
    return null;
  }
}

export async function processTaggedVariables(userInput: string, notebookTracker: INotebookTracker): Promise<string> {
  const { processedInput, varValues } = await processVariables(userInput, notebookTracker);
  const importsCode = processImports(notebookTracker);

  const modifiedUserInput = '*USER INSTRUCTION START*\n' + processedInput + '\n*USER INSTRUCTION END*\n\n';

  let result = modifiedUserInput;

  if (importsCode || varValues) {
    result += `*ADDITIONAL CONTEXT*\n\n`;
    if (importsCode) {
      result += `The following imports are already present in *OTHER CELLS* of the notebook:\n\`\`\`\n${importsCode}\n\`\`\`\n\n`;
    }
    if (varValues) {
      result += `\n${varValues}\n`;
    }
    result += `\n*END ADDITIONAL CONTEXT*\n`;
  }

  return result;
}

export async function processVariables(
  userInput: string,
  notebookTracker: INotebookTracker
): Promise<{ processedInput: string; varValues: string }> {
  const variablePattern = / @([a-zA-Z_][a-zA-Z0-9_]*(\[[^\]]+\]|(\.[a-zA-Z_][a-zA-Z0-9_]*)?)*)[\s,\-]?/g;
  let match;
  let processedInput = userInput;
  let variablesProcessed: string[] = [];
  let varValues = '';

  while ((match = variablePattern.exec(userInput)) !== null) {
    const variableName = match[1];
    if (variablesProcessed.includes(variableName)) {
      continue;
    }
    variablesProcessed.push(variableName);
    try {
      const variableType = await getVariableValue(`type(${variableName})`, notebookTracker);

      if (variableType?.includes('DataFrame')) {
        const variableColumns = await getVariableValue(`${variableName}.columns`, notebookTracker);
        varValues += `\n\`${variableName}\` is a DataFrame with the following columns: \`${variableColumns}\`\n`;
      } else if (variableType) {
        const variableValue = await getVariableValue(variableName, notebookTracker);
        varValues += `\n\`${variableName}\` is a Python variable of type \`${variableType}\` with value \`${variableValue}\`\n`;
      }
      processedInput = processedInput.replace(`@${variableName}`, `\`${variableName}\``);
    } catch (error) {
      console.error(`Error accessing variable ${variableName}:`, error);
    }
  }

  return { processedInput, varValues };
}

export function processImports(notebookTracker: INotebookTracker): string {
  const imports = notebookTracker.currentWidget!.model!.sharedModel.cells.filter(
    cell =>
      cell.id !== notebookTracker.currentWidget!.content.activeCell!.model.id &&
      cell.source.split('\n').some(line => line.includes('import'))
  );
  return imports
    .map(cell =>
      cell.source
        .split('\n')
        .filter(line => line.trim().includes('import'))
        .join('\n')
    )
    .join('\n');
}

export const getAvailableVariables = async (notebookTracker: INotebookTracker): Promise<string[]> => {
  const code = `from IPython import get_ipython;ipython = get_ipython();print(ipython.run_line_magic('who_ls', ''))`;
  const varsToIgnore = ['get_ipython', 'ipython'];
  try {
    const kernel = notebookTracker!.currentWidget!.sessionContext!.session!.kernel!;
    const output = await executeCode(kernel, code);
    if (output) {
      try {
        let variablesArray = JSON.parse(output.replace(/'/g, '"')) as string[];
        variablesArray = variablesArray.filter(variable => !varsToIgnore.includes(variable));
        return variablesArray;
      } catch (error) {
        console.error('Error parsing output:', error);
        return [];
      }
    } else {
      console.warn('No output received from kernel');
      return [];
    }
  } catch (error) {
    console.error('Error executing code:', error);
    return [];
  }
};

export const PRETZEL_FOLDER = '.pretzel';

export async function createAndSaveEmbeddings(
  existingEmbeddingsJSON: Embedding[],
  cells: any[],
  path: string,
  app: JupyterFrontEnd,
  aiClient: OpenAI | OpenAIClient | MistralClient | null,
  aiChatModelProvider: string
): Promise<Embedding[]> {
  let embeddings = existingEmbeddingsJSON;
  const newEmbeddingsArray: Embedding[] = [];
  const promises = cells
    .filter(cell => cell.source.trim() !== '') // Filter out empty cells
    .map(cell => {
      return (async () => {
        const index = embeddings.findIndex(e => e.id === cell.id);
        if (index !== -1) {
          const hash = await calculateHash(cell.source);
          if (hash !== embeddings[index].hash) {
            try {
              const response = await openaiEmbeddings(cell.source, aiChatModelProvider, aiClient);
              newEmbeddingsArray.push({
                id: cell.id,
                source: cell.source,
                hash,
                embedding: response.data[0].embedding
              });
            } catch (error) {
              console.error('Error generating embedding:', error);
            }
          } else {
            newEmbeddingsArray.push(embeddings[index]);
          }
        } else {
          try {
            const response = await openaiEmbeddings(cell.source, aiChatModelProvider, aiClient);
            const hash = await calculateHash(cell.source);
            newEmbeddingsArray.push({
              id: cell.id,
              source: cell.source,
              hash,
              embedding: response.data[0].embedding
            });
          } catch (error) {
            console.error('Error generating embedding:', error);
          }
        }
      })();
    });
  await Promise.allSettled(promises);
  const oldSet = new Set(embeddings.map(e => e.hash));
  const newSet = new Set(newEmbeddingsArray.map(e => e.hash));

  // if new embeddings are different, save them to the file
  if (!isSetsEqual(oldSet, newSet)) {
    app.serviceManager.contents.save(path, {
      type: 'file',
      format: 'text',
      content: JSON.stringify(newEmbeddingsArray)
    });
  }

  // and return the new embeddings
  return newEmbeddingsArray;
}

export async function getEmbeddings(
  notebookTracker: INotebookTracker,
  app: JupyterFrontEnd,
  aiClient: OpenAI | OpenAIClient | MistralClient | null,
  aiChatModelProvider: string
): Promise<Embedding[]> {
  const notebook = notebookTracker.currentWidget;
  let embeddings: Embedding[] = [];
  if (notebook?.model) {
    const currentNotebookPath = notebook.context.path;
    const notebookName = currentNotebookPath.split('/').pop()!.replace('.ipynb', '');
    const currentDir = currentNotebookPath.substring(0, currentNotebookPath.lastIndexOf('/'));
    const embeddingsPath = currentDir + '/' + PRETZEL_FOLDER + '/' + notebookName + '_embeddings.json';
    const newDirPath = currentDir + '/' + PRETZEL_FOLDER;

    // check if file exists via ServerConnection
    const requestUrl = URLExt.join(app.serviceManager.serverSettings.baseUrl, 'api/contents', embeddingsPath);
    const response = await ServerConnection.makeRequest(
      requestUrl,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      app.serviceManager.serverSettings
    );
    if (response.ok) {
      const file = await app.serviceManager.contents.get(embeddingsPath);
      try {
        const existingEmbeddingsJSON = JSON.parse(file.content);
        embeddings = await createAndSaveEmbeddings(
          existingEmbeddingsJSON,
          notebook!.model!.sharedModel.cells,
          embeddingsPath,
          app,
          aiClient,
          aiChatModelProvider
        );
      } catch (error) {
        console.error('Error parsing embeddings JSON:', error);
      }
    } else {
      // create directory. if already exists, this code does nothing
      const requestUrl = URLExt.join(
        app.serviceManager.serverSettings.baseUrl,
        'api/contents',
        encodeURIComponent(newDirPath)
      );
      const init = {
        method: 'PUT',
        body: JSON.stringify({ type: 'directory', path: newDirPath }),
        headers: { 'Content-Type': 'application/json' }
      };

      // create embeddings file which will be used in the next call of this function
      try {
        const response = await ServerConnection.makeRequest(requestUrl, init, app.serviceManager.serverSettings);
        if (!response.ok) {
          throw new Error(`Error creating directory: ${response}`);
        }
        await app.serviceManager.contents.save(embeddingsPath, {
          type: 'file',
          format: 'text',
          content: JSON.stringify([])
        });
      } catch (error) {
        console.error('Error creating embeddings:', error);
      }
    }
  } else {
    setTimeout(() => getEmbeddings(notebookTracker, app, aiClient, aiChatModelProvider), 1000);
  }
  return embeddings;
}

export const readEmbeddings = async (
  notebookTracker: INotebookTracker,
  app: JupyterFrontEnd,
  aiClient: OpenAI | OpenAIClient | MistralClient | null,
  aiChatModelProvider: string
): Promise<Embedding[]> => {
  const notebook = notebookTracker.currentWidget;
  const currentNotebookPath = notebook!.context.path;
  const notebookName = currentNotebookPath.split('/').pop()!.replace('.ipynb', '');
  const currentDir = currentNotebookPath.substring(0, currentNotebookPath.lastIndexOf('/'));
  const embeddingsPath = currentDir + '/' + PRETZEL_FOLDER + '/' + notebookName + '_embeddings.json';
  try {
    const file = await app.serviceManager.contents.get(embeddingsPath);
    return JSON.parse(file.content);
  } catch (error) {
    await getEmbeddings(notebookTracker, app, aiClient, aiChatModelProvider);
    return await readEmbeddings(notebookTracker, app, aiClient, aiChatModelProvider);
  }
};

export const getTopSimilarities = async (
  userInput: string,
  embeddings: Embedding[],
  numberOfSimilarities: number,
  aiClient: OpenAI | OpenAIClient | MistralClient | null,
  aiChatModelProvider: string,
  cellId: string,
  codeMatchThreshold: number
): Promise<string[]> => {
  let response;
  try {
    response = await openaiEmbeddings(userInput, aiChatModelProvider, aiClient);
  } catch (error: any) {
    // Catching OpenAI errors here since this function is called for all prompts
    showErrorDialog(`${aiChatModelProvider}: Error connecting`, error?.error?.message || JSON.stringify(error));
    throw error;
  }
  const userInputEmbedding = response.data[0].embedding; // same API for openai and azure
  const similarities = embeddings
    .filter(embedding => embedding.id !== cellId) // Exclude current cell's embedding
    .map((embedding, index) => ({
      value: cosineSimilarity(embedding.embedding, userInputEmbedding),
      index
    }));
  return similarities
    .filter(e => e.value > codeMatchThreshold)
    .sort((a, b) => b.value - a.value)
    .slice(0, numberOfSimilarities)
    .map(e => embeddings[e.index].source);
};

const setupStream = async ({
  aiChatModelProvider,
  aiChatModelString,
  openAiApiKey,
  openAiBaseUrl,
  prompt,
  azureBaseUrl,
  azureApiKey,
  deploymentId,
  mistralApiKey,
  mistralModel,
  anthropicApiKey,
  ollamaBaseUrl,
  groqApiKey
}: {
  aiChatModelProvider: string;
  aiChatModelString: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  prompt: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  mistralApiKey?: string;
  mistralModel?: string;
  anthropicApiKey?: string;
  ollamaBaseUrl?: string;
  groqApiKey?: string;
}): Promise<AsyncIterable<any>> => {
  let stream: AsyncIterable<any> | null = null;

  if (aiChatModelProvider === 'OpenAI' && openAiApiKey && aiChatModelString && prompt) {
    const openai = new OpenAI({
      apiKey: openAiApiKey,
      dangerouslyAllowBrowser: true,
      baseURL: openAiBaseUrl ? openAiBaseUrl : undefined
    });
    stream = await openai.chat.completions.create({
      model: aiChatModelString,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: true
    });
  } else if (aiChatModelProvider === 'Pretzel AI') {
    const response = await fetch('https://api.pretzelai.app/prompt/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    const reader = response!.body!.getReader();
    const decoder = new TextDecoder('utf-8');

    stream = {
      async *[Symbol.asyncIterator]() {
        let isReading = true;
        while (isReading) {
          const { done, value } = await reader.read();
          if (done) {
            isReading = false;
          }
          const chunk = decoder.decode(value);
          yield { choices: [{ delta: { content: chunk } }] };
        }
      }
    };
  } else if (aiChatModelProvider === 'Azure' && prompt && azureBaseUrl && azureApiKey && deploymentId) {
    const client = new OpenAIClient(azureBaseUrl, new AzureKeyCredential(azureApiKey));
    // FIXME: the aiChatModelString has no effect since the model name is the deploymentId
    // we need to validate this in settings at some point
    const result = await client.getCompletions(deploymentId, [prompt]);

    stream = {
      async *[Symbol.asyncIterator]() {
        for (const choice of result.choices) {
          yield { choices: [{ delta: { content: choice.text } }] };
        }
      }
    };
  } else if (aiChatModelProvider === 'Mistral' && mistralApiKey && aiChatModelString && prompt) {
    const client = new MistralClient(mistralApiKey);
    const chatStream = await client.chatStream({
      model: aiChatModelString,
      messages: [{ role: 'user', content: prompt }]
    });

    stream = {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of chatStream) {
          yield { choices: [{ delta: { content: chunk.choices[0].delta.content || '' } }] };
        }
      }
    };
  } else if (aiChatModelProvider === 'Anthropic' && anthropicApiKey && aiChatModelString && prompt) {
    const messages = [{ role: 'user', content: prompt }];
    const stream = await streamAnthropicCompletion(anthropicApiKey, messages, aiChatModelString);

    return stream;
  } else if (aiChatModelProvider === 'Ollama' && ollamaBaseUrl && aiChatModelString && prompt) {
    const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiChatModelString,
        messages: [{ role: 'user', content: prompt }],
        stream: true
      })
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let isReading = true;

    stream = {
      async *[Symbol.asyncIterator]() {
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
                yield { choices: [{ delta: { content: jsonResponse.message?.content || '' } }] };
              }
            }
          }
        }
      }
    };
  } else if (aiChatModelProvider === 'Groq' && groqApiKey && aiChatModelString && prompt) {
    const groq = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });
    const chatStream = await groq.chat.completions.create({
      model: aiChatModelString,
      messages: [{ role: 'user', content: prompt }],
      stream: true
    });

    stream = {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of chatStream) {
          yield { choices: [{ delta: { content: chunk.choices[0]?.delta?.content || '' } }] };
        }
      }
    };
  } else {
    throw new Error('Invalid AI service');
  }

  return stream;
};

export const generateAIStream = async ({
  aiChatModelProvider,
  aiChatModelString,
  aiClient,
  embeddings,
  userInput,
  oldCodeForPrompt,
  traceback,
  notebookTracker,
  codeMatchThreshold,
  numberOfSimilarCells,
  posthogPromptTelemetry,
  openAiApiKey,
  openAiBaseUrl,
  azureBaseUrl,
  azureApiKey,
  deploymentId,
  mistralApiKey,
  mistralModel,
  anthropicApiKey,
  ollamaBaseUrl,
  groqApiKey,
  isInject
}: {
  aiChatModelProvider: string;
  aiChatModelString: string;
  aiClient: OpenAI | OpenAIClient | MistralClient | null;
  embeddings: Embedding[];
  userInput: string;
  oldCodeForPrompt: string;
  traceback: string;
  notebookTracker: INotebookTracker;
  codeMatchThreshold: number;
  numberOfSimilarCells: number;
  posthogPromptTelemetry: boolean;
  openAiApiKey: string;
  openAiBaseUrl: string;
  azureBaseUrl: string;
  azureApiKey: string;
  deploymentId: string;
  mistralApiKey: string;
  mistralModel: string;
  anthropicApiKey: string;
  ollamaBaseUrl: string;
  groqApiKey: string;
  isInject: boolean;
}): Promise<AsyncIterable<any>> => {
  const { extractedCode } = getSelectedCode(notebookTracker);
  const topSimilarities = await getTopSimilarities(
    traceback ? oldCodeForPrompt : userInput,
    embeddings,
    numberOfSimilarCells,
    aiClient,
    aiChatModelProvider,
    notebookTracker.activeCell!.model.id,
    codeMatchThreshold
  );

  const prompt = await generatePrompt(
    userInput,
    oldCodeForPrompt,
    topSimilarities,
    notebookTracker,
    extractedCode,
    traceback,
    isInject
  );

  if (posthogPromptTelemetry) {
    posthog.capture('prompt', { property: userInput });
  } else {
    posthog.capture('prompt', { property: 'no_telemetry' });
  }

  return setupStream({
    aiChatModelProvider,
    aiChatModelString,
    openAiApiKey,
    openAiBaseUrl,
    prompt,
    azureBaseUrl,
    azureApiKey,
    deploymentId,
    mistralApiKey,
    mistralModel,
    anthropicApiKey,
    ollamaBaseUrl,
    groqApiKey
  });
};

export class FixedSizeStack<T> {
  public stack: T[] = [];
  public maxSize: number;
  public startSentinel: T;
  public endSentinel: T;

  constructor(maxSize: number, startSentinel: T, endSentinel: T) {
    this.maxSize = maxSize + 2; // Add two extra spaces for the sentinels
    this.startSentinel = startSentinel;
    this.endSentinel = endSentinel;
    this.stack.push(startSentinel); // Add the start sentinel
    this.stack.push(endSentinel); // Add the end sentinel
  }

  push(item: T): void {
    this.stack.splice(this.stack.length - 1, 0, item); // Insert the item before the end sentinel
    if (this.stack.length > this.maxSize) {
      this.stack.splice(1, 1); // Remove the oldest item (excluding the start sentinel)
    }
  }

  get length(): number {
    return this.stack.length; // Exclude the sentinels from the length
  }

  get(index: number): T {
    if (index < 0 || index >= this.stack.length) {
      throw new Error('Index out of bounds');
    }
    return this.stack[this.length - 1 - index];
  }

  isFull(): boolean {
    return this.stack.length >= this.maxSize;
  }
}

export async function deleteExistingEmbeddings(app: JupyterFrontEnd, notebookTracker: INotebookTracker) {
  const notebook = notebookTracker.currentWidget;
  if (!notebook) {
    console.error('No active notebook found');
    return;
  }

  const currentNotebookPath = notebook.context.path;
  const currentDir = currentNotebookPath.substring(0, currentNotebookPath.lastIndexOf('/'));
  const embeddingsDir = `${currentDir}/${PRETZEL_FOLDER}`;

  try {
    // List all files in the directory
    const fileList = await app.serviceManager.contents.get(embeddingsDir, { content: true });
    const embeddingsFiles = fileList.content.filter((file: any) => file.name.endsWith('_embeddings.json'));

    // Delete each embeddings file
    for (const file of embeddingsFiles) {
      await app.serviceManager.contents.delete(`${embeddingsDir}/${file.name}`);
    }
    console.log('All embeddings files deleted successfully');
  } catch (error) {
    console.error('Error deleting embeddings files:', error);
  }
}

export async function getCookie(name: string): Promise<string> {
  const r = document.cookie.match('\\b' + name + '=([^;]*)\\b');
  return r ? r[1] : '';
}

export async function streamAnthropicCompletion(
  apiKey: string,
  messages: any[],
  model: string = 'claude-3-5-sonnet-20240620',
  maxTokens: number = 4096
): Promise<AsyncIterable<any>> {
  const xsrfToken = await getCookie('_xsrf');
  const baseUrl = ServerConnection.makeSettings().baseUrl;
  const fullUrl = URLExt.join(baseUrl, '/anthropic/complete');

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-XSRFToken': xsrfToken
    },
    body: JSON.stringify({
      api_key: apiKey,
      messages: messages,
      max_tokens: maxTokens,
      model: model
    })
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const events = chunk.split('\n\n');

        for (const event of events) {
          if (event.trim() === '') continue;

          const [eventType, eventData] = event.split('\n');
          const type = eventType.replace('event: ', '');
          const data = JSON.parse(eventData.replace('data: ', ''));

          if (type === 'content_block_delta') {
            yield { choices: [{ delta: { content: data.delta.text } }] };
          } else if (type === 'message_stop') {
            return;
          }
        }
      }
    }
  };
}

export const completionFunctionProvider = (model, position) => {
  const textUntilPosition = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column
  });

  const match = textUntilPosition.match(/@(\w*)$/);
  if (!match) {
    return { suggestions: [] };
  }

  const word = match[1];
  const range = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: position.column - word.length - 1,
    endColumn: position.column
  };

  return {
    suggestions: globalState.availableVariables
      .filter(variable => variable.startsWith(word))
      .map(variable => ({
        label: variable,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: `@${variable}`,
        range: range,
        filterText: `@${variable}`
      }))
  };
};
