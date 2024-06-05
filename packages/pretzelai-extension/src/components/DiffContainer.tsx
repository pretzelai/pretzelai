import * as React from 'react';
import * as monaco from 'monaco-editor';
import { IStreamingDiffEditorProps, StreamingDiffEditor } from './StreamingDiffEditor';
import { useState } from 'react';
import { ButtonsContainer } from './ButtonsContainer';

interface IDiffContainerProps extends IStreamingDiffEditorProps {
  parentContainer: HTMLElement;
  activeCell: any;
  commands: any;
  isErrorFixPrompt: boolean;
  oldCode: string;
}

export const DiffContainer: React.FC<IDiffContainerProps> = props => {
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
