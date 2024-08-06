import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView } from 'codemirror';
import { unifiedMergeView } from '@codemirror/merge';

export function applyDiffToEditor(editor: CodeMirrorEditor, original: string, modified: string): EditorView {
  const extensions: Extension[] = [
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
    unifiedMergeView({
      original: original,
      mergeControls: false,
      gutter: true
    })
  ];

  // Create a new EditorView with the diff content
  const diffView = new EditorView({
    state: EditorState.create({
      doc: modified,
      extensions: extensions
    })
  });

  // Replace the content of the original editor with the diff view
  editor.editor.dom.innerHTML = '';
  editor.editor.dom.appendChild(diffView.dom);

  return diffView;
}

export function removeDiffFromEditor(editor: CodeMirrorEditor, diffView: EditorView): void {
  // Destroy the diff view
  diffView.destroy();

  // Clear the editor's DOM
  editor.editor.dom.innerHTML = '';

  // Recreate the original editor state
  editor.editor.dispatch({
    changes: { from: 0, to: editor.editor.state.doc.length, insert: editor.model.sharedModel.source }
  });
}
