import React, { useState } from 'react';
import { LabIcon } from '@jupyterlab/ui-components';
import promptHistorySvg from '../../style/icons/prompt-history.svg';
import '../../style/base.css';

const encodedSvgStr = encodeURIComponent(promptHistorySvg);

const promptHistoryIcon = new LabIcon({
  name: 'pretzelai::prompt-history',
  svgstr: encodedSvgStr
});

const PromptHistoryButton: React.FC<{ handleClick: () => void }> = ({ handleClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="prompt-history-button">
      <button
        title="Prompt History"
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <promptHistoryIcon.react tag="span" className="jp-Icon jp-Icon-20" />
        {showTooltip && <div className="tooltip">Populate last prompt</div>}
      </button>
    </div>
  );
};

interface ISubmitButtonProps {
  handleClick: () => void;
  isDisabled: boolean;
}

const SubmitButton: React.FC<ISubmitButtonProps> = ({ handleClick, isDisabled }) => {
  return (
    <button className="pretzelInputSubmitButton" onClick={handleClick} disabled={isDisabled}>
      Submit
    </button>
  );
};

interface IRemoveButtonProps {
  handleClick: () => void;
}

const RemoveButton: React.FC<IRemoveButtonProps> = ({ handleClick }) => {
  return (
    <button className="remove-button" onClick={handleClick}>
      Remove
    </button>
  );
};

export default RemoveButton;

export { SubmitButton, PromptHistoryButton };
