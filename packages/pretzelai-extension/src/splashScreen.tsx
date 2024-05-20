import { ISettingRegistry } from '@jupyterlab/settingregistry';

let settingRegistry: ISettingRegistry;

async function handleConsent(consent: string) {
  await settingRegistry.set(
    '@jupyterlab/apputils-extension:notification',
    'posthogCookieConsent',
    consent
  );
  removeSplashScreen();
}

function createSplashScreen() {
  const isMac = /Mac/i.test(navigator.userAgent);
  const keyCombination = isMac ? 'Cmd + K' : 'Ctrl + K';

  const splashScreen = document.createElement('div');
  splashScreen.id = 'splash-screen';
  splashScreen.innerHTML = `
    <style>
      #splash-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }

      .splash-content {
        background: white;
        padding: 30px;
        border-radius: 15px;
        text-align: left;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 0 15px rgba(0, 0, 0, 0.3);
      }

      .splash-content h1 {
        margin-top: 0;
      }

      .splash-buttons {
        display: flex;
        justify-content: flex-end;
        margin-top: 20px;
      }

      .splash-buttons button {
        margin-left: 10px;
        padding: 10px 20px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 16px;
      }

      #splash-accept {
        background-color: #4CAF50;
        color: white;
      }

      #splash-reject {
        background-color: transparent;
        color: black;
      }

      .splash-content a {
        color: #1a0dab;
        text-decoration: underline;
      }
    </style>
    <div class="splash-content">
      <h1>Welcome to Pretzel</h1>
      <p>How to use:</p>
      <ul>
        <li>When in a cell, press <strong>${keyCombination}</strong> and type in your prompt</li>
        <li>You can use <strong>@variable</strong> syntax in the prompt to refer to dataframes and variables in memory</li>
        <li>Press the <strong>"Fix Error with AI"</strong> button to automatically fix errors</li>
        <li>Go to <strong>Settings > Settings Editor</strong> and search for Pretzel AI to customize which AI model is used</li>
        <li>See more usage instructions <a href="https://github.com/pretzelai/pretzelai#readme" target="_blank">in our README</a></li>
      </ul>
      <p>To better understand how users are using the new AI codegen features, we collect anonymized telemetry strictly related to the AI features. We also collect the AI prompt but it can be disabled in Pretzel AI Settings.</p>
      <p>We use cookies to make sure we remember you between browser sessions. Do you consent to the use of cookies for this purpose?</p>
      <div class="splash-buttons">
        <button id="splash-accept">Accept</button>
        <button id="splash-reject">Reject</button>
      </div>
    </div>
  `;
  document.body.appendChild(splashScreen);

  document
    .getElementById('splash-accept')
    ?.addEventListener('click', () => handleConsent('Yes'));
  document
    .getElementById('splash-reject')
    ?.addEventListener('click', () => handleConsent('No'));
}

function removeSplashScreen() {
  const splashScreen = document.getElementById('splash-screen');
  if (splashScreen) {
    splashScreen.remove();
  }
}

export function initSplashScreen(registry: ISettingRegistry) {
  settingRegistry = registry;
  createSplashScreen();
}
