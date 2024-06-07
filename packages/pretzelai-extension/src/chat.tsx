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
import { Box, TextField, Typography } from '@mui/material';
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
import posthog from 'posthog-js';

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
  posthogPromptTelemetry: boolean;
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
  codeMatchThreshold,
  posthogPromptTelemetry
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
    if (input.trim() === '' || isAiGenerating) {
      return;
    }
    setIsAiGenerating(true);
    posthog.capture('prompt_chat', { property: posthogPromptTelemetry ? input : 'no_telemetry' });
    const inputMarkdown = input.replace(/\n/g, '  \n');
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
      content: inputMarkdown,
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

  const cancelGeneration = () => {
    setIsAiGenerating(false);
    stopGeneration();
    setReferenceSource('');
  };

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      onSend();
      event.stopPropagation();
      event.preventDefault();
    }
    if (event.key === 'Escape') {
      cancelGeneration();
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
    if (direction === 1 && chatIndex === chatHistory.length - 1) {
      clearChat();
    } else if (chatIndex + direction >= 0 && chatIndex + direction < chatHistory.length) {
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

      <Box sx={{ display: 'flex', flexDirection: 'column', padding: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TextField
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            fullWidth
            multiline
            rows={4}
            placeholder="Type message to ask AI..."
            autoComplete="off"
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
        </Box>
        {isAiGenerating ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
            <button className="remove-button" onClick={cancelGeneration} title="Cancel">
              Cancel <span style={{ fontSize: '0.8em' }}>Esc</span>
            </button>
            <Typography sx={{ marginRight: 'var(--jp-ui-margin, 10px)', marginTop: 'var(--jp-ui-margin, 10px)' }}>
              Generating AI response...
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
            <button className="pretzelInputSubmitButton" onClick={onSend} title="Submit ↵">
              Submit <span style={{ fontSize: '0.8em' }}>↵</span>
            </button>
            <button className="pretzelInputSubmitButton" onClick={clearChat} title="Clear">
              Clear
            </button>
            <button className="pretzelInputSubmitButton" onClick={() => restoreChat(-1)} title="Clear">
              {'<'}
            </button>
            <Typography sx={{ marginRight: 'var(--jp-ui-margin, 10px)', marginTop: 'var(--jp-ui-margin, 10px)' }}>
              History
            </Typography>
            <button className="pretzelInputSubmitButton" onClick={() => restoreChat(1)} title="Clear">
              {'>'}
            </button>
          </Box>
        )}
      </Box>
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
