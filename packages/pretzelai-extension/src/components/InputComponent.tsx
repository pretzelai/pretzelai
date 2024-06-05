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
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { history, historyKeymap, insertNewlineAndIndent } from '@codemirror/commands';
import posthog from 'posthog-js';
import { FixedSizeStack } from '../utils';

import { LabIcon } from '@jupyterlab/ui-components';
import promptHistorySvg from '../../style/icons/prompt-history.svg';
import '../../style/base.css';

interface ISubmitButtonProps {
  handleClick: () => void;
  isDisabled: boolean;
}

const SubmitButton: React.FC<ISubmitButtonProps> = ({ handleClick, isDisabled }) => {
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
        Submit <span style={{ fontSize: '0.8em' }}>↵</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          Send prompt to AI for completion <strong>(Enter)</strong>
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
          Remove the AI prompt box <strong>({keyCombination})</strong>
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
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Cmd + Shift + H' : 'Ctrl + Shift + H';

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
          Populate with last prompt <strong>({keyCombination})</strong>
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
  initialPrompt?: string;
  activeCell: any;
}
const InputComponent: React.FC<IInputComponentProps> = ({
  isAIEnabled,
  placeholderEnabled,
  placeholderDisabled,
  handleSubmit,
  handleRemove,
  promptHistoryStack,
  setInputView,
  initialPrompt = '',
  activeCell
}) => {
  const inputFieldRef = useRef<HTMLDivElement>(null);
  const inputViewRef = useRef<EditorView | null>(null);
  const [promptHistoryIndex, setPromptHistoryIndex] = useState<number>(0); // how many items to skip

  const handlePromptHistory = (promptHistoryIndex: number = 0) => {
    if (promptHistoryStack.length > 0) {
      const oldPrompt = promptHistoryStack.get(promptHistoryIndex);
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
    if (inputFieldRef.current) {
      const state = EditorState.create({
        doc: initialPrompt,
        extensions: [
          markdown(),
          history({ newGroupDelay: 50 }),
          keymap.of(historyKeymap),
          isAIEnabled ? placeholder(placeholderEnabled) : placeholder(placeholderDisabled),
          EditorView.lineWrapping,
          EditorView.editable.of(isAIEnabled),
          syntaxHighlighting(defaultHighlightStyle)
        ]
      });

      const inputView = new EditorView({
        state,
        parent: inputFieldRef.current
      });
      setInputView(inputView);

      inputView.dispatch({
        selection: { anchor: state.doc.length, head: state.doc.length }
      });

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
          event.preventDefault();
          posthog.capture('Prompt History Back via Shortcut', {
            event_type: 'keypress',
            event_value: 'up_arrow',
            method: 'prompt_history'
          });
          setPromptHistoryIndex(prevIndex => {
            handlePromptHistory(prevIndex + 1);
            return prevIndex + 1;
          });
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          posthog.capture('Prompt History Forward via Shortcut', {
            event_type: 'keypress',
            event_value: 'down_arrow',
            method: 'prompt_history'
          });
          setPromptHistoryIndex(prevIndex => {
            handlePromptHistory(prevIndex - 1);
            return prevIndex - 1;
          });
        }
      });

      inputViewRef.current = inputView;
      // remove?
      setInputView(inputView);
      inputView.focus();
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
            handlePromptHistory(promptHistoryIndex);
            setPromptHistoryIndex(promptHistoryIndex + 1);
          }}
          promptHistoryIndex={promptHistoryIndex}
        />
      </div>
    </div>
  );
};

export default InputComponent;
