import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { basicSetup, EditorView } from 'codemirror';

export function createDiffView(original: string, modified: string, parent: HTMLElement): MergeView {
  return new MergeView({
    a: {
      doc: original,
      extensions: basicSetup
    },
    b: {
      doc: modified,
      extensions: [basicSetup, EditorView.editable.of(false), EditorState.readOnly.of(true)]
    },
    parent: parent
  });
}

export function applyDiff(editor: CodeMirrorEditor, original: string, modified: string): MergeView {
  const container = document.createElement('div');
  editor.host.appendChild(container);
  return createDiffView(original, modified, container);
}

export function removeDiff(editor: CodeMirrorEditor, mergeView: MergeView): void {
  mergeView.destroy();
  const diffContainer = editor.host.querySelector('div:last-child');
  if (diffContainer) {
    editor.host.removeChild(diffContainer);
  }
}

let currentMergeView: MergeView | null = null;

export function applyDiffToEditor(editor: CodeMirrorEditor, original: string, modified: string): void {
  if (currentMergeView) {
    removeDiffFromEditor(editor);
  }
  currentMergeView = applyDiff(editor, original, modified);
}

export function removeDiffFromEditor(editor: CodeMirrorEditor): void {
  if (currentMergeView) {
    removeDiff(editor, currentMergeView);
    currentMergeView = null;
  }
}
