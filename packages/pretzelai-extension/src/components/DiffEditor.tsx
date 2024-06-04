import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';

interface IDiffEditorProps {
  newCode: string;
  oldCode: string;
  onEditorCreated: (editor: monaco.editor.IStandaloneDiffEditor) => void;
}

const DiffEditor: React.FC<IDiffEditorProps> = ({ newCode, oldCode, onEditorCreated }) => {
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

export default DiffEditor;
