/* eslint-disable camelcase */
import { Dialog, showDialog } from '@jupyterlab/apputils';
import * as monaco from 'monaco-editor';
import React, { useEffect } from 'react';
import posthog from 'posthog-js';
import { Cell, ICellModel } from '@jupyterlab/cells';

import { CommandRegistry } from '@lumino/commands';

const AcceptAndRunButton: React.FC<{
  diffEditor: monaco.editor.IStandaloneDiffEditor;
  activeCell: Cell<ICellModel>;
  commands: CommandRegistry;
  handleRemove: () => void;
}> = ({ diffEditor, activeCell, commands, handleRemove }) => {
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
    <button onClick={handleClick} className="accept-and-run-button">
      Accept and Run
    </button>
  );
};

const AcceptButton: React.FC<{
  diffEditor: monaco.editor.IStandaloneDiffEditor;
  activeCell: Cell<ICellModel>;
  handleRemove: () => void;
}> = ({ diffEditor, activeCell, handleRemove }) => {
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
    <button onClick={handleClick} className="accept-button">
      Accept
    </button>
  );
};

const RejectButton: React.FC<{
  activeCell: Cell<ICellModel>;
  oldCode: string;
  handleRemove: () => void;
}> = ({ activeCell, oldCode, handleRemove }) => {
  const handleClick = () => {
    activeCell.model.sharedModel.source = oldCode;
    posthog.capture('Reject', {
      event_type: 'click',
      method: 'reject'
    });
    handleRemove();
  };

  return (
    <button onClick={handleClick} className="reject-button">
      Reject
    </button>
  );
};

const EditPromptButton: React.FC<{
  activeCell: Cell<ICellModel>;
  commands: CommandRegistry;
  handleRemove: () => void;
}> = ({ activeCell, commands, handleRemove }) => {
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
    <button onClick={handleClick} className="edit-prompt-button">
      Edit Prompt
    </button>
  );
};
const InfoIcon: React.FC = () => {
  const handleClick = () => {
    const richTextBody = (
      <div>
        <p>
          <b>
            Accept and Run (shortcut: <u>Shift + Enter</u>)
          </b>
          : Will put the code in current Jupyter cell AND run it.
        </p>
        <p>
          <b>
            Accept (shortcut: <u>Enter</u>)
          </b>
          : Will put the code in current Jupyter cell but WILL NOT run it.
        </p>
        <p>
          <b>Reject</b>: Will reject the generated code. Your cell will return to the state it was before.
        </p>
        <p>
          <b>Edit Prompt</b>: Go back to writing the editing your initial prompt.
        </p>
        <p>
          See more in the README <a href="https://github.com/pretzelai/pretzelai?tab=readme-ov-file#usage">here</a>.
        </p>
      </div>
    );

    showDialog({
      title: 'Using AI Features',
      body: richTextBody,
      buttons: [
        Dialog.createButton({
          label: 'Close',
          className: 'jp-About-button jp-mod-reject jp-mod-styled'
        })
      ]
    });
  };

  return (
    <div className="info-icon" onClick={handleClick}>
      <svg
        className="w-6 h-6 text-gray-800 dark:text-white"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M9.529 9.988a2.502 2.502 0 1 1 5 .191A2.441 2.441 0 0 1 12 12.582V14m-.01 3.008H12M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
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
      <InfoIcon />
    </div>
  );
};
