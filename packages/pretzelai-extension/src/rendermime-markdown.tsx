/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
// This file is a modified version of the original file from Jupyter AI.
// https://github.com/jupyterlab/jupyter-ai/blob/main/packages/jupyter-ai/src/components/rendermime-markdown.tsx

import React, { useEffect, useState } from 'react';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { CodeToolbar, CodeToolbarProps } from './code-blocks/code-toolbar';
import { createPortal } from 'react-dom';

const MD_MIME_TYPE = 'text/markdown';
const RENDERMIME_MD_CLASS = 'jp-pretzelai-rendermime-markdown';

type RendermimeMarkdownProps = {
  markdownStr: string;
  rmRegistry: IRenderMimeRegistry;
};

function escapeLatexDelimiters(text: string) {
  return text.replace(/\\\(/g, '\\\\(').replace(/\\\)/g, '\\\\)').replace(/\\\[/g, '\\\\[').replace(/\\\]/g, '\\\\]');
}

function RendermimeMarkdownBase(props: RendermimeMarkdownProps): JSX.Element {
  const [renderedContent, setRenderedContent] = useState<HTMLElement | null>(null);
  const renderedContentRef = React.useRef<HTMLDivElement>(null);
  const [codeToolbarDefns, setCodeToolbarDefns] = useState<Array<[HTMLDivElement, CodeToolbarProps]>>([]);

  useEffect(() => {
    const renderContent = async () => {
      const mdStr = escapeLatexDelimiters(props.markdownStr);
      const model = props.rmRegistry.createModel({
        data: { [MD_MIME_TYPE]: mdStr }
      });

      const renderer = props.rmRegistry.createRenderer(MD_MIME_TYPE);
      await renderer.renderModel(model);
      props.rmRegistry.latexTypesetter?.typeset(renderer.node);
      if (!renderer.node) {
        throw new Error('Error rendering markdown');
      }

      const newCodeToolbarDefns: [HTMLDivElement, CodeToolbarProps][] = [];

      // Attach CodeToolbar root element to each <pre> block
      const preBlocks = renderer.node.querySelectorAll('pre');
      preBlocks.forEach(preBlock => {
        const codeToolbarRoot = document.createElement('div');
        preBlock.parentNode?.insertBefore(codeToolbarRoot, preBlock.nextSibling);
        newCodeToolbarDefns.push([codeToolbarRoot, { content: preBlock.textContent || '' }]);
      });

      setCodeToolbarDefns(newCodeToolbarDefns);
      setRenderedContent(renderer.node);
    };

    renderContent();
  }, [props.markdownStr, props.rmRegistry]);

  useEffect(() => {
    if (renderedContent && renderedContentRef.current) {
      // Clear previous content
      renderedContentRef.current.innerHTML = '';
      // Append new content
      renderedContentRef.current.appendChild(renderedContent);
    }
  }, [renderedContent]);

  return (
    <div className={RENDERMIME_MD_CLASS}>
      <div ref={renderedContentRef} />
      {
        // Render a `CodeToolbar` element underneath each code block.
        // We use ReactDOM.createPortal() so each `CodeToolbar` element is able
        // to use the context in the main React tree.
        codeToolbarDefns.map(codeToolbarDefn => {
          const [codeToolbarRoot, codeToolbarProps] = codeToolbarDefn;
          return createPortal(<CodeToolbar {...codeToolbarProps} />, codeToolbarRoot);
        })
      }
    </div>
  );
}

export const RendermimeMarkdown = React.memo(RendermimeMarkdownBase);
