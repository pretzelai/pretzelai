// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module nbformat
 */

// Notebook format interfaces
// https://nbformat.readthedocs.io/en/latest/format_description.html
// https://github.com/jupyter/nbformat/blob/master/nbformat/v4/nbformat.v4.schema.json

import { JSONExt, PartialJSONObject } from '@lumino/coreutils';

/**
 * The earliest major version of the notebook format we support.
 */
export const MAJOR_VERSION: number = 4;

/**
 * The earliest minor version of the notebook format we support.
 */
export const MINOR_VERSION: number = 4;

/**
 * The kernelspec metadata.
 */
export interface IKernelspecMetadata extends PartialJSONObject {
  name: string;
  display_name: string;
}

/**
 * The language info metadata
 */
export interface ILanguageInfoMetadata extends PartialJSONObject {
  name: string;
  codemirror_mode?: string | PartialJSONObject;
  file_extension?: string;
  mimetype?: string;
  pygments_lexer?: string;
}

/**
 * The default metadata for the notebook.
 */
export interface INotebookMetadata extends PartialJSONObject {
  kernelspec?: IKernelspecMetadata;
  language_info?: ILanguageInfoMetadata;
  orig_nbformat?: number;
}

/**
 * The notebook content.
 */
export interface INotebookContent extends PartialJSONObject {
  metadata: INotebookMetadata;
  nbformat_minor: number;
  nbformat: number;
  cells: ICell[];
}

/**
 * A multiline string.
 */
export type MultilineString = string | string[];

/**
 * A mime-type keyed dictionary of data.
 */
export interface IMimeBundle extends PartialJSONObject {
  [key: string]: MultilineString | PartialJSONObject;
}

/**
 * Media attachments (e.g. inline images).
 */
export interface IAttachments {
  [key: string]: IMimeBundle | undefined;
}

/**
 * The code cell's prompt number. Will be null if the cell has not been run.
 */
export type ExecutionCount = number | null;

/**
 * Cell output metadata.
 */
export type OutputMetadata = PartialJSONObject;

/**
 * Validate a mime type/value pair.
 *
 * @param type - The mimetype name.
 *
 * @param value - The value associated with the type.
 *
 * @returns Whether the type/value pair are valid.
 */
export function validateMimeValue(
  type: string,
  value: MultilineString | PartialJSONObject
): boolean {
  // Check if "application/json" or "application/foo+json"
  const jsonTest = /^application\/.+\+json$/;
  const isJSONType = type === 'application/json' || jsonTest.test(type);

  const isString = (x: any) => {
    return Object.prototype.toString.call(x) === '[object String]';
  };

  // If it is an array, make sure if is not a JSON type and it is an
  // array of strings.
  if (Array.isArray(value)) {
    if (isJSONType) {
      return false;
    }
    let valid = true;
    (value as string[]).forEach(v => {
      if (!isString(v)) {
        valid = false;
      }
    });
    return valid;
  }

  // If it is a string, make sure we are not a JSON type.
  if (isString(value)) {
    return !isJSONType;
  }

  // It is not a string, make sure it is a JSON type.
  if (!isJSONType) {
    return false;
  }

  // It is a JSON type, make sure it is a valid JSON object.
  return JSONExt.isObject(value);
}

/**
 * A type which describes the type of cell.
 */
export type CellType = 'code' | 'markdown' | 'raw' | string;

/**
 * The Jupyter metadata namespace.
 */
export interface IBaseCellJupyterMetadata extends PartialJSONObject {
  /**
   * Whether the source is hidden.
   */
  source_hidden: boolean;
}

/**
 * Cell-level metadata.
 */
export interface IBaseCellMetadata extends PartialJSONObject {
  /**
   * Whether the cell is trusted.
   *
   * #### Notes
   * This is not strictly part of the nbformat spec, but it is added by
   * the contents manager.
   *
   * See https://jupyter-server.readthedocs.io/en/latest/operators/security.html.
   */
  trusted: boolean;

  /**
   * The cell's name. If present, must be a non-empty string.
   */
  name: string;

  /**
   * The Jupyter metadata namespace
   */
  jupyter: Partial<IBaseCellJupyterMetadata>;

  /**
   * The cell's tags. Tags must be unique, and must not contain commas.
   */
  tags: string[];
}

/**
 * The base cell interface.
 */
export interface IBaseCell extends PartialJSONObject {
  /**
   * String identifying the type of cell.
   */
  cell_type: string;

  /**
   * Contents of the cell, represented as an array of lines.
   */
  source: MultilineString;

  /**
   * Cell-level metadata.
   */
  metadata: Partial<ICellMetadata>;
}

/**
 * Metadata for the raw cell.
 */
export interface IRawCellMetadata extends IBaseCellMetadata {
  /**
   * Raw cell metadata format for nbconvert.
   */
  format: string;
}

/**
 * A raw cell.
 */
export interface IRawCell extends IBaseCell {
  /**
   * A string field representing the identifier of this particular cell.
   *
   * Notebook format 4.4 requires no id field, but format 4.5 requires an id
   * field. We need to handle both cases, so we make id optional here.
   */
  id?: string;

  /**
   * String identifying the type of cell.
   */
  cell_type: 'raw';

  /**
   * Cell-level metadata.
   */
  metadata: Partial<IRawCellMetadata>;

  /**
   * Cell attachments.
   */
  attachments?: IAttachments;
}

/**
 * A markdown cell.
 */
export interface IMarkdownCell extends IBaseCell {
  /**
   * A string field representing the identifier of this particular cell.
   *
   * Notebook format 4.4 requires no id field, but format 4.5 requires an id
   * field. We need to handle both cases, so we make id optional here.
   */
  id?: string;

  /**
   * String identifying the type of cell.
   */
  cell_type: 'markdown';

  /**
   * Cell attachments.
   */
  attachments?: IAttachments;
}

/**
 * The Jupyter metadata namespace for code cells.
 */
export interface ICodeCellJupyterMetadata extends IBaseCellJupyterMetadata {
  /**
   * Whether the outputs are hidden. See https://github.com/jupyter/nbformat/issues/137.
   */
  outputs_hidden: boolean;
}

/**
 * Metadata for a code cell.
 */
export interface ICodeCellMetadata extends IBaseCellMetadata {
  /**
   * Whether the cell is collapsed/expanded.
   */
  collapsed: boolean;

  /**
   * The Jupyter metadata namespace
   */
  jupyter: Partial<ICodeCellJupyterMetadata>;

  /**
   * Whether the cell's output is scrolled, unscrolled, or autoscrolled.
   */
  scrolled: boolean | 'auto';
}

/**
 * A code cell.
 */
export interface ICodeCell extends IBaseCell {
  /**
   * A string field representing the identifier of this particular cell.
   *
   * Notebook format 4.4 requires no id field, but format 4.5 requires an id
   * field. We need to handle both cases, so we make id optional here.
   */
  id?: string;

  /**
   * String identifying the type of cell.
   */
  cell_type: 'code';

  /**
   * Cell-level metadata.
   */
  metadata: Partial<ICodeCellMetadata>;

  /**
   * Execution, display, or stream outputs.
   */
  outputs: IOutput[];

  /**
   * The code cell's prompt number. Will be null if the cell has not been run.
   */
  execution_count: ExecutionCount;
}

/**
 * An unrecognized cell.
 */
export interface IUnrecognizedCell extends IBaseCell {}

/**
 * A cell union type.
 */
export type ICell = IRawCell | IMarkdownCell | ICodeCell | IUnrecognizedCell;

/**
 * Test whether a cell is a raw cell.
 */
export function isRaw(cell: ICell): cell is IRawCell {
  return cell.cell_type === 'raw';
}

/**
 * Test whether a cell is a markdown cell.
 */
export function isMarkdown(cell: ICell): cell is IMarkdownCell {
  return cell.cell_type === 'markdown';
}

/**
 * Test whether a cell is a code cell.
 */
export function isCode(cell: ICell): cell is ICodeCell {
  return cell.cell_type === 'code';
}

/**
 * A union metadata type.
 */
export type ICellMetadata =
  | IBaseCellMetadata
  | IRawCellMetadata
  | ICodeCellMetadata;

/**
 * The valid output types.
 */
export type OutputType =
  | 'execute_result'
  | 'display_data'
  | 'stream'
  | 'error'
  | 'update_display_data';

/**
 * The base output type.
 */
export interface IBaseOutput extends PartialJSONObject {
  /**
   * Type of cell output.
   */
  output_type: string;
}

/**
 * Result of executing a code cell.
 */
export interface IExecuteResult extends IBaseOutput {
  /**
   * Type of cell output.
   */
  output_type: 'execute_result';

  /**
   * A result's prompt number.
   */
  execution_count: ExecutionCount;

  /**
   * A mime-type keyed dictionary of data.
   */
  data: IMimeBundle;

  /**
   * Cell output metadata.
   */
  metadata: OutputMetadata;
}

/**
 * Data displayed as a result of code cell execution.
 */
export interface IDisplayData extends IBaseOutput {
  /**
   * Type of cell output.
   */
  output_type: 'display_data';

  /**
   * A mime-type keyed dictionary of data.
   */
  data: IMimeBundle;

  /**
   * Cell output metadata.
   */
  metadata: OutputMetadata;
}

/**
 * Data displayed as an update to existing display data.
 */
export interface IDisplayUpdate extends IBaseOutput {
  /**
   * Type of cell output.
   */
  output_type: 'update_display_data';

  /**
   * A mime-type keyed dictionary of data.
   */
  data: IMimeBundle;

  /**
   * Cell output metadata.
   */
  metadata: OutputMetadata;
}

/**
 * Stream output from a code cell.
 */
export interface IStream extends IBaseOutput {
  /**
   * Type of cell output.
   */
  output_type: 'stream';

  /**
   * The name of the stream.
   */
  name: StreamType;

  /**
   * The stream's text output.
   */
  text: MultilineString;
}

/**
 * An alias for a stream type.
 */
export type StreamType = 'stdout' | 'stderr';

/**
 * Output of an error that occurred during code cell execution.
 */
export interface IError extends IBaseOutput {
  /**
   * Type of cell output.
   */
  output_type: 'error';

  /**
   * The name of the error.
   */
  ename: string;

  /**
   * The value, or message, of the error.
   */
  evalue: string;

  /**
   * The error's traceback.
   */
  traceback: string[];
}

/**
 * Unrecognized output.
 */
export interface IUnrecognizedOutput extends IBaseOutput {}

/**
 * Test whether an output is an execute result.
 */
export function isExecuteResult(output: IOutput): output is IExecuteResult {
  return output.output_type === 'execute_result';
}

/**
 * Test whether an output is from display data.
 */
export function isDisplayData(output: IOutput): output is IDisplayData {
  return output.output_type === 'display_data';
}

/**
 * Test whether an output is from updated display data.
 */
export function isDisplayUpdate(output: IOutput): output is IDisplayUpdate {
  return output.output_type === 'update_display_data';
}

/**
 * Test whether an output is from a stream.
 */
export function isStream(output: IOutput): output is IStream {
  return output.output_type === 'stream';
}

/**
 * Test whether an output is an error.
 */
export function isError(output: IOutput): output is IError {
  return output.output_type === 'error';
}

/**
 * An output union type.
 */
export type IOutput =
  | IUnrecognizedOutput
  | IExecuteResult
  | IDisplayData
  | IStream
  | IError;
