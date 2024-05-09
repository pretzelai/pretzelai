// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterFrontEnd } from '@jupyterlab/application';
import { PathExt } from '@jupyterlab/coreutils';
import { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { IRunningSessionManagers, IRunningSessions } from '@jupyterlab/running';
import { Kernel, KernelSpec, Session } from '@jupyterlab/services';
import { ITranslator } from '@jupyterlab/translation';
import {
  closeIcon,
  consoleIcon,
  IDisposableMenuItem,
  jupyterIcon,
  kernelIcon,
  LabIcon,
  notebookIcon,
  RankedMenu
} from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';
import { Throttler } from '@lumino/polling';
import { Signal } from '@lumino/signaling';
import { CommandIDs } from '.';
import React, { ReactNode } from 'react';

const KERNEL_ITEM_CLASS = 'jp-mod-kernel';
const KERNELSPEC_ITEM_CLASS = 'jp-mod-kernelspec';
const WIDGET_ITEM_CLASS = 'jp-mod-kernel-widget';
const KERNEL_LABEL_ID = 'jp-RunningSessions-item-label-kernel-id';

/**
 * Add the running kernel manager (notebooks & consoles) to the running panel.
 */
export async function addKernelRunningSessionManager(
  managers: IRunningSessionManagers,
  translator: ITranslator,
  app: JupyterFrontEnd
): Promise<void> {
  const { commands, contextMenu, serviceManager } = app;
  const { kernels, kernelspecs, sessions } = serviceManager;
  const { runningChanged, RunningKernel } = Private;
  const throttler = new Throttler(() => runningChanged.emit(undefined), 100);
  const trans = translator.load('jupyterlab');

  // Throttle signal emissions from the kernel and session managers.
  kernels.runningChanged.connect(() => void throttler.invoke());
  sessions.runningChanged.connect(() => void throttler.invoke());

  // Wait until the relevant services are ready.
  await Promise.all([kernels.ready, kernelspecs.ready, sessions.ready]);

  // Add the kernels pane to the running sidebar.
  managers.add({
    name: trans.__('Kernels'),
    running: () => {
      const kernelsBySpec = new Map<string, Private.RunningKernel[]>();

      for (const kernel of kernels.running()) {
        const list = kernelsBySpec.get(kernel.name) ?? [];
        kernelsBySpec.set(kernel.name, list);
        list.push(
          new RunningKernel({
            commands,
            kernel,
            kernels,
            sessions,
            trans
          })
        );
      }

      return Array.from(kernelsBySpec.entries()).map(
        ([spec, kernels]) =>
          new Private.KernelSpecItem({
            name: spec,
            kernels,
            spec: kernelspecs.specs?.kernelspecs[spec],
            trans
          })
      );
    },
    shutdownAll: () => kernels.shutdownAll(),
    refreshRunning: () =>
      Promise.all([kernels.refreshRunning(), sessions.refreshRunning()]),
    runningChanged,
    shutdownLabel: trans.__('Shut Down Kernel'),
    shutdownAllLabel: trans.__('Shut Down All'),
    shutdownAllConfirmationText: trans.__(
      'Are you sure you want to permanently shut down all running kernels?'
    )
  });

  // Add running kernels commands to the registry.
  const test = (node: HTMLElement) =>
    node.classList.contains(KERNEL_ITEM_CLASS);
  commands.addCommand(CommandIDs.kernelNewConsole, {
    icon: consoleIcon,
    label: trans.__('New Console for Kernel'),
    execute: args => {
      const node = app.contextMenuHitTest(test);
      const id = (args.id as string) ?? node?.dataset['context'];
      if (id) {
        return commands.execute('console:create', { kernelPreference: { id } });
      }
    }
  });
  commands.addCommand(CommandIDs.kernelNewNotebook, {
    icon: notebookIcon,
    label: trans.__('New Notebook for Kernel'),
    execute: args => {
      const node = app.contextMenuHitTest(test);
      const id = (args.id as string) ?? node?.dataset['context'];
      if (id) {
        return commands.execute('notebook:create-new', { kernelId: id });
      }
    }
  });
  commands.addCommand(CommandIDs.kernelOpenSession, {
    icon: args =>
      args.type === 'console'
        ? consoleIcon
        : args.type === 'notebook'
        ? notebookIcon
        : undefined,
    isEnabled: ({ path, type }) => !!type || path !== undefined,
    label: ({ name, path }) =>
      (name as string) ||
      PathExt.basename((path as string) || trans.__('Unknown Session')),
    execute: ({ path, type }) => {
      if (!type || path === undefined) {
        return;
      }
      const command = type === 'console' ? 'console:open' : 'docmanager:open';
      return commands.execute(command, { path });
    }
  });
  commands.addCommand(CommandIDs.kernelShutDown, {
    icon: closeIcon,
    label: trans.__('Shut Down Kernel'),
    execute: args => {
      const node = app.contextMenuHitTest(test);
      const id = (args.id as string) ?? node?.dataset['context'];
      if (id) {
        return kernels.shutdown(id);
      }
    }
  });

  const sessionsItems: IDisposableMenuItem[] = [];

  // Populate connected sessions submenu when context menu is opened.
  contextMenu.opened.connect(async () => {
    const submenu =
      (contextMenu.menu.items.find(
        item =>
          item.type === 'submenu' &&
          item.submenu?.id === 'jp-contextmenu-connected-sessions'
      )?.submenu as RankedMenu) ?? null;

    if (!submenu) {
      // Bail early if the connected session menu is not found
      return;
    }

    // Empty the connected sessions submenu.
    sessionsItems.forEach(item => item.dispose());
    sessionsItems.length = 0;
    submenu.clearItems();

    const node = app.contextMenuHitTest(test);
    const id = node?.dataset['context'];
    if (!id) {
      return;
    }

    // Populate the submenu with sessions connected to this kernel.
    const command = CommandIDs.kernelOpenSession;
    for (const session of sessions.running()) {
      if (id === session.kernel?.id) {
        const { name, path, type } = session;
        sessionsItems.push(
          submenu.addItem({ command, args: { name, path, type } })
        );
      }
    }
  });
}

namespace Private {
  export class KernelSpecItem implements IRunningSessions.IRunningItem {
    constructor(options: KernelSpecItem.IOptions) {
      this._name = options.name;
      this.className = KERNELSPEC_ITEM_CLASS;
      this._kernels = options.kernels;
      this.spec = options.spec || null;
      this.trans = options.trans;
    }

    readonly className: string;

    readonly spec: KernelSpec.ISpecModel | null;

    readonly trans: IRenderMime.TranslationBundle;

    private _name: string;
    private _kernels: RunningKernel[];

    icon(): LabIcon | string {
      const { spec } = this;
      if (!spec || !spec.resources) {
        return jupyterIcon;
      }
      return (
        spec.resources['logo-svg'] ||
        spec.resources['logo-64x64'] ||
        spec.resources['logo-32x32']
      );
    }

    label(): string {
      const { _name, spec } = this;
      return spec?.display_name || _name;
    }

    get children(): IRunningSessions.IRunningItem[] {
      return this._kernels;
    }
  }

  export namespace KernelSpecItem {
    export interface IOptions {
      kernels: RunningKernel[];
      name: string;
      spec?: KernelSpec.ISpecModel;
      trans: IRenderMime.TranslationBundle;
    }
  }

  type DocumentWidgetWithKernelItem = Omit<
    IRunningSessions.IRunningItem,
    'label'
  > & { label(): string };

  export class RunningKernel implements IRunningSessions.IRunningItem {
    constructor(options: RunningKernel.IOptions) {
      this.className = KERNEL_ITEM_CLASS;
      this.commands = options.commands;
      this.kernel = options.kernel;
      this.context = this.kernel.id;
      this.kernels = options.kernels;
      this.sessions = options.sessions;
      this.trans = options.trans;
    }

    readonly className: string;

    readonly context: string;

    readonly commands: CommandRegistry;

    readonly kernel: Kernel.IModel;

    readonly kernels: Kernel.IManager;

    readonly sessions: Session.IManager;

    readonly trans: IRenderMime.TranslationBundle;

    get children(): DocumentWidgetWithKernelItem[] {
      const children: DocumentWidgetWithKernelItem[] = [];
      const open = CommandIDs.kernelOpenSession;
      const { commands } = this;
      for (const session of this.sessions.running()) {
        if (this.kernel.id === session.kernel?.id) {
          const { name, path, type } = session;
          children.push({
            className: WIDGET_ITEM_CLASS,
            context: this.kernel.id,
            open: () => void commands.execute(open, { name, path, type }),
            icon: () =>
              type === 'console'
                ? consoleIcon
                : type === 'notebook'
                ? notebookIcon
                : jupyterIcon,
            label: () => name,
            labelTitle: () => path
          });
        }
      }
      return children;
    }

    shutdown(): Promise<void> {
      return this.kernels.shutdown(this.kernel.id);
    }

    icon(): LabIcon | string {
      return kernelIcon;
    }

    label(): ReactNode {
      const { kernel } = this;
      const kernelIdPrefix = kernel.id.split('-')[0];
      return (
        <>
          {this._summary}{' '}
          <span className={KERNEL_LABEL_ID}>({kernelIdPrefix})</span>
        </>
      );
    }

    labelTitle(): string {
      const { trans } = this;
      const { id } = this.kernel;
      const title = [`${this._summary}: ${id}`];
      for (const session of this.sessions.running()) {
        if (this.kernel.id === session.kernel?.id) {
          const { path, type } = session;
          title.push(trans.__(`%1\nPath: %2`, type, path));
        }
      }
      return title.join('\n\n');
    }

    private get _summary(): string {
      const children = this.children;
      if (children.length === 0) {
        return this.trans.__('No sessions connected');
      } else if (children.length == 1) {
        return children[0].label();
      } else {
        return this.trans.__(
          '%1 and %2 more',
          children[0].label(),
          children.length - 1
        );
      }
    }
  }

  export namespace RunningKernel {
    export interface IOptions {
      commands: CommandRegistry;
      kernel: Kernel.IModel;
      kernels: Kernel.IManager;
      sessions: Session.IManager;
      spec?: KernelSpec.ISpecModel;
      trans: IRenderMime.TranslationBundle;
    }
  }

  export const runningChanged = new Signal<unknown, unknown>({});
}
