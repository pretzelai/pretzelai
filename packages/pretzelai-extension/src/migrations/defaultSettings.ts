/* eslint-disable camelcase */
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
