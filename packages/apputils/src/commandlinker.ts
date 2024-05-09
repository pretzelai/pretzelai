/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { CommandRegistry } from '@lumino/commands';
import { JSONExt, ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { ElementDataset } from '@lumino/virtualdom';

/**
 * The command data attribute added to nodes that are connected.
 */
const COMMAND_ATTR = 'commandlinker-command';

/**
 * The args data attribute added to nodes that are connected.
 */
const ARGS_ATTR = 'commandlinker-args';

/**
 * A static class that provides helper methods to generate clickable nodes that
 * execute registered commands with pre-populated arguments.
 */
export class CommandLinker implements IDisposable {
  /**
   * Instantiate a new command linker.
   */
  constructor(options: CommandLinker.IOptions) {
    this._commands = options.commands;
    document.body.addEventListener('click', this);
  }

  /**
   * Test whether the linker is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the linker.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    document.body.removeEventListener('click', this);
  }

  /**
   * Connect a command/argument pair to a given node so that when it is clicked,
   * the command will execute.
   *
   * @param node - The node being connected.
   *
   * @param command - The command ID to execute upon click.
   *
   * @param args - The arguments with which to invoke the command.
   *
   * @returns The same node that was passed in, after it has been connected.
   *
   * #### Notes
   * Only `click` events will execute the command on a connected node. So, there
   * are two considerations that are relevant:
   * 1. If a node is connected, the default click action will be prevented.
   * 2. The `HTMLElement` passed in should be clickable.
   */
  connectNode(
    node: HTMLElement,
    command: string,
    args?: ReadonlyPartialJSONObject
  ): HTMLElement {
    node.setAttribute(`data-${COMMAND_ATTR}`, command);
    if (args !== void 0) {
      node.setAttribute(`data-${ARGS_ATTR}`, JSON.stringify(args));
    }
    return node;
  }

  /**
   * Disconnect a node that has been connected to execute a command on click.
   *
   * @param node - The node being disconnected.
   *
   * @returns The same node that was passed in, after it has been disconnected.
   *
   * #### Notes
   * This method is safe to call multiple times and is safe to call on nodes
   * that were never connected.
   *
   * This method can be called on rendered virtual DOM nodes that were populated
   * using the `populateVNodeDataset` method in order to disconnect them from
   * executing their command/argument pair.
   */
  disconnectNode(node: HTMLElement): HTMLElement {
    node.removeAttribute(`data-${COMMAND_ATTR}`);
    node.removeAttribute(`data-${ARGS_ATTR}`);
    return node;
  }

  /**
   * Handle the DOM events for the command linker helper class.
   *
   * @param event - The DOM event sent to the class.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the panel's DOM node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    switch (event.type) {
      case 'click':
        this._evtClick(event as MouseEvent);
        break;
      default:
        return;
    }
  }

  /**
   * Populate the `dataset` attribute within the collection of attributes used
   * to instantiate a virtual DOM node with the values necessary for its
   * rendered DOM node to respond to clicks by executing a command/argument
   * pair.
   *
   * @param command - The command ID to execute upon click.
   *
   * @param args - The arguments with which to invoke the command.
   *
   * @returns A `dataset` collection for use within virtual node attributes.
   *
   * #### Notes
   * The return value can be used on its own as the value for the `dataset`
   * attribute of a virtual element, or it can be added to an existing `dataset`
   * as in the example below.
   *
   * #### Example
   * ```typescript
   * let command = 'some:command-id';
   * let args = { alpha: 'beta' };
   * let anchor = h.a({
   *   className: 'some-class',
   *   dataset: {
   *     foo: '1',
   *     bar: '2',
   *     ../...linker.populateVNodeDataset(command, args)
   *   }
   * }, 'some text');
   * ```
   */
  populateVNodeDataset(
    command: string,
    args?: ReadonlyPartialJSONObject
  ): ElementDataset {
    let dataset: ElementDataset;
    if (args !== void 0) {
      dataset = { [ARGS_ATTR]: JSON.stringify(args), [COMMAND_ATTR]: command };
    } else {
      dataset = { [COMMAND_ATTR]: command };
    }
    return dataset;
  }

  /**
   * The global click handler that deploys commands/argument pairs that are
   * attached to the node being clicked.
   */
  private _evtClick(event: MouseEvent): void {
    let target = event.target as HTMLElement;
    while (target && target.parentElement) {
      if (target.hasAttribute(`data-${COMMAND_ATTR}`)) {
        event.preventDefault();
        const command = target.getAttribute(`data-${COMMAND_ATTR}`);
        if (!command) {
          return;
        }
        const argsValue = target.getAttribute(`data-${ARGS_ATTR}`);
        let args = JSONExt.emptyObject;
        if (argsValue) {
          args = JSON.parse(argsValue);
        }
        void this._commands.execute(command, args);
        return;
      }
      target = target.parentElement;
    }
  }

  private _commands: CommandRegistry;
  private _isDisposed = false;
}

/**
 * A namespace for command linker statics.
 */
export namespace CommandLinker {
  /**
   * The instantiation options for a command linker.
   */
  export interface IOptions {
    /**
     * The command registry instance that all linked commands will use.
     */
    commands: CommandRegistry;
  }
}
