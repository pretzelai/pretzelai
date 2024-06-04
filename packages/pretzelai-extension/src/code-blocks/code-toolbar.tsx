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
import replaceCellIconRaw from '../../style/icons/replace-cell.svg';
import { LabIcon } from '@jupyterlab/ui-components';

const replaceCellIcon = new LabIcon({
  name: 'pretzelai::replace-cell',
  svgstr: replaceCellIconRaw
});

import { TooltippedIconButton } from '../mui-extras/tooltipped-icon-button';

export type CodeToolbarProps = {
  /**
   * The content of the Markdown code block this component is attached to.
   */
  content: string;
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
      <InsertAboveButton />
      <InsertBelowButton />
      <ReplaceButton />
      <CopyButton value={props.content} />
    </Box>
  );
}

function InsertAboveButton() {
  const tooltip = 'Insert above active cell';

  return (
    <TooltippedIconButton tooltip={tooltip} onClick={() => {}}>
      <addAboveIcon.react height="16px" width="16px" />
    </TooltippedIconButton>
  );
}

function InsertBelowButton() {
  const tooltip = 'Insert below active cell';

  return (
    <TooltippedIconButton tooltip={tooltip} onClick={() => {}}>
      <addBelowIcon.react height="16px" width="16px" />
    </TooltippedIconButton>
  );
}

function ReplaceButton() {
  const tooltip = 'Replace active cell';

  return (
    <TooltippedIconButton tooltip={tooltip} onClick={() => {}}>
      <replaceCellIcon.react height="16px" width="16px" />
    </TooltippedIconButton>
  );
}
