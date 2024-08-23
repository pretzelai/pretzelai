/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import { OpenAIClient } from '@azure/openai';
import { ILabShell, JupyterFrontEnd } from '@jupyterlab/application';
import { IThemeManager, ReactWidget } from '@jupyterlab/apputils';
import { URLExt } from '@jupyterlab/coreutils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ServerConnection } from '@jupyterlab/services';
import { LabIcon } from '@jupyterlab/ui-components';
import MistralClient from '@mistralai/mistralai';
import { Editor, loader, Monaco } from '@monaco-editor/react';
import { Box, Chip, Typography } from '@mui/material';
import * as monaco from 'monaco-editor';
import { OpenAI } from 'openai';
import posthog from 'posthog-js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import pretzelSvg from '../style/icons/pretzel.svg';
import { CHAT_SYSTEM_MESSAGE, chatAIStream } from './chatAIUtils';
import { RendermimeMarkdown } from './components/rendermime-markdown';
import { globalState } from './globalState';
import { Embedding } from './prompt';
import {
  completionFunctionProvider,
  getSelectedCode,
  getTopSimilarities,
  PRETZEL_FOLDER,
  readEmbeddings
} from './utils';
loader.config({ monaco }); // BUG FIX - WAS PICKING UP OLD VERSION OF MONACO FROM JSDELIVR

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

class PlaceholderContentWidget {
  static ID = 'editor.widget.placeholderHint';
  private domNode: HTMLElement | null = null;
  private editor: monaco.editor.IStandaloneCodeEditor;
  private placeholder: string;

  constructor(placeholder: string, editor: monaco.editor.IStandaloneCodeEditor) {
    this.placeholder = placeholder;
    this.editor = editor;
    editor.onDidChangeModelContent(() => this.onDidChangeModelContent());
    this.onDidChangeModelContent();
  }

  onDidChangeModelContent() {
    if (this.editor.getValue() === '') {
      this.editor.addContentWidget(this);
    } else {
      this.editor.removeContentWidget(this);
    }
  }

  getId() {
    return PlaceholderContentWidget.ID;
  }

  getDomNode() {
    if (!this.domNode) {
      this.domNode = document.createElement('div');
      this.domNode.style.width = 'max-content';
      this.domNode.style.fontStyle = 'italic';
      this.domNode.style.color = 'gray';
      this.domNode.style.pointerEvents = 'none';
      this.domNode.style.fontSize = '0.75rem';

      const lines = this.placeholder.split('\n');
      lines.forEach((line, index) => {
        const lineDiv = document.createElement('div');
        lineDiv.textContent = line;
        if (index > 0) {
          lineDiv.style.marginTop = '4px';
        }
        this.domNode!.appendChild(lineDiv);
      });

      this.editor.applyFontInfo(this.domNode);
    }
    return this.domNode;
  }

  getPosition() {
    return {
      position: { lineNumber: 1, column: 1 },
      preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
    };
  }

  dispose() {
    this.editor.removeContentWidget(this);
  }
}

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
  notebookTracker: INotebookTracker | null;
  app: JupyterFrontEnd;
  rmRegistry: IRenderMimeRegistry;
  aiClient: OpenAI | OpenAIClient | MistralClient | null;
  codeMatchThreshold: number;
  posthogPromptTelemetry: boolean;
  themeManager: IThemeManager;
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
  posthogPromptTelemetry,
  themeManager
}: IChatProps): JSX.Element {
  const [messages, setMessages] = useState(initialMessage);
  const [chatHistory, setChatHistory] = useState<IMessage[][]>([]);
  const [, setChatIndex] = useState(0);
  const clearChatRef = useRef<() => void>(() => { });
  const chatHistoryRef = useRef<IMessage[][]>([]);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [referenceSource, setReferenceSource] = useState('');
  const [stopGeneration, setStopGeneration] = useState<() => void>(() => () => { });
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const [editorValue, setEditorValue] = useState('');
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const placeholderWidgetRef = useRef<PlaceholderContentWidget | null>(null);
  const [base64Images, setBase64Images] = useState<string[]>([]);
  const base64ImagesRef = useRef<string[]>([]);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);

  const fetchChatHistory = async () => {
    const notebook = notebookTracker?.currentWidget;
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
    if (!notebookTracker) return;
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
    const labShell = app.shell as ILabShell;
    labShell.currentPathChanged.connect((sender, args) => {
      fetchChatHistory();
    });
  }, []);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

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

  const handlePaste = useCallback((editor: monaco.editor.IStandaloneCodeEditor, event: monaco.editor.IPasteEvent) => {
    const clipboardData = event.clipboardEvent?.clipboardData;
    if (clipboardData) {
      const items = clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setBase64Images((prevImages) => [...prevImages, base64Image]);
            };
            reader.readAsDataURL(blob);
          }
        } else if (item.type === 'text/plain') {
          item.getAsString((text) => {
            if (editorRef.current) {
              const position = editorRef.current.getPosition();
              editorRef.current.executeEdits('paste', [{
                range: new monaco.Range(
                  position!.lineNumber,
                  position!.column,
                  position!.lineNumber,
                  position!.column
                ),
                text: text,
                forceMoveMarkers: true
              }]);
            }
          });
        }
      }
    }
  }, []);

  useEffect(() => {
    base64ImagesRef.current = base64Images;
  }, [base64Images]);

  const onSend = async (editorValueFromEvent = editorValue) => {
    if (editorValueFromEvent.trim() === '' || isAiGenerating) {
      return;
    }
    setIsAiGenerating(true);
    posthog.capture('prompt_chat', { property: posthogPromptTelemetry ? editorValueFromEvent : 'no_telemetry' });
    const inputMarkdown = editorValueFromEvent.replace(/\n/g, '  \n');
    let activeCellCode: string = '';
    let embeddings: Embedding[] = [];
    let selectedCode: string = '';
    if (notebookTracker && notebookTracker.currentWidget) {
      activeCellCode = notebookTracker?.activeCell?.model?.sharedModel?.source || '';
      embeddings = await readEmbeddings(notebookTracker, app, aiClient, aiChatModelProvider);
      selectedCode = getSelectedCode(notebookTracker).extractedCode;
    }

    const newMessage = {
      id: String(messages.length + 1),
      // we need to use a Ref here because of the closure created by handleEditorDidMount
      // that meant that when we used shortcuts, the updates state was not accessed
      content: base64ImagesRef.current.length > 0
        ? [
          { type: "text", text: inputMarkdown },
          ...base64ImagesRef.current.map(base64Image => ({
            type: "image",
            data: base64Image
          }))
        ]
        : inputMarkdown,
      role: 'user'
    };

    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages, newMessage as IMessage];

      const formattedMessages = [
        {
          role: 'system',
          content: CHAT_SYSTEM_MESSAGE
        },
        ...updatedMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      (async () => {
        const topSimilarities = await getTopSimilarities(
          editorValueFromEvent,
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
          messages: formattedMessages,
          topSimilarities,
          activeCellCode,
          selectedCode,
          setReferenceSource,
          setIsAiGenerating,
          signal,
          notebookTracker
        });
      })();

      return updatedMessages;
    });

    setEditorValue('');
    setBase64Images([]); // Clear images after sending
  };

  const onSendWithoutContext = async (editorValueFromEvent = editorValue) => {
    if (editorValueFromEvent.trim() === '' || isAiGenerating) {
      return;
    }
    setIsAiGenerating(true);
    posthog.capture('prompt_chat_without_context', { property: posthogPromptTelemetry ? editorValueFromEvent : 'no_telemetry' });
    const inputMarkdown = editorValueFromEvent.replace(/\n/g, '  \n');

    const newMessage = {
      id: String(messages.length + 1),
      content: inputMarkdown,
      role: 'user'
    };

    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages, newMessage as IMessage];

      const formattedMessages = [
        {
          role: 'system',
          content: CHAT_SYSTEM_MESSAGE
        },
        ...updatedMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      (async () => {
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
          messages: formattedMessages,
          topSimilarities: [],
          activeCellCode: '',
          selectedCode: '',
          setReferenceSource,
          setIsAiGenerating,
          signal,
          notebookTracker
        });
      })();

      return updatedMessages;
    });

    setEditorValue('');
  };

  const cancelGeneration = () => {
    posthog.capture('prompt_chat cancel generation');
    setIsAiGenerating(false);
    stopGeneration();
    setReferenceSource('');
  };

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

  const clearChat = useCallback(() => {
    setMessages(initialMessage);
    setChatIndex(chatHistoryRef.current.length);
    setBase64Images([]);
    posthog.capture('Chat Cleared', {
      chatLength: messages.length
    });
    editorRef.current?.focus();
  }, [messages.length]);

  useEffect(() => {
    clearChatRef.current = clearChat;
  }, [clearChat]);

  const restoreChat = useCallback((direction: number) => {
    setChatIndex(prevIndex => {
      const newIndex = prevIndex + direction;
      const currentChatHistory = chatHistoryRef.current;
      if (direction === 1 && newIndex === currentChatHistory.length) {
        clearChatRef.current();
        return currentChatHistory.length;
      } else if (newIndex >= 0 && newIndex < currentChatHistory.length) {
        setMessages(currentChatHistory[newIndex]);
        posthog.capture('Chat History Restored', {
          direction: direction
        });
        return newIndex;
      }
      return prevIndex;
    });
  }, []);

  const handleEditorDidMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor;
      monaco.editor.setTheme(themeManager?.theme?.includes('Light') ? 'vs' : 'vs-dark');

      // Add placeholder
      const placeholder =
        `Ask AI (toggle with: ${keyCombination}).\n` +
        `Use Esc to jump back to cell. Shift + Enter for newline.\n` +
        `Current cell and other relevant cells are available as context to the AI.`;

      placeholderWidgetRef.current = new PlaceholderContentWidget(placeholder, editor);

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
        if (themeManager) {
          themeManager.themeChanged.connect((_, theme) => {
            const currentTheme = theme.newValue.includes('Light') ? 'vs' : 'vs-dark';
            monaco.editor.setTheme(currentTheme);
          });
        }

        globalState.isMonacoRegistered = true;
      }

      editor.onDidPaste((e) => {
        handlePaste(editor, e);
      });

      editor.onKeyDown((event: monaco.IKeyboardEvent) => {
        // Check if autocomplete widget is visible
        const isAutocompleteWidgetVisible = () => {
          const editorElement = editor.getContainerDomNode();
          const suggestWidget = editorElement.querySelector('.editor-widget.suggest-widget.visible');
          return suggestWidget !== null && suggestWidget.getAttribute('monaco-visible-content-widget') === 'true';
        };

        if (isAutocompleteWidgetVisible()) {
          // Let Monaco handle the key events when autocomplete is open
          return;
        }

        if (event.keyCode === monaco.KeyCode.Enter && !event.shiftKey) {
          event.preventDefault();
          const currentValue = editor.getValue();
          if ((isMac && event.altKey) || (!isMac && event.altKey)) {
            onSendWithoutContext(currentValue);
          } else {
            onSend(currentValue);
          }
        }

        if (event.keyCode === monaco.KeyCode.Escape) {
          event.preventDefault();
          if (isAiGenerating) {
            cancelGeneration();
          } else {
            notebookTracker?.activeCell?.editor?.focus();
          }
        }
        // Cmd + Esc should clear the chat
        if ((event.ctrlKey || event.metaKey) && event.keyCode === monaco.KeyCode.Escape && !isAiGenerating) {
          event.preventDefault();
          clearChatRef.current();
        }
        // Navigate chat history with Cmd+Shift+, and Cmd+Shift+. (or Ctrl+Shift on Windows)
        if (
          (event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          event.keyCode === monaco.KeyCode.Comma &&
          !isAiGenerating
        ) {
          event.preventDefault();
          restoreChat(-1);
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          event.keyCode === monaco.KeyCode.Period &&
          !isAiGenerating
        ) {
          event.preventDefault();
          restoreChat(1);
        }
      });
    },
    [restoreChat, isAiGenerating, clearChat, onSendWithoutContext, handlePaste]
  );

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setEditorValue(value);
    }
  };

  const removeImage = useCallback((indexToRemove: number) => {
    setBase64Images(prevImages => prevImages.filter((_, index) => index !== indexToRemove));
    setHoveredImage(null);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', padding: 2 }}>
        {messages.map((message, index) => (
          <Box key={`message-${index}`}>
            {referenceSource && message.role === 'assistant' && messages[messages.length - 1].id === message.id && (
              <Box
                sx={{
                  backgroundColor: 'var(--jp-layout-color2)',
                  borderRadius: '4px',
                  display: 'inline-block',
                  marginLeft: '0px',
                  marginTop: '8px',
                  marginBottom: '2px',
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
              markdownStr={message.role === 'user'
                ? '***You:*** ' + (Array.isArray(message.content) ? message.content[0].text : message.content)
                : '***AI:*** ' + (Array.isArray(message.content) ? message.content[0].text : message.content)
              }
              notebookTracker={notebookTracker}
              role={message.role}
            />
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
        {hoveredImage && (
          <Box sx={{ marginBottom: 1, marginLeft: 1, marginRight: 1 }}>
            <img src={hoveredImage} alt="Preview" />
          </Box>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, margin: '0 0 0 10px' }}>
          {base64Images.map((base64Image, index) => (
            <Box
              key={index}
              sx={{
                position: 'relative',
                display: 'inline-block',
                margin: '0 4px 4px 0',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'scale(1.05)',
                  '& .delete-icon': {
                    opacity: 1,
                  }
                }
              }}
              onMouseEnter={() => setHoveredImage(base64Image)}
              onMouseLeave={() => setHoveredImage(null)}
            >
              <Chip
                label="Image"
                size="small"
                sx={{
                  backgroundColor: 'var(--jp-layout-color2)',
                  color: 'var(--jp-ui-font-color1)',
                }}
              />
              <Box
                className="delete-icon"
                sx={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--jp-layout-color3)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: 0,
                  transition: 'all 0.2s ease-in-out',
                  border: '2px solid var(--jp-layout-color1)',
                  '&:hover': {
                    backgroundColor: 'var(--jp-layout-color4)',
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(index);
                }}
              >
                <Typography
                  sx={{
                    color: 'var(--jp-ui-font-color1)',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    lineHeight: 1,
                  }}
                >
                  ×
                </Typography>
              </Box>
            </Box>
          ))}
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
              theme={document.body.getAttribute('data-jp-theme-light') === 'true' ? 'vs' : 'vs-dark'}
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
                <button className="pretzelInputSubmitButton" onClick={() => onSend(editorValue)} title="Submit ↵">
                  Submit <span style={{ fontSize: '0.8em' }}>↵</span>
                </button>
                <div className="tooltip">
                  Submit the message to the AI
                  <br />
                  Shortcut: <strong>Enter</strong>
                  <br />
                  Submit without context: <strong>{isMac ? 'Option' : 'Alt'}+Enter</strong>
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
