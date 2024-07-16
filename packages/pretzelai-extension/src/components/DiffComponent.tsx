/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import * as React from 'react';
import * as monaco from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import { ButtonsContainer } from './DiffButtonsComponent';
import { fixCode } from '../postprocessing';

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
        renderOverviewRuler: false,
        lineNumbers: 'off',
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
      const heightPx = oldCode.split('\n').length + newCode.split('\n').length * 19;
      diffEditorRef.current!.style.height = heightPx + 'px';
      editorRef.current!.layout();
    }
  }, [newCode, oldCode]);

  const renderFinallyFixedEditorHeight = () => {
    // handle the occasional backticks
    const modifiedModel = editorRef.current!.getModel()!.modified;
    const finalNewCode = fixCode(modifiedModel.getValue());
    // set fixed code in editor via modified model
    modifiedModel.setValue(finalNewCode);

    const changes = editorRef.current!.getLineChanges();
    let totalLines = oldCode.split('\n').length;
    if (changes) {
      changes.forEach((c: any) => {
        if (c.modifiedEndLineNumber >= c.modifiedStartLineNumber) {
          const modified = c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1;
          totalLines += modified;
        }
      });
    }
    const heightPx = totalLines * 19;
    if (diffEditorRef.current) {
      diffEditorRef.current.style.height = heightPx + 'px';
      editorRef.current!.layout();
    }
  };

  useEffect(() => {
    const accumulate = async () => {
      for await (const chunk of stream) {
        setNewCode(prevCode => prevCode + (chunk.choices[0]?.delta?.content || ''));
      }
      onStreamingDone();
      // the editor takes some time to calculate the changes correctly, so we need to wait a bit
      setTimeout(renderFinallyFixedEditorHeight, 500);
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
  setShowStatusElement: (show: boolean) => void;
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
          props.setShowStatusElement(false);
        }}
      />
      {streamingDone && diffEditor && <ButtonsContainer {...props} diffEditor={diffEditor} />}
    </div>
  );
};
