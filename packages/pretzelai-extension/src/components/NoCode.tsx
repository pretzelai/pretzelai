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
import { INotebookTracker } from '@jupyterlab/notebook';
import posthog from 'posthog-js';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { CommandRegistry } from '@lumino/commands';
import { getCompletion, getVariableValue } from '../utils';
import { AiService } from '../prompt';

interface INoCodeButtonProps {
  label: string;
  onClick: () => void;
}

const NoCodeButton: React.FC<INoCodeButtonProps> = ({ label, onClick }) => {
  return (
    <div>
      <button
        onClick={onClick}
        style={{
          backgroundColor: 'var(--jp-brand-color1)',
          borderRadius: 'var(--jp-border-radius, 5px)',
          border: 'none',
          maxWidth: '150px',
          minHeight: '25px',
          marginTop: 'var(--jp-ui-margin, 10px)',
          marginRight: 'var(--jp-ui-margin, 10px)',
          color: 'var(--jp-ui-inverse-font-color1)'
        }}
      >
        {label}
      </button>
    </div>
  );
};

interface INoCodeProps {
  notebookTracker: INotebookTracker;
  app: JupyterFrontEnd;
  commands: CommandRegistry;
  handleRemove: () => void;
  aiService: AiService;
  openAiApiKey: string;
  openAiModel: string;
  openAiBaseUrl: string;
}

const NoCode: React.FC<INoCodeProps> = ({
  notebookTracker,
  app,
  commands,
  handleRemove,
  aiService,
  openAiApiKey,
  openAiModel,
  openAiBaseUrl
}) => {
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

  const TEMP_PATH_TESTING = 'pretzelai_visual/public/';

  const listCsvFiles = async (): Promise<string[]> => {
    try {
      const contents = await app.serviceManager.contents.get(TEMP_PATH_TESTING);
      const files = contents.content.filter((file: any) => file.name.endsWith('.csv')).map((file: any) => file.name);
      return files;
    } catch (error) {
      console.error('Error listing CSV files:', error);
      return [];
    }
  };

  const insertCodeIntoCell = (code: string) => {
    if (notebookTracker.activeCell && notebookTracker.activeCell.model) {
      notebookTracker.activeCell.model.sharedModel.source = code;
      commands.execute('notebook:run-cell');
    }
    handleRemove();
  };

  const handleReadCsv = () => {
    posthog.capture('No Code Operation', {
      operation: 'read_csv'
    });
    insertCodeIntoCell(`import pandas as pd\n\ndf = pd.read_csv("${TEMP_PATH_TESTING + selectedFile}")\ndf`);
  };

  const handleCreatePlot = async () => {
    setIsLoading(true);
    posthog.capture('No Code Operation', {
      operation: 'create_plot'
    });
    const output = await getVariableValue(`df.columns`, notebookTracker);
    const columns = output ? output.substring(output.indexOf('[') + 1, output.lastIndexOf(']')) : '';
    const code = await getCompletion(
      `You need to write jupyter notebooks python code to fullfill the request of the user.
If the user wants to export/transform data it should be saved in "df_output" variable.
If the user asks for a chart or plot use the python plotly library with "import plotly.graph_objects as go" (include the import in the code).
Pandas is already loaded in the kernel and the data is loaded in a pandas dataframe named "df".
The columns of the dataframe are: [${columns}]

The user wants:
\`\`\`
Make a chart
\`\`\`
Output ONLY python code, not backquotes or anything else`,
      aiService,
      openAiApiKey,
      openAiModel,
      openAiBaseUrl
    );
    const cleanedCode = code.replace(/```python\n|```/g, '').trim();
    insertCodeIntoCell(cleanedCode);
    setIsLoading(false);
  };

  return (
    <div
      style={{
        marginTop: 'var(--jp-ui-margin, 10px)',
        marginLeft: '72px',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={{ display: 'flex' }}>
        <select
          value={selectedFile}
          onChange={e => setSelectedFile(e.target.value)}
          style={{
            backgroundColor: 'var(--jp-layout-color1)',
            color: 'var(--jp-ui-font-color1)',
            border: '1px solid var(--jp-border-color1)',
            borderRadius: 'var(--jp-border-radius)',
            padding: 'var(--jp-ui-padding)',
            fontSize: 'var(--jp-ui-font-size1)',
            marginTop: 'var(--jp-ui-margin, 10px)',
            marginRight: 'var(--jp-ui-margin, 10px)',
            height: '25px',
            width: 'auto',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {csvFiles.map(file => (
            <option key={file} value={file}>
              {file}
            </option>
          ))}
        </select>
        <NoCodeButton label="Read CSV" onClick={handleReadCsv} />
        <NoCodeButton label="Create Plot" onClick={handleCreatePlot} />
      </div>
      {isLoading && <div className="pretzelInputField">Loading...</div>}
    </div>
  );
};

export default NoCode;
