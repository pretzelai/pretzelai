/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import { cosineSimilarity } from './utils';
import { OpenAI } from 'openai';
import { Embeddings } from '@azure/openai/types/openai';
import { renderEditor } from './utils';
import { AzureKeyCredential, OpenAIClient } from '@azure/openai';
import posthog from 'posthog-js';
import * as React from 'react';
import { Dialog, showDialog } from '@jupyterlab/apputils';

export const EMBEDDING_MODEL = 'text-embedding-3-large';

export type AiService = 'OpenAI API key' | 'Use Pretzel AI Server' | 'Use Azure API';

export type Embedding = {
  id: string;
  source: string;
  hash: string;
  embedding: number[];
};

export function generatePrompt(
  userInput: string,
  oldCode: string,
  topSimilarities: string[],
  selectedCode: string = '',
  traceback: string = ''
): string {
  if (selectedCode) {
    return generatePromptEditPartial(userInput, selectedCode, oldCode, topSimilarities);
  }
  if (traceback) {
    return generatePromptErrorFix(traceback, oldCode, topSimilarities);
  }
  return generatePromptNewAndFullEdit(userInput, oldCode, topSimilarities);
}

function generatePromptNewAndFullEdit(userInput: string, oldCode: string, topSimilarities: string[]): string {
  return `The user is in a Jupyter notebook cell wants to write code to do the following:
${userInput}

${
  oldCode
    ? `The notebook cell already has the following code in it:
\`\`\`
${oldCode}
\`\`\`
`
    : ''
}

${
  topSimilarities.length > 0
    ? `
OTHER CODE CELLS START
The following code cells also exist in the notebook and may be relevant:\n\`\`\`\n${topSimilarities.join(
        '\n```\n\n```\n'
      )}\n\`\`\`\n
OTHER CODE CELLS END`
    : ''
}

INSTRUCTION: Write code according to the user's instructions. Pay close attention to user instructions and WRITE MINIMAL CODE - for eg, CALL EXISTING FUNCTIONS AND REUSE EXISTING VARIABLES. Return ONLY executable python code, no backticks.
${
  topSimilarities.length > 0
    ? `The code in OTHER CODE CELLS already exists in the notebook - DO NOT REWRITE this code since it's already there. **ONLY REFER TO THIS CODE IF IT's RELEVANT TO USER INSTRUCTION**`
    : ''
}
`;
}

function generatePromptEditPartial(
  userInput: string,
  selectedCode: string,
  oldCode: string,
  topSimilarities: string[]
): string {
  return `The user has selected the following code chunk in the CURRENT Jupyter notebook cell (pay attention to the indents and newlines):
SELECTED CODE START
\`\`\`
${selectedCode}
\`\`\`
SELECTED CODE END

This code is part of the following larger code chunk
FULL CODE CHUNK START
\`\`\`
${oldCode}
\`\`\`
FULL CODE CHUNK END

The user wants to modify the SELECTED CODE ONLY (IMPORTANT) with the following instruction:
${userInput}

${
  topSimilarities.length > 0
    ? `The following code chunks were also found in the notebook and may be relevant:\n\`\`\`\n${topSimilarities.join(
        '\n```\n\n```\n'
      )}\n\`\`\`\n`
    : ''
}

INSTRUCTION: Modify the SELECTED CODE (AND ONLY THE SELECTED CODE) according to the user's instructions. WRITE MINIMAL CODE - for eg, CALL EXISTING FUNCTIONS AND REUSE EXISTING VARIABLES. Return FULL CODE CHUNK but with the selected code modified.`;
}

function generatePromptErrorFix(traceback: string, oldCode: string, topSimilarities: string[]): string {
  return `The user ran the following code in the current Jupyter notebook cell:

---
${oldCode}
---

Running the code produces the following traceback:
${traceback}
---

${
  topSimilarities.length > 0
    ? `The following code chunks were also found in the notebook and may be relevant:\n\`\`\`\n${topSimilarities.join(
        '\n```\n\n```\n'
      )}\n\`\`\`\n`
    : ''
}


INSTRUCTION:
- Fix the error and return ONLY correct, executable python code, no backticks, NO COMMENTS.
- If the error is NOT in the CURRENT Jupyter Notebook cell: add a comment at the top explaining this and add just enough code in the CURRENT cell to fix the error.`;
}

export const openAiStream = async ({
  aiService,
  openAiApiKey,
  openAiBaseUrl,
  openAiModel,
  prompt,
  parentContainer,
  inputContainer,
  diffEditorContainer,
  diffEditor,
  monaco,
  oldCode,
  azureBaseUrl,
  azureApiKey,
  deploymentId,
  activeCell,
  commands,
  statusElement
}: {
  aiService: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  prompt?: string;
  parentContainer: HTMLElement;
  inputContainer: Node | null;
  diffEditorContainer: HTMLElement;
  diffEditor: any;
  monaco: any;
  oldCode: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  activeCell: any;
  commands: any;
  statusElement: HTMLElement;
}): Promise<void> => {
  statusElement.textContent = 'Calling AI service...';
  if (aiService === 'OpenAI API key' && openAiApiKey && openAiModel && prompt) {
    const openai = new OpenAI({
      apiKey: openAiApiKey,
      dangerouslyAllowBrowser: true,
      baseURL: openAiBaseUrl ? openAiBaseUrl : undefined
    });
    const stream = await openai.chat.completions.create({
      model: openAiModel,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: true
    });
    statusElement.textContent = 'Generating code...';
    for await (const chunk of stream) {
      renderEditor(
        chunk.choices[0]?.delta?.content || '',
        parentContainer,
        diffEditorContainer,
        diffEditor,
        monaco,
        oldCode
      );
    }
  } else if (aiService === 'Use Pretzel AI Server') {
    const response = await fetch('https://wjwgjk52kb3trqnlqivqqyxm3i0glvof.lambda-url.eu-central-1.on.aws/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });
    const reader = response!.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let isReading = true;
    statusElement.textContent = 'Generating code...';
    while (isReading) {
      const { done, value } = await reader.read();
      if (done) {
        isReading = false;
      }
      const chunk = decoder.decode(value);
      renderEditor(chunk, parentContainer, diffEditorContainer, diffEditor, monaco, oldCode);
    }
  } else if (aiService === 'Use Azure API' && prompt && azureBaseUrl && azureApiKey && deploymentId) {
    const client = new OpenAIClient(azureBaseUrl, new AzureKeyCredential(azureApiKey));
    const result = await client.getCompletions(deploymentId, [prompt]);
    statusElement.textContent = 'Generating code...';
    for (const choice of result.choices) {
      renderEditor(choice.text, parentContainer, diffEditorContainer, diffEditor, monaco, oldCode);
    }
  }
  // Handle occasional responsde with backticks
  const newCode = diffEditor.getModel().modified.getValue();
  if (newCode.split('```').length === 3) {
    renderEditor(newCode.split('```')[1], parentContainer, diffEditorContainer, diffEditor, monaco, oldCode);
  }
  setTimeout(async () => {
    const changes = diffEditor.getLineChanges();
    let totalLines = oldCode.split('\n').length;
    if (changes) {
      changes.forEach((c: any) => {
        if (c.modifiedEndLineNumber >= c.modifiedStartLineNumber) {
          const modified = c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1;

          totalLines += modified;
        }
      });
    }
    const heightPx = totalLines * 19;
    diffEditorContainer.style.height = heightPx + 'px';
    diffEditor?.layout();
  }, 500);
  // Create "Accept and Run", "Accept", and "Reject" buttons
  const diffContainer = document.querySelector('.diff-container');
  const acceptAndRunButton = document.createElement('button');
  acceptAndRunButton.textContent = 'Accept and Run';
  acceptAndRunButton.style.backgroundColor = 'lightblue';
  acceptAndRunButton.style.borderRadius = '5px';
  acceptAndRunButton.style.border = '1px solid darkblue';
  acceptAndRunButton.style.maxWidth = '120px';
  acceptAndRunButton.style.minHeight = '25px';
  acceptAndRunButton.style.marginRight = '10px';
  const handleAcceptAndRun = () => {
    const modifiedCode = diffEditor!.getModel()!.modified.getValue();
    activeCell.model.sharedModel.source = modifiedCode;
    commands.execute('notebook:run-cell');
    activeCell.node.removeChild(parentContainer);
    statusElement.remove();
  };
  acceptAndRunButton.addEventListener('click', () => {
    posthog.capture('Accept and Run', {
      event_type: 'click',
      method: 'accept_and_run'
    });
    handleAcceptAndRun();
  });

  const acceptButton = document.createElement('button');
  acceptButton.textContent = 'Accept';
  acceptButton.style.backgroundColor = 'lightblue';
  acceptButton.style.borderRadius = '5px';
  acceptButton.style.border = '1px solid darkblue';
  acceptButton.style.maxWidth = '100px';
  acceptButton.style.minHeight = '25px';
  acceptButton.style.marginRight = '10px';
  const handleAccept = () => {
    const modifiedCode = diffEditor!.getModel()!.modified.getValue();
    activeCell.model.sharedModel.source = modifiedCode;
    activeCell.node.removeChild(parentContainer);
    statusElement.remove();
  };
  acceptButton.addEventListener('click', () => {
    posthog.capture('Accept', {
      event_type: 'click',
      method: 'accept'
    });
    handleAccept();
  });

  const rejectButton = document.createElement('button');
  rejectButton.textContent = 'Reject';
  rejectButton.style.backgroundColor = 'lightblue';
  rejectButton.style.borderRadius = '5px';
  rejectButton.style.border = '1px solid darkblue';
  rejectButton.style.maxWidth = '100px';
  rejectButton.style.minHeight = '25px';
  rejectButton.style.marginRight = '10px';
  const handleReject = () => {
    activeCell.node.removeChild(parentContainer);
    activeCell.model.sharedModel.source = oldCode;
    statusElement.remove();
  };
  rejectButton.addEventListener('click', () => {
    posthog.capture('Reject', {
      event_type: 'click',
      method: 'reject'
    });
    handleReject();
  });

  const editPromptButton = document.createElement('button');
  if (inputContainer) {
    editPromptButton.textContent = 'Edit Prompt';
    editPromptButton.style.backgroundColor = 'lightgreen';
    editPromptButton.style.borderRadius = '5px';
    editPromptButton.style.border = '1px solid darkgreen';
    editPromptButton.style.maxWidth = '100px';
    editPromptButton.style.minHeight = '25px';
    editPromptButton.style.marginRight = '10px';

    editPromptButton.addEventListener('click', () => {
      posthog.capture('Edit Prompt', {
        event_type: 'click',
        method: 'edit_prompt'
      });
      // Remove the parent container
      parentContainer.remove();
      commands.execute('pretzelai:replace-code');

      const newParentContainer = document.querySelector('.pretzelParentContainerAI');
      const newInputField = (newParentContainer as HTMLElement).querySelector(
        '.pretzelInputField'
      ) as HTMLTextAreaElement;
      if (newInputField) {
        const oldInputField = (inputContainer as HTMLElement).querySelector(
          '.pretzelInputField'
        ) as HTMLTextAreaElement;
        if (oldInputField) {
          const oldInputText = oldInputField.value;
          newInputField.value = oldInputText;
        }
        newInputField.focus();
      }
    });
  }

  const infoIcon = document.createElement('img');
  infoIcon.src = `data:image/svg+xml;utf8,<svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.529 9.988a2.502 2.502 0 1 1 5 .191A2.441 2.441 0 0 1 12 12.582V14m-.01 3.008H12M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
</svg>`;
  infoIcon.style.marginLeft = '-5px';
  infoIcon.style.marginTop = '5px';
  infoIcon.style.cursor = 'pointer';
  infoIcon.style.width = '16px';
  infoIcon.style.height = '16px';
  infoIcon.addEventListener('click', () => {
    const richTextBody = (
      <div>
        <p>
          <b>
            Accept and Run (shortcut: <u>Shift + Enter</u>)
          </b>
          : Will put the code in current Jupyter cell AND run it.
        </p>
        <p>
          <b>
            Accept (shortcut: <u>Enter</u>)
          </b>
          : Will put the code in current Jupyter cell but WILL NOT run it.
        </p>
        <p>
          <b>Reject</b>: Will reject the generated code. Your cell will return to the state it was before.
        </p>
        <p>
          <b>Edit Prompt</b>: Go back to writing the editing your initial prompt.
        </p>
        <p>
          See more in the README <a href="https://github.com/pretzelai/pretzelai?tab=readme-ov-file#usage">here</a>.
        </p>
      </div>
    );

    showDialog({
      title: 'Using AI Features',
      body: richTextBody,
      buttons: [
        Dialog.createButton({
          label: 'Close',
          className: 'jp-About-button jp-mod-reject jp-mod-styled'
        })
      ]
    });
  });

  const diffButtonsContainer = document.createElement('div');
  diffButtonsContainer.style.marginTop = '10px';
  diffButtonsContainer.style.marginLeft = '70px';
  diffButtonsContainer.style.display = 'flex';
  diffButtonsContainer.style.flexDirection = 'row';
  diffButtonsContainer.tabIndex = 0; // Make the container focusable
  diffButtonsContainer.style.outline = 'none'; // Remove blue border when focused
  diffContainer!.appendChild(diffButtonsContainer);
  diffButtonsContainer!.appendChild(acceptAndRunButton!);
  diffButtonsContainer!.appendChild(acceptButton!);
  diffButtonsContainer!.appendChild(rejectButton!);
  if (inputContainer) {
    diffButtonsContainer!.appendChild(editPromptButton!);
  }
  diffButtonsContainer!.appendChild(infoIcon);
  diffButtonsContainer.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleAccept();
    } else if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      handleAcceptAndRun();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleReject();
    }
  });
  diffButtonsContainer.focus();
  statusElement.textContent = '';
};

export const openaiEmbeddings = async (
  source: string,
  aiService: AiService,
  aiClient: OpenAI | OpenAIClient | null
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse | Embeddings> => {
  if (aiService === 'Use Pretzel AI Server') {
    return (await (
      await fetch('https://e7l46ifvcg6qrbuinytg7u535y0denki.lambda-url.eu-central-1.on.aws/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source: source
        })
      })
    ).json()) as OpenAI.Embeddings.CreateEmbeddingResponse;
  } else if (aiService === 'OpenAI API key') {
    return await (aiClient as OpenAI).embeddings.create({
      model: EMBEDDING_MODEL,
      input: source
    });
  } else if (aiService === 'Use Azure API') {
    return await (aiClient as OpenAIClient).getEmbeddings('text-embedding-ada-002', [source]);
  } else {
    throw new Error('Invalid AI service');
  }
};

export const getTopSimilarities = async (
  userInput: string,
  embeddings: Embedding[],
  numberOfSimilarities: number,
  aiClient: OpenAI | OpenAIClient | null,
  aiService: AiService,
  cellId: string,
  codeMatchThreshold: number
): Promise<string[]> => {
  const response = await openaiEmbeddings(userInput, aiService, aiClient);
  const userInputEmbedding = response.data[0].embedding; // same API for openai and azure
  const similarities = embeddings
    .filter(embedding => embedding.id !== cellId) // Exclude current cell's embedding
    .map((embedding, index) => ({
      value: cosineSimilarity(embedding.embedding, userInputEmbedding),
      index
    }));
  return similarities
    .filter(e => e.value > codeMatchThreshold)
    .sort((a, b) => b.value - a.value)
    .slice(0, numberOfSimilarities)
    .map(e => embeddings[e.index].source);
};

export const systemPrompt =
  'You are a helpful assistant that helps users write python code in Jupyter notebook cells. ' +
  'You are helping the user write new code, edit old code in Jupyter and fix errors in Jupyter notebooks. ' +
  'You write code exactly as if an expert python programmer would write. KEEP existing comments and documentation.' +
  'You respond with the clean, amazing quality, minimal working python code only, NO BACKTICKS. \n' +
  'Take a deep breath and think step-by-step. ';
