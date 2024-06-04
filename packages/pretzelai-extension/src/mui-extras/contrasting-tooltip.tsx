/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This file is a modified version of the original file from Jupyter AI.
// https://github.com/jupyterlab/jupyter-ai/blob/main/packages/jupyter-ai/src/components/mui-extras/contrasting-tooltip.tsx

import React from 'react';
import { styled, Tooltip, tooltipClasses, TooltipProps } from '@mui/material';

export const ContrastingTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} arrow classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: theme.palette.common.black,
    color: theme.palette.common.white,
    boxShadow: theme.shadows[1],
    fontSize: 11
  },
  [`& .${tooltipClasses.arrow}`]: {
    color: theme.palette.common.black
  }
}));
