/* eslint-disable camelcase */
import { migrate_1_0_to_1_1 } from './migrate_1_0_to_1_1';

interface IMigrationFunction {
  (settings: any): Promise<any>;
}

const migrations: { [key: string]: IMigrationFunction } = {
  '1.0_to_1.1': migrate_1_0_to_1_1
  // Add more migrations here as needed
};

export async function migrateSettings(settings: any, currentVersion: string, targetVersion: string): Promise<any> {
  let currentSettings = { ...settings };
  const versions = Object.keys(migrations).sort();

  for (const version of versions) {
    const [fromVersion, toVersion] = version.split('_to_');
    if (currentVersion < fromVersion) continue;
    if (toVersion <= targetVersion) {
      currentSettings = await migrations[version](currentSettings);
      currentVersion = toVersion;
    }
    if (currentVersion === targetVersion) break;
  }

  return currentSettings;
}
