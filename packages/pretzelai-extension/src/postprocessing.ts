export const fixCode = (code: string) => {
  let finalCode = code;
  const PYTHON_BACKTICKS = '```python';
  const BACKTICKS = '```';
  const pythonIndex = finalCode.indexOf(PYTHON_BACKTICKS);
  const backticksIndex = finalCode.indexOf(BACKTICKS);
  if (pythonIndex !== -1) {
    finalCode = finalCode.slice(pythonIndex + 9).trim();
  } else if (backticksIndex !== -1) {
    finalCode = finalCode.slice(backticksIndex + 3).trim();
  }
  const endBackticksIndex = finalCode.indexOf(BACKTICKS);
  if (endBackticksIndex !== -1) {
    finalCode = finalCode.slice(0, endBackticksIndex).trim();
  }
  return finalCode;
};

export const fixInlineCompletion = ({
  completion,
  prefix,
  suffix
}: {
  completion: string;
  prefix: string;
  suffix: string;
}): string => {
  // console.log('completion\n', completion);
  // remove backticks
  if (completion.startsWith('```python\n')) {
    if (completion.endsWith('\n```')) {
      completion = completion.slice(10, -4);
    } else if (completion.endsWith('\n```\n')) {
      completion = completion.slice(10, -5);
    }
  }
  // OpenAI sometimes includes the prefix in the completion
  const prefixLastLine = prefix.split('\n').slice(-1)[0];
  if (completion.startsWith(prefixLastLine)) {
    completion = completion.slice(prefixLastLine.length);
  }
  const completionLines = completion.split('\n');
  const completionLastLine = completionLines.slice(-1)[0];
  if (completionLines.length === 2 && completionLines[1] === '\n' && completionLastLine.startsWith(prefixLastLine)) {
    completion = completionLastLine.slice(prefixLastLine.length);
  }
  // Don't return empty
  if (completion.trim().length <= 0) {
    return '';
  }
  // Remove trailing whitespace
  completion = completion.trimEnd();
  // Codestral sometimes starts with an extra space
  // Fix extra space when space is already present
  if (
    completion[0] === ' ' &&
    completion[1] !== ' ' &&
    prefix[prefix.length - 1] === ' ' &&
    prefix[prefix.length - 2] !== ' '
  ) {
    completion = completion.slice(1);
  }
  // Sometimes the extra space messes up the indentation
  if (completion[0] === ' ' && completion[1] !== ' ') {
    // check if there are spaces before completion
    if (prefix.endsWith('  ')) {
      const lastLineOfPrefix = prefix.split('\n').slice(-1)[0];
      if (lastLineOfPrefix.trimStart().length === 0) {
        const indentation = lastLineOfPrefix.length;
        completion = completion
          .split('\n')
          .map(line => {
            const spaces = line.length - line.trimStart().length;
            const extraSpaces = spaces % indentation;
            return line.slice(extraSpaces);
          })
          .join('\n');
      }
    }
  }
  // console.log('completionfixed\n', completion);
  return completion;
};
