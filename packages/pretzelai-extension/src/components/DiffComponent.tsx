import * as React from 'react';
import * as monaco from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import { ButtonsContainer } from './DiffButtonsComponent';

export interface IStreamingDiffEditorProps {
  stream: AsyncIterable<any>;
  oldCode: string;
  onEditorCreated: (editor: monaco.editor.IStandaloneDiffEditor) => void;
  onStreamingDone: () => void;
}

export const StreamingDiffEditor: React.FC<IStreamingDiffEditorProps> = ({
  stream,
  oldCode,
  onEditorCreated,
  onStreamingDone
}) => {
  const [newCode, setNewCode] = useState('');
  const diffEditorRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    if (diffEditorRef.current && !editorRef.current) {
      const currentTheme = document.body.getAttribute('data-jp-theme-light') === 'true' ? 'vs' : 'vs-dark';
      const editor = monaco.editor.createDiffEditor(diffEditorRef.current, {
        readOnly: true,
        theme: currentTheme,
        renderSideBySide: false,
        minimap: { enabled: false },
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        scrollbar: {
          vertical: 'hidden',
          horizontal: 'hidden',
          handleMouseWheel: false
        }
      });
      editor.setModel({
        original: monaco.editor.createModel(oldCode, 'python'),
        modified: monaco.editor.createModel('', 'python')
      });
      editorRef.current = editor;
      onEditorCreated(editor);
    }
  }, [oldCode, onEditorCreated]);

  useEffect(() => {
    if (editorRef.current) {
      const modifiedModel = editorRef.current!.getModel()!.modified;
      modifiedModel.setValue(newCode);
      const heightPx = (oldCode.split('\n').length + newCode.split('\n').length + 1) * 19;
      diffEditorRef.current!.style.height = heightPx + 'px';
      editorRef.current.layout();
    }
  }, [newCode, oldCode]);

  useEffect(() => {
    const accumulate = async () => {
      for await (const chunk of stream) {
        setNewCode(prevCode => prevCode + (chunk.choices[0]?.delta?.content || ''));
      }
      onStreamingDone();
    };
    accumulate();
  }, [stream, onStreamingDone]);

  return (
    <div
      ref={diffEditorRef}
      style={{
        marginTop: '10px',
        display: 'flex',
        flexDirection: 'column'
      }}
    />
  );
};

interface IDiffContainerProps {
  stream: AsyncIterable<any>;
  oldCode: string;
  parentContainer: HTMLElement;
  activeCell: any;
  commands: any;
  isErrorFixPrompt: boolean;
  handleRemove: () => void;
}

export const DiffComponent: React.FC<IDiffContainerProps> = props => {
  const [streamingDone, setStreamingDone] = useState(false);
  const [diffEditor, setDiffEditor] = useState<monaco.editor.IStandaloneDiffEditor | null>(null);

  return (
    <div className="diff-container">
      <StreamingDiffEditor
        stream={props.stream}
        oldCode={props.oldCode}
        onEditorCreated={diffEditor => {
          setDiffEditor(diffEditor);
        }}
        onStreamingDone={() => {
          setStreamingDone(true);
        }}
      />
      {streamingDone && diffEditor && <ButtonsContainer {...props} diffEditor={diffEditor} />}
    </div>
  );
};
