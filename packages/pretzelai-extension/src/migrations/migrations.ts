/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import { migrate_1_0_to_1_1 } from './migrate_1_0_to_1_1';

interface IMigrationFunction {
  (settings: any): Promise<any>;
}

const migrations: { [key: string]: IMigrationFunction } = {
  '1.0_to_1.1': migrate_1_0_to_1_1
  // Add more migrations here as needed
};

export async function migrateSettings(settings: any, currentVersion: string, targetVersion: string): Promise<any> {
  let currentSettings = settings.get('pretzelSettingsJSON').composite as any;
  const versions = Object.keys(migrations).sort();

  for (const version of versions) {
    const [fromVersion, toVersion] = version.split('_to_');
    if (currentVersion < fromVersion) continue;
    if (toVersion <= targetVersion) {
      currentSettings = await migrations[version](toVersion === '1.1' ? settings : currentSettings);
      currentVersion = toVersion;
    }
    if (currentVersion === targetVersion) break;
  }

  return currentSettings;
}
