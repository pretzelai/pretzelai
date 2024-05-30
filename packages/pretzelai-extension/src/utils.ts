/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import { INotebookTracker } from '@jupyterlab/notebook';

export async function calculateHash(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  const dotProduct = vecA.reduce((acc: number, current: number, index: number) => acc + current * vecB[index], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((acc: number, val: number) => acc + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((acc: number, val: number) => acc + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
};

export const isSetsEqual = (xs: Set<any>, ys: Set<any>) => xs.size === ys.size && [...xs].every(x => ys.has(x));

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
      const currentTheme = document.body.getAttribute('data-jp-theme-light') === 'true' ? 'vs' : 'vs-dark';
      diffEditor = monaco.editor.createDiffEditor(diffEditorContainer, {
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
        range: new monaco.Range(endLineNumber, endColumn, endLineNumber, endColumn),
        text: gen,
        forceMoveMarkers: true
      }
    ]);
    const newCode = modifiedModel.getValue();
    const heightPx = oldCode.split('\n').length + newCode.split('\n').length * 19;
    diffEditorContainer.style.height = heightPx + 'px';
    diffEditor?.layout();
    return diffEditor;
  } catch (error) {
    console.log('Error rendering editor:', error);
  }
};

export const getSelectedCode = (notebookTracker: INotebookTracker) => {
  const selection = notebookTracker.activeCell?.editor?.getSelection();
  const cellCode = notebookTracker.activeCell?.model.sharedModel.source;
  let extractedCode = '';
  if (selection && (selection.start.line !== selection.end.line || selection.start.column !== selection.end.column)) {
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const startColumn = selection.start.column;
    const endColumn = selection.end.column;
    for (let i = startLine; i <= endLine; i++) {
      const lineContent = cellCode!.split('\n')[i];
      if (lineContent !== undefined) {
        if (i === startLine && i === endLine) {
          extractedCode += lineContent.substring(startColumn, endColumn);
        } else if (i === startLine) {
          extractedCode += lineContent.substring(startColumn);
        } else if (i === endLine) {
          extractedCode += '\n' + lineContent.substring(0, endColumn);
        } else {
          extractedCode += '\n' + lineContent;
        }
      }
    }
  }
  // also return the selection
  return { extractedCode: extractedCode.trimEnd(), selection };
};
