/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import React, { useState } from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { cutIcon } from '@jupyterlab/ui-components';
import { Box, IconButton, TextField, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { chatAIStream } from './chatAIUtils';
import { ChatCompletionMessage } from 'openai/resources';
import { INotebookTracker } from '@jupyterlab/notebook';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { getSelectedCode } from './utils';

interface IMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
}

const mockMessages: IMessage[] = [{ id: '1', content: 'Hello, how can I assist you today?', role: 'assistant' }];

interface IChatProps {
  aiService: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  notebookTracker: INotebookTracker;
  app: JupyterFrontEnd;
}

export function Chat({
  aiService,
  openAiApiKey,
  openAiBaseUrl,
  openAiModel,
  azureBaseUrl,
  azureApiKey,
  deploymentId,
  notebookTracker,
  app
}: IChatProps): JSX.Element {
  const [messages, setMessages] = useState(mockMessages);
  const [input, setInput] = useState('');

  const onSend = async () => {
    const activeCellCode = notebookTracker?.activeCell?.model?.sharedModel?.source;
    const notebook = notebookTracker.currentWidget;
    const currentNotebookPath = notebook!.context.path;
    const notebookName = currentNotebookPath.split('/').pop()!.replace('.ipynb', '');
    const currentDir = currentNotebookPath.substring(0, currentNotebookPath.lastIndexOf('/'));
    const embeddingsFolderName = '.embeddings';
    const embeddingsPath = currentDir + '/' + embeddingsFolderName + '/' + notebookName + '_embeddings.json';

    const file = await app.serviceManager.contents.get(embeddingsPath);
    const embeddings = JSON.parse(file.content);
    const selectedCode = getSelectedCode(notebookTracker);
    console.log(activeCellCode);
    console.log(embeddings);
    console.log(selectedCode);

    const newMessage = {
      id: String(messages.length + 1),
      content: input,
      role: 'user'
    };
    setMessages([...messages, newMessage as IMessage]);
    setInput('');

    const formattedMessages = [
      {
        role: 'system',
        content:
          'You are a helpful assistant. Your name is Pretzel. You are an expert in Juypter Notebooks, Data Science, and Data Analysis.'
      },
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content
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

      if (lastMessage.role === 'user') {
        const aiMessage = {
          id: String(updatedMessages.length + 1),
          content: chunk,
          role: 'assistant'
        };
        updatedMessages.push(aiMessage as IMessage);
      } else if (lastMessage.role === 'assistant') {
        lastMessage.content += chunk;
      }

      return updatedMessages;
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', padding: 2 }}>
        {}
        {messages.map(message => (
          <Box key={message.id} sx={{ marginBottom: 2 }}>
            <Typography sx={{ fontWeight: 'bold' }} color={message.role === 'user' ? 'primary' : 'textSecondary'}>
              {message.role === 'user' ? 'You' : 'Pretzel AI'}
            </Typography>
            <Typography>{message.content}</Typography>
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
  widget.title.caption = 'Pretzel AI Chat';
  return widget;
}
