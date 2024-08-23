import React, { useEffect, useState } from 'react';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { CodeToolbar, CodeToolbarProps } from './code-blocks/code-toolbar';
import { createPortal } from 'react-dom';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Box, Tooltip } from '@mui/material';
import { imageIcon } from '@jupyterlab/ui-components';

interface IImageIconProps {
  base64Image: string;
}

function ImageIcon({ base64Image }: IImageIconProps): JSX.Element {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Tooltip
      title={
        <Box sx={{ maxWidth: '300px', maxHeight: '300px' }}>
          <img src={base64Image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </Box>
      }
      open={isHovered}
    >
      <Box
        sx={{
          display: 'inline-flex',
          marginLeft: 0,
          height: '16px',
          width: '16px',
          cursor: 'pointer',
          '&:hover': {
            opacity: 0.7,
          },
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <imageIcon.react width="16px" height="16px" />
      </Box>
    </Tooltip>
  );
}

const MD_MIME_TYPE = 'text/markdown';
const RENDERMIME_MD_CLASS = 'jp-pretzelai-rendermime-markdown';

type RendermimeMarkdownProps = {
  markdownStr: string;
  rmRegistry: IRenderMimeRegistry;
  notebookTracker: INotebookTracker | null;
  role?: string;
  images?: string[];
};

function escapeLatexDelimiters(text: string) {
  return text.replace(/\\\(/g, '\\\\(').replace(/\\\)/g, '\\\\)').replace(/\\\[/g, '\\\\[').replace(/\\\]/g, '\\\\]');
}

function wrapLabels(markdownStr: string): string {
  return markdownStr
    .replace(/^\*\*\*You:\*\*\* /, '<span class="chat-label unselectable">***You:*** </span>')
    .replace(/^\*\*\*AI:\*\*\* /, '<span class="chat-label unselectable">***AI:*** </span>');
}

function RendermimeMarkdownBase(props: RendermimeMarkdownProps): JSX.Element {
  const [renderedContent, setRenderedContent] = useState<HTMLElement | null>(null);
  const renderedContentRef = React.useRef<HTMLDivElement>(null);
  const [codeToolbarDefns, setCodeToolbarDefns] = useState<Array<[HTMLDivElement, CodeToolbarProps]>>([]);

  useEffect(() => {
    const renderContent = async () => {
      const mdStr = escapeLatexDelimiters(wrapLabels(props.markdownStr));
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

      const preBlocks = renderer.node.querySelectorAll('pre');
      preBlocks.forEach(preBlock => {
        const codeToolbarRoot = document.createElement('div');
        codeToolbarRoot.className = 'code-toolbar';
        preBlock.insertBefore(codeToolbarRoot, preBlock.firstChild);
        newCodeToolbarDefns.push([
          codeToolbarRoot,
          { content: preBlock.textContent || '', notebookTracker: props.notebookTracker }
        ]);
      });

      setCodeToolbarDefns(newCodeToolbarDefns);
      setRenderedContent(renderer.node);
    };

    renderContent();
  }, [props.markdownStr, props.rmRegistry]);

  useEffect(() => {
    if (renderedContent && renderedContentRef.current) {
      renderedContentRef.current.innerHTML = '';
      renderedContentRef.current.appendChild(renderedContent);
    }
  }, [renderedContent]);

  return (
    <div className={`${RENDERMIME_MD_CLASS} ${props.role === 'user' ? 'user-msg' : 'ai-msg'}`}>
      <div ref={renderedContentRef} />
      {codeToolbarDefns.map(codeToolbarDefn => {
        const [codeToolbarRoot, codeToolbarProps] = codeToolbarDefn;
        return createPortal(<CodeToolbar {...codeToolbarProps} />, codeToolbarRoot);
      })}
      {props.images && props.images.length > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: '4px' }}>
          <p style={{ margin: 0, marginRight: '5px', fontWeight: 'bold', fontStyle: 'italic' }}>Attached images:</p>
          {props.images.map((base64Image, index) => (
            <ImageIcon key={index} base64Image={base64Image} />
          ))}
        </span>
      )}
    </div>
  );
}

export const RendermimeMarkdown = React.memo(RendermimeMarkdownBase);
