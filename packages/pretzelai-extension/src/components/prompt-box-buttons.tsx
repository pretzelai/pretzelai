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
    <div className="prompt-history-button-container">
      <button
        className="prompt-history-button"
        title="Prompt History"
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <promptHistoryIcon.react tag="span" className="jp-Icon jp-Icon-20" />
      </button>
      {showTooltip && <div className="tooltip">Populate with last prompt</div>}
    </div>
  );
};

interface ISubmitButtonProps {
  handleClick: () => void;
  isDisabled: boolean;
}

const SubmitButton: React.FC<ISubmitButtonProps> = ({ handleClick, isDisabled }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="submit-button-container">
      <button
        className="pretzelInputSubmitButton"
        onClick={handleClick}
        disabled={isDisabled}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title="Submit ↵"
      >
        Submit <span style={{ fontSize: '0.8em' }}>↵</span>
      </button>
      {showTooltip && <div className="tooltip">Send input to AI (shortcut: Enter)</div>}
    </div>
  );
};

interface IRemoveButtonProps {
  handleClick: () => void;
}

const RemoveButton: React.FC<IRemoveButtonProps> = ({ handleClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Cmd + K' : 'Ctrl + K';
  const shortcut = isMac ? '⌘K' : '^K';

  return (
    <div className="remove-button-container">
      <button
        className="remove-button"
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`Remove ${shortcut}`}
      >
        Remove <span style={{ fontSize: '0.8em' }}>{shortcut}</span>
      </button>
      {showTooltip && <div className="tooltip">Remove the AI prompt box (shortcut: {keyCombination})</div>}
    </div>
  );
};
export default RemoveButton;

export { PromptHistoryButton, RemoveButton, SubmitButton };
