/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import { IThemeManager } from '@jupyterlab/apputils';
import { Cell, ICellModel } from '@jupyterlab/cells';
import { LabIcon } from '@jupyterlab/ui-components';
import { Editor, Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import 'monaco-editor/min/vs/editor/editor.main.css';
import posthog from 'posthog-js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import promptHistorySvg from '../../style/icons/prompt-history.svg';
import { globalState } from '../globalState';
import { completionFunctionProvider, FixedSizeStack, PromptMessage } from '../utils';
import { Box, Tooltip, Typography } from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import { getDefaultSettings } from '../migrations/defaultSettings';
import { providersInfo } from '../migrations/providerInfo';
import { ImagePreview } from './ImagePreview';

interface ISubmitButtonProps {
  handleClick: () => void;
  isDisabled: boolean;
  buttonText: string;
}

const SubmitButton: React.FC<ISubmitButtonProps> = ({ handleClick, isDisabled, buttonText }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="submit-button-container">
      <button
        className="pretzelInputSubmitButton"
        onClick={handleClick}
        disabled={isDisabled}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title="Submit ↵"
      >
        {buttonText} <span style={{ fontSize: '0.8em' }}>↵</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          {buttonText === 'Generate' ? 'Generate code with AI' : 'Edit code with AI'}
          <br />
          Shortcut: <strong>Enter</strong>
        </div>
      )}
    </div>
  );
};

interface IRemoveButtonProps {
  handleClick: () => void;
}

const RemoveButton: React.FC<IRemoveButtonProps> = ({ handleClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Cmd + K' : 'Ctrl + K';
  const shortcut = isMac ? '⌘K' : '^K';

  return (
    <div className="remove-button-container">
      <button
        className="remove-button"
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`Remove ${shortcut}`}
      >
        Remove <span style={{ fontSize: '0.8em' }}>{shortcut}</span>
      </button>
      {showTooltip && (
        <div className="tooltip">
          Remove the AI prompt box
          <br />
          Shortcut: <strong>{keyCombination}</strong>
        </div>
      )}
    </div>
  );
};

const encodedSvgStr = encodeURIComponent(promptHistorySvg);

const promptHistoryIcon = new LabIcon({
  name: 'pretzelai::prompt-history',
  svgstr: encodedSvgStr
});

const PromptHistoryButton: React.FC<{
  handleClick: () => void;
}> = ({ handleClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="prompt-history-button-container">
      <button
        className="prompt-history-button"
        title="Prompt History"
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <promptHistoryIcon.react tag="span" className="jp-Icon jp-Icon-20" />
      </button>
      {showTooltip && (
        <div className="tooltip">
          Populate with last prompt
          <br />
          Shortcut: <strong>Arrow Up Key</strong>
        </div>
      )}
    </div>
  );
};

const isMac = /Mac/i.test(navigator.userAgent);
interface IInputComponentProps {
  isAIEnabled: boolean;
  placeholderEnabled: string;
  placeholderDisabled: string;
  handleSubmit: (input: string, base64Images: string[]) => void;
  handleRemove: () => void;
  promptHistoryStack: FixedSizeStack<PromptMessage>;
  setInputView: (view: any) => void;
  initialPrompt: PromptMessage;
  activeCell: Cell<ICellModel>;
  themeManager: IThemeManager | null;
  onPromptHistoryUpdate: (newPrompt: PromptMessage) => Promise<void>;
  pretzelSettingsJSON: ReturnType<typeof getDefaultSettings> | null;
}

const InputComponent: React.FC<IInputComponentProps> = ({
  isAIEnabled,
  placeholderEnabled,
  placeholderDisabled,
  handleSubmit,
  handleRemove,
  promptHistoryStack,
  setInputView,
  initialPrompt,
  activeCell,
  themeManager,
  onPromptHistoryUpdate,
  pretzelSettingsJSON
}) => {
  const [editorValue, setEditorValue] = useState(initialPrompt[0].text);
  const [submitButtonText, setSubmitButtonText] = useState('Generate');
  const [, setPromptHistoryIndex] = useState<number>(0);
  const editorRef = useRef<any>(null);

  const [base64Images, setBase64Images] = useState<string[]>([]);
  const base64ImagesRef = useRef<string[]>([]);

  const [canBeUsedForImages, setCanBeUsedForImages] = useState(false);
  const canBeUsedForImagesRef = useRef(false);

  const [placeholder, setPlaceholder] = useState(isAIEnabled ? placeholderEnabled : placeholderDisabled);

  useEffect(() => {
    const currentSettingsVersion = pretzelSettingsJSON?.version;
    if (currentSettingsVersion) {
      const aiChatModelProvider = pretzelSettingsJSON.features.aiChat.modelProvider;
      const aiChatModelString = pretzelSettingsJSON.features.aiChat.modelString;
      setCanBeUsedForImages(providersInfo[aiChatModelProvider]?.models[aiChatModelString]?.canBeUsedForImages ?? false);
    }
  }, [pretzelSettingsJSON]);

  useEffect(() => {
    canBeUsedForImagesRef.current = canBeUsedForImages;
  }, [canBeUsedForImages]);

  // FIXME: Not sure if this will ever fire for isAIEnabled, placeholderEnabled, placeholderDisabled
  useEffect(() => {
    const updatedPlaceholder = canBeUsedForImages
      ? `${isAIEnabled ? placeholderEnabled : placeholderDisabled}\nPaste image by pressing ${
          isMac ? 'Cmd + V' : 'Ctrl + V'
        }.`
      : isAIEnabled
      ? placeholderEnabled
      : placeholderDisabled;
    setPlaceholder(updatedPlaceholder);
  }, [isAIEnabled, placeholderEnabled, placeholderDisabled, canBeUsedForImages]);

  useEffect(() => {
    base64ImagesRef.current = base64Images;
  }, [base64Images]);

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
    [canBeUsedForImagesRef.current]
  );

  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    setInputView(editor);

    // Set initial text in the editor
    if (initialPrompt) {
      editor.setValue(initialPrompt[0].text);
      // Check if initialPrompt contains any images and set them to base64Images
      const imagePrompts = initialPrompt.filter(
        (prompt): prompt is { type: 'image'; data: string } => prompt.type === 'image'
      );
      if (imagePrompts.length > 0) {
        const newBase64Images = imagePrompts.map(prompt => prompt.data);
        setBase64Images(newBase64Images);
      }
      const model = editor.getModel();
      if (model) {
        const lastLineNumber = model.getLineCount();
        const lastLineContent = model.getLineContent(lastLineNumber);
        editor.setPosition({ lineNumber: lastLineNumber, column: lastLineContent.length + 1 });
      }
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

    // Add event listeners
    editor.onKeyDown((event: any) => {
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

      if (event.code === 'Escape') {
        posthog.capture('Back to Cell via Escape', {
          event_type: 'keypress',
          event_value: 'esc',
          method: 'back_to_cell'
        });
        event.preventDefault();
        if (activeCell && activeCell.editor) {
          activeCell.editor.focus();
        }
      }

      if (event.code === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
          editor.trigger('keyboard', 'type', { text: '\n' });
        } else {
          posthog.capture('Submit via Enter', {
            event_type: 'keypress',
            event_value: 'enter',
            method: 'submit'
          });
          handleSubmitWithImages();
        }
      }

      if (event.code === 'ArrowUp') {
        const position = editor.getPosition()!;
        if (position.lineNumber === 1 && position.column === 1) {
          event.preventDefault();
          posthog.capture('Prompt History Back via Shortcut', {
            event_type: 'keypress',
            event_value: 'up_arrow',
            method: 'prompt_history'
          });
          setPromptHistoryIndex(prevIndex => {
            let finalIndex: number;
            if (prevIndex + 1 >= promptHistoryStack.length) {
              finalIndex = promptHistoryStack.length - 1;
            } else {
              finalIndex = prevIndex + 1;
            }
            handlePromptHistory(finalIndex);
            const currentPrompt = editor.getValue();
            if (currentPrompt && prevIndex === 0) {
              const promptEntry: PromptMessage = [{ type: 'text', text: currentPrompt }];
              if (base64Images.length > 0) {
                base64Images.forEach(image => {
                  promptEntry.push({ type: 'image', data: image });
                });
              }
              promptHistoryStack.push(promptEntry);
              finalIndex += 1;
            }
            return finalIndex;
          });
        }
      }

      if (event.code === 'ArrowDown') {
        const model = editor.getModel();
        const position = editor.getPosition()!;
        const lastLineNumber = model!.getLineCount();
        if (position.lineNumber === lastLineNumber) {
          event.preventDefault();
          posthog.capture('Prompt History Forward via Shortcut', {
            event_type: 'keypress',
            event_value: 'down_arrow',
            method: 'prompt_history'
          });
          setPromptHistoryIndex(prevIndex => {
            let finalIndex: number;
            if (prevIndex - 1 < 0) {
              finalIndex = 0;
            } else {
              finalIndex = prevIndex - 1;
            }
            handlePromptHistory(finalIndex);
            return finalIndex;
          });
        }
      }
    });

    editor.onDidPaste(e => {
      handlePaste(editor, e);
    });

    editor.focus();
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setEditorValue(value);
    }
  };

  const handlePromptHistory = (index: number) => {
    if (index >= 0 && index < promptHistoryStack.length) {
      const oldPromptMessage: PromptMessage = promptHistoryStack.get(index);
      const textContent = oldPromptMessage[0].text;
      setEditorValue(textContent);
      const imagePrompts = oldPromptMessage.filter(
        (prompt): prompt is { type: 'image'; data: string } => prompt.type === 'image'
      );

      if (imagePrompts.length > 0) {
        const newBase64Images = imagePrompts.map(prompt => prompt.data);
        setBase64Images(newBase64Images);
        base64ImagesRef.current = newBase64Images;
      } else {
        setBase64Images([]);
        base64ImagesRef.current = [];
      }
      editorRef.current?.focus();
    }
    return index;
  };

  useEffect(() => {
    const updateSubmitButtonText = () => {
      if (activeCell && activeCell.model.sharedModel.source) {
        setSubmitButtonText('Edit Code');
      } else {
        setSubmitButtonText('Generate');
      }
    };

    updateSubmitButtonText();

    activeCell?.model.contentChanged.connect(() => {
      updateSubmitButtonText();
    });
  }, [activeCell]);

  const removeImage = useCallback((indexToRemove: number) => {
    setBase64Images(prevImages => prevImages.filter((_, index) => index !== indexToRemove));
  }, []);

  const handleSubmitWithImages = async () => {
    const currentPrompt = editorRef.current.getValue();
    const base64ImagesCopy = [...base64ImagesRef.current];
    const promptHistoryItem = [
      { type: 'text', text: currentPrompt },
      ...base64ImagesCopy.map(image => ({ type: 'image', data: image }))
    ] as PromptMessage;

    await onPromptHistoryUpdate(promptHistoryItem);
    setBase64Images([]);
    handleSubmit(currentPrompt, base64ImagesCopy);
  };

  const getMaxTooltipSize = () => {
    const maxWidth = window.innerWidth * 0.5; // 50% of the window width
    const maxHeight = window.innerHeight * 0.5; // 50% of the window height
    return { maxWidth, maxHeight };
  };

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
    <div className="input-container">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, marginTop: '-5px' }}>
        {base64Images.map((base64Image, index) => {
          const { maxWidth, maxHeight } = getMaxTooltipSize();
          return (
            <Tooltip key={index} title={<img src={base64Image} alt="Preview" style={{ maxWidth, maxHeight }} />} arrow>
              <Box
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
            </Tooltip>
          );
        })}
      </Box>
      <div className="pretzelInputField">
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
            readOnly: !isAIEnabled,
            placeholder: placeholder
          }}
        />
      </div>

      <div className="input-field-buttons-container">
        <SubmitButton
          handleClick={() => {
            posthog.capture('Submit via Click', {
              event_type: 'click',
              method: 'submit'
            });
            handleSubmitWithImages();
          }}
          isDisabled={!isAIEnabled}
          buttonText={submitButtonText}
        />
        <RemoveButton handleClick={handleRemove} />
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
        <PromptHistoryButton
          handleClick={() => {
            posthog.capture('Prompt History via Button Click', {
              event_type: 'click',
              method: 'prompt_history'
            });
            setPromptHistoryIndex(prevIndex => {
              const newIndex = Math.min(prevIndex + 1, promptHistoryStack.length - 1);
              handlePromptHistory(newIndex);
              return newIndex;
            });
          }}
        />
      </div>
    </div>
  );
};

export default InputComponent;
