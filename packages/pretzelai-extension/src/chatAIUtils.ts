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
  return `${lastContent}
${
  selectedCode
    ? 'My question is regarding this code: \n-----\n' + selectedCode + '\n-----\n'
    : activeCellCode
    ? 'The cell I am focused on is: \n-----\n' + activeCellCode + '\n-----\n'
    : ''
}
${
  topSimilarities
    ? 'Cells containing related content are: \n-----\n' + topSimilarities.join('\n-----\n') + '\n-----\n'
    : ''
}`;
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
