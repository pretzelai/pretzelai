/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
/**
 * @packageDocumentation
 * @module pretzelai-extension
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IIOPubMessage } from '@jupyterlab/services/lib/kernel/messages';
import * as monaco from 'monaco-editor';
import OpenAI from 'openai';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { AzureKeyCredential, OpenAIClient } from '@azure/openai';
import { calculateHash, isSetsEqual, renderEditor } from './utils';
import {
  AiService,
  Embedding,
  generatePrompt,
  getTopSimilarities,
  openaiEmbeddings,
  openAiStream
} from './prompt';
import posthog from 'posthog-js';
import { CodeCellModel } from '@jupyterlab/cells';
import { OutputAreaModel } from '@jupyterlab/outputarea';
import { IOutputModel } from '@jupyterlab/rendermime';

posthog.init('phc_FnIUQkcrbS8sgtNFHp5kpMkSvL5ydtO1nd9mPllRQqZ', {
  // eslint-disable-next-line camelcase
  api_host: 'https://d2yfaqny8nshvd.cloudfront.net'
});

const PLUGIN_ID = '@jupyterlab/pretzelai-extension:plugin';

const NUMBER_OF_SIMILAR_CELLS = 3;

const extension: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker, ISettingRegistry],
  activate: async (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    notebookTracker: INotebookTracker,
    settingRegistry: ISettingRegistry
  ) => {
    const { commands } = app;
    const command = 'pretzelai:replace-code';
    const placeholderDisabled =
      'To use AI features, please set your OpenAI API key or Azure API details in the Pretzel AI Settings.\n' +
      'You can also use the free Pretzel AI server.\n' +
      'Go To: Settings > Settings Editor > Pretzel AI Settings to configure';

    const placeHolderEnabled =
      'Ask AI. Use @variableName to reference defined variables and dataframes';
    let openAiApiKey = '';
    let openAiBaseUrl = '';
    let aiService: AiService = 'Use Pretzel AI Server';
    let azureBaseUrl = '';
    let azureDeploymentName = '';
    let azureApiKey = '';
    let aiClient: OpenAI | OpenAIClient | null;

    function loadSettings(updateFunc?: () => void) {
      settingRegistry
        .load(PLUGIN_ID)
        .then(settings => {
          const openAiSettings = settings.get('openAiSettings')
            .composite as any;
          openAiApiKey = openAiSettings?.openAiApiKey || '';
          openAiBaseUrl = openAiSettings?.openAiBaseUrl || '';

          const azureSettings = settings.get('azureSettings').composite as any;
          azureBaseUrl = azureSettings?.azureBaseUrl || '';
          azureDeploymentName = azureSettings?.azureDeploymentName || '';
          azureApiKey = azureSettings?.azureApiKey || '';

          const aiServiceSetting = settings.get('aiService').composite;
          aiService =
            (aiServiceSetting as AiService) || 'Use Pretzel AI Server';
          updateFunc?.();
          loadAIClient();
        })
        .catch(reason => {
          console.error('Failed to load settings for Pretzel', reason);
        });
    }
    loadSettings();

    function loadAIClient() {
      if (aiService === 'OpenAI API key') {
        aiClient = new OpenAI({
          apiKey: openAiApiKey,
          dangerouslyAllowBrowser: true
        });
      } else if (aiService === 'Use Azure API') {
        aiClient = new OpenAIClient(
          azureBaseUrl,
          new AzureKeyCredential(azureApiKey)
        );
      } else {
        aiClient = null;
      }
    }
    loadAIClient(); // first time load, later settings will trigger this

    // Listen for future changes in settings
    settingRegistry.pluginChanged.connect((sender, plugin) => {
      if (plugin === extension.id) {
        const updateFunc = async () => {
          const submitButton = document.querySelector(
            '.pretzelInputSubmitButton'
          );
          const inputField = document.querySelector('.pretzelInputField');

          if (submitButton) {
            if (
              (aiService === 'OpenAI API key' && openAiApiKey) ||
              aiService === 'Use Pretzel AI Server' ||
              (aiService === 'Use Azure API' &&
                azureBaseUrl &&
                azureDeploymentName &&
                azureApiKey)
            ) {
              (submitButton as HTMLInputElement).disabled = false;
              (inputField as HTMLInputElement).placeholder = placeHolderEnabled;
            } else {
              (submitButton as HTMLInputElement).disabled = true;
              (inputField as HTMLInputElement).placeholder =
                placeholderDisabled;
            }
          }
        };
        loadSettings(updateFunc);
      }
    });

    notebookTracker.activeCellChanged.connect((sender, cell) => {
      console.log('activeCellChanged');
      if (cell && cell.model.type === 'code') {
        const codeCellModel = cell.model as CodeCellModel;
        codeCellModel.outputs.changed.connect(() => {
          console.log('outputs changed');

          const outputs = codeCellModel.outputs as OutputAreaModel;
          const errorOutput = findErrorOutput(outputs);
          if (errorOutput) {
            console.log('errorOutput', errorOutput);
            addFixErrorButton(
              cell.node.querySelector(
                '.jp-RenderedText.jp-mod-trusted.jp-OutputArea-output'
              ) as HTMLElement,
              codeCellModel
            );
          }
        });
      }
    });

    function findErrorOutput(
      outputs: OutputAreaModel
    ): IOutputModel | undefined {
      for (let i = 0; i < outputs.length; i++) {
        const output = outputs.get(i);
        if (output.type === 'error') {
          return output;
        }
      }
      return undefined;
    }

    function addFixErrorButton(
      cellNode: HTMLElement,
      cellModel: CodeCellModel
    ) {
      // Remove existing button if any
      const existingButton = cellNode.querySelector('.fix-error-button');
      if (existingButton) {
        existingButton.remove();
      }

      const button = document.createElement('button');
      button.textContent = 'Fix Error with AI';
      button.className = 'fix-error-button';
      button.style.position = 'absolute';
      button.style.top = '10px';
      button.style.right = '10px';
      button.style.padding = '5px 10px';
      button.style.backgroundColor = '#007bff';
      button.style.color = 'white';
      button.style.border = 'none';
      button.style.borderRadius = '4px';
      button.style.cursor = 'pointer';
      cellNode.appendChild(button);
      button.onclick = () => {
        const existingButton = cellNode.querySelector('.fix-error-button');
        if (existingButton) {
          existingButton.remove();
        }
        handleFixError(cellModel);
      };
    }

    async function handleFixError(cellModel: CodeCellModel) {
      const outputs = cellModel.outputs as OutputAreaModel;
      let traceback = findErrorOutput(outputs)!.toJSON().traceback;
      if (!traceback) {
        // handle error where traceback is undefined
        traceback = 'No traceback found';
      }
      // else  if traceback is an array, join with newlines
      else if (traceback instanceof Array) {
        // replace ANSI chars in traceback - they show colors that we don't need
        // eslint-disable-next-line no-control-regex
        traceback = traceback.join('\n').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
      }
      // else traceback is some JS object. Convert it to a string representation
      else {
        traceback = traceback.toString();
      }
      const originalCode = cellModel.sharedModel.source;

      const topSimilarities = await getTopSimilarities(
        originalCode,
        embeddings,
        NUMBER_OF_SIMILAR_CELLS,
        aiClient,
        'OpenAI API key',
        cellModel.id
      );
      const prompt = generatePrompt(
        '',
        originalCode,
        topSimilarities,
        '',
        traceback
      );
      let diffEditorContainer: HTMLElement = document.createElement('div');
      let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
      let activeCell = notebookTracker.activeCell!;

      const parentContainer = document.createElement('div');
      parentContainer.classList.add('pretzelParentContainerAI');
      activeCell.node.appendChild(parentContainer);

      diffEditor = renderEditor(
        '',
        parentContainer,
        diffEditorContainer,
        diffEditor,
        monaco,
        originalCode
      );

      openAiStream({
        aiService,
        openAiApiKey,
        openAiBaseUrl,
        prompt,
        parentContainer,
        diffEditorContainer,
        diffEditor,
        monaco,
        oldCode: originalCode,
        azureBaseUrl,
        azureApiKey,
        deploymentId: azureDeploymentName,
        activeCell,
        commands
      })
        .then(() => {
          // clear output of the cell
          cellModel.outputs.clear();
        })
        .catch(error => {
          console.error('Error during OpenAI stream:', error);
        });
    }

    let embeddings: Embedding[];

    async function createEmbeddings(
      embeddingsJSON: Embedding[],
      cells: any[],
      path: string
    ) {
      embeddings = embeddingsJSON;
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
                  const response = await openaiEmbeddings(
                    cell.source,
                    aiService,
                    aiClient
                  );
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
                const response = await openaiEmbeddings(
                  cell.source,
                  aiService,
                  aiClient
                );
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
      if (!isSetsEqual(oldSet, newSet)) {
        app.serviceManager.contents.save(path, {
          type: 'file',
          format: 'text',
          content: JSON.stringify(newEmbeddingsArray)
        });
      }
    }

    // Function to print the source of all cells once the notebook is defined
    function getEmbeddings() {
      const notebook = notebookTracker.currentWidget;
      if (notebook?.model) {
        const currentNotebookPath = notebook.context.path;
        const embeddingsPath =
          currentNotebookPath.replace('.ipynb', '') + '_embeddings.json';

        app.serviceManager.contents
          .get(embeddingsPath)
          .then(file => {
            try {
              const embJSON = JSON.parse(file.content);
              createEmbeddings(
                embJSON,
                notebook!.model!.sharedModel.cells,
                embeddingsPath
              );
            } catch (error) {
              console.error('Error parsing embeddings JSON:', error);
            }
          })
          .catch(async error => {
            createEmbeddings(
              [],
              notebook!.model!.sharedModel.cells,
              embeddingsPath
            );
          });
        // Temporary solution to keep refreshing hashes in non blocking thread
        setTimeout(getEmbeddings, 1000);
      } else {
        setTimeout(getEmbeddings, 1000);
      }
    }
    getEmbeddings();

    async function getVariableValue(
      variableName: string
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
          kernel.registerMessageHook(
            executeRequest.msg.header.msg_id,
            (msg: IIOPubMessage) => {
              if (
                msg.header.msg_type === 'stream' &&
                // @ts-expect-error tserror
                msg.content.name === 'stdout'
              ) {
                // @ts-expect-error tserror
                variableValue = msg.content.text.trim();
              }
              return true;
            }
          );

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

    const getSelectedCode = () => {
      const selection = notebookTracker.activeCell?.editor?.getSelection();
      const cellCode = notebookTracker.activeCell?.model.sharedModel.source;
      let extractedCode = '';
      if (
        selection &&
        (selection.start.line !== selection.end.line ||
          selection.start.column !== selection.end.column)
      ) {
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
        console.log('Extracted code:', extractedCode);
      }
      // also return the selection
      return { extractedCode: extractedCode.trimEnd(), selection };
    };

    async function processTaggedVariables(userInput: string): Promise<string> {
      const variablePattern = /@(\w+)/g;
      let match;
      let modifiedUserInput = userInput;
      while ((match = variablePattern.exec(userInput)) !== null) {
        try {
          const variableName = match[1];
          // get value of var using the getVariableValue function
          const variableType = await getVariableValue(`type(${variableName})`);

          // check if variableType is dataframe
          // if it is, get columns and add to modifiedUserInput
          if (variableType?.includes('DataFrame')) {
            const variableColumns = await getVariableValue(
              `${variableName}.columns`
            );
            modifiedUserInput += `\n${variableName} is a dataframe with the following columns: ${variableColumns}\n`;
          } else if (variableType) {
            const variableValue = await getVariableValue(variableName);
            modifiedUserInput += `\nPrinting ${variableName} in Python returns the string ${variableValue}\n`;
          }
        } catch (error) {
          console.error(`Error accessing variable ${match[1]}:`, error);
        }
      }
      return modifiedUserInput;
    }

    commands.addCommand(command, {
      label: 'Replace Cell Code',
      execute: () => {
        const activeCell = notebookTracker.activeCell;

        let diffEditorContainer: HTMLElement = document.createElement('div');
        let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;

        const callingP = document.createElement('p');
        callingP.textContent = 'Calling AI Service...';
        const generatingP = document.createElement('p');
        generatingP.textContent = 'Generating code...';

        if (activeCell) {
          // Cmd K twice should toggle the box
          const existingDiv = activeCell.node.querySelector(
            '.pretzelParentContainerAI'
          );
          if (existingDiv) {
            // If so, delete that div
            existingDiv.remove();
            // Switch focus back to the Jupyter cell
            activeCell!.editor!.focus();
            return;
          }

          const oldCode = activeCell.model.sharedModel.source;

          // Create a parent container for all dynamically created elements
          const parentContainer = document.createElement('div');
          parentContainer.classList.add('pretzelParentContainerAI');
          activeCell.node.appendChild(parentContainer);
          // Create an input field and append it below the cell
          const inputContainer = document.createElement('div');
          inputContainer.style.marginTop = '10px';
          inputContainer.style.marginLeft = '70px';
          inputContainer.style.display = 'flex';
          inputContainer.style.flexDirection = 'column';
          parentContainer.appendChild(inputContainer);

          const inputField = document.createElement('textarea');
          inputField.classList.add('pretzelInputField');
          inputField.placeholder = placeHolderEnabled;
          inputField.style.width = '100%';
          inputField.style.height = '100px';
          inputContainer.appendChild(inputField);
          inputField.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
              // TODO: this doesn't work - the Escape key isn't being captured
              // but every other key press is being captured
              event.preventDefault(); // Prevent any default behavior
              // Shift focus back to the editor of the active cell
              const activeCell = notebookTracker.activeCell;
              if (activeCell && activeCell.editor) {
                activeCell.editor.focus(); // Focus the editor of the active cell
              }
            }
            // handle enter key press to trigger submit
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!submitButton.disabled) {
                handleSubmit(inputField.value);
              }
            }
          });

          const callingP = document.createElement('p');
          callingP.textContent = 'Calling AI Service...';
          const generatingP = document.createElement('p');
          generatingP.textContent = 'Generating code...';

          const inputFieldButtonsContainer = document.createElement('div');
          inputFieldButtonsContainer.style.marginTop = '10px';
          inputFieldButtonsContainer.style.display = 'flex';
          inputFieldButtonsContainer.style.flexDirection = 'row';
          inputContainer.appendChild(inputFieldButtonsContainer);
          inputField.focus();

          const submitButton = document.createElement('button');
          submitButton.classList.add('pretzelInputSubmitButton');
          submitButton.textContent = 'Submit';
          submitButton.style.backgroundColor = 'lightblue';
          submitButton.style.borderRadius = '5px';
          submitButton.style.border = '1px solid darkblue';
          submitButton.style.maxWidth = '100px';
          submitButton.style.minHeight = '25px';
          submitButton.style.marginTop = '10px';
          submitButton.style.marginRight = '10px';
          submitButton.addEventListener('click', () => {
            handleSubmit(inputField.value);
          });
          inputFieldButtonsContainer.appendChild(submitButton);

          // write code to add a button the removed the inputField and submitButton
          const removeButton = document.createElement('button');
          removeButton.textContent = 'Remove';
          removeButton.style.backgroundColor = 'lightcoral';
          removeButton.style.borderRadius = '5px';
          removeButton.style.border = '1px solid darkred';
          removeButton.style.maxWidth = '100px';
          removeButton.style.minHeight = '25px';
          removeButton.style.marginTop = '10px';
          inputFieldButtonsContainer.appendChild(removeButton);
          removeButton.addEventListener('click', () => {
            activeCell.node.removeChild(parentContainer);
          });

          const handleSubmit = async (userInput: string) => {
            parentContainer.removeChild(inputContainer);
            const { extractedCode } = getSelectedCode();
            if (userInput !== '') {
              userInput = await processTaggedVariables(userInput);
              try {
                const topSimilarities = await getTopSimilarities(
                  userInput,
                  embeddings,
                  NUMBER_OF_SIMILAR_CELLS,
                  aiClient,
                  aiService,
                  activeCell.model.id
                );
                const prompt = generatePrompt(
                  userInput,
                  oldCode,
                  topSimilarities,
                  extractedCode
                );
                posthog.capture('prompt', { property: userInput });
                diffEditor = renderEditor(
                  '',
                  parentContainer,
                  diffEditorContainer,
                  diffEditor,
                  monaco,
                  extractedCode ? extractedCode : oldCode
                );
                openAiStream({
                  aiService,
                  parentContainer,
                  diffEditorContainer,
                  diffEditor,
                  monaco,
                  oldCode: extractedCode ? extractedCode : oldCode,
                  // OpenAI API
                  openAiApiKey,
                  openAiBaseUrl,
                  prompt,
                  // Azure API
                  azureApiKey,
                  azureBaseUrl,
                  deploymentId: azureDeploymentName,
                  activeCell,
                  commands
                });
              } catch (error) {
                activeCell.node.removeChild(parentContainer);
              }
            }
          };
        }
      }
    });

    const category = 'Cell Operations';
    palette.addItem({ command, category });

    app.commands.addKeyBinding({
      command,
      keys: ['Accel K'],
      selector: '.jp-Notebook'
    });
  }
};

export default extension;
