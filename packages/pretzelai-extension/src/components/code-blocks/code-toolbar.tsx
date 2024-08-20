/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This file is a modified version of the original file from Jupyter AI.
// https://github.com/jupyterlab/jupyter-ai/blob/main/packages/jupyter-ai/src/components/code-blocks/code-toolbar.tsx

import React from 'react';
import { Box } from '@mui/material';
import { addAboveIcon, addBelowIcon } from '@jupyterlab/ui-components';

import { CopyButton } from './copy-button';
import replaceCellIconRaw from '../../../style/icons/replace-cell.svg';
import { LabIcon } from '@jupyterlab/ui-components';
import { INotebookTracker, Notebook, NotebookPanel } from '@jupyterlab/notebook';

const replaceCellIcon = new LabIcon({
  name: 'pretzelai::replace-cell',
  svgstr: replaceCellIconRaw
});

import { TooltippedIconButton } from '../mui-extras/tooltipped-icon-button';

export type CodeToolbarProps = {
  content: string;
  notebookTracker: INotebookTracker | null;
};

export function CodeToolbar(props: CodeToolbarProps): JSX.Element | null {
  // If there's no notebookTracker, return null (don't render anything)
  if (!props.notebookTracker || !props.notebookTracker.currentWidget) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '2px',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: '8px',
        marginBottom: '-2px'
      }}
    >
      <InsertAboveButton {...props} />
      <InsertBelowButton {...props} />
      <ReplaceButton {...props} />
      <CopyButton value={props.content} />
    </Box>
  );
}

type ToolbarButtonProps = {
  content: string;
  notebookTracker: INotebookTracker | null;
};

const insertCell = async (notebookTracker: INotebookTracker, content: string, index: number) => {
  if (notebookTracker.activeCell) {
    const nb = notebookTracker.currentWidget as NotebookPanel;
    const activeCellIndex = nb.model?.sharedModel.cells.findIndex(
      c => c.id === notebookTracker.activeCell?.model.sharedModel.id
    ) as number;
    const newCellIndex = activeCellIndex + index;
    nb.model?.sharedModel.insertCell(newCellIndex, {
      cell_type: 'code',
      source: content
    });

    // Wait for the cell to be added to the DOM
    await new Promise(resolve => setTimeout(resolve, 0));

    // Get the newly inserted cell
    const notebook = nb.content as Notebook;
    const newCell = notebook.widgets[newCellIndex];

    // Scroll to the new cell
    if (newCell) {
      await notebook.scrollToCell(newCell);
    }
  }
};

function InsertAboveButton({ notebookTracker, content }: ToolbarButtonProps) {
  const tooltip = 'Insert above active cell';

  if (!notebookTracker) return null;

  return (
    <TooltippedIconButton
      tooltip={tooltip}
      onClick={() => {
        insertCell(notebookTracker, content, 0).catch(console.error);
      }}
    >
      <addAboveIcon.react height="16px" width="16px" />
    </TooltippedIconButton>
  );
}

function InsertBelowButton({ notebookTracker, content }: ToolbarButtonProps) {
  const tooltip = 'Insert below active cell';

  if (!notebookTracker) return null;

  return (
    <TooltippedIconButton
      tooltip={tooltip}
      onClick={() => {
        insertCell(notebookTracker, content, 1).catch(console.error);
      }}
    >
      <addBelowIcon.react height="16px" width="16px" />
    </TooltippedIconButton>
  );
}

function ReplaceButton({ notebookTracker, content }: ToolbarButtonProps) {
  const tooltip = 'Replace active cell';

  if (!notebookTracker) return null;

  return (
    <TooltippedIconButton
      tooltip={tooltip}
      onClick={() => {
        if (notebookTracker.activeCell) {
          notebookTracker.activeCell.model.sharedModel.source = content;
        }
      }}
    >
      <replaceCellIcon.react height="16px" width="16px" />
    </TooltippedIconButton>
  );
}
