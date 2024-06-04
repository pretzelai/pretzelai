/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import { INotebookTracker } from '@jupyterlab/notebook';
// import React, { useEffect } from 'react';
// import { createRoot } from 'react-dom/client';

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

export class FixedSizeStack<T> {
  private stack: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    this.stack.push(item);
    if (this.stack.length > this.maxSize) {
      this.stack.shift(); // Remove the oldest item
    }
  }

  get length(): number {
    return this.stack.length;
  }

  get(index: number): T {
    if (index >= 0) {
      index = index % this.stack.length;
    } else {
      index = (index % this.stack.length) + this.stack.length;
    }
    const reverseIndex = this.stack.length - 1 - index;
    if (reverseIndex < 0 || reverseIndex >= this.stack.length) {
      throw new Error('Index out of bounds');
    }
    return this.stack[reverseIndex];
  }
}
