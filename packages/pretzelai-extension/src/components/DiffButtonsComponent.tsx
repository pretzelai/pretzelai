/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import React, { useEffect, useState } from 'react';
import posthog from 'posthog-js';
import { Cell, ICellModel } from '@jupyterlab/cells';

import { CommandRegistry } from '@lumino/commands';
import { EditorView } from 'codemirror';

const AcceptAndRunButton: React.FC<{
  diffEditor: EditorView;
  activeCell: Cell<ICellModel>;
  commands: CommandRegistry;
  handleRemove: () => void;
  newCode: string;
}> = ({ diffEditor, activeCell, commands, handleRemove, newCode }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const keyCombination = 'Shift + Enter';
  const shortcut = '⇧↵';
  const isMac = /Mac/i.test(navigator.userAgent);
  const runOnlyKeyCombination = isMac ? 'Cmd + Enter' : 'Ctrl + Enter';

  const handleClick = () => {
    activeCell.model.sharedModel.setSource(newCode);
    posthog.capture('Accept and Run', {
      event_type: 'click',
      method: 'accept_and_run'
    });
    handleRemove();
    commands.execute('notebook:run-cell-and-select-next');
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
          Run code in the current cell and insert a new cell below.
          <br />
          Shortcut: <strong>{keyCombination}</strong>
          <br />
          Run code in the current cell only.
          <br />
          Shortcut: <strong>{runOnlyKeyCombination}</strong>
        </div>
      )}
    </div>
  );
};

// this button stays hidden and handles the Cmd+Enter shortcut
const AcceptRunCodeSameCellButton: React.FC<{
  diffEditor: EditorView;
  activeCell: Cell<ICellModel>;
  commands: CommandRegistry;
  handleRemove: () => void;
  newCode: string;
}> = ({ diffEditor, activeCell, commands, handleRemove, newCode }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Cmd + Enter' : 'Ctrl + Enter';
  const shortcut = isMac ? '⌘↵' : '^↵';

  const handleClick = () => {
    activeCell.model.sharedModel.setSource(newCode);
    posthog.capture('Accept and Run Same Cell', {
      event_type: 'click',
      method: 'accept_and_run_same_cell'
    });
    handleRemove();
    commands.execute('notebook:run-cell');
  };

  return (
    <div className="accept-run-code-same-cell-button-container" style={{ display: 'none' }}>
      <button
        onClick={handleClick}
        className="accept-run-code-same-cell-button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`Accept and Run Same Cell ${shortcut}`}
      >
        Run Cell <span style={{ fontSize: '0.8em' }}>{shortcut}</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          Run code in the current cell only
          <br />
          Shortcut: <strong>{keyCombination}</strong>
        </div>
      )}
    </div>
  );
};

const AcceptButton: React.FC<{
  diffEditor: EditorView;
  activeCell: Cell<ICellModel>;
  handleRemove: () => void;
  newCode: string;
}> = ({ diffEditor, activeCell, handleRemove, newCode }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Enter' : 'Enter';
  const shortcut = isMac ? '↵' : 'Enter';

  const handleClick = () => {
    activeCell.model.sharedModel.setSource(newCode);
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
  const shortcut = isMac ? 'Esc' : 'Esc';

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
  const shortcut = isMac ? '⌘Esc' : '⌃Esc';

  const handleClick = () => {
    activeCell.model.setMetadata('isPromptEdit', true);
    handleRemove();
    posthog.capture('Edit Prompt', {
      event_type: 'click',
      method: 'edit_prompt'
    });
    commands.execute('pretzelai:ai-code-gen');
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
  diffEditor: EditorView;
  activeCell: Cell<ICellModel>;
  commands: CommandRegistry;
  isErrorFixPrompt: boolean;
  oldCode: string;
  newCode: string;
  handleRemove: () => void;
}

export const ButtonsContainer: React.FC<IButtonsContainerProps> = ({
  diffEditor,
  activeCell,
  commands,
  isErrorFixPrompt,
  oldCode,
  newCode,
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
        if (event.key === 'Enter') {
          event.preventDefault();
          if (!event.shiftKey && !(event.metaKey || event.ctrlKey)) {
            const acceptButton = document.querySelector('.accept-button') as HTMLButtonElement;
            acceptButton.click();
          } else if (event.shiftKey) {
            const acceptAndRunButton = document.querySelector('.accept-and-run-button') as HTMLButtonElement;
            acceptAndRunButton.click();
          } else if (event.metaKey || event.ctrlKey) {
            const acceptRunCodeSameCellButton = document.querySelector(
              '.accept-run-code-same-cell-button'
            ) as HTMLButtonElement;
            acceptRunCodeSameCellButton.click();
          }
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
        newCode={newCode}
      />
      <AcceptRunCodeSameCellButton
        diffEditor={diffEditor}
        activeCell={activeCell}
        commands={commands}
        handleRemove={handleRemove}
        newCode={newCode}
      />
      <AcceptButton diffEditor={diffEditor} activeCell={activeCell} handleRemove={handleRemove} newCode={newCode} />
      <RejectButton activeCell={activeCell} oldCode={oldCode} handleRemove={handleRemove} />
      {!isErrorFixPrompt && (
        <EditPromptButton activeCell={activeCell} commands={commands} handleRemove={handleRemove} />
      )}
    </div>
  );
};
