/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import { OpenAI } from 'openai';
import { Embeddings as AzureEmbeddings } from '@azure/openai/types/openai';
import { OpenAIClient } from '@azure/openai';
import MistralClient, { EmbeddingResponse as MistralEmbeddings } from '@mistralai/mistralai';
import { CreateEmbeddingResponse as OpenAIEmbeddings } from 'openai/resources/embeddings';
import { getCookie } from './utils';

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
  traceback: string = '',
  isInject: boolean = false
): string {
  if (selectedCode) {
    return generatePromptEditPartial(userInput, selectedCode, oldCode, topSimilarities);
  }
  if (traceback) {
    return generatePromptErrorFix(traceback, oldCode, topSimilarities);
  }
  if (isInject) {
    return generatePromptInject(userInput, oldCode, topSimilarities);
  }
  if (oldCode) {
    return generatePromptFullEdit(userInput, oldCode, topSimilarities);
  }
  return generatePromptNew(userInput, oldCode, topSimilarities);
}

function generatePromptFullEdit(userInput: string, oldCode: string, topSimilarities: string[]): string {
  const initPrompt =
    'You are a Data Science expert and an expert python programmer. ' +
    'You are helping users edit existing python code in a Jupyter notebook cell. ' +
    'Given existing code and user instructions, you modify the existing code with clean, production quality, working python code. ';

  return `${initPrompt}

The user is in a Jupyter notebook cell that has the following code:
*EXISTING CODE START*
\`\`\`
${oldCode}
\`\`\`
*EXISTING CODE END*

The user wants to modify the existing code according to the following instructions:
${userInput}

${
  topSimilarities.length > 0
    ? `The following code cells ALREADY EXISTS in *OTHER* notebook cells and *MAY* be relevant:
\`\`\`
${topSimilarities.join('\n```\n\n```\n')}
\`\`\`
You *MAY* reference this code from *OTHER* notebook cells to call existing functions or use existing variables.
`
    : ''
}

Modify the EXISTING CODE according to USER INSTRUCTION. Take a deep breath, think step-by-step and respond with the working python code, no explanations.

**VERY IMPORTANT**: This code will be run directly in a Jupyter cell. So: Return ONLY RUNNABLE AND VALID python code WITHOUT ANY BACKTICKS.`;
}

function generatePromptInject(userInput: string, oldCode: string, topSimilarities: string[]): string {
  const initPrompt =
    'You are a Data Science expert and an expert python programmer. ' +
    'You are helping users write python code in a Jupyter notebook cell. ' +
    'Given existing code and user instructions, you write clean, production quality, working python code in the middle of the existing code. ';

  return `${initPrompt}
The user is in a Jupyter notebook cell that has the following code:
*EXISTING CODE START*
\`\`\`
${oldCode}
\`\`\`
*EXISTING CODE END*

The user wants to add some code IN THE MIDDLE OF THE EXISTING CODE according to the following instructions:
${userInput}

${
  topSimilarities.length > 0
    ? `The following code cells ALREADY EXISTS in *OTHER* notebook cells and *MAY* be relevant:
\`\`\`
${topSimilarities.join('\n```\n\n```\n')}
\`\`\`
You *MAY* reference this code from *OTHER* notebook cells to call existing functions or use existing variables.
`
    : ''
}

*REPLACE* the comment "# INJECT NEW CODE HERE" in the EXISTING CODE (*THIS IS VERY IMPORTANT!!!*) with the new code according to USER INSTRUCTION. Take a deep breath, think step-by-step and respond with the working python code, no explanation.

**VERY IMPORTANT**: This code will be run directly in a Jupyter cell. So: Return ONLY RUNNABLE AND VALID python code WITHOUT ANY BACKTICKS.`;
}

function generatePromptNew(userInput: string, oldCode: string, topSimilarities: string[]): string {
  const initPrompt =
    'You are a Data Science expert and an expert python programmer. ' +
    'You help users write python code in Jupyter notebook cells. ' +
    'You respond with the clean, production quality, working python code.';

  return `${initPrompt}
The user has provided the following instruction:
${userInput}

${
  topSimilarities.length > 0
    ? `The following code cells ALREADY EXISTS in *OTHER* notebook cells and *MAY* be relevant:
\`\`\`
${topSimilarities.join('\n```\n\n```\n')}
\`\`\`
`
    : ''
}

Write code according to the USER INSTRUCTION. CALL EXISTING FUNCTIONS AND REUSE EXISTING VARIABLES when possible. Take a deep breath, think step-by-step and respond with the working python code. DO NOT ADD explanation or comments.

**VERY IMPORTANT**: This code will be run directly in a Jupyter cell. So: Return ONLY RUNNABLE AND VALID python code WITHOUT ANY BACKTICKS.`;
}

function generatePromptEditPartial(
  userInput: string,
  selectedCode: string,
  oldCode: string,
  topSimilarities: string[]
): string {
  const initPrompt =
    'You are a Data Science expert and an expert python programmer. ' +
    'You are helping users edit existing python code in a Jupyter notebook cell. ' +
    'Given existing code and user instructions, you modify the existing code with clean, production quality, working python code. ';

  return `${initPrompt}
The user has selected the following code chunk in the CURRENT Jupyter notebook cell:
*SELECTED CODE START*
\`\`\`
${selectedCode}
\`\`\`
*SELECTED CODE END*

This SELECTED CODE is part of the following larger code chunk:
*FULL CODE CHUNK START*
\`\`\`
${oldCode}
\`\`\`
*FULL CODE CHUNK END*

The user wants to MODIFY the SELECTED CODE ONLY (IMPORTANT) with the following instruction:
${userInput}

${
  topSimilarities.length > 0
    ? `The following code cells ALREADY EXISTS in *OTHER* notebook cells and *MAY* be relevant:
\`\`\`
${topSimilarities.join('\n```\n\n```\n')}
\`\`\`
`
    : ''
}

Modify the SELECTED CODE (*THIS IS VERY IMPORTANT!!!*) according to the user's instructions. Respond with FULL CODE CHUNK but with the SELECTED CODE modified according to USER INSTRUCTION. Take a deep breath, think step-by-step and respond with the working python code, no explanation.

**VERY IMPORTANT**: This code will be run directly in a Jupyter cell. So: Return ONLY RUNNABLE AND VALID python code WITHOUT ANY BACKTICKS.`;
}

function generatePromptErrorFix(traceback: string, oldCode: string, topSimilarities: string[]): string {
  const initPrompt =
    'You are a Data Science expert and an expert python programmer. ' +
    'You are helping users fix errors in Jupyter notebook cells. ' +
    'Given existing code and the traceback, you responde with code that fixes the error. ' +
    'Respond with the clean, production quality, working python code.';

  return `${initPrompt}

The user ran the following code in the CURRENT Jupyter notebook cell:
*CURRENT CELL CODE START*
\`\`\`
${oldCode}
\`\`\`
*CURRENT CELL CODE END*

Running the code produces an error with the following traceback:
*TRACEBACK START*
\`\`\`
${traceback}
\`\`\`
*TRACEBACK END*

${
  topSimilarities.length > 0
    ? `The following code cells ALREADY EXISTS in *OTHER* notebook cells and *MAY* be relevant:
\`\`\`
${topSimilarities.join('\n```\n\n```\n')}
\`\`\`
`
    : ''
}

Take a deep breath, think step-by-step and respond with MODIFIED version of CURRENT CELL CODE to fix the error. Add a PYTHON COMMENT explaining what you did. IF NEEDED, use of Jupyter bang and magic.

**VERY IMPORTANT**: This code will be run directly in a Jupyter cell. So: Return ONLY RUNNABLE AND VALID python code WITHOUT ANY BACKTICKS.`;
}

export const openaiEmbeddings = async (
  source: string,
  aiChatModelProvider: string,
  aiClient: OpenAI | OpenAIClient | MistralClient | null
): Promise<OpenAIEmbeddings | AzureEmbeddings | MistralEmbeddings> => {
  if (aiChatModelProvider === 'Pretzel AI') {
    return (await (
      await fetch('https://api.pretzelai.app/embeddings/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source: source
        })
      })
    ).json()) as OpenAIEmbeddings;
  } else if (aiChatModelProvider === 'OpenAI') {
    return await (aiClient as OpenAI).embeddings.create({
      model: 'text-embedding-3-large',
      input: source
    });
  } else if (aiChatModelProvider === 'Azure') {
    return await (aiClient as OpenAIClient).getEmbeddings('text-embedding-ada-002', [source]);
  } else if (aiChatModelProvider === 'Mistral') {
    return await (aiClient as MistralClient).embeddings({
      model: 'mistral-embed',
      input: source
    });
  } else {
    const xsrfToken = await getCookie('_xsrf');
    const response = await fetch('/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-XSRFToken': xsrfToken
      },
      body: JSON.stringify({
        texts: [source]
      })
    });
    const data = await response.json();
    return {
      data: [
        {
          embedding: data.embeddings[0],
          index: 0,
          object: 'embedding'
        }
      ],
      model: 'local-jina-embeddings-v2-small-en',
      object: 'list',
      usage: {
        prompt_tokens: source.split(' ').length,
        total_tokens: source.split(' ').length
      }
    } as OpenAIEmbeddings;
  }
};
