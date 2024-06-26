/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import React, { useEffect, useState } from 'react';
import { Cell, ICellModel } from '@jupyterlab/cells';
import posthog from 'posthog-js';
import { JupyterFrontEnd } from '@jupyterlab/application';

interface INoCodeButtonProps {
  label: string;
  onClick: () => void;
}

const NoCodeButton: React.FC<INoCodeButtonProps> = ({ label, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="submit-button-container">
      <button
        className="pretzelInputSubmitButton"
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {label}
      </button>
      {showTooltip && <div className="tooltip">Insert {label.toLowerCase()} code snippet</div>}
    </div>
  );
};

interface INoCodeProps {
  activeCell: Cell<ICellModel>;
  app: JupyterFrontEnd;
}

const NoCode: React.FC<INoCodeProps> = ({ activeCell, app }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [csvFiles, setCsvFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');

  useEffect(() => {
    // Fetch CSV files in the directory
    const fetchCsvFiles = async () => {
      try {
        const files = await listCsvFiles();
        setCsvFiles(files);
        if (files.length > 0) {
          setSelectedFile(files[0]);
        }
      } catch (error) {
        console.error('Error fetching CSV files:', error);
      }
    };

    fetchCsvFiles();
  }, []);

  const listCsvFiles = async (): Promise<string[]> => {
    try {
      const contents = await app.serviceManager.contents.get('');
      const files = contents.content.filter((file: any) => file.name.endsWith('.csv')).map((file: any) => file.name);
      return files;
    } catch (error) {
      console.error('Error listing CSV files:', error);
      return [];
    }
  };

  const insertCodeIntoCell = (code: string) => {
    if (activeCell && activeCell.model) {
      activeCell.model.sharedModel.source = code;
    }
  };

  const handleButtonClick = (operation: string) => {
    setIsLoading(true);
    posthog.capture('No Code Operation', {
      operation: operation
    });

    // Simulating an async operation
    setTimeout(() => {
      let code = '';
      switch (operation) {
        case 'read_csv':
          code = `import pandas as pd\n\ndf = pd.read_csv("${selectedFile}")`;
          break;
        case 'plot':
          code = 'import matplotlib.pyplot as plt\n\nplt.plot(x, y)\nplt.show()';
          break;
        case 'train_test_split':
          code =
            'from sklearn.model_selection import train_test_split\n\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)';
          break;
        default:
          code = '# No operation selected';
      }

      insertCodeIntoCell(code);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="input-container">
      <h3>No Code Operations</h3>
      <div className="input-field-buttons-container">
        <select
          value={selectedFile}
          onChange={e => setSelectedFile(e.target.value)}
          className="jp-mod-styled"
          style={{
            backgroundColor: 'var(--jp-layout-color1)',
            color: 'var(--jp-ui-font-color1)',
            border: '1px solid var(--jp-border-color1)',
            borderRadius: 'var(--jp-border-radius)',
            padding: 'var(--jp-ui-padding)',
            fontSize: 'var(--jp-ui-font-size1)',
            marginRight: 'var(--jp-ui-margin)',
            height: '25px',
            width: '100px'
          }}
        >
          {csvFiles.map(file => (
            <option key={file} value={file}>
              {file}
            </option>
          ))}
        </select>
        <NoCodeButton label="Read CSV" onClick={() => handleButtonClick('read_csv')} />
        <NoCodeButton label="Create Plot" onClick={() => handleButtonClick('plot')} />
        <NoCodeButton label="Train-Test Split" onClick={() => handleButtonClick('train_test_split')} />
      </div>
      {isLoading && <div className="pretzelInputField">Loading...</div>}
    </div>
  );
};

export default NoCode;
