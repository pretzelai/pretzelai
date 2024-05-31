import React from 'react';
import { LabIcon } from '@jupyterlab/ui-components';
import promptHistorySvg from '../../style/icons/prompt-history.svg';

const promptHistoryIcon = new LabIcon({
  name: 'prompt-history',
  svgstr: promptHistorySvg
});

const PromptHistoryButton: React.FC = () => {
  return (
    <button
      style={{
        backgroundColor: 'var(--jp-layout-color1)',
        color: 'var(--jp-ui-font-color1)',
        border: '1px solid var(--jp-border-color2)',
        padding: 'var(--jp-ui-font-size1)',
        borderRadius: 'var(--jp-border-radius)'
      }}
      title="Prompt History"
      onClick={() => {
        console.log('Prompt history button clicked');
      }}
    >
      <promptHistoryIcon.react tag="span" className="jp-Icon jp-Icon-20" />
    </button>
  );
};

export default PromptHistoryButton;
