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
import { AiService, Embedding, openaiEmbeddings } from './prompt';
import OpenAI from 'openai';
import { OpenAIClient } from '@azure/openai';

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
  const variablePattern = /@(\w+)/g;
  let match;
  let modifiedUserInput = 'USER INSTRUCTION START\n' + userInput + '\nUSER INSTRUCTION END\n\n';

  // add context of imports and existing variables in the notebook
  const imports = notebookTracker.currentWidget!.model!.sharedModel.cells.filter(cell =>
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

  modifiedUserInput += `ADDITIONAL CONTEXT\n\nThe following imports are already present in the notebook:\n\`\`\`\n${importsCode}\n\`\`\`\n\n`;

  // call getVariableValue to get the list of globals() from python
  const getVarsCode = `[var for var in globals() if not var.startswith('_') and not callable(globals()[var]) and var not in ['In', 'Out']]`;
  const listVars = await getVariableValue(getVarsCode, notebookTracker);

  modifiedUserInput += `The following variables exist in memory of the notebook kernel:\n\`\`\`\n${listVars}\n\`\`\`\n`;

  let variablesProcessed: string[] = [];
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
        modifiedUserInput += `\n\`${variableName}\` is a dataframe with the following columns: \`${variableColumns}\`\n`;
      } else if (variableType) {
        const variableValue = await getVariableValue(variableName, notebookTracker);
        modifiedUserInput += `\nPrinting \`${variableName}\` in Python returns \`${variableValue}\`\n`;
      }
      // replace the @variable in userInput with `variable`
      modifiedUserInput = modifiedUserInput.replace(`@${variableName}`, `\`${variableName}\``);
    } catch (error) {
      console.error(`Error accessing variable ${variableName}:`, error);
    }
  }
  modifiedUserInput += `\nEND ADDITIONAL CONTEXT\n`;
  return modifiedUserInput;
}

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
    const embeddingsFolderName = '.embeddings';
    const embeddingsPath = currentDir + '/' + embeddingsFolderName + '/' + notebookName + '_embeddings.json';
    const newDirPath = currentDir + '/' + embeddingsFolderName;

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

      // then create embeddings file which will be used in the next call of this function
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
    // Temporary solution to keep refreshing hashes in non blocking thread
    setTimeout(getEmbeddings, 1000);
  } else {
    setTimeout(getEmbeddings, 1000);
  }
  return embeddings;
}

export class FixedSizeStack<T> {
  private stack: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    this.stack.push(item);
    if (this.stack.length > this.maxSize) {
      this.stack.shift(); // Remove the oldest item
    }
  }

  get length(): number {
    return this.stack.length;
  }

  get(index: number): T {
    if (index >= 0) {
      index = index % this.stack.length;
    } else {
      index = (index % this.stack.length) + this.stack.length;
    }
    const reverseIndex = this.stack.length - 1 - index;
    if (reverseIndex < 0 || reverseIndex >= this.stack.length) {
      throw new Error('Index out of bounds');
    }
    return this.stack[reverseIndex];
  }
}
