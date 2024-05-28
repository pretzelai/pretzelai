import { OpenAI } from 'openai';

export const chatAIStream = async ({
  aiService,
  openAiApiKey,
  openAiBaseUrl,
  openAiModel,
  azureBaseUrl,
  azureApiKey,
  deploymentId,
  renderChat,
  messages
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
}): Promise<void> => {
  if (aiService === 'OpenAI API key' && openAiApiKey && openAiModel && messages) {
    console.log('hallochen');
    const openai = new OpenAI({
      apiKey: openAiApiKey,
      dangerouslyAllowBrowser: true,
      baseURL: openAiBaseUrl ? openAiBaseUrl : undefined
    });
    const stream = await openai.chat.completions.create({
      model: openAiModel,
      messages,
      stream: true
    });
    for await (const chunk of stream) {
      renderChat(chunk.choices[0]?.delta?.content || '');
    }
  } else if (aiService === 'Use Pretzel AI Server') {
    const response = await fetch('https://wjwgjk52kb3trqnlqivqqyxm3i0glvof.lambda-url.eu-central-1.on.aws/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages
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
