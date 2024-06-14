/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import * as React from 'react';
import { Dialog } from '@jupyterlab/apputils';

function ErrorDialog({ errorTitle, errorDescription }: { errorTitle: string; errorDescription: string }) {
  return (
    <div id="splash-screen">
      <div className="splash-content">
        <h3>{errorTitle}</h3>
        <p>{errorDescription}</p>
        <div className="splash-buttons">
          <div id="splash-close" className="button-red" onClick={() => Dialog.flush()} role="button" tabIndex={0}>
            Close
          </div>
        </div>
      </div>
    </div>
  );
}

function createErrorDialog(errorTitle: string, errorDescription: string) {
  const dialog = new Dialog({
    body: <ErrorDialog errorTitle={errorTitle} errorDescription={errorDescription} />,
    buttons: [],
    hasClose: true
  });

  dialog.launch();
}

export function showErrorDialog(errorTitle: string, errorDescription: string) {
  createErrorDialog(errorTitle, errorDescription);
}
