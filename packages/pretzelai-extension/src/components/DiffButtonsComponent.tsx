/* eslint-disable camelcase */
import * as monaco from 'monaco-editor';
import React, { useEffect, useState } from 'react';
import posthog from 'posthog-js';
import { Cell, ICellModel } from '@jupyterlab/cells';

import { CommandRegistry } from '@lumino/commands';

const AcceptAndRunButton: React.FC<{
  diffEditor: monaco.editor.IStandaloneDiffEditor;
  activeCell: Cell<ICellModel>;
  commands: CommandRegistry;
  handleRemove: () => void;
}> = ({ diffEditor, activeCell, commands, handleRemove }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const keyCombination = 'Shift + Enter';
  const shortcut = '⇧↵';

  const handleClick = () => {
    const modifiedCode = diffEditor!.getModel()!.modified.getValue();
    activeCell.model.sharedModel.source = modifiedCode;
    commands.execute('notebook:run-cell');
    posthog.capture('Accept and Run', {
      event_type: 'click',
      method: 'accept_and_run'
    });
    handleRemove();
  };

  return (
    <div className="accept-and-run-button-container">
      <button
        onClick={handleClick}
        className="accept-and-run-button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`Accept and Run ${shortcut}`}
      >
        Run <span style={{ fontSize: '0.8em' }}>{shortcut}</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          Accept generated code into the cell <strong>and run it</strong>
          <br />
          Shortcut: <strong>{keyCombination}</strong>
        </div>
      )}
    </div>
  );
};

const AcceptButton: React.FC<{
  diffEditor: monaco.editor.IStandaloneDiffEditor;
  activeCell: Cell<ICellModel>;
  handleRemove: () => void;
}> = ({ diffEditor, activeCell, handleRemove }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Enter' : 'Enter';
  const shortcut = isMac ? '↵' : 'Enter';

  const handleClick = () => {
    const modifiedCode = diffEditor!.getModel()!.modified.getValue();
    activeCell.model.sharedModel.source = modifiedCode;
    posthog.capture('Accept', {
      event_type: 'click',
      method: 'accept'
    });
    handleRemove();
  };

  return (
    <div className="accept-button-container">
      <button
        onClick={handleClick}
        className="accept-button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`Accept ${shortcut}`}
      >
        Accept <span style={{ fontSize: '0.8em' }}>{shortcut}</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          Accept the code into the cell
          <br />
          Shortcut: <strong>{keyCombination}</strong>
        </div>
      )}
    </div>
  );
};

const RejectButton: React.FC<{
  activeCell: Cell<ICellModel>;
  oldCode: string;
  handleRemove: () => void;
}> = ({ activeCell, oldCode, handleRemove }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Esc' : 'Esc';
  const shortcut = isMac ? '⎋' : 'Esc';

  const handleClick = () => {
    activeCell.model.sharedModel.source = oldCode;
    posthog.capture('Reject', {
      event_type: 'click',
      method: 'reject'
    });
    handleRemove();
  };

  return (
    <div className="reject-button-container">
      <button
        onClick={handleClick}
        className="reject-button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`Reject ${shortcut}`}
      >
        Reject <span style={{ fontSize: '0.8em' }}>{shortcut}</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          Reject the changes and revert to the original code
          <br />
          Shortcut: <strong>{keyCombination}</strong>
        </div>
      )}
    </div>
  );
};

const EditPromptButton: React.FC<{
  activeCell: Cell<ICellModel>;
  commands: CommandRegistry;
  handleRemove: () => void;
}> = ({ activeCell, commands, handleRemove }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Cmd + Esc' : 'Ctrl+Esc';
  const shortcut = isMac ? '⌘⎋' : '⌃⎋';

  const handleClick = () => {
    activeCell.model.setMetadata('isPromptEdit', true);
    handleRemove();
    posthog.capture('Edit Prompt', {
      event_type: 'click',
      method: 'edit_prompt'
    });
    commands.execute('pretzelai:replace-code');
  };

  return (
    <div className="edit-prompt-button-container">
      <button
        onClick={handleClick}
        className="edit-prompt-button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`Edit Prompt ${shortcut}`}
      >
        Edit Prompt <span style={{ fontSize: '0.8em' }}>{shortcut}</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          Edit your last prompt
          <br />
          Shortcut: <strong>{keyCombination}</strong>
        </div>
      )}
    </div>
  );
};

interface IButtonsContainerProps {
  diffEditor: monaco.editor.IStandaloneDiffEditor;
  activeCell: Cell<ICellModel>;
  commands: CommandRegistry;
  isErrorFixPrompt: boolean;
  oldCode: string;
  handleRemove: () => void;
}

export const ButtonsContainer: React.FC<IButtonsContainerProps> = ({
  diffEditor,
  activeCell,
  commands,
  isErrorFixPrompt,
  oldCode,
  handleRemove
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, []);

  return (
    <div
      className="diff-buttons-container"
      tabIndex={0}
      ref={containerRef}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          const acceptButton = document.querySelector('.accept-button') as HTMLButtonElement;
          acceptButton.click();
        } else if (event.key === 'Enter' && event.shiftKey) {
          event.preventDefault();
          const acceptAndRunButton = document.querySelector('.accept-and-run-button') as HTMLButtonElement;
          acceptAndRunButton.click();
        } else if (event.key === 'Escape' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          const editPromptButton = document.querySelector('.edit-prompt-button') as HTMLButtonElement;
          editPromptButton.click();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          const rejectButton = document.querySelector('.reject-button') as HTMLButtonElement;
          rejectButton.click();
        }
      }}
    >
      <AcceptAndRunButton
        diffEditor={diffEditor}
        activeCell={activeCell}
        commands={commands}
        handleRemove={handleRemove}
      />
      <AcceptButton diffEditor={diffEditor} activeCell={activeCell} handleRemove={handleRemove} />
      <RejectButton activeCell={activeCell} oldCode={oldCode} handleRemove={handleRemove} />
      {!isErrorFixPrompt && (
        <EditPromptButton activeCell={activeCell} commands={commands} handleRemove={handleRemove} />
      )}
    </div>
  );
};
