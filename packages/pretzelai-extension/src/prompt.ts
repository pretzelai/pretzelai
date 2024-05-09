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

export const openaiEmbeddings = async (
  source: string,
  aiService: AiService,
  openai: OpenAI
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> => {
  return aiService === 'Use Pretzel AI Server'
    ? ((await (
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
      ).json()) as OpenAI.Embeddings.CreateEmbeddingResponse)
    : await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: source
      });
};

export const getTopSimilarities = async (
  userInput: string,
  embeddings: Embedding[],
  numberOfSimilarities: number,
  openai: any,
  aiService: AiService
): Promise<string[]> => {
  const response = await openaiEmbeddings(userInput, aiService, openai);
  const userInputEmbedding = response.data[0].embedding;
  const similarities = embeddings.map(embedding =>
    cosineSimilarity(embedding.embedding, userInputEmbedding)
  );
  return similarities
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
    .slice(0, numberOfSimilarities)
    .map(e => embeddings[e.index].source);
};

export const systemPrompt =
  'You are a helpful assistant that helps users write python code in Jupyter notebook cells. ' +
  'You are helping the user write new code and edit old code in Jupyter notebooks. ' +
  'You write code exactly as if an expert python user would write, reusing existing variables and functions as needed. ' +
  'You respond with the clean, good quality, working python code only, no backticks.';
