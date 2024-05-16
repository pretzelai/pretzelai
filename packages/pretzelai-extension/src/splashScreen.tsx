import { ISettingRegistry } from '@jupyterlab/settingregistry';

let settingRegistry: ISettingRegistry;

async function handleConsent(consent: string) {
  await settingRegistry.set(
    '@jupyterlab/pretzelai-extension:plugin',
    'posthogCookieConsent',
    consent
  );
  removeSplashScreen();
}

function createSplashScreen() {
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
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        max-width: 400px;
        width: 80%;
      }

      .splash-buttons {
        margin-top: 20px;
      }

      .splash-buttons button {
        margin: 0 10px;
        padding: 10px 20px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      }

      #splash-yes {
        background-color: #4CAF50;
        color: white;
      }

      #splash-no {
        background-color: #f44336;
        color: white;
      }
    </style>
    <div class="splash-content">
      <h1>Welcome to Pretzel</h1>
      <p>We use Posthog for usage tracking. You can opt-out in settings.</p>
      <p>Do you consent to the use of cookies for tracking?</p>
      <div class="splash-buttons">
        <button id="splash-yes">Yes</button>
        <button id="splash-no">No</button>
      </div>
    </div>
  `;
  document.body.appendChild(splashScreen);

  document
    .getElementById('splash-yes')
    ?.addEventListener('click', () => handleConsent('Yes'));
  document
    .getElementById('splash-no')
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
