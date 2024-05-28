import { ISettingRegistry } from '@jupyterlab/settingregistry';
import * as React from 'react';
import { Dialog } from '@jupyterlab/apputils';
import '../style/index.css';

let settingRegistry: ISettingRegistry;

async function handleConsent(consent: string) {
  await settingRegistry.set('@jupyterlab/apputils-extension:notification', 'posthogCookieConsent', consent);
  removeSplashScreen();
}

function SplashScreen() {
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Cmd + K' : 'Ctrl + K';

  return (
    <div id="splash-screen">
      <div className="splash-content">
        <h1>Welcome to Pretzel</h1>
        <p>How to use:</p>
        <ul>
          <li>
            When in a cell, press <strong>{keyCombination}</strong> and type in your prompt
          </li>
          <li>
            You can use <strong>@variable</strong> syntax in the prompt to refer to dataframes and variables in memory
          </li>
          <li>
            Press the <strong>&quot;Fix Error with AI&quot;</strong> button to automatically fix errors
          </li>
          <li>
            Go to <strong>Settings &gt; Settings Editor</strong> and search for Pretzel AI to customize which AI model
            is used
          </li>
          <li>
            See more usage instructions{' '}
            <a href="https://github.com/pretzelai/pretzelai#readme" target="_blank" rel="noreferrer">
              in our README
            </a>
          </li>
        </ul>
        <p>
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
