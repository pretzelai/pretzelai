/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import React, { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { history, historyKeymap, insertNewlineAndIndent } from '@codemirror/commands';
import { Cell, ICellModel } from '@jupyterlab/cells';
import posthog from 'posthog-js';
import { FixedSizeStack } from '../utils';
import { globalState } from '../globalState';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

import { LabIcon } from '@jupyterlab/ui-components';
import promptHistorySvg from '../../style/icons/prompt-history.svg';

interface ISubmitButtonProps {
  handleClick: () => void;
  isDisabled: boolean;
  buttonText: string;
}

const SubmitButton: React.FC<ISubmitButtonProps> = ({ handleClick, isDisabled, buttonText }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="submit-button-container">
      <button
        className="pretzelInputSubmitButton"
        onClick={handleClick}
        disabled={isDisabled}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title="Submit ↵"
      >
        {buttonText} <span style={{ fontSize: '0.8em' }}>↵</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          {buttonText === 'Generate' ? 'Generate code with AI' : 'Edit code with AI'}
          <br />
          Shortcut: <strong>Enter</strong>
        </div>
      )}
    </div>
  );
};

interface IRemoveButtonProps {
  handleClick: () => void;
}

const RemoveButton: React.FC<IRemoveButtonProps> = ({ handleClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Cmd + K' : 'Ctrl + K';
  const shortcut = isMac ? '⌘K' : '^K';

  return (
    <div className="remove-button-container">
      <button
        className="remove-button"
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`Remove ${shortcut}`}
      >
        Remove <span style={{ fontSize: '0.8em' }}>{shortcut}</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          Remove the AI prompt box
          <br />
          Shortcut: <strong>{keyCombination}</strong>
        </div>
      )}
    </div>
  );
};

const encodedSvgStr = encodeURIComponent(promptHistorySvg);

const promptHistoryIcon = new LabIcon({
  name: 'pretzelai::prompt-history',
  svgstr: encodedSvgStr
});

const PromptHistoryButton: React.FC<{
  handleClick: (promptHistoryIndex: number) => void;
  promptHistoryIndex: number;
}> = ({ handleClick, promptHistoryIndex }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="prompt-history-button-container">
      <button
        className="prompt-history-button"
        title="Prompt History"
        onClick={() => {
          handleClick(promptHistoryIndex);
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <promptHistoryIcon.react tag="span" className="jp-Icon jp-Icon-20" />
      </button>
      {showTooltip && (
        <div className="tooltip">
          Populate with last prompt
          <br />
          Shortcut: <strong>Arrow Up Key</strong>
        </div>
      )}
    </div>
  );
};

interface IInputComponentProps {
  isAIEnabled: boolean;
  placeholderEnabled: string;
  placeholderDisabled: string;
  handleSubmit: (input: string) => void;
  handleRemove: () => void;
  promptHistoryStack: FixedSizeStack<string>;
  setInputView: (view: EditorView) => void;
  initialPrompt: string;
  activeCell: Cell<ICellModel>;
}
const InputComponent: React.FC<IInputComponentProps> = ({
  isAIEnabled,
  placeholderEnabled,
  placeholderDisabled,
  handleSubmit,
  handleRemove,
  promptHistoryStack,
  setInputView,
  initialPrompt,
  activeCell
}) => {
  const inputFieldRef = useRef<HTMLDivElement>(null);
  const inputViewRef = useRef<EditorView | null>(null);
  const [submitButtonText, setSubmitButtonText] = useState('Generate');
  const [promptHistoryIndex, setPromptHistoryIndex] = useState<number>(0); // how many items to skip

  const handlePromptHistory = (promptHistoryIndex: number = 0) => {
    let oldPrompt = '';
    if (promptHistoryIndex >= 0 && promptHistoryIndex < promptHistoryStack.length) {
      oldPrompt = promptHistoryStack.get(promptHistoryIndex);
      inputViewRef.current!.dispatch({
        changes: { from: 0, to: inputViewRef.current!.state.doc.length, insert: oldPrompt }
      });
      inputViewRef.current!.dispatch({
        selection: { anchor: inputViewRef.current!.state.doc.length }
      });
      inputViewRef.current!.focus();
    }
  };

  useEffect(() => {
    const updateSubmitButtonText = () => {
      if (activeCell && activeCell.model.sharedModel.source) {
        setSubmitButtonText('Edit Code');
      } else {
        setSubmitButtonText('Generate');
      }
    };

    // Call the function initially
    updateSubmitButtonText();

    // Listen to the stateChanged signal
    activeCell?.model.contentChanged.connect(() => {
      updateSubmitButtonText();
    });
  }, [activeCell]);

  const autocompleteExtension = autocompletion({
    override: [
      async (context: CompletionContext): Promise<CompletionResult | null> => {
        console.log('Autocomplete function called');
        let word = context.matchBefore(/@\w*/);
        if (!word || (word.from == word.to && !context.explicit)) return null;
        let options = globalState.availableVariables;
        console.log('Autocomplete options:', options);
        return {
          from: word.from,
          options: options.map(option => ({ label: option, type: 'variable' }))
        };
      }
    ],
    activateOnTyping: true,
    defaultKeymap: true
  });

  useEffect(() => {
    if (inputFieldRef.current) {
      console.log('Creating EditorView');
      const state = EditorState.create({
        doc: initialPrompt,
        extensions: [
          history({ newGroupDelay: 50 }),
          keymap.of(historyKeymap),
          isAIEnabled ? placeholder(placeholderEnabled) : placeholder(placeholderDisabled),
          EditorView.lineWrapping,
          EditorView.editable.of(isAIEnabled),
          syntaxHighlighting(defaultHighlightStyle),
          drawSelection(),
          autocompleteExtension,
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              console.log('Document changed:', update.state.doc.toString());
            }
            if (update.selectionSet) {
              console.log('Selection changed:', update.state.selection);
            }
            const autocompleteContainer = document.querySelector('.cm-tooltip-autocomplete');
            if (autocompleteContainer) {
              console.log('Autocomplete suggestions are in the DOM:', autocompleteContainer.innerHTML);
            } else {
              console.log('Autocomplete suggestions are not found in the DOM');
            }
          })
        ]
      });

      const inputView = new EditorView({
        state,
        parent: inputFieldRef.current
      });
      console.log('EditorView created');
      setInputView(inputView);

      inputView.dispatch({
        selection: { anchor: state.doc.length, head: state.doc.length }
      });
      console.log('EditorView dispatch completed');

      inputView.dom.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          posthog.capture('Back to Cell via Escape', {
            event_type: 'keypress',
            event_value: 'esc',
            method: 'back_to_cell'
          });
          event.preventDefault();
          if (activeCell && activeCell.editor) {
            activeCell.editor.focus();
          }
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (event.shiftKey) {
            insertNewlineAndIndent({ state: inputView.state, dispatch: inputView.dispatch });
          } else {
            posthog.capture('Submit via Enter', {
              event_type: 'keypress',
              event_value: 'enter',
              method: 'submit'
            });
            const currentPrompt = inputView.state.doc.toString();
            promptHistoryStack.push(currentPrompt);
            handleSubmit(currentPrompt);
          }
        }
        if (event.key === 'ArrowUp') {
          const { state } = inputViewRef.current!;
          const firstLine = state.doc.lineAt(0);
          const cursorPos = state.selection.main.head;

          if (cursorPos <= firstLine.to) {
            const currentPrompt = state.doc.toString();
            event.preventDefault();
            posthog.capture('Prompt History Back via Shortcut', {
              event_type: 'keypress',
              event_value: 'up_arrow',
              method: 'prompt_history'
            });
            setPromptHistoryIndex(prevIndex => {
              let finalIndex: number;
              if (prevIndex + 1 >= promptHistoryStack.length) {
                finalIndex = promptHistoryStack.length - 1;
              } else {
                finalIndex = prevIndex + 1;
              }
              handlePromptHistory(finalIndex);
              if (currentPrompt && prevIndex == 0) {
                promptHistoryStack.push(currentPrompt);
                finalIndex += 1;
              }
              return finalIndex;
            });
          }
        }

        if (event.key === 'ArrowDown') {
          const { state } = inputViewRef.current!;
          const firstLine = state.doc.lineAt(0);
          const lastLine = state.doc.lineAt(state.doc.length);
          const cursorPos = state.selection.main.head;

          if (cursorPos >= lastLine.from || cursorPos === firstLine.to) {
            event.preventDefault();
            posthog.capture('Prompt History Forward via Shortcut', {
              event_type: 'keypress',
              event_value: 'down_arrow',
              method: 'prompt_history'
            });
            setPromptHistoryIndex(prevIndex => {
              let finalIndex: number;
              if (prevIndex - 1 < 0) {
                finalIndex = 0;
              } else {
                finalIndex = prevIndex - 1;
              }
              handlePromptHistory(finalIndex);
              return finalIndex;
            });
          }
        }
        console.log('Key pressed:', event.key);
      });

      inputViewRef.current = inputView;
      setInputView(inputView);
      inputView.focus();
      console.log('EditorView focused');
    }

    return () => {
      inputViewRef.current?.destroy();
    };
  }, [isAIEnabled, handleSubmit, handleRemove, setInputView, activeCell]);

  return (
    <div className="input-container">
      <div className="pretzelInputField" ref={inputFieldRef}></div>
      <div className="input-field-buttons-container">
        <SubmitButton
          handleClick={() => {
            posthog.capture('Submit via Click', {
              event_type: 'click',
              method: 'submit'
            });
            handleSubmit(inputViewRef.current?.state.doc.toString() || '');
          }}
          isDisabled={!isAIEnabled}
          buttonText={submitButtonText}
        />
        <RemoveButton
          handleClick={() => {
            posthog.capture('Remove via Click', {
              event_type: 'click',
              method: 'remove'
            });
            handleRemove();
          }}
        />
        <PromptHistoryButton
          handleClick={(promptHistoryIndex: number) => {
            posthog.capture('Prompt History via Click', {
              event_type: 'click',
              method: 'prompt_history'
            });
            const currentPrompt = inputViewRef.current?.state.doc.toString();
            setPromptHistoryIndex(prevIndex => {
              let finalIndex: number;
              if (prevIndex + 1 >= promptHistoryStack.length) {
                finalIndex = promptHistoryStack.length - 1;
              } else {
                finalIndex = prevIndex + 1;
              }
              handlePromptHistory(finalIndex);
              if (currentPrompt && prevIndex == 0) {
                promptHistoryStack.push(currentPrompt);
                finalIndex += 1;
              }
              return finalIndex;
            });
          }}
          promptHistoryIndex={promptHistoryIndex}
        />
      </div>
    </div>
  );
};

export default InputComponent;
