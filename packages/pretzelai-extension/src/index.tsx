/* eslint-disable camelcase */
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
import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IIOPubMessage } from '@jupyterlab/services/lib/kernel/messages';
import * as monaco from 'monaco-editor';
import OpenAI from 'openai';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { AzureKeyCredential, OpenAIClient } from '@azure/openai';
import { calculateHash, isSetsEqual, renderEditor } from './utils';
import { ServerConnection } from '@jupyterlab/services';

import { AiService, Embedding, generatePrompt, getTopSimilarities, openaiEmbeddings, openAiStream } from './prompt';
import posthog from 'posthog-js';
import { CodeCellModel } from '@jupyterlab/cells';
import { OutputAreaModel } from '@jupyterlab/outputarea';
import { IOutputModel } from '@jupyterlab/rendermime';
import { initSplashScreen } from './splashScreen';
import { URLExt } from '@jupyterlab/coreutils';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { createChat } from './chat';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { history, historyKeymap, insertNewlineAndIndent } from '@codemirror/commands';

function initializePosthog(cookiesEnabled: boolean) {
  posthog.init('phc_FnIUQkcrbS8sgtNFHp5kpMkSvL5ydtO1nd9mPllRQqZ', {
    api_host: 'https://d2yfaqny8nshvd.cloudfront.net',
    persistence: cookiesEnabled ? 'localStorage+cookie' : 'memory',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    mask_all_text: true,
    disable_session_recording: true
  });
}

const PLUGIN_ID = '@jupyterlab/pretzelai-extension:plugin';

const NUMBER_OF_SIMILAR_CELLS = 3;

const extension: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  autoStart: true,
  requires: [IRenderMimeRegistry, ICommandPalette, INotebookTracker, ISettingRegistry],
  activate: async (
    app: JupyterFrontEnd,
    rmRegistry: IRenderMimeRegistry,
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

    const placeholderEnabled =
      'Ask AI. Use @variable_name to reference defined variables and dataframes. Shift + Enter for new line. Enter to submit.';
    let openAiApiKey = '';
    let openAiBaseUrl = '';
    let openAiModel = '';
    let aiService: AiService = 'Use Pretzel AI Server';
    let azureBaseUrl = '';
    let azureDeploymentName = '';
    let azureApiKey = '';
    let aiClient: OpenAI | OpenAIClient | null = null;
    let posthogPromptTelemetry: boolean = true;
    let codeMatchThreshold: number;
    let isAIEnabled: boolean = false;

    const showSplashScreen = async (consent: string) => {
      if (consent === 'None') {
        initSplashScreen(settingRegistry);
      }
    };

    function setAIEnabled() {
      // check to make sure we have all the settings set
      if (aiService === 'OpenAI API key' && openAiApiKey && openAiModel) {
        isAIEnabled = true;
      } else if (aiService === 'Use Azure API' && azureBaseUrl && azureDeploymentName && azureApiKey) {
        isAIEnabled = true;
      } else if (aiService === 'Use Pretzel AI Server') {
        isAIEnabled = true;
      } else {
        isAIEnabled = false;
      }
    }

    async function loadSettings(updateFunc?: () => void) {
      try {
        const settings = await settingRegistry.load(PLUGIN_ID);
        const openAiSettings = settings.get('openAiSettings').composite as any;
        openAiApiKey = openAiSettings?.openAiApiKey || '';
        openAiBaseUrl = openAiSettings?.openAiBaseUrl || '';
        openAiModel = openAiSettings?.openAiModel;

        const azureSettings = settings.get('azureSettings').composite as any;
        azureBaseUrl = azureSettings?.azureBaseUrl || '';
        azureDeploymentName = azureSettings?.azureDeploymentName || '';
        azureApiKey = azureSettings?.azureApiKey || '';

        const aiServiceSetting = settings.get('aiService').composite;
        aiService = (aiServiceSetting as AiService) || 'Use Pretzel AI Server';
        posthogPromptTelemetry = settings.get('posthogPromptTelemetry').composite as boolean;
        codeMatchThreshold = (settings.get('codeMatchThreshold').composite as number) / 100;

        const cookieSettings = await settingRegistry.load('@jupyterlab/apputils-extension:notification');
        const posthogCookieConsent = cookieSettings.get('posthogCookieConsent').composite as string;

        initializePosthog(posthogCookieConsent === 'Yes');
        setAIEnabled();
        updateFunc?.();
        loadAIClient();
        showSplashScreen(posthogCookieConsent);
        const sidePanel = createChat({
          aiService,
          openAiApiKey,
          openAiBaseUrl,
          openAiModel,
          azureBaseUrl,
          azureApiKey,
          deploymentId: azureDeploymentName,
          notebookTracker,
          app,
          rmRegistry,
          aiClient,
          codeMatchThreshold
        });
        app.shell.add(sidePanel, 'right', { rank: 1000 });
      } catch (reason) {
        console.error('Failed to load settings for Pretzel', reason);
      }
    }
    loadSettings();

    function loadAIClient() {
      if (aiService === 'OpenAI API key') {
        aiClient = new OpenAI({
          apiKey: openAiApiKey,
          dangerouslyAllowBrowser: true
        });
      } else if (aiService === 'Use Azure API') {
        aiClient = new OpenAIClient(azureBaseUrl, new AzureKeyCredential(azureApiKey));
      } else {
        aiClient = null;
      }
    }
    loadAIClient(); // first time load, later settings will trigger this

    // Listen for future changes in settings
    settingRegistry.pluginChanged.connect(async (sender, plugin) => {
      if (plugin === extension.id) {
        const oldIsAIEnabled = isAIEnabled;
        const updateFunc = async () => {
          if (oldIsAIEnabled !== isAIEnabled) {
            const pretzelParentContainerAI = document.querySelector('.pretzelParentContainerAI');
            if (pretzelParentContainerAI) {
              pretzelParentContainerAI.remove();
            }
            commands.execute('pretzelai:replace-code');
          }
        };
        await loadSettings(updateFunc);
      }
    });

    notebookTracker.activeCellChanged.connect((sender, cell) => {
      if (cell && cell.model.type === 'code') {
        const codeCellModel = cell.model as CodeCellModel;
        codeCellModel.outputs.changed.connect(() => {
          const outputs = codeCellModel.outputs as OutputAreaModel;
          const errorOutput = findErrorOutput(outputs);
          if (errorOutput) {
            addFixErrorButton(
              cell.node.querySelector('.jp-RenderedText.jp-mod-trusted.jp-OutputArea-output') as HTMLElement,
              codeCellModel
            );
          }
        });
        addAskAIButton(cell.node);
      }
    });

    function findErrorOutput(outputs: OutputAreaModel): IOutputModel | undefined {
      for (let i = 0; i < outputs.length; i++) {
        const output = outputs.get(i);
        if (output.type === 'error') {
          return output;
        }
      }
      return undefined;
    }

    function addFixErrorButton(cellNode: HTMLElement, cellModel: CodeCellModel) {
      const existingButton = cellNode.querySelector('.fix-error-button');
      if (existingButton) {
        existingButton.remove();
      }

      const button = document.createElement('button');
      button.textContent = 'Fix Error with AI';
      button.className = 'fix-error-button';
      cellNode.appendChild(button);
      button.onclick = () => {
        posthog.capture('Fix Error with AI', {
          event_type: 'click',
          method: 'fix_error'
        });
        const existingButton = cellNode.querySelector('.fix-error-button');
        if (existingButton) {
          existingButton.remove();
        }
        handleFixError(cellModel);
      };
    }

    function addAskAIButton(cellNode: HTMLElement) {
      const existingButton = document.querySelector('.ask-ai-button');
      if (existingButton) {
        existingButton.remove();
      }

      const button = document.createElement('button');
      button.textContent = 'Ask AI';
      button.className = 'ask-ai-button';
      cellNode.appendChild(button);

      button.onclick = () => {
        posthog.capture('Ask AI', {
          event_type: 'click',
          method: 'ask_ai'
        });
        commands.execute('pretzelai:replace-code');
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
      let activeCell = notebookTracker.activeCell!;
      const statusElement = document.createElement('p');
      statusElement.style.marginLeft = '70px';
      statusElement.textContent = 'Calculating embeddings...';
      activeCell.node.appendChild(statusElement);

      const topSimilarities = await getTopSimilarities(
        originalCode,
        embeddings,
        NUMBER_OF_SIMILAR_CELLS,
        aiClient,
        aiService,
        cellModel.id,
        codeMatchThreshold
      );
      const prompt = generatePrompt('', originalCode, topSimilarities, '', traceback);
      let diffEditorContainer: HTMLElement = document.createElement('div');
      let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;

      const parentContainer = document.createElement('div');
      parentContainer.classList.add('pretzelParentContainerAI');
      activeCell.node.appendChild(parentContainer);

      diffEditor = renderEditor('', parentContainer, diffEditorContainer, diffEditor, monaco, originalCode);

      openAiStream({
        aiService,
        openAiApiKey,
        openAiBaseUrl,
        openAiModel,
        prompt,
        parentContainer,
        inputContainer: null,
        diffEditorContainer,
        diffEditor,
        monaco,
        oldCode: originalCode,
        azureBaseUrl,
        azureApiKey,
        deploymentId: azureDeploymentName,
        activeCell,
        commands,
        statusElement
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

    async function createEmbeddings(embeddingsJSON: Embedding[], cells: any[], path: string) {
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
      if (!isSetsEqual(oldSet, newSet)) {
        app.serviceManager.contents.save(path, {
          type: 'file',
          format: 'text',
          content: JSON.stringify(newEmbeddingsArray)
        });
      }
    }

    // Function to print the source of all cells once the notebook is defined
    async function getEmbeddings() {
      const notebook = notebookTracker.currentWidget;
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
            const embJSON = JSON.parse(file.content);
            createEmbeddings(embJSON, notebook!.model!.sharedModel.cells, embeddingsPath);
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
    }
    getEmbeddings();

    async function getVariableValue(variableName: string): Promise<string | null> {
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

    // remove this and import from utils, leaving it here to avoid merged conflicts for now
    const getSelectedCode = () => {
      const selection = notebookTracker.activeCell?.editor?.getSelection();
      const cellCode = notebookTracker.activeCell?.model.sharedModel.source;
      let extractedCode = '';
      if (
        selection &&
        (selection.start.line !== selection.end.line || selection.start.column !== selection.end.column)
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
      }
      // also return the selection
      return { extractedCode: extractedCode.trimEnd(), selection };
    };

    async function processTaggedVariables(userInput: string): Promise<string> {
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
      const listVars = await getVariableValue(getVarsCode);

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
          const variableType = await getVariableValue(`type(${variableName})`);

          // check if variableType is dataframe
          // if it is, get columns and add to modifiedUserInput
          if (variableType?.includes('DataFrame')) {
            const variableColumns = await getVariableValue(`${variableName}.columns`);
            modifiedUserInput += `\n\`${variableName}\` is a dataframe with the following columns: \`${variableColumns}\`\n`;
          } else if (variableType) {
            const variableValue = await getVariableValue(variableName);
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

    commands.addCommand(command, {
      label: 'Replace Cell Code',
      execute: () => {
        const activeCell = notebookTracker.activeCell;

        let diffEditorContainer: HTMLElement = document.createElement('div');
        let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;

        if (activeCell) {
          // Cmd K twice should toggle the box
          const existingDiv = activeCell.node.querySelector('.pretzelParentContainerAI');
          // this code is repeated with the removeHandler
          if (existingDiv) {
            // If so, delete that div
            existingDiv.remove();
            // Switch focus back to the Jupyter cell
            posthog.capture('Remove via Cmd K', {
              event_type: 'keypress',
              event_value: 'Cmd+k',
              method: 'remove'
            });
            const statusElements = activeCell.node.querySelectorAll('p.status-element');
            statusElements.forEach(element => element.remove());

            // Switch focus back to the Jupyter cell
            activeCell!.editor!.focus();
            return;
          }

          let oldCode = activeCell.model.sharedModel.source;

          const statusElement = document.createElement('p');
          statusElement.className = 'status-element';
          activeCell.node.appendChild(statusElement);

          // Create a parent container for all dynamically created elements
          const parentContainer = document.createElement('div');
          parentContainer.classList.add('pretzelParentContainerAI');
          activeCell.node.appendChild(parentContainer);
          // Create an input field and append it below the cell
          const inputContainer = document.createElement('div');
          inputContainer.className = 'input-container';
          parentContainer.appendChild(inputContainer);

          const inputField = document.createElement('div');
          inputField.classList.add('pretzelInputField');
          const oldPrompt = activeCell.model.getMetadata('currentPrompt');

          const state = EditorState.create({
            doc: oldPrompt || '',
            extensions: [
              markdown(),
              history({ newGroupDelay: 50 }),
              keymap.of(historyKeymap),
              isAIEnabled ? placeholder(placeholderEnabled) : placeholder(placeholderDisabled),
              EditorView.lineWrapping,
              EditorView.editable.of(isAIEnabled),
              // Enable syntax highlighting
              syntaxHighlighting(defaultHighlightStyle)
            ]
          });
          const inputView = new EditorView({
            state,
            parent: inputField
          });
          inputContainer.appendChild(inputField);
          inputView.dispatch({
            selection: { anchor: state.doc.length, head: state.doc.length }
          });
          inputView.dom.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
              posthog.capture('Remove via Escape', {
                event_type: 'keypress',
                event_value: 'esc',
                method: 'remove'
              });
              event.preventDefault();
              const activeCell = notebookTracker.activeCell;
              if (activeCell && activeCell.editor) {
                activeCell.editor.focus();
              }
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (event.shiftKey) {
                // insert a new line
                insertNewlineAndIndent({ state: inputView.state, dispatch: inputView.dispatch });
              } else if (!submitButton.disabled) {
                posthog.capture('Submit via Enter', {
                  event_type: 'keypress',
                  event_value: 'enter',
                  method: 'submit'
                });
                const currentPrompt = inputView.state.doc.toString();
                activeCell.model.setMetadata('currentPrompt', currentPrompt);
                handleSubmit(currentPrompt);
              }
            }
          });

          const inputFieldButtonsContainer = document.createElement('div');
          inputFieldButtonsContainer.className = 'input-field-buttons-container';
          inputContainer.appendChild(inputFieldButtonsContainer);
          // Move focus into the CodeMirror editor in inputField
          inputView.focus();

          const submitButton = document.createElement('button');
          submitButton.classList.add('pretzelInputSubmitButton');
          submitButton.textContent = 'Submit';
          submitButton.disabled = !isAIEnabled;
          submitButton.addEventListener('click', () => {
            posthog.capture('Submit via Click', {
              event_type: 'click',
              method: 'submit'
            });
            handleSubmit(inputView.state.doc.toString());
          });
          inputFieldButtonsContainer.appendChild(submitButton);

          const removeButton = document.createElement('button');
          removeButton.className = 'remove-button';
          removeButton.textContent = 'Remove';
          inputFieldButtonsContainer.appendChild(removeButton);
          const removeHandler = () => {
            posthog.capture('Remove via Click', {
              event_type: 'click',
              method: 'remove'
            });
            activeCell.node.removeChild(parentContainer);
            const statusElements = activeCell.node.querySelectorAll('p.status-element');
            statusElements.forEach(element => element.remove());

            // Switch focus back to the Jupyter cell
            activeCell!.editor!.focus();
          };
          removeButton.addEventListener('click', removeHandler);

          const handleSubmit = async (userInput: string) => {
            parentContainer.removeChild(inputContainer);
            const { extractedCode } = getSelectedCode();
            const injectCodeComment = '# INJECT NEW CODE HERE';
            let oldCodeInject = oldCode;
            statusElement.textContent = 'Calculating embeddings...';
            if (userInput !== '') {
              const isInject = userInput.toLowerCase().startsWith('inject') || userInput.toLowerCase().startsWith('ij');
              if (isInject && !extractedCode) {
                userInput = userInput.replace(/inject/i, '').replace(/ij/i, '');
                (activeCell!.editor! as CodeMirrorEditor).moveToEndAndNewIndentedLine();
                activeCell!.editor!.replaceSelection!(injectCodeComment);
                oldCodeInject = activeCell.model.sharedModel.source;
                activeCell.model.sharedModel.source = oldCode;
              }
              userInput = await processTaggedVariables(userInput);
              try {
                const topSimilarities = await getTopSimilarities(
                  userInput,
                  embeddings,
                  NUMBER_OF_SIMILAR_CELLS,
                  aiClient,
                  aiService,
                  activeCell.model.id,
                  codeMatchThreshold
                );

                const prompt = generatePrompt(
                  userInput,
                  isInject ? oldCodeInject : oldCode,
                  topSimilarities,
                  extractedCode,
                  '',
                  isInject
                );

                // if posthogPromptTelemetry is true, capture the prompt
                if (posthogPromptTelemetry) {
                  posthog.capture('prompt', { property: userInput });
                } else {
                  posthog.capture('prompt', { property: 'no_telemetry' });
                }
                diffEditor = renderEditor('', parentContainer, diffEditorContainer, diffEditor, monaco, oldCode);
                openAiStream({
                  aiService,
                  parentContainer,
                  diffEditorContainer,
                  diffEditor,
                  monaco,
                  oldCode,
                  inputContainer,
                  // OpenAI API
                  openAiApiKey,
                  openAiBaseUrl,
                  openAiModel,
                  prompt,
                  // Azure API
                  azureApiKey,
                  azureBaseUrl,
                  deploymentId: azureDeploymentName,
                  activeCell,
                  commands,
                  statusElement
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
