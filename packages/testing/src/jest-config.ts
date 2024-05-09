/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import path from 'path';

const esModules = [
  '@codemirror',
  '@microsoft',
  '@jupyter/react-components',
  '@jupyter/web-components',
  '@jupyter/ydoc',
  'exenv-es6',
  'lib0',
  'nanoid',
  'vscode-ws-jsonrpc',
  'y-protocols',
  'y-websocket',
  'yjs'
].join('|');

module.exports = function (baseDir: string) {
  return {
    testEnvironment: '@jupyterlab/testing/lib/jest-env.js',
    moduleNameMapper: {
      '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
      '\\.(gif|ttf|eot)$': '@jupyterlab/testing/lib/jest-file-mock.js'
    },
    transform: {
      '\\.svg$': '@jupyterlab/testing/lib/jest-raw-loader.js',
      // Extracted from https://github.com/kulshekhar/ts-jest/blob/v29.0.3/presets/index.js
      '^.+\\.tsx?$': [
        'ts-jest/legacy',
        {
          tsconfig: `./tsconfig.test.json`
        }
      ],
      '^.+\\.jsx?$': 'babel-jest'
    },
    testTimeout: 10000,
    setupFiles: ['@jupyterlab/testing/lib/jest-shim.js'],
    testPathIgnorePatterns: ['/lib/', '/node_modules/'],
    moduleFileExtensions: [
      'ts',
      'tsx',
      'js',
      'jsx',
      'json',
      'node',
      'mjs',
      'cjs'
    ],
    transformIgnorePatterns: [`/node_modules/(?!${esModules}).+`],
    reporters: ['default', 'jest-junit', 'github-actions'],
    coverageReporters: ['json', 'lcov', 'text', 'html'],
    coverageDirectory: path.join(baseDir, 'coverage'),
    testRegex: '/test/.*.spec.ts[x]?$'
  };
};
