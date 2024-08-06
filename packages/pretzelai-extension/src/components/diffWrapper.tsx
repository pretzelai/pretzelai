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
    }),
    parent: editor.editor.dom
  });

  // Hide the original editor view
  editor.editor.dom.classList.add('pretzel-hidden-editor');

  // Append the diff view to the same parent as the original editor
  editor.host.appendChild(diffView.dom);

  return diffView;
}
