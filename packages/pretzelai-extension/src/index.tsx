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
  systemPrompt
} from './prompt';
import posthog from 'posthog-js';
import React, { useState } from 'react';
import { Widget } from '@lumino/widgets';
import { ReactWidget } from '@jupyterlab/ui-components';
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

      const apiKey = openAiApiKey;

      const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      });

      const topSimilarities = await getTopSimilarities(
        originalCode,
        embeddings,
        NUMBER_OF_SIMILAR_CELLS,
        openai,
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

      console.log(prompt);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // print text in response
      console.log(response.choices[0].message.content);

      // send text to the cell
      cellModel.sharedModel.setSource(
        response.choices[0].message.content || originalCode
      );
      // clear output of the cell
      cellModel.outputs.clear();
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

          const parentContainer = document.createElement('div');
          parentContainer.classList.add('pretzelParentContainerAI');
          activeCell.node.appendChild(parentContainer);

          const handleSubmit = async (userInput: string) => {
            const getSelectedCode = () => {
              const selection = activeCell?.editor?.getSelection();
              const cellCode = activeCell?.model.sharedModel.source;
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
                      extractedCode += lineContent.substring(
                        startColumn,
                        endColumn
                      );
                    } else if (i === startLine) {
                      extractedCode += lineContent.substring(startColumn);
                    } else if (i === endLine) {
                      extractedCode +=
                        '\n' + lineContent.substring(0, endColumn);
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
            const { extractedCode } = getSelectedCode();
            if (userInput !== '') {
              const variablePattern = /@(\w+)/g;
              let match;
              let modifiedUserInput = userInput;
              while ((match = variablePattern.exec(userInput)) !== null) {
                try {
                  const variableName = match[1];
                  // get value of var using the getVariableValue function
                  const variableType = await getVariableValue(
                    `type(${variableName})`
                  );

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
              userInput = modifiedUserInput;

              if (aiService === 'OpenAI API key' && openAiApiKey) {
                try {
                  const openai = new OpenAI({
                    apiKey: openAiApiKey,
                    dangerouslyAllowBrowser: true,
                    baseURL: openAiBaseUrl ? openAiBaseUrl : undefined
                  });
                  const complete = async () => {
                    const topSimilarities = await getTopSimilarities(
                      userInput,
                      embeddings,
                      NUMBER_OF_SIMILAR_CELLS,
                      openai,
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
                      oldCode
                    );
                    // diffButtonsContainer!.appendChild(callingP!);
                    const stream = await openai.chat.completions.create({
                      model: 'gpt-4o',
                      messages: [
                        {
                          role: 'system',
                          content: systemPrompt
                        },
                        {
                          role: 'user',
                          content: prompt
                        }
                      ],
                      stream: true
                    });
                    // diffButtonsContainer!.removeChild(callingP!);
                    // diffButtonsContainer!.appendChild(generatingP!);
                    for await (const chunk of stream) {
                      renderEditor(
                        chunk.choices[0]?.delta?.content || '',
                        parentContainer,
                        diffEditorContainer,
                        diffEditor,
                        monaco,
                        oldCode
                      );
                    }
                    // diffButtonsContainer!.removeChild(generatingP!);
                    // diffButtonsContainer!.appendChild(acceptButton!);
                    // diffButtonsContainer!.appendChild(rejectButton!);
                    // diffButtonsContainer!.appendChild(editPromptButton!);
                  };
                  complete();
                } catch (error) {
                  activeCell.node.removeChild(parentContainer);
                }
              } else if (aiService === 'Use Pretzel AI Server') {
                const topSimilarities = await getTopSimilarities(
                  userInput,
                  embeddings,
                  NUMBER_OF_SIMILAR_CELLS,
                  null,
                  aiService,
                  activeCell.model.id
                );
                const options: any = {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  // TODO: New handle extractedCode
                  body: JSON.stringify({
                    oldCode,
                    userInput,
                    topSimilarities
                  })
                };
                posthog.capture('prompt', { property: userInput });
                try {
                  diffEditor = renderEditor(
                    '',
                    parentContainer,
                    diffEditorContainer,
                    diffEditor,
                    monaco,
                    oldCode
                  );
                  const response = await fetch(
                    'https://wjwgjk52kb3trqnlqivqqyxm3i0glvof.lambda-url.eu-central-1.on.aws/',
                    options
                  );
                  const reader = response!.body!.getReader();
                  const decoder = new TextDecoder('utf-8');
                  let isReading = true;
                  // diffButtonsContainer!.removeChild(callingP!);
                  // diffButtonsContainer!.appendChild(generatingP!);
                  while (isReading) {
                    const { done, value } = await reader.read();
                    if (done) {
                      isReading = false;
                    }
                    const chunk = decoder.decode(value);
                    console.log(diffEditor);
                    renderEditor(
                      chunk,
                      parentContainer,
                      diffEditorContainer,
                      diffEditor,
                      monaco,
                      oldCode
                    );
                  }
                  // diffButtonsContainer!.removeChild(generatingP!);
                  // diffButtonsContainer!.appendChild(acceptButton!);
                  // diffButtonsContainer!.appendChild(rejectButton!);
                  // diffButtonsContainer!.appendChild(editPromptButton!);
                } catch (error) {
                  activeCell.model.sharedModel.source = `# Error: ${error}\n${oldCode}`;
                  activeCell.node.removeChild(parentContainer);
                }
              } else if (
                aiService === 'Use Azure API' &&
                azureBaseUrl &&
                azureDeploymentName &&
                azureApiKey
              ) {
                try {
                  const client = new OpenAIClient(
                    azureBaseUrl,
                    new AzureKeyCredential(azureApiKey)
                  );
                  const topSimilarities = await getTopSimilarities(
                    userInput,
                    embeddings,
                    NUMBER_OF_SIMILAR_CELLS,
                    client,
                    aiService,
                    activeCell.model.id
                  );
                  const deploymentId = azureDeploymentName;
                  const prompt = generatePrompt(
                    userInput,
                    oldCode,
                    topSimilarities,
                    extractedCode
                  );

                  const result = await client.getCompletions(deploymentId, [
                    prompt
                  ]);

                  for (const choice of result.choices) {
                    renderEditor(
                      choice.text,
                      parentContainer,
                      diffEditorContainer,
                      diffEditor,
                      monaco,
                      oldCode
                    );
                  }
                } catch (error) {
                  activeCell.model.sharedModel.source = `# Error: ${error}\n${oldCode}`;
                  activeCell.node.removeChild(parentContainer);
                }
              }
            }
          };
          function AiWidget() {
            const [isVisible, setIsVisible] = useState(true);
            const [inputValue, setInputValue] = useState('');
            const [isSubmitDisabled, setIsSubmitDisabled] = useState(true);
            const [placeholderText, setPlaceholderText] = useState('');

            React.useEffect(() => {
              const updatePlaceholderText = () => {
                if (
                  (aiService === 'OpenAI API key' && openAiApiKey) ||
                  aiService === 'Use Pretzel AI Server' ||
                  (aiService === 'Use Azure API' &&
                    azureBaseUrl &&
                    azureDeploymentName &&
                    azureApiKey)
                ) {
                  setIsSubmitDisabled(false);
                  setPlaceholderText(placeHolderEnabled);
                } else {
                  setIsSubmitDisabled(true);
                  setPlaceholderText(placeholderDisabled);
                }
              };

              updatePlaceholderText();
            }, [
              aiService,
              openAiApiKey,
              azureBaseUrl,
              azureDeploymentName,
              azureApiKey
            ]);

            const handleInputChange = (
              event: React.ChangeEvent<HTMLTextAreaElement>
            ) => {
              setInputValue(event.target.value);
            };

            const handleRemove = () => {
              setIsVisible(false);
            };

            if (!isVisible) {
              return null;
            }

            return (
              <div className="pretzelParentContainerAI">
                <div
                  style={{
                    marginTop: '10px',
                    marginLeft: '70px',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <textarea
                    className="pretzelInputField"
                    placeholder={placeholderText}
                    style={{ width: '100%', height: '100px' }}
                    value={inputValue}
                    onChange={handleInputChange}
                    autoFocus={true}
                  />
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'flex',
                      flexDirection: 'row'
                    }}
                  >
                    <button
                      className="pretzelInputSubmitButton"
                      style={{
                        backgroundColor: 'lightblue',
                        borderRadius: '5px',
                        border: '1px solid darkblue',
                        maxWidth: '100px',
                        minHeight: '25px',
                        marginTop: '10px',
                        marginRight: '10px'
                      }}
                      onClick={() => {
                        setIsVisible(false);
                        handleSubmit(inputValue);
                      }}
                      disabled={isSubmitDisabled}
                    >
                      Submit
                    </button>
                    <button
                      style={{
                        backgroundColor: 'lightcoral',
                        borderRadius: '5px',
                        border: '1px solid darkred',
                        maxWidth: '100px',
                        minHeight: '25px',
                        marginTop: '10px'
                      }}
                      onClick={handleRemove}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          }
          const AiWidgetComponent = ReactWidget.create(<AiWidget />);
          Widget.attach(AiWidgetComponent, activeCell.node);
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
