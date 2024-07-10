/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import { returnDefaults_1_1 } from './migrate_1_0_to_1_1';

export const getDefaultSettings = (version: string) => {
  switch (version) {
    case '1.1':
      return returnDefaults_1_1();
    // Add more cases for future versions
    default:
      return returnDefaults_1_1(); // Fallback to the latest version
  }
};
