/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import { migration_functions } from './migration_functions';

export async function migrateSettings(settings: any, currentVersion: string, targetVersion: string): Promise<any> {
  let currentSettings = settings.get('pretzelSettingsJSON').composite as any;
  const version_migrations = Object.keys(migration_functions).sort();

  for (const version_migration of version_migrations) {
    const [fromVersion, toVersion] = version_migration.split('_to_');
    if (currentVersion < fromVersion) continue;
    if (toVersion <= targetVersion) {
      currentSettings = await migration_functions[version_migration as keyof typeof migration_functions](
        toVersion === '1.1' ? settings : currentSettings
      );
      currentVersion = toVersion;
    }
    if (currentVersion === targetVersion) break;
  }

  return currentSettings;
}
