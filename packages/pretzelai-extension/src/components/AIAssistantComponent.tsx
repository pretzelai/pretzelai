import React, { useState } from 'react';
import InputComponent from './InputComponent';
import { DiffContainer } from './DiffContainer';
import { setupStream } from '../prompt';
import { FixedSizeStack, getSelectedCode, processTaggedVariables } from '../utils';
import { INotebookTracker, NotebookTracker } from '@jupyterlab/notebook';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { AiService, Embedding, generatePrompt, getTopSimilarities } from '../prompt';
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
}

export const AIAssistantComponent: React.FC<IAIAssistantComponentProps> = props => {
  const [showInputComponent, setShowInputComponent] = useState(true);
  const [showDiffContainer, setShowDiffContainer] = useState(false);
  const [showStatusElement, setShowStatusElement] = useState(true);

  const [stream, setStream] = useState<AsyncIterable<any> | null>(null);
  const [statusElementText, setStatusElementText] = useState<string>('');

  const handleSubmit = async (userInput: string) => {
    const { extractedCode } = getSelectedCode(props.notebookTracker);
    const injectCodeComment = '# INJECT NEW CODE HERE';
    let oldCodeInject = props.oldCode;
    let activeCell = props.notebookTracker.activeCell;

    if (userInput !== '') {
      setShowStatusElement(true);
      setStatusElementText('Calculating embeddings...');

      const isInject = userInput.toLowerCase().startsWith('inject') || userInput.toLowerCase().startsWith('ij');
      if (isInject && !extractedCode) {
        userInput = userInput.replace(/inject/i, '').replace(/ij/i, '');
        (activeCell!.editor! as CodeMirrorEditor).moveToEndAndNewIndentedLine();
        activeCell!.editor!.replaceSelection!(injectCodeComment);
        oldCodeInject = activeCell!.model.sharedModel.source;
        activeCell!.model.sharedModel.source = props.oldCode;
      }
      userInput = await processTaggedVariables(userInput, props.notebookTracker);
      try {
        const topSimilarities = await getTopSimilarities(
          userInput,
          props.embeddings,
          props.numberOfSimilarCells,
          props.aiClient,
          props.aiService,
          activeCell!.model.id,
          props.codeMatchThreshold
        );

        const prompt = generatePrompt(
          userInput,
          isInject ? oldCodeInject : props.oldCode,
          topSimilarities,
          extractedCode,
          '',
          isInject
        );

        // if posthogPromptTelemetry is true, capture the prompt
        if (props.posthogPromptTelemetry) {
          posthog.capture('prompt', { property: userInput });
        } else {
          posthog.capture('prompt', { property: 'no_telemetry' });
        }

        setStatusElementText('Calling AI service...');
        const stream = await setupStream({
          aiService: props.aiService,
          openAiApiKey: props.openAiApiKey,
          openAiBaseUrl: props.openAiBaseUrl,
          openAiModel: props.openAiModel,
          prompt: prompt,
          azureBaseUrl: props.azureBaseUrl,
          azureApiKey: props.azureApiKey,
          deploymentId: props.deploymentId
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
