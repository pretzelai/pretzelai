/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import React, { useEffect, useState } from 'react';
import InputComponent from './InputComponent';
import { FixedSizeStack, generateAIStream, getSelectedCode, PromptMessage, readEmbeddings } from '../utils';
import { INotebookTracker } from '@jupyterlab/notebook';
import OpenAI from 'openai';
import { OpenAIClient } from '@azure/openai';
import { CommandRegistry } from '@lumino/commands';
import { JupyterFrontEnd } from '@jupyterlab/application';
import MistralClient from '@mistralai/mistralai';
import { IThemeManager, showErrorMessage } from '@jupyterlab/apputils';
import { EditorView } from 'codemirror';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { fixCode } from '../postprocessing';

import { ButtonsContainer } from './DiffButtonsComponent';
import { EditorState, Extension } from '@codemirror/state';
import { unifiedMergeView } from '@codemirror/merge';
import { python } from '@codemirror/lang-python';
import { highlightSpecialChars } from '@codemirror/view';
import { jupyterTheme } from '@jupyterlab/codemirror';
import { debounce } from 'lodash';
import { getDefaultSettings } from '../migrations/defaultSettings';

function applyDiffToEditor(
  editor: CodeMirrorEditor,
  original: string,
  modified: string,
  app: JupyterFrontEnd,
  isNewCodeGeneration = false
): EditorView {
  const extensions: Extension[] = [
    python(),
    jupyterTheme,
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
    highlightSpecialChars()
  ];

  if (!isNewCodeGeneration) {
    extensions.push(
      unifiedMergeView({
        original: original,
        mergeControls: false,
        gutter: false
      })
    );
  }
  // Create a new EditorView with the diff content
  const newView = new EditorView({
    state: EditorState.create({
      doc: modified,
      extensions: extensions
    }),
    parent: editor.editor.dom
  });

  // Hide the original editor view
  editor.editor.dom.classList.add('pretzel-hidden-editor');

  // Add a class for new code generation
  if (isNewCodeGeneration) {
    newView.dom.classList.add('pretzel-new-code-generation');
  }

  // add a streaming-now class to the new view
  newView.dom.classList.add('streaming-now');
  // Append the new view to the same parent as the original editor
  editor.host.appendChild(newView.dom);
  return newView;
}

interface IAIAssistantComponentProps {
  aiChatModelProvider: string;
  aiChatModelString: string;
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
  commands: CommandRegistry;
  traceback: string;
  placeholderEnabled: string;
  placeholderDisabled: string;
  promptHistoryStack: FixedSizeStack<PromptMessage>;
  isAIEnabled: boolean;
  handleRemove: () => void;
  notebookTracker: INotebookTracker;
  app: JupyterFrontEnd;
  aiClient: OpenAI | OpenAIClient | MistralClient | null;
  codeMatchThreshold: number;
  numberOfSimilarCells: number;
  posthogPromptTelemetry: boolean;
  themeManager: IThemeManager | null;
  onPromptHistoryUpdate: (newPrompt: PromptMessage) => Promise<void>;
  pretzelSettingsJSON: ReturnType<typeof getDefaultSettings> | null;
}

export const AIAssistantComponent: React.FC<IAIAssistantComponentProps> = props => {
  const [showInputComponent, setShowInputComponent] = useState(true);
  const [showStatusElement, setShowStatusElement] = useState(true);
  const [initialPrompt, setInitialPrompt] = useState<PromptMessage | null>(null);

  const [stream, setStream] = useState<AsyncIterable<any> | null>(null);
  const [statusElementText, setStatusElementText] = useState<string>('');

  const [diffView, setDiffView] = useState<EditorView | null>(null);
  const [newCode, setNewCode] = useState<string>('');
  const [oldCode, setOldCode] = useState<string>('');
  const [streamingDone, setStreamingDone] = useState<boolean>(false);

  const buttonsRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const componentHeight = 144;
    const bottomOffset = 30;
    const getCellPosition = () => {
      const cellRectFooter = props.notebookTracker
        .activeCell!.node.querySelector('.lm-Widget.jp-CellFooter.jp-Cell-footer')!
        .getBoundingClientRect();
      const cellRect = props.notebookTracker.activeCell!.node.getBoundingClientRect();

      const cellTop = cellRect.top;
      const cellBottom = cellRectFooter.bottom;
      const viewportHeight = window.innerHeight;

      return {
        cellTop,
        cellBottom,
        viewportHeight
      };
    };

    let removeScrollListener: () => void;

    const positionComponent = () => {
      if (containerRef.current && props.notebookTracker.activeCell) {
        const { cellTop, cellBottom, viewportHeight } = getCellPosition();
        const cellRect = props.notebookTracker.activeCell.node
          .querySelector('.lm-Widget.jp-CellFooter.jp-Cell-footer')!
          .getBoundingClientRect();

        if (cellBottom + componentHeight + bottomOffset > viewportHeight) {
          if (containerRef.current.classList.contains('fixed')) {
            if (cellTop > viewportHeight - (componentHeight + bottomOffset + 10)) {
              // Hide the component when the cell top goes below the component top
              containerRef.current.style.display = 'none';
            } else {
              // Show the component
              containerRef.current.style.display = 'block';
            }
          } else {
            containerRef.current.classList.add('fixed');
            containerRef.current.style.width = `${cellRect.width}px`;
          }
        } else {
          containerRef.current.classList.remove('fixed');
          containerRef.current.style.display = 'block';
          containerRef.current.style.width = '';
          removeScrollListener();
        }
      }
    };
    const { cellTop, cellBottom, viewportHeight } = getCellPosition();

    if (cellBottom + componentHeight + bottomOffset > viewportHeight) {
      // component would go below the viewport
      const fullCellAndComponentHeight = cellBottom - cellTop + (componentHeight + bottomOffset);
      if (fullCellAndComponentHeight < viewportHeight) {
        // in this case, the component is out of view, but the cell is
        // small enough to fit it and component in the viewport, so we can just scroll the cell
        const panel = props.notebookTracker.currentWidget;
        if (panel) {
          const scrollContainer = panel.node.querySelector('.jp-WindowedPanel-outer') as HTMLElement;
          if (scrollContainer) {
            setTimeout(
              () => {
                const currentScrollTop = scrollContainer.scrollTop;
                // how much to scroll? just enough to fill the cell and the component at the bottom
                const requiredScroll = cellTop - (viewportHeight - fullCellAndComponentHeight) + 10;

                scrollContainer.scrollTo({
                  top: currentScrollTop + requiredScroll,
                  behavior: 'smooth'
                });
              },
              cellBottom > viewportHeight - bottomOffset ? 100 : 0 // wait for the cell to render
            );
          }
        }
      } else {
        // in this case, the component is out of view, and the cell is too large
        // to fit in the viewport, so we need to scroll show with hover
        positionComponent(); // intitial adjustment
        const debouncedPositionComponent = debounce(positionComponent, 10);

        const handleScroll = () => {
          debouncedPositionComponent();
        };

        removeScrollListener = () => {
          const panel = props.notebookTracker.currentWidget;
          if (panel) {
            const scrollContainer = panel.node.querySelector('.jp-WindowedPanel-outer');
            if (scrollContainer) {
              scrollContainer.removeEventListener('scroll', handleScroll);
            }
          }
        };

        // Get the notebook panel
        const panel = props.notebookTracker.currentWidget;
        if (panel) {
          // Get the new scroll container node
          const scrollContainer = panel.node.querySelector('.jp-WindowedPanel-outer');

          if (scrollContainer) {
            // Add scroll event listener to the new scroll container
            scrollContainer.addEventListener('scroll', handleScroll);

            // Cleanup function
            return () => {
              removeScrollListener();
              debouncedPositionComponent.cancel();
            };
          }
        }
      }
    }
  }, []);

  useEffect(() => {
    if (props.traceback) {
      handleFixError();
    }
  }, []);

  useEffect(() => {
    if (streamingDone && diffView) {
      // remove the streaming-now class
      diffView.dom.classList.remove('streaming-now');
      const fixedCode = fixCode(newCode);
      diffView.dispatch({
        changes: {
          from: 0,
          to: diffView.state.doc.length,
          insert: fixedCode
        }
      });
      setNewCode(fixedCode);
      setShowStatusElement(false);
    }
  }, [streamingDone]);

  useEffect(() => {
    if (streamingDone && diffView && buttonsRef.current) {
      // Scroll the buttons into view, but align to the nearest edge
      buttonsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [streamingDone, diffView]);

  useEffect(() => {
    if (stream) {
      const accumulate = async () => {
        try {
          for await (const chunk of stream) {
            const newContent = chunk.choices[0]?.delta?.content || '';
            setNewCode(prevCode => prevCode + newContent);
          }
          setStreamingDone(true);
          setStatusElementText('');
        } catch (error) {
          console.error('Error processing stream:', error);
          setStreamingDone(true);
          setStatusElementText('');
        }
      };
      accumulate();
    }
  }, [stream]);

  useEffect(() => {
    if (!streamingDone && props.notebookTracker.activeCell && diffView) {
      const oldCodeLines = oldCode.split('\n');
      const newCodeLines = newCode.split('\n');
      if (newCodeLines.length > 1) {
        let diffCode = '';
        if (newCodeLines.length < oldCodeLines.length) {
          diffCode = [
            ...newCodeLines.slice(0, -1),
            oldCodeLines[newCodeLines.length - 1] + '\u200B',
            ...oldCodeLines.slice(newCodeLines.length)
          ].join('\n');
        } else {
          diffCode = newCode.split('\n').slice(0, -1).join('\n');
        }
        diffView.dispatch({
          changes: {
            from: 0,
            to: diffView.state.doc.length,
            insert: diffCode
          }
        });
        // add a class to the last changed line
        const changedLines = diffView.dom.querySelectorAll('.cm-changedLine');
        if (changedLines.length > 0) {
          changedLines[changedLines.length - 1].previousElementSibling?.classList.add('hidden-diff');
        }
      }
    }
  }, [newCode]);

  useEffect(() => {
    if (props.notebookTracker.activeCell?.model.getMetadata('isPromptEdit')) {
      setInitialPrompt(props.promptHistoryStack.get(1) || [{ type: 'text', text: '' }]);
      props.notebookTracker.activeCell.model.setMetadata('isPromptEdit', false);
    } else {
      setInitialPrompt([{ type: 'text', text: '' }]); // Set to empty string if no edit is needed
    }
  }, []);

  const handleFixError = async () => {
    setShowInputComponent(false);
    setShowStatusElement(true);
    setStatusElementText('Calculating embeddings...');
    const embeddings = await readEmbeddings(
      props.notebookTracker,
      props.app,
      props.aiClient,
      props.aiChatModelProvider
    );
    let oldCode = props.notebookTracker.activeCell!.model.sharedModel.source;
    setOldCode(oldCode);

    try {
      const stream = await generateAIStream({
        aiChatModelProvider: props.aiChatModelProvider,
        aiClient: props.aiClient,
        embeddings: embeddings,
        userInput: '',
        base64Images: [],
        oldCodeForPrompt: oldCode,
        traceback: props.traceback,
        notebookTracker: props.notebookTracker,
        codeMatchThreshold: props.codeMatchThreshold,
        numberOfSimilarCells: props.numberOfSimilarCells,
        posthogPromptTelemetry: props.posthogPromptTelemetry,
        openAiApiKey: props.openAiApiKey,
        openAiBaseUrl: props.openAiBaseUrl,
        aiChatModelString: props.aiChatModelString,
        azureBaseUrl: props.azureBaseUrl,
        azureApiKey: props.azureApiKey,
        deploymentId: props.deploymentId,
        mistralApiKey: props.mistralApiKey,
        mistralModel: props.mistralModel,
        anthropicApiKey: props.anthropicApiKey,
        ollamaBaseUrl: props.ollamaBaseUrl,
        groqApiKey: props.groqApiKey,
        isInject: false
      });

      const activeCell = props.notebookTracker.activeCell;
      if (activeCell) {
        const editor = activeCell.editor as CodeMirrorEditor;
        const initialDiffView = applyDiffToEditor(editor, oldCode, oldCode, props.app, false);
        setDiffView(initialDiffView);
      }

      setStream(stream);
      setStatusElementText('Generating code...');
      setStreamingDone(false);
    } catch (error: any) {
      props.handleRemove();
      const errorMessage = error.message || 'An unknown error occurred';
      showErrorMessage('Error Generating Prompt', errorMessage);
      throw new Error(`Error generating prompt: ${errorMessage}`);
    }
  };

  const handleSubmit = async (userInput: string, base64Images: string[]) => {
    const { extractedCode } = getSelectedCode(props.notebookTracker);

    let activeCell = props.notebookTracker.activeCell;
    let embeddings = await readEmbeddings(props.notebookTracker, props.app, props.aiClient, props.aiChatModelProvider);

    if (userInput !== '') {
      setShowInputComponent(false);
      setShowStatusElement(true);
      setStatusElementText('Calculating embeddings...');
      let oldCode = activeCell!.model.sharedModel.source;
      setOldCode(oldCode);

      let oldCodeForPrompt = activeCell!.model.sharedModel.source;
      const isInject = userInput.toLowerCase().startsWith('inject') || userInput.toLowerCase().startsWith('ij');
      if (isInject && !extractedCode) {
        // here's what we do:
        // 1. get the old code, add a new line in the cell and add a comment saying 'INJECT NEW CODE HERE'
        // 2. send this changed code to generate the prompt
        // 3. restore the old code in the cell
        userInput = userInput.replace(/inject/i, '').replace(/ij/i, '');
        (activeCell!.editor! as CodeMirrorEditor).moveToEndAndNewIndentedLine();
        activeCell!.editor!.replaceSelection!('# INJECT NEW CODE HERE');
        oldCodeForPrompt = activeCell!.model.sharedModel.source;
        activeCell!.model.sharedModel.source = oldCode;
      }
      try {
        const stream = await generateAIStream({
          aiChatModelProvider: props.aiChatModelProvider,
          aiClient: props.aiClient,
          embeddings: embeddings,
          userInput,
          base64Images,
          oldCodeForPrompt,
          traceback: '',
          notebookTracker: props.notebookTracker,
          codeMatchThreshold: props.codeMatchThreshold,
          numberOfSimilarCells: props.numberOfSimilarCells,
          posthogPromptTelemetry: props.posthogPromptTelemetry,
          openAiApiKey: props.openAiApiKey,
          openAiBaseUrl: props.openAiBaseUrl,
          aiChatModelString: props.aiChatModelString,
          azureBaseUrl: props.azureBaseUrl,
          azureApiKey: props.azureApiKey,
          deploymentId: props.deploymentId,
          mistralApiKey: props.mistralApiKey,
          mistralModel: props.mistralModel,
          anthropicApiKey: props.anthropicApiKey,
          ollamaBaseUrl: props.ollamaBaseUrl,
          groqApiKey: props.groqApiKey,
          isInject: isInject
        });

        const editor = activeCell!.editor as CodeMirrorEditor;
        const initialDiffView = applyDiffToEditor(editor, oldCode, oldCode, props.app, oldCode.trim() === '');
        setDiffView(initialDiffView);

        setStream(stream);
        setStatusElementText('Generating code...');
        setStreamingDone(false);
      } catch (error: any) {
        props.handleRemove();
        const errorMessage = error.message || 'An unknown error occurred';
        showErrorMessage('Error Generating Prompt', errorMessage);
        throw new Error(`Error generating prompt: ${errorMessage}`);
      }
    }
  };

  const handleRemoveDiff = () => {
    const activeCell = props.notebookTracker.activeCell;
    if (activeCell && diffView) {
      const editor = activeCell.editor as CodeMirrorEditor;

      // Remove the diff view from the DOM
      editor.host.removeChild(diffView.dom);

      // Show the original editor view
      editor.editor.dom.classList.remove('pretzel-hidden-editor');

      // Clear the diff view state
      setDiffView(null);
    }
  };

  return (
    <div ref={containerRef}>
      {showStatusElement && <p className="status-element">{statusElementText}</p>}
      {showInputComponent && initialPrompt !== null && (
        <InputComponent
          isAIEnabled={props.isAIEnabled}
          handleSubmit={handleSubmit}
          handleRemove={props.handleRemove}
          promptHistoryStack={props.promptHistoryStack}
          setInputView={() => {}}
          initialPrompt={initialPrompt}
          activeCell={props.notebookTracker.activeCell!}
          placeholderEnabled={props.placeholderEnabled}
          placeholderDisabled={props.placeholderDisabled}
          themeManager={props.themeManager}
          onPromptHistoryUpdate={props.onPromptHistoryUpdate}
          pretzelSettingsJSON={props.pretzelSettingsJSON}
        />
      )}
      {streamingDone && diffView && (
        <div ref={buttonsRef}>
          <ButtonsContainer
            diffEditor={diffView}
            activeCell={props.notebookTracker.activeCell!}
            commands={props.commands}
            isErrorFixPrompt={!!props.traceback}
            oldCode={props.notebookTracker.activeCell!.model.sharedModel.source}
            newCode={newCode}
            handleRemove={() => {
              handleRemoveDiff();
              props.handleRemove();
            }}
          />
        </div>
      )}
    </div>
  );
};
