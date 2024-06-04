/* eslint-disable camelcase */
import { Dialog, showDialog } from '@jupyterlab/apputils';
import * as monaco from 'monaco-editor';
import React from 'react';
import posthog from 'posthog-js';
import { IStreamingDiffEditorProps } from './StreamingDiffEditor';

const AcceptAndRunButton: React.FC<{
  diffEditor: monaco.editor.IStandaloneDiffEditor;
  parentContainer: HTMLElement;
  activeCell: any;
  commands: any;
  statusElement: HTMLElement;
}> = ({ diffEditor, parentContainer, activeCell, commands, statusElement }) => {
  const handleClick = () => {
    const modifiedCode = diffEditor!.getModel()!.modified.getValue();
    activeCell.model.sharedModel.source = modifiedCode;
    commands.execute('notebook:run-cell');
    activeCell.node.removeChild(parentContainer);
    statusElement.remove();
    posthog.capture('Accept and Run', {
      event_type: 'click',
      method: 'accept_and_run'
    });
  };

  return (
    <button onClick={handleClick} className="accept-and-run-button">
      Accept and Run
    </button>
  );
};

const AcceptButton: React.FC<{
  diffEditor: monaco.editor.IStandaloneDiffEditor;
  parentContainer: HTMLElement;
  activeCell: any;
  statusElement: HTMLElement;
}> = ({ diffEditor, parentContainer, activeCell, statusElement }) => {
  const handleClick = () => {
    const modifiedCode = diffEditor!.getModel()!.modified.getValue();
    activeCell.model.sharedModel.source = modifiedCode;
    activeCell.node.removeChild(parentContainer);
    statusElement.remove();
    posthog.capture('Accept', {
      event_type: 'click',
      method: 'accept'
    });
  };

  return (
    <button onClick={handleClick} className="accept-button">
      Accept
    </button>
  );
};

const RejectButton: React.FC<{
  parentContainer: HTMLElement;
  activeCell: any;
  statusElement: HTMLElement;
  oldCode: string;
}> = ({ parentContainer, activeCell, statusElement, oldCode }) => {
  const handleClick = () => {
    activeCell.node.removeChild(parentContainer);
    activeCell.model.sharedModel.source = oldCode;
    statusElement.remove();
    posthog.capture('Reject', {
      event_type: 'click',
      method: 'reject'
    });
  };

  return (
    <button onClick={handleClick} className="reject-button">
      Reject
    </button>
  );
};

const EditPromptButton: React.FC<{ parentContainer: HTMLElement; activeCell: any; commands: any }> = ({
  parentContainer,
  activeCell,
  commands
}) => {
  const handleClick = () => {
    parentContainer.remove();
    activeCell.model.setMetadata('isPromptEdit', true);
    commands.execute('pretzelai:replace-code');
    posthog.capture('Edit Prompt', {
      event_type: 'click',
      method: 'edit_prompt'
    });
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

interface IButtonsContainerProps extends IStreamingDiffEditorProps {
  diffEditor: monaco.editor.IStandaloneDiffEditor;
  parentContainer: HTMLElement;
  activeCell: any;
  commands: any;
  statusElement: HTMLElement;
  isErrorFixPrompt: boolean;
  oldCode: string;
}

export const ButtonsContainer: React.FC<IButtonsContainerProps> = ({
  diffEditor,
  parentContainer,
  activeCell,
  commands,
  statusElement,
  isErrorFixPrompt,
  oldCode
}) => {
  return (
    <div
      className="diff-buttons-container"
      tabIndex={0}
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
        parentContainer={parentContainer}
        activeCell={activeCell}
        commands={commands}
        statusElement={statusElement}
      />
      <AcceptButton
        diffEditor={diffEditor}
        parentContainer={parentContainer}
        activeCell={activeCell}
        statusElement={statusElement}
      />
      <RejectButton
        parentContainer={parentContainer}
        activeCell={activeCell}
        statusElement={statusElement}
        oldCode={oldCode}
      />
      {!isErrorFixPrompt && (
        <EditPromptButton parentContainer={parentContainer} activeCell={activeCell} commands={commands} />
      )}
      <InfoIcon />
    </div>
  );
};
