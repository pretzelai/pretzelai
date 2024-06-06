/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { LabIcon } from '@jupyterlab/ui-components';
import pretzelSvg from '../style/icons/pretzel.svg';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import { CHAT_SYSTEM_MESSAGE, chatAIStream } from './chatAIUtils';
import { ChatCompletionMessage } from 'openai/resources';
import { INotebookTracker } from '@jupyterlab/notebook';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { getSelectedCode, getTopSimilarities, PRETZEL_FOLDER, readEmbeddings } from './utils';
import { RendermimeMarkdown } from './components/rendermime-markdown';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { AiService } from './prompt';

import { OpenAI } from 'openai';
import { OpenAIClient } from '@azure/openai';
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

const pretzelIcon = new LabIcon({
  name: 'pretzelai::chat',
  svgstr: pretzelSvg
});

interface IMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
}

const initialMessage: IMessage[] = [{ id: '1', content: 'Hello, how can I assist you today?', role: 'assistant' }];

interface IChatProps {
  aiService: AiService;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  notebookTracker: INotebookTracker;
  app: JupyterFrontEnd;
  rmRegistry: IRenderMimeRegistry;
  aiClient: OpenAI | OpenAIClient | null;
  codeMatchThreshold: number;
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
  app,
  rmRegistry,
  aiClient,
  codeMatchThreshold
}: IChatProps): JSX.Element {
  const [messages, setMessages] = useState(initialMessage);
  const [chatHistory, setChatHistory] = useState<IMessage[][]>([]);
  const [chatIndex, setChatIndex] = useState(0);
  const [input, setInput] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [referenceSource, setReferenceSource] = useState('');
  const [stopGeneration, setStopGeneration] = useState<() => void>(() => () => {});
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const fetchChatHistory = async () => {
    const notebook = notebookTracker.currentWidget;
    if (!notebook?.model) {
      setTimeout(fetchChatHistory, 1000);
      return;
    }
    if (notebook?.model && !isAiGenerating) {
      const currentNotebookPath = notebook.context.path;
      const currentDir = currentNotebookPath.substring(0, currentNotebookPath.lastIndexOf('/'));
      const chatHistoryPath = currentDir + '/' + PRETZEL_FOLDER + '/' + 'chat_history.json';

      const requestUrl = URLExt.join(app.serviceManager.serverSettings.baseUrl, 'api/contents', chatHistoryPath);
      const response = await ServerConnection.makeRequest(
        requestUrl,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        app.serviceManager.serverSettings
      );
      if (response.ok) {
        // chat_history.json exists
        const file = await app.serviceManager.contents.get(chatHistoryPath);

        const chatHistoryJson = JSON.parse(file.content);
        setChatHistory(chatHistoryJson);
        setChatIndex(chatHistoryJson.length);
      }
    }
  };

  const saveMessages = async () => {
    const notebook = notebookTracker.currentWidget;
    if (notebook?.model && !isAiGenerating) {
      const currentNotebookPath = notebook.context.path;
      const currentDir = currentNotebookPath.substring(0, currentNotebookPath.lastIndexOf('/'));
      const chatHistoryPath = currentDir + '/' + PRETZEL_FOLDER + '/' + 'chat_history.json';

      const requestUrl = URLExt.join(app.serviceManager.serverSettings.baseUrl, 'api/contents', chatHistoryPath);
      const response = await ServerConnection.makeRequest(
        requestUrl,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        app.serviceManager.serverSettings
      );
      if (response.ok) {
        // chat_history.json exists
        const file = await app.serviceManager.contents.get(chatHistoryPath);
        try {
          const chatHistoryJson = JSON.parse(file.content);
          let lastChat: IMessage[] = chatHistoryJson[chatHistoryJson.length - 1];
          if (
            lastChat.every(m => messages.some(m2 => m2.content === m.content && m2.role === m.role && m2.id === m.id))
          ) {
            chatHistoryJson[chatHistoryJson.length - 1] = messages;
          } else {
            chatHistoryJson.push(messages);
          }
          if (messages.length > 1) {
            await app.serviceManager.contents.save(chatHistoryPath, {
              type: 'file',
              format: 'text',
              content: JSON.stringify(chatHistoryJson)
            });
          }
          setChatHistory(chatHistoryJson);
          setChatIndex(chatHistoryJson.length - 1);
        } catch (error) {
          console.error('Error parsing chat history JSON:', error);
        }
      } else {
        // create chat_history.json
        const messagesToSave = messages.length > 1 ? [messages] : [];
        app.serviceManager.contents.save(chatHistoryPath, {
          type: 'file',
          format: 'text',
          content: JSON.stringify(messagesToSave)
        });
        setChatHistory(messagesToSave);
        setChatIndex(1);
      }
    }
  };

  useEffect(() => {
    // Load chat history
    fetchChatHistory();
  }, []);

  useEffect(() => {
    // Triggers when AI generation finishes
    if (!isAiGenerating) {
      saveMessages();
    }
  }, [isAiGenerating]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView();
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const onSend = async () => {
    setIsAiGenerating(true);
    const activeCellCode = notebookTracker?.activeCell?.model?.sharedModel?.source;
    const embeddings = await readEmbeddings(notebookTracker, app);
    const selectedCode = getSelectedCode(notebookTracker).extractedCode;

    const formattedMessages = [
      {
        role: 'system',
        content: CHAT_SYSTEM_MESSAGE
      },
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: input }
    ];

    const newMessage = {
      id: String(messages.length + 1),
      content: input,
      role: 'user'
    };

    setMessages(prevMessages => [...prevMessages, newMessage as IMessage]);
    setInput('');

    const topSimilarities = await getTopSimilarities(
      input,
      embeddings,
      5,
      aiClient,
      aiService,
      'no-match-id',
      codeMatchThreshold
    );

    const controller = new AbortController();
    let signal = controller.signal;
    setStopGeneration(() => () => controller.abort());

    await chatAIStream({
      aiService,
      openAiApiKey,
      openAiBaseUrl,
      openAiModel,
      azureBaseUrl,
      azureApiKey,
      deploymentId,
      renderChat,
      messages: formattedMessages as ChatCompletionMessage[],
      topSimilarities,
      activeCellCode,
      selectedCode,
      setReferenceSource,
      setIsAiGenerating,
      signal
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

  const restoreChat = (direction: number) => {
    if (chatIndex + direction >= 0 && chatIndex + direction < chatHistory.length) {
      setChatIndex(chatIndex + direction);
      setMessages(chatHistory[chatIndex + direction]);
    }
  };

  const clearChat = () => {
    setMessages(initialMessage);
    setChatIndex(chatHistory.length);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', padding: 2 }}>
        {messages.map(message => (
          <Box key={message.id} sx={{ marginBottom: 2 }}>
            <Box
              sx={{
                backgroundColor: 'var(--jp-brand-color2)',
                borderRadius: '10px',
                display: 'inline-block',
                paddingX: '10px'
              }}
            >
              <Typography sx={{ fontWeight: 'bold' }} color={'var(--jp-ui-inverse-font-color1)'}>
                {message.role === 'user' ? 'You' : 'Pretzel AI'}
              </Typography>
            </Box>
            {referenceSource && message.role === 'assistant' && messages[messages.length - 1].id === message.id && (
              <Box
                sx={{
                  backgroundColor: 'var(--jp-layout-color2)',
                  borderRadius: '10px',
                  display: 'inline-block',
                  paddingX: '10px',
                  marginLeft: '10px'
                }}
              >
                <Typography color={'var(--jp-ui-font-color1)'}>{`Using ${referenceSource}...`}</Typography>
              </Box>
            )}
            <RendermimeMarkdown
              rmRegistry={rmRegistry}
              markdownStr={message.content}
              notebookTracker={notebookTracker}
            />
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </Box>
      {isAiGenerating ? (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 1 }}>
          <Typography>Generating AI response...</Typography>
          <IconButton
            onClick={() => {
              setIsAiGenerating(false);
              stopGeneration();
              setReferenceSource('');
            }}
            sx={{
              color: 'red',
              backgroundColor: '#ffcccc',
              borderRadius: '10%',
              fontSize: '1rem',
              alignSelf: 'center'
            }}
          >
            <StopIcon />
            Cancel
          </IconButton>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', padding: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <TextField
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              fullWidth
              placeholder="Type message to ask AI..."
              sx={{
                color: 'var(--jp-ui-font-color1)',
                '& .MuiInputBase-input': {
                  color: 'var(--jp-ui-font-color1)'
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--jp-ui-font-color1)'
                }
              }}
            />
            <IconButton onClick={onSend} sx={{ color: 'var(--jp-ui-font-color1)' }}>
              <SendIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginTop: '8px' }}>
            <Button onClick={clearChat} sx={{ marginRight: '8px' }}>
              Clear
            </Button>
            <Button onClick={() => restoreChat(-1)}>{'<'}</Button>
            <Typography>History</Typography>
            <Button onClick={() => restoreChat(1)}>{'>'}</Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export function createChat(props: IChatProps): ReactWidget {
  const widget = ReactWidget.create(<Chat {...props} />);
  widget.id = 'pretzelai::chat';
  widget.title.icon = pretzelIcon;
  widget.title.caption = 'Pretzel AI Chat';
  return widget;
}
