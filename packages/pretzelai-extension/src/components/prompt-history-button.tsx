import React from 'react';
import { LabIcon } from '@jupyterlab/ui-components';
import promptHistorySvg from '../../style/icons/prompt-history.svg';

const encodedSvgStr = encodeURIComponent(promptHistorySvg);

const promptHistoryIcon = new LabIcon({
  name: 'pretzelai::prompt-history',
  svgstr: encodedSvgStr
});

const PromptHistoryButton: React.FC = () => {
  return (
    <div className="prompt-history-button">
      <button
        style={{
          backgroundColor: 'var(--jp-layout-color1)',
          color: 'var(--jp-ui-font-color1)',
          border: '1px solid var(--jp-border-color2)',
          borderRadius: 'var(--jp-border-radius)'
        }}
        title="Prompt History"
        onClick={() => {
          console.log('Prompt history button clicked');
        }}
      >
        <promptHistoryIcon.react tag="span" className="jp-Icon jp-Icon-20" />
      </button>
    </div>
  );
};

export default PromptHistoryButton;
