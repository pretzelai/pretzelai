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

export const EMBEDDING_MODEL = 'text-embedding-3-large';

export type AiService =
  | 'OpenAI API key'
  | 'Use Pretzel AI Server'
  | 'Use Azure API';

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
    return generatePromptEditPartial(
      userInput,
      selectedCode,
      oldCode,
      topSimilarities
    );
  }
  if (traceback) {
    return generatePromptErrorFix(traceback, oldCode, topSimilarities);
  }
  return generatePromptNewAndFullEdit(userInput, '', topSimilarities);
}

function generatePromptNewAndFullEdit(
  userInput: string,
  oldCode: string,
  topSimilarities: string[]
): string {
  return `The user wants to do the following:
"""
${userInput}
"""

${
  oldCode
    ? `The following code already exists in the notebook cell:
"""
${oldCode}
"""

`
    : ''
}
${
  topSimilarities.length > 0
    ? `We also have the following matching code chunks in the notebook\n---\n${topSimilarities.join(
        '\n---\n'
      )}\n---\n`
    : ''
}
Based on the above, return ONLY executable python code, no backticks.`;
}

function generatePromptEditPartial(
  userInput: string,
  selectedCode: string,
  oldCode: string,
  topSimilarities: string[]
): string {
  return `The user has selected the following code chunk in the CURRENT Jupyter notebook cell (pay attention to the indents and newlines):
\`\`\`
${selectedCode}
\`\`\`

The user wants to modify this code with the following instruction:
"""
${userInput}
"""

CONTEXT
This highlighted code is a small code chunk inside a larger code chunk. FOR YOUR REFERENCE, the larger code chunk is here:
\`\`\`
${oldCode}
\`\`\`

${
  topSimilarities.length > 0
    ? `The following code chunks were also found in the notebook and may be relevant:\n\`\`\`\n${topSimilarities.join(
        '\n```\n\n```\n'
      )}\n\`\`\`\n`
    : ''
}
END CONTEXT

INSTRUCTION: Modify the highlighted code according to the user's instructions. VERY IMPORTANT - ONLY MODIFY THE HIGHLIGHTED CODE!!! Returned code MUST have the correct indentation and newlines - it will replace the old code and the resulting code MUST BE RUNNABLE and NO BACKTICKS.`;
}

function generatePromptErrorFix(
  traceback: string,
  oldCode: string,
  topSimilarities: string[]
): string {
  return `The user ran the following code in the current Jupyter notebook cell:

---
${oldCode}
---

Running the code produces the following traceback:
${traceback}
---

${
  topSimilarities.length > 0
    ? `We also have the following related code chunks in the notebook\n---\n${topSimilarities.join(
        '\n---\n'
      )}\n---\n`
    : ''
}

Based on the above, your instructions are:

- If the error is in the CURRENT cell, fix the error and return ONLY correct, executable python code, no backticks, no comments.
- Else if the error is NOT in the CURRENT Jupyter Notebook cell, add a comment at the top explaining this and add just enough code in the CURRENT cell to fix the error.
- Else If you don't have enough context to fix the error, just reply with existing code and a comment at the top explaining why you cannot generate fixed code.
`;
}

export const openAiStream = async ({
  aiService,
  openAiApiKey,
  openAiBaseUrl,
  prompt,
  parentContainer,
  diffEditorContainer,
  diffEditor,
  monaco,
  oldCode,
  azureBaseUrl,
  azureApiKey,
  deploymentId,
  activeCell,
  commands
}: {
  aiService: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  prompt?: string;
  parentContainer: HTMLElement;
  diffEditorContainer: HTMLElement;
  diffEditor: any;
  monaco: any;
  oldCode: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  activeCell: any;
  commands: any;
}): Promise<void> => {
  if (aiService === 'OpenAI API key' && openAiApiKey && prompt) {
    const openai = new OpenAI({
      apiKey: openAiApiKey,
      dangerouslyAllowBrowser: true,
      baseURL: openAiBaseUrl ? openAiBaseUrl : undefined
    });
    const stream = await openai.chat.completions.create({
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
      ],
      stream: true
    });
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
    const response = await fetch(
      'https://wjwgjk52kb3trqnlqivqqyxm3i0glvof.lambda-url.eu-central-1.on.aws/',
      {
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
      }
    );
    const reader = response!.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let isReading = true;
    while (isReading) {
      const { done, value } = await reader.read();
      if (done) {
        isReading = false;
      }
      const chunk = decoder.decode(value);
      console.log(diffEditor);
      renderEditor(
        chunk,
        parentContainer,
        diffEditorContainer,
        diffEditor,
        monaco,
        oldCode
      );
    }
  } else if (
    aiService === 'Use Azure API' &&
    prompt &&
    azureBaseUrl &&
    azureApiKey &&
    deploymentId
  ) {
    const client = new OpenAIClient(
      azureBaseUrl,
      new AzureKeyCredential(azureApiKey)
    );
    const result = await client.getCompletions(deploymentId, [prompt]);

    for (const choice of result.choices) {
      renderEditor(
        choice.text,
        parentContainer,
        diffEditorContainer,
        diffEditor,
        monaco,
        oldCode
      );
    }
  }
  // Create "Accept" and "Reject" buttons
  const diffContainer = document.querySelector('.diff-container');
  const acceptButton = document.createElement('button');
  acceptButton.textContent = 'Accept';
  acceptButton.style.backgroundColor = 'lightblue';
  acceptButton.style.borderRadius = '5px';
  acceptButton.style.border = '1px solid darkblue';
  acceptButton.style.maxWidth = '100px';
  acceptButton.style.minHeight = '25px';
  acceptButton.style.marginRight = '10px';
  acceptButton.addEventListener('click', () => {
    const modifiedCode = diffEditor!.getModel()!.modified.getValue();
    activeCell.model.sharedModel.source = modifiedCode;
    commands.execute('notebook:run-cell');
    activeCell.node.removeChild(parentContainer);
  });

  const rejectButton = document.createElement('button');
  rejectButton.textContent = 'Reject';
  rejectButton.style.backgroundColor = 'lightblue';
  rejectButton.style.borderRadius = '5px';
  rejectButton.style.border = '1px solid darkblue';
  rejectButton.style.maxWidth = '100px';
  rejectButton.style.minHeight = '25px';
  rejectButton.style.marginRight = '10px';
  rejectButton.addEventListener('click', () => {
    activeCell.node.removeChild(parentContainer);
    activeCell.model.sharedModel.source = oldCode;
  });
  const diffButtonsContainer = document.createElement('div');
  diffButtonsContainer.style.marginTop = '10px';
  diffButtonsContainer.style.marginLeft = '70px';
  diffButtonsContainer.style.display = 'flex';
  diffButtonsContainer.style.flexDirection = 'row';
  diffContainer!.appendChild(diffButtonsContainer);
  diffButtonsContainer!.appendChild(acceptButton!);
  diffButtonsContainer!.appendChild(rejectButton!);
};

export const openaiEmbeddings = async (
  source: string,
  aiService: AiService,
  aiClient: OpenAI | OpenAIClient | null
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse | Embeddings> => {
  if (aiService === 'Use Pretzel AI Server') {
    return (await (
      await fetch(
        'https://e7l46ifvcg6qrbuinytg7u535y0denki.lambda-url.eu-central-1.on.aws/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source: source
          })
        }
      )
    ).json()) as OpenAI.Embeddings.CreateEmbeddingResponse;
  } else if (aiService === 'OpenAI API key') {
    return await (aiClient as OpenAI).embeddings.create({
      model: EMBEDDING_MODEL,
      input: source
    });
  } else if (aiService === 'Use Azure API') {
    return await (aiClient as OpenAIClient).getEmbeddings(
      'text-embedding-ada-002',
      [source]
    );
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
  cellId: string
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
    .sort((a, b) => b.value - a.value)
    .slice(0, numberOfSimilarities)
    .map(e => embeddings[e.index].source);
};

export const systemPrompt =
  'You are a helpful assistant that helps users write python code in Jupyter notebook cells. ' +
  'You are helping the user write new code and edit old code in Jupyter notebooks. ' +
  'You write code exactly as if an expert python user would write, reusing existing variables and functions as needed. ' +
  'You respond with the clean, good quality, working python code only, NO BACKTICKS.';
