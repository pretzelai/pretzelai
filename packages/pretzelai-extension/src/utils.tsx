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
import { AiService, Embedding, generatePrompt, openaiEmbeddings } from './prompt';
import OpenAI from 'openai';
import { AzureKeyCredential, OpenAIClient } from '@azure/openai';
import posthog from 'posthog-js';
import { showErrorDialog } from './components/ErrorDialog';

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

export async function getVariableValue(
  variableName: string,
  notebookTracker: INotebookTracker
): Promise<string | null> {
  const notebook = notebookTracker.currentWidget;
  if (notebook && notebook.sessionContext.session?.kernel) {
    const kernel = notebook.sessionContext.session.kernel;
    try {
      // get the type - if dataframe, we get columns
      // if other, we get the string representation
      const executeRequest = kernel.requestExecute({
        code: `print(${variableName})`
      });
      let variableValue: string | null = null;

      // Registering a message hook to intercept messages
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

      // Await the completion of the execute request
      const reply = await executeRequest.done;
      if (reply && reply.content.status === 'ok') {
        return variableValue;
      } else {
        console.error('Failed to retrieve variable value');
        return null;
      }
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
  const variablePattern = / @([a-zA-Z_][a-zA-Z0-9_]*(\[[^\]]+\]|(\.[a-zA-Z_][a-zA-Z0-9_]*)?)*)[\s,\-]?/g;
  let match;
  let modifiedUserInput = '*USER INSTRUCTION START*\n' + userInput + '\n*USER INSTRUCTION END*\n\n';

  // add context of imports and existing variables in the notebook
  const imports = notebookTracker.currentWidget!.model!.sharedModel.cells.filter(
    cell =>
      cell.id !== notebookTracker.currentWidget!.content.activeCell!.model.id &&
      cell.source.split('\n').some(line => line.includes('import'))
  );
  const importsCode = imports
    .map(cell =>
      cell.source
        .split('\n')
        .filter(line => line.trim().includes('import'))
        .join('\n')
    )
    .join('\n');

  // call getVariableValue to get the list of globals() from python
  // TODO: I suspect that this ends up removing variables on edit (in code). Look at it later, removing for now
  // const getVarsCode = `[var for var in globals() if not var.startswith('_') and not callable(globals()[var]) and var not in ['In', 'Out']]`;
  // const globalVars = await getVariableValue(getVarsCode, notebookTracker);

  let variablesProcessed: string[] = [];
  let varValues = '';
  while ((match = variablePattern.exec(userInput)) !== null) {
    const variableName = match[1];
    if (variablesProcessed.includes(variableName)) {
      continue;
    }
    variablesProcessed.push(variableName);
    try {
      // get value of var using the getVariableValue function
      const variableType = await getVariableValue(`type(${variableName})`, notebookTracker);

      // check if variableType is dataframe
      // if it is, get columns and add to modifiedUserInput
      if (variableType?.includes('DataFrame')) {
        const variableColumns = await getVariableValue(`${variableName}.columns`, notebookTracker);
        varValues += `\n\`${variableName}\` is a dataframe with the following columns: \`${variableColumns}\`\n`;
      } else if (variableType) {
        const variableValue = await getVariableValue(variableName, notebookTracker);
        varValues += `\nPrinting \`${variableName}\` in Python returns \`${variableValue}\`\n`;
      }
      // replace the @variable in userInput with `variable`
      modifiedUserInput = modifiedUserInput.replace(`@${variableName}`, `\`${variableName}\``);
    } catch (error) {
      console.error(`Error accessing variable ${variableName}:`, error);
    }
  }

  if (importsCode || varValues) {
    modifiedUserInput += `*ADDITIONAL CONTEXT*\n\n`;
    if (importsCode) {
      modifiedUserInput += `The following imports are already present in *OTHER CELLS* the notebook:\n\`\`\`\n${importsCode}\n\`\`\`\n\n`;
    }
    // if (globalVars) {
    //   modifiedUserInput += `The following variables exist in memory of the notebook kernel:\n\`\`\`\n${globalVars}\n\`\`\`\n`;
    // }
    if (varValues) {
      modifiedUserInput += `\n${varValues}\n`;
    }
    modifiedUserInput += `\n*END ADDITIONAL CONTEXT*\n`;
  }

  return modifiedUserInput;
}

export const PRETZEL_FOLDER = '.pretzel';

export async function createAndSaveEmbeddings(
  existingEmbeddingsJSON: Embedding[],
  cells: any[],
  path: string,
  app: JupyterFrontEnd,
  aiClient: OpenAI | OpenAIClient | null,
  aiService: AiService
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
              const response = await openaiEmbeddings(cell.source, aiService, aiClient);
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
            const response = await openaiEmbeddings(cell.source, aiService, aiClient);
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
  aiClient: OpenAI | OpenAIClient | null,
  aiService: AiService
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
          aiService
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
    setTimeout(() => getEmbeddings(notebookTracker, app, aiClient, aiService), 1000);
  }
  return embeddings;
}

export const readEmbeddings = async (notebookTracker: INotebookTracker, app: JupyterFrontEnd): Promise<Embedding[]> => {
  const notebook = notebookTracker.currentWidget;
  const currentNotebookPath = notebook!.context.path;
  const notebookName = currentNotebookPath.split('/').pop()!.replace('.ipynb', '');
  const currentDir = currentNotebookPath.substring(0, currentNotebookPath.lastIndexOf('/'));
  const embeddingsPath = currentDir + '/' + PRETZEL_FOLDER + '/' + notebookName + '_embeddings.json';
  const file = await app.serviceManager.contents.get(embeddingsPath);
  return JSON.parse(file.content);
};

export const getTopSimilarities = async (
  userInput: string,
  embeddings: Embedding[],
  numberOfSimilarities: number,
  aiClient: OpenAI | OpenAIClient | null,
  aiService: AiService,
  cellId: string,
  codeMatchThreshold: number
): Promise<string[]> => {
  let response;
  try {
    response = await openaiEmbeddings(userInput, aiService, aiClient);
  } catch (error: any) {
    // Catching OpenAI errors here since this function is called for all prompts
    showErrorDialog(`${aiService}: Error connecting`, error?.error?.message || JSON.stringify(error));
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
  aiService,
  openAiApiKey,
  openAiBaseUrl,
  openAiModel,
  ollamaModel,
  prompt,
  azureBaseUrl,
  azureApiKey,
  deploymentId
}: {
  aiService: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  ollamaModel?: string;
  prompt: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
}): Promise<AsyncIterable<any>> => {
  let stream: AsyncIterable<any> | null = null;
  if (aiService === 'OpenAI API key' && openAiApiKey && openAiModel && prompt) {
    const openai = new OpenAI({
      apiKey: openAiApiKey,
      dangerouslyAllowBrowser: true,
      baseURL: openAiBaseUrl ? openAiBaseUrl : undefined
    });
    stream = await openai.chat.completions.create({
      model: openAiModel,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: true
    });
  } else if (aiService === 'Use Pretzel AI Server') {
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
  } else if (aiService === 'Ollama' && prompt && ollamaModel) {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: true
      })
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');

    stream = {
      async *[Symbol.asyncIterator]() {
        let isReading = true;
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
  } else if (aiService === 'Use Azure API' && prompt && azureBaseUrl && azureApiKey && deploymentId) {
    const client = new OpenAIClient(azureBaseUrl, new AzureKeyCredential(azureApiKey));
    const result = await client.getCompletions(deploymentId, [prompt]);

    stream = {
      async *[Symbol.asyncIterator]() {
        for (const choice of result.choices) {
          yield { choices: [{ delta: { content: choice.text } }] };
        }
      }
    };
  } else {
    throw new Error('Invalid AI service');
  }

  return stream;
};

export const generateAIStream = async ({
  aiService,
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
  openAiModel,
  ollamaModel,
  azureBaseUrl,
  azureApiKey,
  deploymentId,
  isInject
}: {
  aiService: AiService;
  aiClient: OpenAI | OpenAIClient | null;
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
  openAiModel: string;
  ollamaModel: string;
  azureBaseUrl: string;
  azureApiKey: string;
  deploymentId: string;
  isInject: boolean;
}): Promise<AsyncIterable<any>> => {
  const { extractedCode } = getSelectedCode(notebookTracker);
  const topSimilarities = await getTopSimilarities(
    traceback ? oldCodeForPrompt : userInput,
    embeddings,
    numberOfSimilarCells,
    aiClient,
    aiService,
    notebookTracker.activeCell!.model.id,
    codeMatchThreshold
  );

  const prompt = generatePrompt(userInput, oldCodeForPrompt, topSimilarities, extractedCode, traceback, isInject);

  if (posthogPromptTelemetry) {
    posthog.capture('prompt', { property: userInput });
  } else {
    posthog.capture('prompt', { property: 'no_telemetry' });
  }

  return setupStream({
    aiService,
    openAiApiKey,
    openAiBaseUrl,
    openAiModel,
    ollamaModel,
    prompt,
    azureBaseUrl,
    azureApiKey,
    deploymentId
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
