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
import { Embeddings } from '@azure/openai/types/openai';
import { OpenAIClient } from '@azure/openai';

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
  return generatePromptNewAndFullEdit(userInput, oldCode, topSimilarities);
}

function generatePromptInject(userInput: string, oldCode: string, topSimilarities: string[]): string {
  return `The user is in a Jupyter notebook cell that has the following code:
EXISTING CODE START
\`\`\`
${oldCode}
\`\`\`
EXISTING CODE END


The user wants to add some code in the middle of the existing code according to the following instructions:
${userInput}

${
  topSimilarities.length > 0
    ? `
OTHER CODE CELLS START
The following code cells also exist in the notebook in OTHER CELLS and may be relevant:\n\`\`\`\n${topSimilarities.join(
        '\n```\n\n```\n'
      )}\n\`\`\`\n
OTHER CODE CELLS END`
    : ''
}

INSTRUCTION: Add the new code according to the user's instructions. IMPORTANT!! The new code MUST BE WRITTEN BY REPLACING THE COMMENT "# INJECT NEW CODE HERE" in the EXISTING CODE. WRITE MINIMAL CODE - for eg, CALL EXISTING FUNCTIONS AND REUSE EXISTING VARIABLES. Return FULL CODE CHUNK by replacing the comment with the new code.`;
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

INSTRUCTION: ${
    oldCode ? 'Modify' : 'Write'
  } code according to the user's instructions. Pay close attention to user instructions and WRITE MINIMAL CODE - for eg, CALL EXISTING FUNCTIONS AND REUSE EXISTING VARIABLES. DO NOT REMOVE COMMENTS OR EXISTING IMPORT STATEMENTS. Return ONLY executable python code, no backticks.
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

The user wants to MODIFY the SELECTED CODE ONLY (IMPORTANT) with the following instruction:
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
  return `The user ran the following code in the CURRENT Jupyter notebook cell:
CURRENT CELL CODE START
\`\`\`
${oldCode}
\`\`\`
CURRENT CELL CODE END

Running the code produces the following traceback:
TRACEBACK START
\`\`\`
${traceback}
\`\`\`
TRACEBACK END

${
  topSimilarities.length > 0
    ? `The following code chunks were also found in the notebook and may be relevant:\n\`\`\`\n${topSimilarities.join(
        '\n```\n\n```\n'
      )}\n\`\`\`\n`
    : ''
}

INSTRUCTION:
- Fix the error and return ONLY correct, executable python code, NO BACKTICKS. DO NOT ADD ANY COMMENTS TO EXPLAIN YOUR FIX. DO NOT REMOVE EXISTING IMPORTS
- ONLY IF the error is in a DIFFERENT PART of the Jupyter Notebook: add a comment at the top explaining this and add AS LITTLE CODE AS POSSIBLE in the CURRENT cell to fix the error.`;
}

export const openaiEmbeddings = async (
  source: string,
  aiService: AiService,
  aiClient: OpenAI | OpenAIClient | null
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse | Embeddings> => {
  if (aiService === 'Use Pretzel AI Server') {
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

export const systemPrompt =
  'You are a helpful assistant that helps users write python code in Jupyter notebook cells. ' +
  'You are helping the user write new code, edit old code in Jupyter and fix errors in Jupyter notebooks. ' +
  'You write code exactly as if an expert python programmer would write. KEEP existing comments and documentation.' +
  'You respond with the clean, amazing quality, minimal working python code only, NO BACKTICKS. \n' +
  'Take a deep breath and think step-by-step. ';
