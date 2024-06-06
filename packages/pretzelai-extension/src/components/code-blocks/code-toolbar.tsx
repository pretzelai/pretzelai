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
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';

const replaceCellIcon = new LabIcon({
  name: 'pretzelai::replace-cell',
  svgstr: replaceCellIconRaw
});

import { TooltippedIconButton } from '../mui-extras/tooltipped-icon-button';

export type CodeToolbarProps = {
  content: string;
  notebookTracker: INotebookTracker;
};

export function CodeToolbar(props: CodeToolbarProps): JSX.Element {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '6px 2px',
        marginBottom: '1em',
        border: '1px solid var(--jp-cell-editor-border-color)',
        borderTop: 'none'
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
  notebookTracker: INotebookTracker;
};

const insertCell = (notebookTracker: INotebookTracker, content: string, index: number) => {
  if (notebookTracker.activeCell) {
    const nb = notebookTracker.currentWidget as NotebookPanel;
    const activeCellIndex = nb.model?.sharedModel.cells.findIndex(
      c => c.id === notebookTracker.activeCell?.model.sharedModel.id
    ) as number;
    nb.model?.sharedModel.insertCell(activeCellIndex + index, {
      cell_type: 'code',
      source: content
    });
  }
};

function InsertAboveButton({ notebookTracker, content }: ToolbarButtonProps) {
  const tooltip = 'Insert above active cell';

  return (
    <TooltippedIconButton tooltip={tooltip} onClick={() => insertCell(notebookTracker, content, 0)}>
      <addAboveIcon.react height="16px" width="16px" />
    </TooltippedIconButton>
  );
}

function InsertBelowButton({ notebookTracker, content }: ToolbarButtonProps) {
  const tooltip = 'Insert below active cell';

  return (
    <TooltippedIconButton tooltip={tooltip} onClick={() => insertCell(notebookTracker, content, 1)}>
      <addBelowIcon.react height="16px" width="16px" />
    </TooltippedIconButton>
  );
}

function ReplaceButton({ notebookTracker, content }: ToolbarButtonProps) {
  const tooltip = 'Replace active cell';

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
