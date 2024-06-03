/* eslint-disable camelcase */
import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { history, historyKeymap, insertNewlineAndIndent, undo } from '@codemirror/commands';
import { PromptHistoryButton, RemoveButton, SubmitButton } from './prompt-box-buttons';
import posthog from 'posthog-js';

interface IInputFieldProps {
  isAIEnabled: boolean;
  placeholderEnabled: string;
  placeholderDisabled: string;
  handleSubmit: (input: string) => void;
  handleRemove: () => void;
  handlePromptHistory: () => void;
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
  setInputView,
  initialPrompt = '',
  activeCell // Add this prop
}) => {
  const inputFieldRef = useRef<HTMLDivElement>(null);
  const inputViewRef = useRef<EditorView | null>(null);

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
          posthog.capture('Remove via Escape', {
            event_type: 'keypress',
            event_value: 'esc',
            method: 'remove'
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
            activeCell.model.setMetadata('currentPrompt', currentPrompt);
            handleSubmit(currentPrompt);
          }
        }
        if (event.key === 'z' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          const undoResult = undo({ state: inputView.state, dispatch: inputView.dispatch });
          if (!undoResult) {
            const oldPrompt = activeCell.model.getMetadata('currentPrompt');
            if (oldPrompt) {
              inputView.dispatch({
                changes: { from: 0, to: inputView.state.doc.length, insert: oldPrompt }
              });
              inputView.dispatch({
                selection: { anchor: inputView.state.doc.length }
              });
            }
          }
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
        <RemoveButton handleClick={handleRemove} />
        <PromptHistoryButton handleClick={handlePromptHistory} activeCell={activeCell} />
      </div>
    </div>
  );
};

export default InputField;
