import React, { useState } from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { cutIcon } from '@jupyterlab/ui-components';
import { Box, IconButton, TextField, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { chatAIStream } from './chatAIUtils';
import { ChatCompletionMessage } from 'openai/resources';

interface IMessage {
  id: string;
  body: string;
  type: 'agent' | 'human';
}

const mockMessages: IMessage[] = [{ id: '1', body: 'Hello, how can I assist you today?', type: 'agent' }];

interface IChatProps {
  aiService: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
}

export function Chat({
  aiService,
  openAiApiKey,
  openAiBaseUrl,
  openAiModel,
  azureBaseUrl,
  azureApiKey,
  deploymentId
}: IChatProps): JSX.Element {
  const [messages, setMessages] = useState(mockMessages);
  const [input, setInput] = useState('');

  const onSend = async () => {
    const newMessage = {
      id: String(messages.length + 1),
      body: input,
      type: 'human'
    };
    setMessages([...messages, newMessage as IMessage]);
    setInput('');

    const formattedMessages = [
      ...messages.map(msg => ({
        role: msg.type === 'human' ? 'user' : 'assistant',
        content: msg.body
      })),
      { role: 'user', content: input }
    ];

    await chatAIStream({
      aiService,
      openAiApiKey,
      openAiBaseUrl,
      openAiModel,
      azureBaseUrl,
      azureApiKey,
      deploymentId,
      renderChat,
      messages: formattedMessages as ChatCompletionMessage[]
    });
  };

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      onSend();
      event.stopPropagation();
      event.preventDefault();
    }
  }

  const renderChat = (chunk: string) => {
    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages];
      const lastMessage = updatedMessages[updatedMessages.length - 1];

      if (lastMessage.type === 'human') {
        const systemMessage = {
          id: String(updatedMessages.length + 1),
          body: chunk,
          type: 'agent'
        };
        updatedMessages.push(systemMessage as IMessage);
      } else if (lastMessage.type === 'agent') {
        lastMessage.body += chunk;
      }

      return updatedMessages;
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', padding: 2 }}>
        {messages.map(message => (
          <Box key={message.id} sx={{ marginBottom: 2 }}>
            <Typography sx={{ fontWeight: 'bold' }} color={message.type === 'human' ? 'primary' : 'textSecondary'}>
              {message.type === 'human' ? 'You' : 'Pretzel AI'}
            </Typography>
            <Typography>{message.body}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', padding: 1 }}>
        <TextField
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          fullWidth
          placeholder="Type message to ask AI..."
        />
        <IconButton onClick={onSend}>
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}

export function createChat(props: IChatProps): ReactWidget {
  const widget = ReactWidget.create(<Chat {...props} />);
  widget.id = 'pretzelai::chat';
  widget.title.icon = cutIcon;
  widget.title.caption = 'Pretzel AI Chat'; // TODO: i18n
  return widget;
}
