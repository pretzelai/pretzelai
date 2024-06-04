/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This file is a modified version of the original file from Jupyter AI.
// https://github.com/jupyterlab/jupyter-ai/blob/main/packages/jupyter-ai/src/components/mui-extras/tooltipped-icon-button.tsx

import React from 'react';
import { IconButton, TooltipProps } from '@mui/material';

import { ContrastingTooltip } from './contrasting-tooltip';

export type TooltippedIconButtonProps = {
  onClick: () => unknown;
  tooltip: string;
  children: JSX.Element;
  disabled?: boolean;
  placement?: TooltipProps['placement'];
  offset?: [number, number];
  'aria-label'?: string;
};

export function TooltippedIconButton(props: TooltippedIconButtonProps): JSX.Element {
  return (
    <ContrastingTooltip
      title={props.tooltip}
      placement={props.placement ?? 'top'}
      slotProps={{
        popper: {
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, -8]
              }
            }
          ]
        }
      }}
    >
      <span>
        <IconButton
          onClick={props.onClick}
          disabled={props.disabled}
          sx={{ lineHeight: 0, ...(props.disabled && { opacity: 0.5 }) }}
          aria-label={props['aria-label']}
        >
          {props.children}
        </IconButton>
      </span>
    </ContrastingTooltip>
  );
}
