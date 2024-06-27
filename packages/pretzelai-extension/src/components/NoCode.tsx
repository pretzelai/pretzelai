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
import Select from 'react-select';

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

const PlotOptions: React.FC<{
  columns: string[];
  onPlot: (prompt: string) => void;
}> = ({ columns, onPlot }) => {
  const [selectedXAxis, setSelectedXAxis] = useState<string | null>(null);
  const [selectedYAxis, setSelectedYAxis] = useState<string | null>(null);
  const [selectedChartType, setSelectedChartType] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const chartTypes = ['Line', 'Bar', 'Scatter', 'Pie'];

  const generatePrompt = () => {
    return `You need to write jupyter notebooks python code to make a chart with plotly.
Make a ${selectedChartType} chart with the x axis ${selectedXAxis} and the y axis ${selectedYAxis}.
pandas is already loaded in the python kernel, but you need to import plotly with "import plotly.graph_objects as go"
The dataframe with the data for the plot is already in the kernel saved in variable "df"
The columns of "df" are: [${columns.join(', ')}]
I also have this extra remarks
${remarks}
Output ONLY python code, not backquotes or anything else`;
  };

  const columnOptions = columns.map(col => ({ value: col, label: col }));
  const chartTypeOptions = chartTypes.map(type => ({ value: type, label: type }));

  const customStyles = {
    control: (provided: any) => ({
      ...provided,
      backgroundColor: 'var(--jp-layout-color2)',
      borderColor: 'var(--jp-border-color1)',
      color: 'var(--jp-content-font-color1)',
      minWidth: '150px'
    }),
    menu: (provided: any) => ({
      ...provided,
      backgroundColor: 'var(--jp-layout-color2)'
    }),
    option: (provided: any, state: { isSelected: any }) => ({
      ...provided,
      backgroundColor: state.isSelected ? 'var(--jp-brand-color1)' : 'var(--jp-layout-color2)',
      color: state.isSelected ? 'var(--jp-ui-inverse-font-color1)' : 'var(--jp-content-font-color1)'
    }),
    singleValue: (provided: any) => ({
      ...provided,
      color: 'var(--jp-content-font-color1)'
    })
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '15px',
        backgroundColor: 'var(--jp-layout-color1)',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Select
          options={columnOptions}
          onChange={option => setSelectedXAxis(option ? option.value : null)}
          placeholder="Select X Axis"
          styles={customStyles}
        />
        <Select
          options={columnOptions}
          onChange={option => setSelectedYAxis(option ? option.value : null)}
          placeholder="Select Y Axis"
          styles={customStyles}
        />
        <Select
          options={chartTypeOptions}
          onChange={option => setSelectedChartType(option ? option.value : null)}
          placeholder="Select Chart Type"
          styles={customStyles}
        />
        <input
          type="text"
          placeholder="Other remarks"
          onChange={e => setRemarks(e.target.value)}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid var(--jp-border-color1)',
            backgroundColor: 'var(--jp-layout-color2)',
            color: 'var(--jp-content-font-color1)',
            flexGrow: 1
          }}
        />
      </div>
      <button
        onClick={() => onPlot(generatePrompt())}
        style={{
          padding: '10px 15px',
          borderRadius: '4px',
          border: 'none',
          backgroundColor: 'var(--jp-brand-color1)',
          color: 'var(--jp-ui-inverse-font-color1)',
          cursor: 'pointer',
          transition: 'background-color 0.3s ease',
          alignSelf: 'flex-start'
        }}
      >
        Plot
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
  const [isCreatePlot, setIsCreatePlot] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);

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
    posthog.capture('No Code Operation', {
      operation: 'create_plot'
    });
    const output = await getVariableValue(`df.columns`, notebookTracker);
    const cols = output ? output.substring(output.indexOf('[') + 1, output.lastIndexOf(']')) : '';
    setColumns(eval(`[${cols}]`));
    setIsCreatePlot(true);
  };

  const onPlot = async (prompt: string) => {
    setIsLoading(true);
    const code = await getCompletion(prompt, aiService, openAiApiKey, openAiModel, openAiBaseUrl);
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
      {isCreatePlot && <PlotOptions columns={columns} onPlot={onPlot} />}
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
