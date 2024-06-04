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
import { PromptHistoryButton, RemoveButton, SubmitButton } from './prompt-box-buttons';
import posthog from 'posthog-js';
import { FixedSizeStack } from '../utils';

interface IInputFieldProps {
  isAIEnabled: boolean;
  placeholderEnabled: string;
  placeholderDisabled: string;
  handleSubmit: (input: string) => void;
  handleRemove: () => void;
  handlePromptHistory: (promptHistoryIndex: number) => void;
  promptHistoryStack: FixedSizeStack<string>;
  setInputView: (view: EditorView) => void;
  initialPrompt?: string;
  activeCell: any; // Add this prop
}

const InputField: React.FC<IInputFieldProps> = ({
  isAIEnabled,
  placeholderEnabled,
  placeholderDisabled,
  handleSubmit,
  handleRemove,
  handlePromptHistory,
  promptHistoryStack,
  setInputView,
  initialPrompt = '',
  activeCell // Add this prop
}) => {
  const inputFieldRef = useRef<HTMLDivElement>(null);
  const inputViewRef = useRef<EditorView | null>(null);
  const [promptHistoryIndex, setPromptHistoryIndex] = useState<number>(0); // how many items to skip

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
      setInputView(inputView);
    }

    return () => {
      inputViewRef.current?.destroy();
    };
  }, [isAIEnabled, placeholderEnabled, placeholderDisabled, handleSubmit, handleRemove, setInputView, activeCell]);

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

export default InputField;
