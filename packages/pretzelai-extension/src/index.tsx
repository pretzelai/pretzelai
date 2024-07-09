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
import { ILabShell, ILayoutRestorer, JupyterFrontEnd, JupyterFrontEndPlugin, LabShell } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import OpenAI from 'openai';
import MistralClient from '@mistralai/mistralai';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { AzureKeyCredential, OpenAIClient } from '@azure/openai';
import { FixedSizeStack, getEmbeddings, PLUGIN_ID } from './utils';

import posthog from 'posthog-js';
import { CodeCellModel } from '@jupyterlab/cells';
import { OutputAreaModel } from '@jupyterlab/outputarea';
import { IOutputModel } from '@jupyterlab/rendermime';
import { initSplashScreen } from './splashScreen';
import { createChat } from './chat';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { AIAssistantComponent } from './components/AIAssistantComponent';
import { ICompletionProviderManager } from '@jupyterlab/completer';
import { PretzelInlineProvider } from './PretzelInlineProvider';
import { IMainMenu } from '@jupyterlab/mainmenu';
import { PretzelSettings } from './components/PretzelSettings';
import { ReactWidget } from '@jupyterlab/apputils';
import { migrateSettings } from './migrations/migrations';

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

const NUMBER_OF_SIMILAR_CELLS = 3;

const extension: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  autoStart: true,
  requires: [
    IRenderMimeRegistry,
    ICommandPalette,
    INotebookTracker,
    ISettingRegistry,
    ICompletionProviderManager,
    IMainMenu
  ],
  optional: [ILayoutRestorer],
  activate: async (
    app: JupyterFrontEnd,
    rmRegistry: IRenderMimeRegistry,
    palette: ICommandPalette,
    notebookTracker: INotebookTracker,
    settingRegistry: ISettingRegistry,
    providerManager: ICompletionProviderManager,
    mainMenu: IMainMenu,
    restorer: ILayoutRestorer | null
  ) => {
    const provider = new PretzelInlineProvider(notebookTracker, settingRegistry, app);
    providerManager.registerInlineProvider(provider);
    // Change the shortcut to accept inline completion to the Tab key
    app.commands.addKeyBinding({
      command: 'inline-completer:accept',
      keys: ['Tab'], // New key combination
      selector: '.jp-mod-inline-completer-active'
    });
    const { commands } = app;
    const command = 'pretzelai:ai-code-gen';
    const isMac = /Mac/i.test(navigator.userAgent);
    const rightSidebarShortcut = isMac ? 'Ctrl+Cmd+B' : 'Ctrl+Alt+B';

    const placeholderDisabled =
      'To use AI features, please set your OpenAI API key or Azure API details in the Pretzel AI Settings.\n' +
      'You can also use the free Pretzel AI server.\n' +
      'Go To: Settings > Settings Editor > Pretzel AI Settings to configure';

    const placeholderEnabled =
      `Ask AI. Use ${rightSidebarShortcut} to toggle AI Chat sidebar.\n` +
      'Mention @variable in prompt to reference variables/dataframes.\n' +
      'Use ↑ / ↓ to cycle through prompt history for current browser session.\n' +
      'Shift + Enter for new line.';

    let aiChatModelProvider = '';
    let aiChatModelString = ''; // FIXME: This is not used but we should change code to use it directly
    let codeMatchThreshold: number;

    let openAiApiKey = '';
    let openAiBaseUrl = '';
    let openAiModel = '';

    let azureBaseUrl = '';
    let azureDeploymentName = '';
    let azureApiKey = '';

    let aiClient: OpenAI | OpenAIClient | MistralClient | null = null;
    let pretzelSettingsJSON: any = null;

    let posthogPromptTelemetry: boolean = true;
    let isAIEnabled: boolean = false;
    let promptHistoryStack: FixedSizeStack<string> = new FixedSizeStack<string>(50, '', '');

    const showSplashScreen = async (consent: string) => {
      if (consent === 'None') {
        initSplashScreen(settingRegistry);
      }
    };

    function setAIEnabled() {
      // check to make sure we have all the settings set
      if (aiChatModelProvider === 'OpenAI' && openAiApiKey && openAiModel) {
        isAIEnabled = true;
      } else if (aiChatModelProvider === 'Azure' && azureBaseUrl && azureDeploymentName && azureApiKey) {
        isAIEnabled = true;
      } else if (aiChatModelProvider === 'Pretzel AI') {
        isAIEnabled = true;
      } else {
        isAIEnabled = false;
      }
    }

    async function loadSettings(updateFunc?: () => void) {
      try {
        const settings = await settingRegistry.load(PLUGIN_ID);
        pretzelSettingsJSON = settings.get('pretzelSettingsJSON').composite as any;

        // Extract settings from pretzelSettingsJSON
        const features = pretzelSettingsJSON.features || {};
        const providers = pretzelSettingsJSON.providers || {};

        // AI Chat settings
        const aiChatSettings = features?.aiChat || {};
        aiChatModelProvider = aiChatSettings.modelProvider || 'Pretzel AI';
        aiChatModelString = aiChatSettings.modelString || 'gpt-4o';
        codeMatchThreshold = (aiChatSettings.codeMatchThreshold ?? 20) / 100;

        // OpenAI settings
        const openAiProvider = providers['OpenAI'] || {};
        openAiApiKey = openAiProvider?.apiSettings?.apiKey?.value || '';
        openAiBaseUrl = openAiProvider?.apiSettings?.baseUrl?.value || '';
        openAiModel = aiChatSettings.modelString || 'gpt-4o';

        // Azure settings
        const azureProvider = providers['Azure'] || {};
        azureBaseUrl = azureProvider?.apiSettings?.baseUrl?.value || '';
        azureDeploymentName = azureProvider?.apiSettings?.deploymentName?.value || '';
        azureApiKey = azureProvider?.apiSettings?.apiKey?.value || '';

        // Posthog settings
        posthogPromptTelemetry = features.posthogTelemetry?.posthogPromptTelemetry?.enabled ?? true;

        const cookieSettings = await settingRegistry.load('@jupyterlab/apputils-extension:notification');
        const posthogCookieConsent = cookieSettings.get('posthogCookieConsent').composite as string;

        initializePosthog(posthogCookieConsent === 'Yes');
        setAIEnabled();
        updateFunc?.();
        loadAIClient();
        initSidePanel();
        showSplashScreen(posthogCookieConsent);
      } catch (reason) {
        console.error('Failed to load settings for Pretzel', reason);
      }
    }

    async function migrateAndSetSettings(): Promise<void> {
      try {
        const settings = await settingRegistry.load(PLUGIN_ID);
        let pretzelSettingsJSON = settings.get('pretzelSettingsJSON').composite as any;
        let pretzelSettingsJSONVersion = settings.get('pretzelSettingsJSONVersion').composite as string;

        const currentVersion = pretzelSettingsJSON?.version || '1.0';
        const targetVersion = pretzelSettingsJSONVersion;

        if (Object.keys(pretzelSettingsJSON).length === 0 || currentVersion !== targetVersion) {
          pretzelSettingsJSON = await migrateSettings(settings, currentVersion, targetVersion);
          await settings.set('pretzelSettingsJSON', pretzelSettingsJSON);
        }

        await loadSettings();
      } catch (error) {
        console.error('Error migrating and setting settings:', error);
      }
    }
    await migrateAndSetSettings();

    // FIXME: this is only used for embeddings. We need to standardize this to work
    // when embedding model is not present to use local embddings
    function loadAIClient() {
      const aiChatSettings = pretzelSettingsJSON.features.aiChat;
      const aiChatModelProvider = aiChatSettings.modelProvider;
      const providers = pretzelSettingsJSON.providers;

      if (aiChatModelProvider === 'OpenAI') {
        const openAIProvider = providers.OpenAI;
        aiClient = new OpenAI({
          apiKey: openAIProvider.apiSettings.apiKey.value,
          dangerouslyAllowBrowser: true,
          baseURL: openAIProvider.apiSettings.baseUrl.value || undefined
        });
      } else if (aiChatModelProvider === 'Azure') {
        const azureProvider = providers.Azure;
        aiClient = new OpenAIClient(
          azureProvider.apiSettings.baseUrl.value,
          new AzureKeyCredential(azureProvider.apiSettings.apiKey.value)
        );
      } else if (aiChatModelProvider === 'Mistral') {
        const mistralProvider = providers.Mistral;
        aiClient = new MistralClient(mistralProvider.apiSettings.apiKey.value);
      } else {
        aiClient = null;
      }
    }
    loadAIClient(); // first time load, later settings will trigger this

    notebookTracker.currentChanged.connect(() => {
      getEmbeddings(notebookTracker, app, aiClient, aiChatModelProvider);
    });

    // getEmbeddings when a file is renamed
    app.serviceManager.contents.fileChanged.connect((sender, change) => {
      if (change.type === 'rename') {
        // wait for the file to be renamed before creating embeddings file
        setTimeout(() => {
          getEmbeddings(notebookTracker, app, aiClient, aiChatModelProvider);
        }, 2000);
      }
    });

    let debounceTimeout: NodeJS.Timeout | null = null;

    notebookTracker.activeCellChanged.connect((sender, cell) => {
      if (cell) {
        cell.model.contentChanged.connect(() => {
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
          }
          debounceTimeout = setTimeout(() => {
            getEmbeddings(notebookTracker, app, aiClient, aiChatModelProvider);
          }, 1000);
        });
      }
    });

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
            commands.execute('pretzelai:ai-code-gen');
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
      // Remove existing buttons from all cells before adding a new one
      document.querySelectorAll('.ask-ai-button-container').forEach(container => {
        container.remove();
      });

      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'ask-ai-button-container';

      const button = document.createElement('button');
      // get shortcut keybinding by checking if Mac
      const isMac = /Mac/i.test(navigator.userAgent);
      const shortcut = isMac ? '⌘K' : '^K';
      const shortcutText = isMac ? 'Cmd+K' : 'Ctrl+K';

      button.innerHTML = `Ask AI <span style="font-size: 0.8em;">${shortcut}</span>`;
      button.className = 'ask-ai-button';
      button.title = 'Ask AI ' + shortcut;
      buttonContainer.appendChild(button);

      // Tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'tooltip';
      tooltip.textContent = `Open the prompt box to instruct AI (${shortcutText})`;
      buttonContainer.appendChild(tooltip); // Append tooltip to buttonContainer
      cellNode.appendChild(buttonContainer); // Append buttonContainer to cellNode

      button.onclick = () => {
        posthog.capture('Ask AI', {
          event_type: 'click',
          method: 'ask_ai'
        });
        commands.execute('pretzelai:ai-code-gen');
      };

      button.onmouseenter = () => {
        tooltip.style.visibility = 'visible';
      };
      button.onmouseleave = () => {
        tooltip.style.visibility = 'hidden';
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
      const parentContainer = document.createElement('div');
      parentContainer.classList.add('pretzelParentContainerAI');
      notebookTracker.activeCell!.node.appendChild(parentContainer);

      const aiAssistantComponentRoot = createRoot(parentContainer);
      const handleRemove = () => {
        aiAssistantComponentRoot.unmount();
        parentContainer.remove();
      };

      aiAssistantComponentRoot.render(
        <AIAssistantComponent
          aiChatModelProvider={aiChatModelProvider}
          openAiApiKey={openAiApiKey}
          openAiBaseUrl={openAiBaseUrl}
          openAiModel={openAiModel}
          azureBaseUrl={azureBaseUrl}
          azureApiKey={azureApiKey}
          deploymentId={azureDeploymentName}
          commands={commands}
          traceback={traceback}
          placeholderEnabled={placeholderEnabled}
          placeholderDisabled={placeholderDisabled}
          promptHistoryStack={promptHistoryStack}
          isAIEnabled={isAIEnabled}
          handleRemove={handleRemove}
          notebookTracker={notebookTracker}
          app={app}
          aiClient={aiClient}
          codeMatchThreshold={codeMatchThreshold}
          numberOfSimilarCells={NUMBER_OF_SIMILAR_CELLS}
          posthogPromptTelemetry={posthogPromptTelemetry}
        />
      );
      parentContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    commands.addCommand(command, {
      label: 'Pretzel AI: Generate Code',
      execute: () => {
        if (notebookTracker.activeCell) {
          const existingDiv = notebookTracker.activeCell.node.querySelector('.pretzelParentContainerAI');
          if (existingDiv) {
            existingDiv.remove();
            posthog.capture('Remove via Cmd K', {
              event_type: 'keypress',
              event_value: 'Cmd+k',
              method: 'remove'
            });
            const statusElements = notebookTracker.activeCell.node.querySelectorAll('p.status-element');
            statusElements.forEach(element => element.remove());
            notebookTracker.activeCell!.editor!.focus();
            return;
          }

          const parentContainer = document.createElement('div');
          parentContainer.classList.add('pretzelParentContainerAI');
          notebookTracker.activeCell.node.appendChild(parentContainer);

          const aiAssistantComponentRoot = createRoot(parentContainer);

          const handleRemove = () => {
            aiAssistantComponentRoot.unmount();
            parentContainer.remove();
          };

          aiAssistantComponentRoot.render(
            <AIAssistantComponent
              aiChatModelProvider={aiChatModelProvider}
              openAiApiKey={openAiApiKey}
              openAiBaseUrl={openAiBaseUrl}
              openAiModel={openAiModel}
              azureBaseUrl={azureBaseUrl}
              azureApiKey={azureApiKey}
              deploymentId={azureDeploymentName}
              commands={commands}
              traceback={''}
              placeholderEnabled={placeholderEnabled}
              placeholderDisabled={placeholderDisabled}
              promptHistoryStack={promptHistoryStack}
              isAIEnabled={isAIEnabled}
              handleRemove={handleRemove}
              notebookTracker={notebookTracker}
              app={app}
              aiClient={aiClient}
              codeMatchThreshold={codeMatchThreshold}
              numberOfSimilarCells={NUMBER_OF_SIMILAR_CELLS}
              posthogPromptTelemetry={posthogPromptTelemetry}
            />
          );
        }
      }
    });

    // Function to create and add the side panel
    function createAndAddSidePanel(expandPanel = false) {
      const newSidePanel = createChat({
        aiChatModelProvider,
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
        codeMatchThreshold,
        posthogPromptTelemetry
      });
      newSidePanel.id = 'pretzelai-chat-panel';
      newSidePanel.node.classList.add('chat-sidepanel');

      const labShell = app.shell as LabShell;
      labShell.add(newSidePanel, 'right', { rank: 1000 });
      if (expandPanel) {
        app.shell.activateById(newSidePanel.id);
      }
      return newSidePanel;
    }

    function initSidePanel() {
      const labShell = app.shell as ILabShell;
      const sidePanel = Array.from(labShell.widgets('right')).find(widget => widget.id === 'pretzelai-chat-panel');
      const wasExpanded = sidePanel?.isVisible || false;

      if (sidePanel) {
        sidePanel.dispose();
      }
      const newSidePanel = createAndAddSidePanel(wasExpanded);

      // Add this block to restore the sidebar state
      if (restorer) {
        restorer.add(newSidePanel, 'pretzelai-chat-panel');
      }
    }

    function toggleChatPanel() {
      const labShell = app.shell as ILabShell;
      const sidePanel = Array.from(labShell.widgets('right')).find(widget => widget.id === 'pretzelai-chat-panel');
      const wasExpanded = sidePanel?.isVisible || false;

      if (sidePanel) {
        const inputArea = sidePanel.node.querySelector('textarea');
        if (document.activeElement === inputArea) {
          // If the input is focused, just collapse the right area without removing the panel
          labShell.collapseRight();
          notebookTracker.activeCell?.editor?.focus();
        } else {
          // If the side panel is open but input is not focused, focus the input
          labShell.activateById(sidePanel.id);
          inputArea?.focus();
        }
      } else {
        // If the side panel does not exist, create and add it
        createAndAddSidePanel(wasExpanded);
        // Ensure the side panel is focused after creation
        requestAnimationFrame(() => {
          const newlyCreatedPanel = Array.from(labShell.widgets('right')).find(
            widget => widget.id === 'pretzelai-chat-panel'
          );
          if (newlyCreatedPanel) {
            const inputArea = newlyCreatedPanel.node.querySelector('textarea');
            inputArea?.focus();
          }
        });
      }
    }

    commands.addCommand('pretzelai:toggle-chat-panel', {
      label: 'Toggle Chat Panel',
      execute: () => {
        toggleChatPanel();
      }
    });

    // Add key binding for the toggle command
    app.commands.addKeyBinding({
      command: 'pretzelai:toggle-chat-panel',
      keys: ['Ctrl Cmd B'],
      selector: 'body',
      winKeys: ['Ctrl Alt B']
    });
    const category = 'Cell Operations';
    palette.addItem({ command, category });

    app.commands.addKeyBinding({
      command,
      keys: ['Accel K'],
      selector: '.jp-Notebook'
    });

    const pretzelSettingsCommand = 'pretzelai:open-settings';
    commands.addCommand(pretzelSettingsCommand, {
      label: 'Pretzel AI Settings',
      execute: () => {
        const widget = ReactWidget.create(<PretzelSettings settingRegistry={settingRegistry} />);
        widget.id = 'pretzelai-settings';
        widget.title.label = 'Pretzel AI Settings';
        widget.title.closable = true;

        if (!widget.isAttached) {
          app.shell.add(widget, 'main');
        }
        app.shell.activateById(widget.id);
      }
    });

    mainMenu.settingsMenu.addItem({
      command: pretzelSettingsCommand,
      rank: 500
    });
  }
};

export default extension;
