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
import { OpenAIClient } from '@azure/openai';
import { Embeddings } from '@azure/openai/types/openai';
import { renderEditor } from './utils';

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
  return `The user has selected the following code chunk in the current Jupyter notebook cell (pay attention to the indents and newlines):
\`\`\`
${selectedCode}
\`\`\`

The user wants to edit this code with the following instruction:
"""
${userInput}
"""

This selected code is a small code chunk inside a larger code chunk. ONLY FOR YOUR REFERENCE, the larger code chunk is as follows:
\`\`\`
${oldCode}
\`\`\`

${
  topSimilarities.length > 0
    ? `Also, the following code chunks in the notebook may be relevant:\n---\n${topSimilarities.join(
        '\n---\n'
      )}\n---\n`
    : ''
}

Generate new code according to the user's instructions. Remember, the selected code is a small chunk inside a larger code chunk. So, returned code MUST have the correct indentation and newlines - it will replace the old code and the resulting code MUST BE RUNNABLE and NO BACKTICKS.`;
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
  openai,
  prompt,
  parentContainer,
  diffEditorContainer,
  diffEditor,
  monaco,
  oldCode,
  userInput,
  topSimilarities
}: {
  aiService: string;
  openai?: OpenAI;
  prompt?: string;
  parentContainer: HTMLElement;
  diffEditorContainer: HTMLElement;
  diffEditor: any;
  monaco: any;
  oldCode: string;
  userInput?: string;
  topSimilarities?: string[];
}): Promise<void> => {
  if (aiService === 'OpenAI API key' && openai && prompt) {
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
          oldCode,
          userInput,
          topSimilarities
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
  }
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
