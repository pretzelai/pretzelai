/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
export async function calculateHash(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  const dotProduct = vecA.reduce(
    (acc: number, current: number, index: number) =>
      acc + current * vecB[index],
    0
  );
  const magnitudeA = Math.sqrt(
    vecA.reduce((acc: number, val: number) => acc + val * val, 0)
  );
  const magnitudeB = Math.sqrt(
    vecB.reduce((acc: number, val: number) => acc + val * val, 0)
  );
  return dotProduct / (magnitudeA * magnitudeB);
};

export const isSetsEqual = (xs: Set<any>, ys: Set<any>) =>
  xs.size === ys.size && [...xs].every(x => ys.has(x));

export const renderEditor = (
  gen: string,
  parentContainer: HTMLElement,
  diffEditorContainer: HTMLElement,
  diffEditor: any,
  monaco: any,
  oldCode: string
) => {
  try {
    if (!diffEditor) {
      const diffContainer = document.createElement('div');
      diffContainer.className = 'diff-container';
      diffContainer.style.marginTop = '10px';
      diffContainer.style.display = 'flex';
      diffContainer.style.flexDirection = 'column';
      parentContainer.appendChild(diffContainer);

      diffContainer.appendChild(diffEditorContainer);

      // finally, the diff editor itself
      const currentTheme =
        document.body.getAttribute('data-jp-theme-light') === 'true'
          ? 'vs'
          : 'vs-dark';
      diffEditor = monaco.editor.createDiffEditor(diffEditorContainer, {
        readOnly: true,
        theme: currentTheme,
        renderSideBySide: false
      });
      diffEditor.setModel({
        original: monaco.editor.createModel(oldCode, 'python'),
        modified: monaco.editor.createModel('', 'python')
      });
    }
    const modifiedModel = diffEditor!.getModel()!.modified;
    const endLineNumber = modifiedModel.getLineCount();
    const endColumn = modifiedModel.getLineMaxColumn(endLineNumber);
    modifiedModel.applyEdits([
      {
        range: new monaco.Range(
          endLineNumber,
          endColumn,
          endLineNumber,
          endColumn
        ),
        text: gen,
        forceMoveMarkers: true
      }
    ]);
    const newCode = modifiedModel.getValue();
    const heightPx =
      oldCode.split('\n').length + newCode.split('\n').length * 19;
    diffEditorContainer.style.height = heightPx + 'px';
    diffEditor?.layout();
    return diffEditor;
  } catch (error) {
    console.log('Error rendering editor:', error);
  }
};
