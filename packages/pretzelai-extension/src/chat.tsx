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
import { Box, Typography } from '@mui/material';
import { CHAT_SYSTEM_MESSAGE, chatAIStream } from './chatAIUtils';
import { ChatCompletionMessage } from 'openai/resources';
import { INotebookTracker } from '@jupyterlab/notebook';
import { JupyterFrontEnd } from '@jupyterlab/application';
import {
  completionFunctionProvider,
  getSelectedCode,
  getTopSimilarities,
  PRETZEL_FOLDER,
  readEmbeddings
} from './utils';
import { RendermimeMarkdown } from './components/rendermime-markdown';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { OpenAI } from 'openai';
import { OpenAIClient } from '@azure/openai';
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import posthog from 'posthog-js';
import MistralClient from '@mistralai/mistralai';
import { Editor, Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { globalState } from './globalState';

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
const isMac = /Mac/i.test(navigator.userAgent);
const keyCombination = isMac ? 'Ctrl+Cmd+B' : 'Ctrl+Alt+B';
const historyPrevKeyCombination = isMac ? '⇧⌘<' : '⇧^<';
const historyNextKeyCombination = isMac ? '⇧⌘>' : '⇧^>';

interface IChatProps {
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
  notebookTracker: INotebookTracker;
  app: JupyterFrontEnd;
  rmRegistry: IRenderMimeRegistry;
  aiClient: OpenAI | OpenAIClient | MistralClient | null;
  codeMatchThreshold: number;
  posthogPromptTelemetry: boolean;
}

export function Chat({
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
  const [editorValue, setEditorValue] = useState('');
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

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
          if (chatHistoryJson.length > 0) {
            let lastChat: IMessage[] = chatHistoryJson[chatHistoryJson.length - 1];
            if (
              lastChat.every(m => messages.some(m2 => m2.content === m.content && m2.role === m.role && m2.id === m.id))
            ) {
              chatHistoryJson[chatHistoryJson.length - 1] = messages;
            } else {
              chatHistoryJson.push(messages);
            }
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
        setChatIndex(messagesToSave.length);
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
    if (editorValue.trim() === '' || isAiGenerating) {
      return;
    }
    setIsAiGenerating(true);
    posthog.capture('prompt_chat', { property: posthogPromptTelemetry ? editorValue : 'no_telemetry' });
    const inputMarkdown = editorValue.replace(/\n/g, '  \n');
    const activeCellCode = notebookTracker?.activeCell?.model?.sharedModel?.source;
    const embeddings = await readEmbeddings(notebookTracker, app, aiClient, aiChatModelProvider);
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
      { role: 'user', content: editorValue }
    ];

    const newMessage = {
      id: String(messages.length + 1),
      content: inputMarkdown,
      role: 'user'
    };

    setMessages(prevMessages => [...prevMessages, newMessage as IMessage]);
    setEditorValue('');

    const topSimilarities = await getTopSimilarities(
      editorValue,
      embeddings,
      5,
      aiClient,
      aiChatModelProvider,
      'no-match-id',
      codeMatchThreshold
    );

    const controller = new AbortController();
    let signal = controller.signal;
    setStopGeneration(() => () => controller.abort());

    await chatAIStream({
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
      messages: formattedMessages as ChatCompletionMessage[],
      topSimilarities,
      activeCellCode,
      selectedCode,
      setReferenceSource,
      setIsAiGenerating,
      signal,
      notebookTracker
    });
  };

  const cancelGeneration = () => {
    posthog.capture('prompt_chat cancel generation');
    setIsAiGenerating(false);
    stopGeneration();
    setReferenceSource('');
  };

  // function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
  //   if (event.key === 'Enter' && !event.shiftKey) {
  //     onSend();
  //     event.stopPropagation();
  //     event.preventDefault();
  //   }
  //   if (event.key === 'Escape') {
  //     if (isAiGenerating) {
  //       cancelGeneration();
  //     } else {
  //       notebookTracker?.activeCell?.editor?.focus();
  //     }
  //   }
  //   // Cmd + Esc should clear the chat
  //   if ((event.metaKey || event.ctrlKey) && event.key === 'Escape' && !isAiGenerating) {
  //     clearChat();
  //   }
  //   // Navigate chat history with Cmd+Shift+, and Cmd+Shift+. (or Ctrl+Shift on Windows)
  //   if (
  //     (event.metaKey || event.ctrlKey) &&
  //     event.shiftKey &&
  //     (event.key === ',' || event.key === '<') &&
  //     !isAiGenerating
  //   ) {
  //     restoreChat(-1);
  //   }
  //   if (
  //     (event.metaKey || event.ctrlKey) &&
  //     event.shiftKey &&
  //     (event.key === '.' || event.key === '>') &&
  //     !isAiGenerating
  //   ) {
  //     restoreChat(1);
  //   }
  // }

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
      posthog.capture('Chat History Restored', {
        direction: direction
      });
    }
  };

  const clearChat = () => {
    setMessages(initialMessage);
    setChatIndex(chatHistory.length);
    posthog.capture('Chat Cleared', {
      chatLength: messages.length
    });
  };

  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;

    const currentTheme = document.body.getAttribute('data-jp-theme-light') === 'true' ? 'vs' : 'vs-dark';
    monaco.editor.setTheme(currentTheme);

    if (!globalState.isMonacoRegistered) {
      // Register the completion provider for Markdown
      monaco.languages.registerCompletionItemProvider('markdown', {
        triggerCharacters: ['@'],
        provideCompletionItems: completionFunctionProvider
      });

      // remove cmd+k shortcut
      monaco.editor.addKeybindingRule({
        keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
        command: null
      });

      globalState.isMonacoRegistered = true;
    }

    editor.onKeyDown((event: monaco.IKeyboardEvent) => {
      if (event.keyCode === monaco.KeyCode.Enter && !event.shiftKey) {
        event.preventDefault();
        onSend();
      }
      // fixme ... add other key handlers as needed ...
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setEditorValue(value);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', padding: 2 }}>
        {messages.map(message => (
          <Box key={message.id} sx={message.role === 'user' ? { margin: '0 -16px 16px -16px' } : {}}>
            {referenceSource && message.role === 'assistant' && messages[messages.length - 1].id === message.id && (
              <Box
                sx={{
                  backgroundColor: 'var(--jp-layout-color2)',
                  borderRadius: '4px',
                  display: 'inline-block',
                  marginLeft: '0px',
                  marginBottom: '8px',
                  padding: '2px 6px'
                }}
              >
                <Typography
                  color={'var(--jp-ui-font-color1)'}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '1em'
                  }}
                >
                  {`Using ${referenceSource}...`}
                </Typography>
              </Box>
            )}
            <RendermimeMarkdown
              rmRegistry={rmRegistry}
              markdownStr={message.role === 'user' ? '***You:*** ' + message.content : '***AI:*** ' + message.content}
              notebookTracker={notebookTracker}
              role={message.role}
            />
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', padding: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px',
            border: '1px solid var(--jp-border-color1)',
            background: 'var(--vscode-editor-background)'
          }}
        >
          <Editor
            height="100px"
            defaultLanguage="markdown"
            value={editorValue}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              suggestOnTriggerCharacters: true,
              wordBasedSuggestions: 'off',
              parameterHints: { enabled: false },
              quickSuggestions: {
                other: false,
                comments: false,
                strings: false
              },
              lineNumbers: 'off',
              glyphMargin: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 0,
              folding: false,
              wordWrap: 'on',
              wrappingIndent: 'same',
              automaticLayout: true,
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              overviewRulerLanes: 0,
              renderLineHighlight: 'none',
              readOnly: isAiGenerating
            }}
          />
        </Box>
        {isAiGenerating ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
            <button className="remove-button" onClick={cancelGeneration} title="Cancel">
              Cancel <span style={{ fontSize: '0.8em' }}>Esc</span>
            </button>
            <Typography
              sx={{
                marginRight: 'var(--jp-ui-margin, 10px)',
                marginTop: 'var(--jp-ui-margin, 10px)',
                fontSize: '0.885rem'
              }}
            >
              Generating AI response...
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
            <div className="submit-button-container">
              <button className="pretzelInputSubmitButton" onClick={onSend} title="Submit ↵">
                Submit <span style={{ fontSize: '0.8em' }}>↵</span>
              </button>
              <div className="tooltip">
                Submit the message to the AI
                <br />
                Shortcut: <strong>Enter</strong>
              </div>
            </div>
            <div className="clear-button-container">
              <button className="pretzelInputSubmitButton" onClick={clearChat} title="Clear (Esc)">
                Clear <span style={{ fontSize: '0.8em' }}>{isMac ? '⌘' : '^'}Esc</span>
              </button>
              <div className="tooltip">
                Start a new chat. Previous chat will be saved.
                <br />
                Shortcut: <strong>{isMac ? 'Cmd+Esc' : 'Ctrl+Esc'}</strong>
              </div>
            </div>
            <div className="history-prev-button-container">
              <button
                className="pretzelInputSubmitButton"
                onClick={() => restoreChat(-1)}
                title={`Previous (${historyPrevKeyCombination})`}
              >
                {'<'}
              </button>
              <div className="tooltip">
                Navigate to the previous chat in history
                <br />
                Shortcut: <strong>{historyPrevKeyCombination}</strong>
              </div>
            </div>
            <Typography
              sx={{
                marginRight: 'var(--jp-ui-margin, 10px)',
                marginTop: 'var(--jp-ui-margin, 10px)',
                fontSize: '0.885rem'
              }}
            >
              History
            </Typography>
            <div className="history-next-button-container">
              <button
                className="pretzelInputSubmitButton"
                onClick={() => restoreChat(1)}
                title={`Next (${historyNextKeyCombination})`}
              >
                {'>'}
              </button>
              <div className="tooltip">
                Navigate to the next chat in history
                <br />
                Shortcut: <strong>{historyNextKeyCombination}</strong>
              </div>
            </div>
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
  widget.title.caption = `Pretzel AI Chat (${keyCombination})`;
  return widget;
}
