import * as React from 'react';
import * as monaco from 'monaco-editor';

import DiffEditor from './DiffEditor';
import { useEffect, useState } from 'react';

export interface IStreamingDiffEditorProps {
  stream: AsyncIterable<any>;
  oldCode: string;
  onEditorCreated: (editor: monaco.editor.IStandaloneDiffEditor) => void;
  onStreamingDone: () => void; // Add this callback
}

export const StreamingDiffEditor: React.FC<IStreamingDiffEditorProps> = ({
  stream,
  oldCode,
  onEditorCreated,
  onStreamingDone
}) => {
  const [newCode, setNewCode] = useState('');

  useEffect(() => {
    const accumulate = async () => {
      for await (const chunk of stream) {
        setNewCode(prevCode => prevCode + (chunk.choices[0]?.delta?.content || ''));
      }
      onStreamingDone();
    };
    accumulate();
  }, [stream, onStreamingDone]);

  return <DiffEditor oldCode={oldCode} newCode={newCode} onEditorCreated={onEditorCreated} />;
};
