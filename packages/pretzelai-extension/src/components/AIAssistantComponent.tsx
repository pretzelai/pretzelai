import React, { useState } from 'react';
import InputComponent from './InputComponent';
import { DiffContainer } from './DiffContainer';
import { FixedSizeStack, generateAIStream, getSelectedCode, processTaggedVariables } from '../utils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { AiService, Embedding, generatePrompt } from '../prompt';
import OpenAI from 'openai';
import { OpenAIClient } from '@azure/openai';
import posthog from 'posthog-js';

interface IAIAssistantComponentProps {
  aiService: AiService;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  activeCell: any;
  commands: any;
  isErrorFixPrompt: boolean;
  oldCode: string;
  placeholderEnabled: string;
  placeholderDisabled: string;
  promptHistoryStack: FixedSizeStack<string>;
  isAIEnabled: boolean;
  handleRemove: () => void;
  notebookTracker: INotebookTracker;
  embeddings: Embedding[];
  aiClient: OpenAI | OpenAIClient | null;
  codeMatchThreshold: number;
  numberOfSimilarCells: number;
  posthogPromptTelemetry: boolean;
  skipInput?: boolean;
}

export const AIAssistantComponent: React.FC<IAIAssistantComponentProps> = props => {
  const [showInputComponent, setShowInputComponent] = useState(!props.skipInput);
  const [showDiffContainer, setShowDiffContainer] = useState(!!props.skipInput);
  const [showStatusElement, setShowStatusElement] = useState(true);

  const [stream, setStream] = useState<AsyncIterable<any> | null>(null);
  const [statusElementText, setStatusElementText] = useState<string>('');

  const handleSubmit = async (userInput: string) => {
    const { extractedCode } = getSelectedCode(props.notebookTracker);

    let activeCell = props.notebookTracker.activeCell;

    if (userInput !== '') {
      setShowStatusElement(true);
      setStatusElementText('Calculating embeddings...');

      let oldCodeForPrompt = props.oldCode;
      const isInject = userInput.toLowerCase().startsWith('inject') || userInput.toLowerCase().startsWith('ij');
      if (isInject && !extractedCode) {
        // here's what we do:
        // 1. get the old code, add a new line in the cell and add a comment saying 'INJECT NEW CODE HERE'
        // 2. send this changed code to generate the prompt
        // 3. restore the old code in the cell
        userInput = userInput.replace(/inject/i, '').replace(/ij/i, '');
        (activeCell!.editor! as CodeMirrorEditor).moveToEndAndNewIndentedLine();
        activeCell!.editor!.replaceSelection!('# INJECT NEW CODE HERE');
        oldCodeForPrompt = activeCell!.model.sharedModel.source;
        activeCell!.model.sharedModel.source = props.oldCode;
      }
      try {
        const stream = await generateAIStream({
          aiService: props.aiService,
          aiClient: props.aiClient,
          embeddings: props.embeddings,
          userInput,
          oldCodeForPrompt,
          notebookTracker: props.notebookTracker,
          codeMatchThreshold: props.codeMatchThreshold,
          numberOfSimilarCells: props.numberOfSimilarCells,
          posthogPromptTelemetry: props.posthogPromptTelemetry,
          openAiApiKey: props.openAiApiKey,
          openAiBaseUrl: props.openAiBaseUrl,
          openAiModel: props.openAiModel,
          azureBaseUrl: props.azureBaseUrl,
          azureApiKey: props.azureApiKey,
          deploymentId: props.deploymentId,
          isInject: isInject
        });

        setStream(stream);
        setShowInputComponent(false);
        setStatusElementText('Generating code...');
        setShowDiffContainer(true);
      } catch (error) {
        props.handleRemove();
        throw new Error('Error generating prompt');
      }
    }
  };

  return (
    <>
      {showStatusElement && <p className="status-element">{statusElementText}</p>}
      {showInputComponent && (
        <InputComponent
          isAIEnabled={props.isAIEnabled}
          handleSubmit={handleSubmit}
          handleRemove={props.handleRemove}
          promptHistoryStack={props.promptHistoryStack}
          setInputView={() => {}}
          initialPrompt={''}
          activeCell={props.activeCell}
          placeholderEnabled={props.placeholderEnabled}
          placeholderDisabled={props.placeholderDisabled}
          setStatusElementText={setStatusElementText}
        />
      )}
      {showDiffContainer && stream && (
        <DiffContainer
          stream={stream}
          oldCode={props.oldCode}
          parentContainer={document.createElement('div')}
          activeCell={props.activeCell}
          commands={props.commands}
          isErrorFixPrompt={props.isErrorFixPrompt}
          onEditorCreated={() => {}}
          onStreamingDone={() => {}}
        />
      )}
    </>
  );
};
