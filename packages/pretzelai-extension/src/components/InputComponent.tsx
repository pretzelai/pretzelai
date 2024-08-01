/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { Editor } from '@monaco-editor/react';
import { Cell, ICellModel } from '@jupyterlab/cells';
import posthog from 'posthog-js';
import { FixedSizeStack } from '../utils';
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
  setInputView: (view: any) => void;
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
  const [editorValue, setEditorValue] = useState(initialPrompt);
  const [submitButtonText, setSubmitButtonText] = useState('Generate');
  const [promptHistoryIndex, setPromptHistoryIndex] = useState<number>(0);
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    setInputView(editor);
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setEditorValue(value);
    }
  };

  const handlePromptHistory = (promptHistoryIndex: number = 0) => {
    if (promptHistoryIndex >= 0 && promptHistoryIndex < promptHistoryStack.length) {
      const oldPrompt = promptHistoryStack.get(promptHistoryIndex);
      setEditorValue(oldPrompt);
      editorRef.current?.focus();
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

    updateSubmitButtonText();

    activeCell?.model.contentChanged.connect(() => {
      updateSubmitButtonText();
    });
  }, [activeCell]);

  return (
    <div className="input-container">
      <Editor
        height="200px"
        defaultLanguage="markdown"
        defaultValue={initialPrompt}
        value={editorValue}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'off',
          folding: false,
          wordWrap: 'on',
          wrappingIndent: 'same',
          automaticLayout: true,
          readOnly: !isAIEnabled
        }}
      />
      <div className="input-field-buttons-container">
        <SubmitButton
          handleClick={() => {
            posthog.capture('Submit via Click', {
              event_type: 'click',
              method: 'submit'
            });
            handleSubmit(editorValue);
          }}
          isDisabled={!isAIEnabled}
          buttonText={submitButtonText}
        />
        <RemoveButton handleClick={handleRemove} />
        <PromptHistoryButton
          handleClick={index => {
            if (index >= 0 && index < promptHistoryStack.length) {
              const oldPrompt = promptHistoryStack.get(index);
              setEditorValue(oldPrompt);
              editorRef.current?.focus();
            }
          }}
          promptHistoryIndex={promptHistoryIndex}
        />
      </div>
    </div>
  );
};

export default InputComponent;
