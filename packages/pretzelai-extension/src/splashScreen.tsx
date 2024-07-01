/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import * as React from 'react';
import { Dialog } from '@jupyterlab/apputils';

let settingRegistry: ISettingRegistry;

async function handleConsent(consent: string) {
  await settingRegistry.set('@jupyterlab/apputils-extension:notification', 'posthogCookieConsent', consent);
  removeSplashScreen();
}

function SplashScreen() {
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Cmd + K' : 'Ctrl + K';
  const keyCombinationSidepanel = isMac ? 'Ctrl + Cmd + B' : 'Ctrl + Alt + B';

  return (
    <div id="splash-screen">
      <div className="splash-content">
        <h1>Welcome to Pretzel</h1>
        <h3>Using Pretzel</h3>
        <ul>
          <li>Start typing in a notebook cell to get tab completions</li>
          <li>
            Use <strong>{keyCombination}</strong> in a Jupyter cell to start generating code
          </li>
          <li>
            Use <strong>{keyCombinationSidepanel}</strong> or Pretzel icon on right sidebar to open the AI assistant
            chat
          </li>
          <li>
            See more feature details{' '}
            <a href="https://github.com/pretzelai/pretzelai?tab=readme-ov-file#usage" target="_blank" rel="noreferrer">
              in our README
            </a>
          </li>
          <li>
            Go to <strong>Settings &gt; Settings Editor</strong> and search for Pretzel AI to use your own OpenAI or
            Azure models.
          </li>
        </ul>
        <p style={{ marginTop: '30px' }}>
          To better understand how users are using the new AI codegen features, we collect anonymized telemetry strictly
          related to the AI features. We also collect the AI prompt but it can be disabled in Pretzel AI Settings.
        </p>
        <p>
          We use cookies to make sure we remember you between browser sessions. Do you consent to the use of cookies for
          this purpose?
        </p>
        <div className="splash-buttons">
          <div id="splash-accept" className="button" onClick={() => handleConsent('Yes')} role="button" tabIndex={0}>
            Accept
          </div>
          <div id="splash-reject" className="button" onClick={() => handleConsent('No')} role="button" tabIndex={0}>
            Reject
          </div>
        </div>
      </div>
    </div>
  );
}

function createCustomDialog() {
  const dialog = new Dialog({
    body: <SplashScreen />,
    buttons: [],
    hasClose: false
  });

  const buttons = dialog.node.querySelectorAll('button.jp-mod-styled');
  buttons.forEach(button => button.classList.remove('jp-mod-styled'));

  dialog.launch();
}

// function createSplashScreen() {
//   return showDialog({
//     body: <SplashScreen />,
//     buttons: [],
//     hasClose: false,
//   });
// }

function removeSplashScreen() {
  Dialog.flush();
}

export function initSplashScreen(registry: ISettingRegistry) {
  settingRegistry = registry;
  createCustomDialog();
}
