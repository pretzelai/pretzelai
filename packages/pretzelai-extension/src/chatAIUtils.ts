/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import { AzureKeyCredential, OpenAIClient } from '@azure/openai';
import { OpenAI } from 'openai';
import { ChatCompletionMessage } from 'openai/resources';
import MistralClient, { Message } from '@mistralai/mistralai';
import { streamAnthropicCompletion } from './utils';
import Groq from 'groq-sdk';
import { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';
import { processVariables } from './utils';
import { INotebookTracker } from '@jupyterlab/notebook';

export const CHAT_SYSTEM_MESSAGE =
  'You are a helpful assistant. Your name is Pretzel. You are an expert in Juypter Notebooks, Data Science, and Data Analysis. You always output markdown. All Python code MUST BE in a FENCED CODE BLOCK with language-specific highlighting. ';

export const generateChatPrompt = async (
  lastContent: string,
  setReferenceSource: (source: string) => void,
  notebookTracker: INotebookTracker,
  topSimilarities?: string[],
  activeCellCode?: string,
  selectedCode?: string
) => {
  const { processedInput, varValues } = await processVariables(lastContent, notebookTracker);

  let output = `${processedInput}\n`;

  if (!selectedCode && !activeCellCode && (!topSimilarities || topSimilarities.length === 0)) {
    setReferenceSource('No specific code context');
    output += `My main question is the above. Your goal is to answer my question briefly and don't mention the code unless necessary.\n`;
  }

  if (varValues) {
    output += `\n*ADDITIONAL CONTEXT*\n`;
    output += `\n${varValues}\n`;
    output += `\n*END ADDITIONAL CONTEXT*\n`;
  }

  if (selectedCode || activeCellCode) {
    setReferenceSource(selectedCode ? 'Selected code' : 'Current cell code');
    output += `My question is related to this part of the code, answer me in a short and concise manner:
\`\`\`python
${selectedCode || activeCellCode}
\`\`\`\n`;
  }

  if (topSimilarities && topSimilarities.length > 0) {
    setReferenceSource(selectedCode || activeCellCode ? 'Current code and related cells' : 'Related cells in notebook');
    output += `Cells containing related content are:
\`\`\`python
${topSimilarities.join('\n```\n```python\n')}
\`\`\`\n`;
  }

  return output;
};

export const chatAIStream = async ({
  aiChatModelProvider,
  aiChatModelString,
  openAiApiKey,
  openAiBaseUrl,
  azureBaseUrl,
  azureApiKey,
  deploymentId,
  mistralApiKey,
  anthropicApiKey,
  ollamaBaseUrl,
  groqApiKey,
  renderChat,
  messages,
  topSimilarities,
  activeCellCode,
  selectedCode,
  setReferenceSource,
  setIsAiGenerating,
  signal,
  notebookTracker
}: {
  aiChatModelProvider: string;
  aiChatModelString: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  mistralApiKey?: string;
  anthropicApiKey?: string;
  ollamaBaseUrl?: string;
  groqApiKey?: string;
  renderChat: (message: string) => void;
  messages: OpenAI.ChatCompletionMessage[];
  topSimilarities: string[];
  activeCellCode?: string;
  selectedCode?: string;
  setReferenceSource: (source: string) => void;
  setIsAiGenerating: (isGenerating: boolean) => void;
  signal: AbortSignal;
  notebookTracker: INotebookTracker;
}): Promise<void> => {
  const lastContent = messages[messages.length - 1].content as string;
  const lastContentWithInjection = await generateChatPrompt(
    lastContent,
    setReferenceSource,
    notebookTracker,
    topSimilarities,
    activeCellCode,
    selectedCode
  );
  const messagesWithInjection = [...messages.slice(0, -1), { role: 'user', content: lastContentWithInjection }];
  if (aiChatModelProvider === 'OpenAI' && openAiApiKey && aiChatModelString && messages) {
    const openai = new OpenAI({
      apiKey: openAiApiKey,
      dangerouslyAllowBrowser: true,
      baseURL: openAiBaseUrl ? openAiBaseUrl : undefined
    });
    const stream = await openai.chat.completions.create(
      {
        model: aiChatModelString,
        messages: messagesWithInjection as ChatCompletionMessage[],
        stream: true
      },
      {
        signal
      }
    );
    for await (const chunk of stream) {
      renderChat(chunk.choices[0]?.delta?.content || '');
    }
    setReferenceSource('');
    setIsAiGenerating(false);
  } else if (
    // FIXME : never tested
    aiChatModelProvider === 'Azure' &&
    azureBaseUrl &&
    azureApiKey &&
    deploymentId &&
    aiChatModelString &&
    messages
  ) {
    const client = new OpenAIClient(azureBaseUrl, new AzureKeyCredential(azureApiKey));
    const events = await client.streamChatCompletions(deploymentId, messagesWithInjection as ChatCompletionMessage[]);
    for await (const event of events) {
      for (const choice of event.choices) {
        if (choice.delta?.content) {
          renderChat(choice.delta.content);
        }
      }
    }
    setReferenceSource('');
    setIsAiGenerating(false);
  } else if (aiChatModelProvider === 'Pretzel AI') {
    const response = await fetch('https://api.pretzelai.app/chat/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: messagesWithInjection
      }),
      signal
    });
    const reader = response!.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let isReading = true;
    while (isReading) {
      const { done, value } = await reader.read();
      if (done) {
        isReading = false;
        setReferenceSource('');
        setIsAiGenerating(false);
      } else {
        const chunk = decoder.decode(value);
        renderChat(chunk);
      }
    }
  } else if (aiChatModelProvider === 'Mistral' && mistralApiKey && aiChatModelString && messages) {
    const client = new MistralClient(mistralApiKey);

    // Convert messagesWithInjection to the required Message[] type
    const convertedMessages = messagesWithInjection.map(msg => ({
      role: msg.role,
      content: msg.content || ''
    }));

    const chatStream = await client.chatStream({
      model: aiChatModelString,
      messages: convertedMessages as Message[]
    });

    for await (const chunk of chatStream) {
      if (chunk.choices[0].delta.content) {
        renderChat(chunk.choices[0].delta.content);
      }
    }
    setReferenceSource('');
    setIsAiGenerating(false);
  } else if (aiChatModelProvider === 'Anthropic' && anthropicApiKey && aiChatModelString && messages) {
    const filteredMessages = messagesWithInjection.filter((msg, index) => index !== 1);
    const stream = await streamAnthropicCompletion(anthropicApiKey, filteredMessages, aiChatModelString);

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        renderChat(chunk.choices[0].delta.content);
      }
    }
    setReferenceSource('');
    setIsAiGenerating(false);
  } else if (aiChatModelProvider === 'Ollama') {
    const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiChatModelString,
        messages: messagesWithInjection,
        stream: true
      }),
      signal
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let isReading = true;
    while (isReading) {
      const { done, value } = await reader.read();
      if (done) {
        isReading = false;
        setReferenceSource('');
        setIsAiGenerating(false);
      } else {
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim() !== '') {
            const jsonResponse = JSON.parse(line);
            renderChat(jsonResponse.message?.content || '');
          }
        }
      }
    }
  } else if (aiChatModelProvider === 'Groq' && aiChatModelString && messages) {
    const groq = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });
    const stream = await groq.chat.completions.create({
      model: aiChatModelString,
      messages: messagesWithInjection as ChatCompletionMessageParam[],
      stream: true
    });

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        renderChat(chunk.choices[0].delta.content);
      }
    }
    setReferenceSource('');
    setIsAiGenerating(false);
  } else {
    renderChat('ERROR: No model provided. Fix your settings in Settings > Pretzel AI Settings');
    setReferenceSource('');
    setIsAiGenerating(false);
  }
};
