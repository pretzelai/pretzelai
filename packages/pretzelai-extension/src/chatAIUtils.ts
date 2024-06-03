import { OpenAI } from 'openai';
import { ChatCompletionMessage } from 'openai/resources';

export const CHAT_SYSTEM_MESSAGE =
  'You are a helpful assistant. Your name is Pretzel. You are an expert in Juypter Notebooks, Data Science, and Data Analysis. You always output markdown.';

const generateChatPrompt = (
  lastContent: string,
  topSimilarities?: string[],
  activeCellCode?: string,
  selectedCode?: string
) => {
  let output = `${lastContent}\n`;
  if (selectedCode) {
    output += `My question is related to this part of the code:
\`\`\`
${selectedCode}
\`\`\``;
  }

  if (lastContent.toLowerCase().includes('@notebook') && topSimilarities) {
    output += `Cells containing related content are:
\`\`\`
${topSimilarities.join('\n```\n')}
\`\`\`
`;
  } else {
    output += `My main question is the above.
If you need context this is the cell I am focused on.
Your goal is to answer my question briefly and don't mention the code unless necessary.
\`\`\`
${activeCellCode}
\`\`\`
`;
  }

  return output;
};

export const chatAIStream = async ({
  aiService,
  openAiApiKey,
  openAiBaseUrl,
  openAiModel,
  azureBaseUrl,
  azureApiKey,
  deploymentId,
  renderChat,
  messages,
  topSimilarities,
  activeCellCode,
  selectedCode
}: {
  aiService: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  renderChat: (message: string) => void;
  messages: OpenAI.ChatCompletionMessage[];
  topSimilarities: string[];
  activeCellCode?: string;
  selectedCode?: string;
}): Promise<void> => {
  const lastContent = messages[messages.length - 1].content as string;
  const lastContentWithInjection = generateChatPrompt(lastContent, topSimilarities, activeCellCode, selectedCode);
  const messagesWithInjection = [...messages.slice(0, -1), { role: 'user', content: lastContentWithInjection }];
  if (aiService === 'OpenAI API key' && openAiApiKey && openAiModel && messages) {
    const openai = new OpenAI({
      apiKey: openAiApiKey,
      dangerouslyAllowBrowser: true,
      baseURL: openAiBaseUrl ? openAiBaseUrl : undefined
    });
    const stream = await openai.chat.completions.create({
      model: openAiModel,
      messages: messagesWithInjection as ChatCompletionMessage[],
      stream: true
    });
    for await (const chunk of stream) {
      renderChat(chunk.choices[0]?.delta?.content || '');
    }
  } else if (aiService === 'Use Pretzel AI Server') {
    const response = await fetch('https://api.pretzelai.app/chat/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: messagesWithInjection
      })
    });
    const reader = response!.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let isReading = true;
    while (isReading) {
      const { done, value } = await reader.read();
      if (done) {
        isReading = false;
      }
      const chunk = decoder.decode(value);
      renderChat(chunk);
    }
  }
};
