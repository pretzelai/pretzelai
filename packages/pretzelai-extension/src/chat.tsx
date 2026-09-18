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
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryIcon from '@mui/icons-material/History';
import UploadIcon from '@mui/icons-material/Upload';
import { Box, IconButton, ListSubheader, Menu, MenuItem, Typography } from '@mui/material';
import * as monaco from 'monaco-editor';
import { OpenAI } from 'openai';
import posthog from 'posthog-js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import pretzelSvg from '../style/icons/pretzel.svg';
import { CHAT_SYSTEM_MESSAGE, chatAIStream } from './chatAIUtils';
import { describeChatError } from './chatErrors';
import { RendermimeMarkdown } from './components/rendermime-markdown';
import { ChatModelPicker } from './components/ChatModelPicker';
import { globalState } from './globalState';
import { getDefaultSettings } from './migrations/defaultSettings';
import { Embedding } from './prompt';
import {
  completionFunctionProvider,
  getSelectedCode,
  getTopSimilarities,
  PRETZEL_FOLDER,
  readEmbeddings
} from './utils';
import { providersInfo } from './migrations/providerInfo';
import { ImagePreview } from './components/ImagePreview';

loader.config({ monaco }); // BUG FIX - WAS PICKING UP OLD VERSION OF MONACO FROM JSDELIVR

const pretzelIcon = new LabIcon({
  name: 'pretzelai::chat',
  svgstr: pretzelSvg
});

interface IMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  // Name the user gave the chat. Kept on the chat's first message so chat_history.json stays a list of message lists
  chatTitle?: string;
  // Reply that failed (the AI provider or model gave an error)
  error?: boolean;
}

const initialMessage: IMessage[] = [{ id: '1', content: 'Hello, how can I assist you today?', role: 'assistant' }];
const isMac = /Mac/i.test(navigator.userAgent);
const keyCombination = isMac ? 'Ctrl+Cmd+B' : 'Ctrl+Alt+B';
const historyPrevKeyCombination = isMac ? '⇧⌘<' : '⇧^<';
const historyNextKeyCombination = isMac ? '⇧⌘>' : '⇧^>';

// Replies that are an error message rather than an answer ("ERROR: ..." is also how older code reports errors)
const isErrorReply = (message?: IMessage): boolean =>
  message?.role === 'assistant' &&
  (!!message.error || (typeof message.content === 'string' && message.content.startsWith('ERROR: ')));

// What the model is sent: failed replies, and the questions they were answering, are left out
const withoutFailedReplies = (messages: IMessage[]): IMessage[] =>
  messages.filter(
    (message, i) => !isErrorReply(message) && !(message.role === 'user' && isErrorReply(messages[i + 1]))
  );

// Chats are saved next to the notebook, in .pretzel/chat_history.json
const getChatHistoryPath = (notebookPath: string): string =>
  notebookPath.substring(0, notebookPath.lastIndexOf('/')) + '/' + PRETZEL_FOLDER + '/' + 'chat_history.json';

// The first thing the user asked in a chat
const getFirstQuestion = (chat: IMessage[]): string => {
  const content: any = chat.find(message => message.role === 'user')?.content ?? '';
  const text = Array.isArray(content) ? content.find(item => item.type === 'text')?.text ?? '' : content;
  return text.replace(/\s+/g, ' ').trim();
};

// Title for a saved chat in the history menu: the name the user gave it, or else its first question
const getChatTitle = (chat: IMessage[]): string => chat[0]?.chatTitle || getFirstQuestion(chat) || 'Untitled chat';

// A copy of the chat with its name set (or removed when chatTitle is undefined)
const withChatTitle = (chat: IMessage[], chatTitle?: string): IMessage[] => [
  { ...chat[0], chatTitle },
  ...chat.slice(1)
];

// Compares content by value, since messages with images have a list as content
const isSameMessage = (message: IMessage, other: IMessage): boolean =>
  message.id === other.id &&
  message.role === other.role &&
  JSON.stringify(message.content) === JSON.stringify(other.content);

const isSameChat = (chat?: IMessage[], other?: IMessage[]): boolean =>
  !!chat && !!other && chat.length === other.length && chat.every((message, i) => isSameMessage(message, other[i]));

// Which saved chat the open conversation is (it may have gone on since it was saved), or chats.length if none
const findOpenChat = (chats: IMessage[][], messages: IMessage[]): number => {
  let found = chats.length;
  chats.forEach((chat, i) => {
    const isStartOfOpenChat =
      chat.length > 1 &&
      chat.length <= messages.length &&
      chat.every((message, j) => isSameMessage(message, messages[j]));
    if (isStartOfOpenChat && (found === chats.length || chat.length >= chats[found].length)) {
      found = i;
    }
  });
  return found;
};

// Text box for renaming a chat in the history menu. Enter or clicking away saves, Esc cancels
function ChatNameInput({
  initialName,
  onSave,
  onCancel
}: {
  initialName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState(initialName);
  // Enter/Esc remove the text box, which can also fire a blur; only finish once
  const finishedRef = useRef(false);
  const finish = (save: boolean) => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    if (save) {
      onSave(name);
    } else {
      onCancel();
    }
  };
  return (
    <input
      className="jp-mod-styled"
      aria-label="Chat name"
      placeholder="Name this chat"
      autoFocus
      value={name}
      onChange={e => setName(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={() => finish(true)}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        // Keep keys in the text box: the menu would use them to jump between chats or to close
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          finish(e.key === 'Enter');
          // Back to the chat in the list, so the arrow keys and Esc keep working
          e.currentTarget.closest('li')?.focus();
        }
      }}
      style={{ width: '100%', height: '24px' }}
    />
  );
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
  pretzelSettingsJSON: ReturnType<typeof getDefaultSettings> | null;
  // Saves the model picked in the chat as the AI Chat model
  onChatModelChange?: (provider: string, model: string) => void;
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
  themeManager,
  pretzelSettingsJSON,
  onChatModelChange
}: IChatProps): JSX.Element {
  // Saving settings (e.g. picking another model) rebuilds this panel: carry on with the chat that was open
  const [messages, setMessages] = useState<IMessage[]>(globalState.openChat?.messages ?? initialMessage);
  const [chatHistory, setChatHistory] = useState<IMessage[][]>([]);
  // Position of the open chat in chatHistory; chatHistory.length means a new chat that isn't saved yet
  const [chatIndex, setChatIndex] = useState(globalState.openChat?.chatIndex ?? 0);
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState<HTMLElement | null>(null);
  // Chat in the history menu that is being renamed, or waiting for the user to confirm its deletion
  const [historyMenuAction, setHistoryMenuAction] = useState<{ type: 'rename' | 'delete'; index: number } | null>(null);
  // Where to put keyboard focus in the history menu once a deleted chat is gone from the list
  const focusAfterDeleteRef = useRef<{ list: HTMLElement; position: number } | null>(null);
  const clearChatRef = useRef<() => void>(() => {});
  const chatHistoryRef = useRef<IMessage[][]>([]);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [referenceSource, setReferenceSource] = useState('');
  const [stopGeneration, setStopGeneration] = useState<() => void>(() => () => {});
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const [editorValue, setEditorValue] = useState(globalState.openChat?.draft ?? '');
  const openChatRef = useRef({ messages, chatIndex, draft: editorValue });
  openChatRef.current = { messages, chatIndex, draft: editorValue };
  // Set when a model is picked in the chat: the rebuilt panel puts the cursor back in the chat box
  const focusInputAfterRebuildRef = useRef(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [base64Images, setBase64Images] = useState<string[]>([]);
  const base64ImagesRef = useRef<string[]>([]);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);
  const [canBeUsedForImages, setCanBeUsedForImages] = useState(false);
  const canBeUsedForImagesRef = useRef(false);

  useEffect(() => {
    const currentSettingsVersion = pretzelSettingsJSON?.version;
    if (currentSettingsVersion) {
      setCanBeUsedForImages(providersInfo[aiChatModelProvider]?.models[aiChatModelString]?.canBeUsedForImages ?? false);
    }
  }, [pretzelSettingsJSON, aiChatModelProvider, aiChatModelString]);

  useEffect(() => {
    canBeUsedForImagesRef.current = canBeUsedForImages;
  }, [canBeUsedForImages]);

  const fetchChatHistory = async () => {
    const notebook = notebookTracker?.currentWidget;
    if (!notebook?.model) {
      setTimeout(fetchChatHistory, 1000);
      return;
    }
    if (notebook?.model && !isAiGenerating) {
      const chatHistoryPath = getChatHistoryPath(notebook.context.path);

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
        // Keep saving the open chat in its place if it is one of this folder's chats (else it's saved as a new one)
        setChatIndex(findOpenChat(chatHistoryJson, openChatRef.current.messages));
      } else {
        // No chats saved in this notebook's folder yet
        setChatHistory([]);
        setChatIndex(0);
      }
    }
  };

  const saveMessages = async () => {
    // Nothing to save until the user has sent a message
    if (!notebookTracker || messages.length <= 1) return;
    const notebook = notebookTracker.currentWidget;
    if (notebook?.model && !isAiGenerating) {
      const chatHistoryPath = getChatHistoryPath(notebook.context.path);

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
          const isContinuationOf = (chat?: IMessage[]) =>
            !!chat && chat.every(m => messages.some(m2 => isSameMessage(m, m2)));
          // Update the chat in place if it was opened from history (or is the latest chat) and continued,
          // otherwise save it as a new chat
          let savedIndex = chatHistoryJson.length;
          if (isContinuationOf(chatHistoryJson[chatIndex])) {
            savedIndex = chatIndex;
          } else if (isContinuationOf(chatHistoryJson[chatHistoryJson.length - 1])) {
            savedIndex = chatHistoryJson.length - 1;
          }
          // Names are changed from the history menu straight in the file, so an updated chat keeps its saved name
          chatHistoryJson[savedIndex] =
            savedIndex < chatHistoryJson.length
              ? withChatTitle(messages, chatHistoryJson[savedIndex][0]?.chatTitle)
              : messages;
          await app.serviceManager.contents.save(chatHistoryPath, {
            type: 'file',
            format: 'text',
            content: JSON.stringify(chatHistoryJson)
          });
          setChatHistory(chatHistoryJson);
          setChatIndex(savedIndex);
        } catch (error) {
          console.error('Error parsing chat history JSON:', error);
        }
      } else {
        // create chat_history.json
        const messagesToSave = [messages];
        app.serviceManager.contents.save(chatHistoryPath, {
          type: 'file',
          format: 'text',
          content: JSON.stringify(messagesToSave)
        });
        setChatHistory(messagesToSave);
        setChatIndex(0);
      }
    }
  };

  useEffect(() => {
    // Remember the open chat for when the panel is rebuilt
    return () => {
      globalState.openChat = { ...openChatRef.current, focusInput: focusInputAfterRebuildRef.current };
    };
  }, []);

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

  const handlePaste = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, event: monaco.editor.IPasteEvent) => {
      const clipboardData = event.clipboardEvent?.clipboardData;
      if (clipboardData && canBeUsedForImagesRef.current) {
        const items = clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            if (blob) {
              const reader = new FileReader();
              reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.8); // Convert to JPEG with 80% quality
                    setBase64Images(prevImages => [...prevImages, jpegDataUrl]);
                  }
                };
                img.src = e.target?.result as string;
              };
              reader.readAsDataURL(blob);
            }
          }
        }
      }
    },
    [canBeUsedForImagesRef]
  );

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
      try {
        embeddings = await readEmbeddings(notebookTracker, app, aiClient, aiChatModelProvider);
      } catch (error) {
        // Similar cells are extra context: the question is still sent without them
        console.error('Could not read the notebook embeddings:', error);
      }
      selectedCode = getSelectedCode(notebookTracker).extractedCode;
    }

    const newMessage = {
      id: String(messages.length + 1),
      // we need to use a Ref here because of the closure created by handleEditorDidMount
      // that meant that when we used shortcuts, the updates state was not accessed
      content:
        base64ImagesRef.current.length > 0
          ? [
              { type: 'text', text: inputMarkdown },
              ...base64ImagesRef.current.map(base64Image => ({
                type: 'image',
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
        ...withoutFailedReplies(updatedMessages).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      const controller = new AbortController();
      let signal = controller.signal;
      setStopGeneration(() => () => controller.abort());

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
      })().catch(error => showChatError(error, signal));

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
    posthog.capture('prompt_chat_without_context', {
      property: posthogPromptTelemetry ? editorValueFromEvent : 'no_telemetry'
    });
    const inputMarkdown = editorValueFromEvent.replace(/\n/g, '  \n');

    const newMessage = {
      id: String(messages.length + 1),
      content:
        base64ImagesRef.current.length > 0
          ? [
              { type: 'text', text: inputMarkdown },
              ...base64ImagesRef.current.map(base64Image => ({
                type: 'image',
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
        ...withoutFailedReplies(updatedMessages).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      const controller = new AbortController();
      let signal = controller.signal;
      setStopGeneration(() => () => controller.abort());

      (async () => {
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
      })().catch(error => showChatError(error, signal));

      return updatedMessages;
    });

    setEditorValue('');
    setBase64Images([]); // Clear images after sending
  };

  // A failed request says why in the chat, instead of staying on "Generating AI response..."
  const showChatError = (error: any, signal: AbortSignal) => {
    if (signal.aborted) {
      return; // stopped with Cancel
    }
    console.error('AI chat request failed:', error);
    const reason = describeChatError(error, aiChatModelProvider, aiChatModelString);
    setMessages(prevMessages => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      if (lastMessage.role === 'assistant') {
        // Part of the reply came through before the error
        return [
          ...prevMessages.slice(0, -1),
          { ...lastMessage, content: `${lastMessage.content}\n\nERROR: ${reason}`, error: true }
        ];
      }
      return [
        ...prevMessages,
        {
          id: String(prevMessages.length + 1),
          role: 'assistant',
          content: `ERROR: ${reason} Your message is back in the box below, so you can send it again.`,
          error: true
        }
      ];
    });
    setReferenceSource('');
    setIsAiGenerating(false);
  };

  useEffect(() => {
    // When a reply fails before any of it arrives, put the question back in the box to send it again (e.g. with
    // another model). Also after the panel is rebuilt for a model switch.
    const lastMessage = messages[messages.length - 1];
    const question = messages[messages.length - 2];
    const failedBeforeAnswering =
      isErrorReply(lastMessage) && (lastMessage.content as string).startsWith('ERROR: ') && question?.role === 'user';
    if (!isAiGenerating && failedBeforeAnswering && !openChatRef.current.draft.trim()) {
      const content: any = question.content;
      const text = Array.isArray(content) ? content.find(item => item.type === 'text')?.text ?? '' : content;
      setEditorValue(text.replace(/ {2}\n/g, '\n'));
      if (Array.isArray(content)) {
        setBase64Images(content.filter(item => item.type === 'image').map(item => item.data));
      }
    }
  }, [isAiGenerating]);

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

  const openChatFromHistory = (index: number) => {
    setHistoryMenuAnchor(null);
    setMessages(chatHistory[index]);
    setChatIndex(index);
    posthog.capture('Chat History Restored', { method: 'menu' });
  };

  // Changes one saved chat in chat_history.json and returns the saved chats. The file is read again first,
  // and nothing is changed if that chat moved in the meantime (e.g. a chat was saved from another browser tab)
  const updateSavedChat = async (index: number, change: (chats: IMessage[][]) => void) => {
    const notebook = notebookTracker?.currentWidget;
    if (!notebook?.model) {
      return null;
    }
    const chatHistoryPath = getChatHistoryPath(notebook.context.path);
    try {
      const file = await app.serviceManager.contents.get(chatHistoryPath);
      const chats: IMessage[][] = JSON.parse(file.content);
      if (!isSameChat(chats[index], chatHistory[index])) {
        setChatHistory(chats);
        return null;
      }
      change(chats);
      await app.serviceManager.contents.save(chatHistoryPath, {
        type: 'file',
        format: 'text',
        content: JSON.stringify(chats)
      });
      setChatHistory(chats);
      return chats;
    } catch (error) {
      console.error('Error updating chat history:', error);
      return null;
    }
  };

  const renameChat = async (index: number, name: string) => {
    setHistoryMenuAction(null);
    const chat = chatHistory[index];
    const newName = name.replace(/\s+/g, ' ').trim();
    // An empty name (or the first question itself) goes back to naming the chat after its first question
    const chatTitle = newName && newName !== getFirstQuestion(chat) ? newName : undefined;
    if (chatTitle === chat[0]?.chatTitle) {
      return;
    }
    if (await updateSavedChat(index, chats => (chats[index] = withChatTitle(chats[index], chatTitle)))) {
      posthog.capture('Chat Renamed');
    }
  };

  const deleteChat = async (index: number) => {
    setHistoryMenuAction(null);
    const chats = await updateSavedChat(index, chats => chats.splice(index, 1));
    if (!chats) {
      focusAfterDeleteRef.current = null;
      return;
    }
    posthog.capture('Chat Deleted');
    if (index === chatIndex) {
      // The open chat was deleted: start a new one
      setMessages(initialMessage);
      setChatIndex(chats.length);
    } else if (index < chatIndex) {
      setChatIndex(chatIndex - 1);
    }
  };

  useEffect(() => {
    // Runs after the list is redrawn, so it wins over the menu moving focus to the open chat
    const target = focusAfterDeleteRef.current;
    focusAfterDeleteRef.current = null;
    if (target?.list.isConnected) {
      const rows = target.list.querySelectorAll<HTMLElement>('li[role="menuitem"]:not(.Mui-disabled)');
      (rows[Math.min(target.position, rows.length - 1)] ?? target.list).focus();
    }
  }, [chatHistory]);

  const handleEditorDidMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor;
      if (globalState.openChat?.focusInput) {
        globalState.openChat.focusInput = false;
        editor.focus();
      }
      monaco.editor.setTheme(themeManager?.theme?.includes('Light') ? 'vs' : 'vs-dark');

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

      editor.onDidPaste(e => {
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
    // Reset the file input
    const fileInput = document.getElementById('image-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }, []);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.8); // Convert to JPEG with 80% quality
              setBase64Images(prevImages => [...prevImages, jpegDataUrl]);
            }
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      } else {
        alert('Please upload a valid image file.');
      }
    }
    // Clear the file input after upload
    event.target.value = '';
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', padding: 2 }}>
        {messages.map((message, index) => (
          <Box key={`message-${index}`} className={isErrorReply(message) ? 'pretzel-chat-error' : undefined}>
            {referenceSource && message.role === 'assistant' && messages[messages.length - 1].id === message.id && (
              <Box sx={{ display: 'flex', alignItems: 'center', marginTop: '8px', marginBottom: '2px' }}>
                <Typography
                  color={'var(--jp-ui-font-color1)'}
                  sx={{
                    fontSize: '1em',
                    marginRight: '4px'
                  }}
                >
                  Using
                </Typography>
                {referenceSource.split(',').map((ref, index) => (
                  <Box
                    key={index}
                    sx={{
                      backgroundColor: 'var(--jp-layout-color2)',
                      borderRadius: '4px',
                      display: 'inline-block',
                      marginLeft: '0px',
                      padding: '2px 6px',
                      marginRight: '4px'
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
                      {ref.trim()}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            <RendermimeMarkdown
              rmRegistry={rmRegistry}
              markdownStr={
                message.role === 'user'
                  ? '***You:*** ' + (Array.isArray(message.content) ? message.content[0].text : message.content)
                  : '***AI:*** ' + (Array.isArray(message.content) ? message.content[0].text : message.content)
              }
              notebookTracker={notebookTracker}
              role={message.role}
              images={
                Array.isArray(message.content)
                  ? (message.content as Array<any>)
                      .filter((item: any) => item.type === 'image')
                      .map((item: any) => item.data as string)
                  : []
              }
            />
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
        {hoveredImage && (
          <Box sx={{ marginBottom: 1, marginLeft: 1, marginRight: 1, backgroundColor: 'transparent' }}>
            <img src={hoveredImage} alt="Preview" />
          </Box>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, margin: '5px 0 0 10px' }}>
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
                    opacity: 1
                  }
                }
              }}
              onMouseEnter={() => setHoveredImage(base64Image)}
              onMouseLeave={() => setHoveredImage(null)}
            >
              <ImagePreview base64Image={base64Image} />
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
                    backgroundColor: 'var(--jp-layout-color4)'
                  }
                }}
                onClick={e => {
                  e.stopPropagation();
                  removeImage(index);
                }}
              >
                <Typography
                  sx={{
                    color: 'var(--jp-ui-font-color1)',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    lineHeight: 1
                  }}
                >
                  ×
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', padding: 1, paddingTop: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px',
              border: '1px solid var(--jp-border-color1)',
              background: 'var(--vscode-editor-background)',
              height: '100px',
              overflow: 'hidden'
            }}
          >
            <Editor
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
                readOnly: isAiGenerating,
                scrollBeyondLastLine: false,
                placeholder:
                  `Ask AI (toggle with: ${keyCombination}).\n` +
                  `Shift + Enter for newline. Esc to jump back to cell.\n` +
                  `${canBeUsedForImages ? `Paste image from clipboard with ${isMac ? 'Cmd+V' : 'Ctrl+V'}.\n` : ''}` +
                  `Code from current cell and other relevant cells\nare available to the AI.`
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
              <div className="history-button-container">
                <button
                  className="pretzelInputSubmitButton"
                  onClick={e => {
                    setHistoryMenuAction(null);
                    setHistoryMenuAnchor(e.currentTarget);
                  }}
                  title="Chat history"
                  aria-label="Chat history"
                >
                  <HistoryIcon />
                </button>
                <div className="tooltip">
                  {chatIndex < chatHistory.length
                    ? `Chat ${chatIndex + 1} of ${chatHistory.length}`
                    : `New chat · ${chatHistory.length} saved`}
                  <br />
                  New chat: <strong>{isMac ? 'Cmd+Esc' : 'Ctrl+Esc'}</strong>
                  <br />
                  Previous / next chat: <strong>{historyPrevKeyCombination}</strong> /{' '}
                  <strong>{historyNextKeyCombination}</strong>
                </div>
              </div>
              <Menu
                anchorEl={historyMenuAnchor}
                open={!!historyMenuAnchor}
                onClose={() => setHistoryMenuAnchor(null)}
                // Back to typing once the menu is gone (focus can't leave the menu while it's open)
                disableRestoreFocus
                TransitionProps={{ onExited: () => editorRef.current?.focus() }}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                PaperProps={{
                  sx: {
                    width: 320,
                    maxHeight: 400,
                    backgroundColor: 'var(--jp-layout-color1)',
                    color: 'var(--jp-ui-font-color1)',
                    border: '1px solid var(--jp-border-color1)'
                  }
                }}
                MenuListProps={{ dense: true }}
              >
                <MenuItem
                  className="chat-history-new"
                  selected={chatIndex >= chatHistory.length}
                  onClick={() => {
                    setHistoryMenuAnchor(null);
                    clearChat();
                  }}
                  sx={{
                    gap: 1,
                    color: 'var(--jp-ui-font-color1)',
                    '&:hover': { backgroundColor: 'var(--jp-layout-color2)' }
                  }}
                >
                  <AddIcon fontSize="small" sx={{ color: 'inherit' }} />
                  <Typography sx={{ fontSize: '0.875rem', color: 'inherit', flexGrow: 1 }}>New chat</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: 'inherit', opacity: 0.75 }}>
                    {isMac ? '⌘Esc' : 'Ctrl+Esc'}
                  </Typography>
                </MenuItem>
                <ListSubheader
                  style={{ backgroundColor: 'var(--jp-layout-color1)', color: 'var(--jp-ui-font-color2)' }}
                >
                  Recent chats ({chatHistory.length})
                </ListSubheader>
                {chatHistory.length === 0 && <MenuItem disabled>Your chats will show up here.</MenuItem>}
                {chatHistory
                  .map((chat, index) => ({ chat, index }))
                  .reverse()
                  .map(({ chat, index }) => {
                    const isRenaming = historyMenuAction?.type === 'rename' && historyMenuAction.index === index;
                    const isDeleting = historyMenuAction?.type === 'delete' && historyMenuAction.index === index;
                    return (
                      <MenuItem
                        key={index}
                        selected={index === chatIndex}
                        onClick={() => !isRenaming && !isDeleting && openChatFromHistory(index)}
                        onKeyDown={e => {
                          // Shortcuts on a chat picked with the arrow keys: F2 renames it, Delete removes it
                          if (e.target !== e.currentTarget) {
                            return;
                          }
                          if (e.key === 'F2') {
                            e.preventDefault();
                            setHistoryMenuAction({ type: 'rename', index });
                          } else if (e.key === 'Delete' || e.key === 'Backspace') {
                            e.preventDefault();
                            setHistoryMenuAction({ type: 'delete', index });
                          }
                        }}
                        disableRipple={isRenaming || isDeleting}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          color: 'var(--jp-ui-font-color1)',
                          '&:hover': { backgroundColor: 'var(--jp-layout-color2)' },
                          // Rename and delete buttons show up when pointing at a chat or moving to it with the keyboard
                          '& .chat-history-actions': { opacity: 0 },
                          '&:hover .chat-history-actions, &.Mui-focusVisible .chat-history-actions': { opacity: 1 },
                          '@media (hover: none)': { '& .chat-history-actions': { opacity: 1 } }
                        }}
                      >
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          {isRenaming ? (
                            <ChatNameInput
                              initialName={chat[0]?.chatTitle || getFirstQuestion(chat)}
                              onSave={name => renameChat(index, name)}
                              onCancel={() => setHistoryMenuAction(null)}
                            />
                          ) : (
                            <Typography noWrap sx={{ fontSize: '0.875rem', color: 'inherit' }}>
                              {getChatTitle(chat)}
                            </Typography>
                          )}
                          {isDeleting ? (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                marginTop: '4px',
                                '& button': { height: '22px', lineHeight: '22px', padding: '0 8px', cursor: 'pointer' }
                              }}
                              onClick={e => e.stopPropagation()}
                              onKeyDown={e => {
                                // Keep keys here: the menu would use them to jump between chats or to close
                                e.stopPropagation();
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  e.currentTarget.closest('li')?.focus();
                                  setHistoryMenuAction(null);
                                }
                              }}
                            >
                              <Typography sx={{ fontSize: '0.75rem', color: 'inherit', flexGrow: 1 }}>
                                Delete this chat?
                              </Typography>
                              <button
                                className="jp-mod-styled jp-mod-reject"
                                onClick={e => {
                                  e.currentTarget.closest('li')?.focus();
                                  setHistoryMenuAction(null);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                className="jp-mod-styled jp-mod-warn"
                                autoFocus
                                onClick={e => {
                                  const list = e.currentTarget.closest('ul');
                                  const row = e.currentTarget.closest('li');
                                  if (list && row) {
                                    // Keep focus in the menu while saving, then give it to the chat taking this one's place
                                    list.focus();
                                    focusAfterDeleteRef.current = {
                                      list,
                                      position: Array.from(list.querySelectorAll('li[role="menuitem"]')).indexOf(row)
                                    };
                                  }
                                  deleteChat(index);
                                }}
                              >
                                Delete
                              </button>
                            </Box>
                          ) : (
                            <Typography sx={{ fontSize: '0.75rem', color: 'inherit', opacity: 0.75 }}>
                              Chat {index + 1} · {chat.length - 1} {chat.length === 2 ? 'message' : 'messages'}
                              {index === chatIndex ? ' · open now' : ''}
                            </Typography>
                          )}
                        </Box>
                        {!isRenaming && !isDeleting && (
                          <Box
                            className="chat-history-actions"
                            sx={{ display: 'flex', flexShrink: 0 }}
                            onMouseDown={e => e.stopPropagation()}
                          >
                            <IconButton
                              size="small"
                              title="Rename (F2)"
                              aria-label="Rename chat"
                              sx={{ color: 'inherit' }}
                              onClick={e => {
                                e.stopPropagation();
                                setHistoryMenuAction({ type: 'rename', index });
                              }}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              title={isMac ? 'Delete (⌫)' : 'Delete (Del)'}
                              aria-label="Delete chat"
                              sx={{ color: 'inherit' }}
                              onClick={e => {
                                e.stopPropagation();
                                setHistoryMenuAction({ type: 'delete', index });
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        )}
                      </MenuItem>
                    );
                  })}
              </Menu>
              {canBeUsedForImages && (
                <div className="upload-image-button-container">
                  <input
                    accept="image/*"
                    style={{ display: 'none' }}
                    id="image-upload"
                    type="file"
                    onChange={handleImageUpload}
                  />
                  <button
                    className="pretzelInputSubmitButton"
                    title="Upload Image"
                    onClick={() => document.getElementById('image-upload')?.click()}
                  >
                    <UploadIcon />
                  </button>
                  <div className="tooltip">
                    Upload an image.
                    <br />
                    Paste image from clipboard with <strong>{isMac ? 'Cmd+V' : 'Ctrl+V'}</strong>
                  </div>
                </div>
              )}
              <ChatModelPicker
                settings={pretzelSettingsJSON}
                provider={aiChatModelProvider}
                model={aiChatModelString}
                onChange={(provider, model) => {
                  focusInputAfterRebuildRef.current = true;
                  posthog.capture('Chat Model Switched', { provider, model });
                  onChatModelChange?.(provider, model);
                }}
                onOpenSettings={() => app.commands.execute('pretzelai:open-settings')}
                onClosed={() => editorRef.current?.focus()}
              />
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
