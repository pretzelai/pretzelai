import React, { useEffect, useState } from 'react';
import InputComponent from './InputComponent';
import { DiffComponent } from './DiffComponent';
import { FixedSizeStack, generateAIStream, getSelectedCode, readEmbeddings } from '../utils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { AiService } from '../prompt';
import OpenAI from 'openai';
import { OpenAIClient } from '@azure/openai';
import { CommandRegistry } from '@lumino/commands';
import { JupyterFrontEnd } from '@jupyterlab/application';

interface IAIAssistantComponentProps {
  aiService: AiService;
  openAiApiKey: string;
  openAiBaseUrl: string;
  openAiModel: string;
  azureBaseUrl: string;
  azureApiKey: string;
  deploymentId: string;
  commands: CommandRegistry;
  traceback: string;
  placeholderEnabled: string;
  placeholderDisabled: string;
  promptHistoryStack: FixedSizeStack<string>;
  isAIEnabled: boolean;
  handleRemove: () => void;
  notebookTracker: INotebookTracker;
  app: JupyterFrontEnd;
  aiClient: OpenAI | OpenAIClient | null;
  codeMatchThreshold: number;
  numberOfSimilarCells: number;
  posthogPromptTelemetry: boolean;
}

export const AIAssistantComponent: React.FC<IAIAssistantComponentProps> = props => {
  const [showInputComponent, setShowInputComponent] = useState(true);
  const [showDiffContainer, setShowDiffContainer] = useState(false);
  const [showStatusElement, setShowStatusElement] = useState(true);
  const [initialPrompt, setInitialPrompt] = useState<string>('');

  const [stream, setStream] = useState<AsyncIterable<any> | null>(null);
  const [statusElementText, setStatusElementText] = useState<string>('');

  useEffect(() => {
    if (props.notebookTracker.activeCell!.model.getMetadata('isPromptEdit')) {
      setInitialPrompt(props.promptHistoryStack.get(0));
      props.notebookTracker.activeCell!.model.setMetadata('isPromptEdit', false);
    }
    if (props.traceback) {
      handleFixError();
    }
  }, []);

  const handleFixError = async () => {
    setShowInputComponent(false);
    setShowStatusElement(true);
    setStatusElementText('Calculating embeddings...');
    const embeddings = await readEmbeddings(props.notebookTracker, props.app);
    let oldCodeForPrompt = props.notebookTracker.activeCell!.model.sharedModel.source;
    try {
      const stream = await generateAIStream({
        aiService: props.aiService,
        aiClient: props.aiClient,
        embeddings: embeddings,
        userInput: '',
        oldCodeForPrompt,
        traceback: props.traceback,
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
        isInject: false
      });

      setStream(stream);
      setStatusElementText('Generating code...');
      setShowDiffContainer(true);
    } catch (error) {
      props.handleRemove();
      throw new Error('Error generating prompt');
    }
  };

  const handleSubmit = async (userInput: string) => {
    const { extractedCode } = getSelectedCode(props.notebookTracker);

    let activeCell = props.notebookTracker.activeCell;
    let embeddings = await readEmbeddings(props.notebookTracker, props.app);

    if (userInput !== '') {
      setShowInputComponent(false);
      setShowStatusElement(true);
      setStatusElementText('Calculating embeddings...');
      const oldCode = activeCell!.model.sharedModel.source;

      let oldCodeForPrompt = activeCell!.model.sharedModel.source;
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
        activeCell!.model.sharedModel.source = oldCode;
      }
      try {
        const stream = await generateAIStream({
          aiService: props.aiService,
          aiClient: props.aiClient,
          embeddings: embeddings,
          userInput,
          oldCodeForPrompt,
          traceback: '',
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
          initialPrompt={initialPrompt}
          activeCell={props.notebookTracker.activeCell}
          placeholderEnabled={props.placeholderEnabled}
          placeholderDisabled={props.placeholderDisabled}
        />
      )}
      {showDiffContainer && stream && (
        <DiffComponent
          stream={stream}
          oldCode={props.notebookTracker.activeCell!.model.sharedModel.source}
          parentContainer={document.createElement('div')}
          activeCell={props.notebookTracker.activeCell}
          commands={props.commands}
          isErrorFixPrompt={!!props.traceback}
          handleRemove={props.handleRemove}
          setShowStatusElement={setShowStatusElement}
        />
      )}
    </>
  );
};
