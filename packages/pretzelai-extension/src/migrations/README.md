# Migration Instructions

When adding or changing settings, migrations are used to update settings from one version to another.

## Steps to Add a New Migration

1. **Create a new migration file**:

   - If the current version is 1.5, and you're making settings version 1.6, then you need to make a file called `migrate_1_5_to_1_6.ts`
   - In this file, create a function that returns default settings for 1.6: `returnDefaults_1_6`
     - Usually, you can just copy the defaults of 1.5 (from `migrate_1_4_to_1_5`) and add/change any settings
     - If you copy and paste old settings, remember to set the version to 1.6
     - If there are structural changes to the schema, you should be extra careful defining what the defaults look like
   - Write a function `migrate_1_5_to_1_6`
     - This function will take as input the JSON settings of version 1.5 and return the correctly mapped settings of version 1.6
     - Usually, you can make simple modifications to the input of the function (i.e., the settings of version 1.5) to get the resulting output
       - If you're simply modifying the input of the function (i.e., the settings of version 1.5), remember to return the set the new version on the JSON (i.e. update version to 1.6)
   - For an example you can look at the `migrate_1_1_to_1_2.ts` file

2. **Import the Migration Function**:

   - Import your new migration function at the top of the `migrations.ts` file.

   ```typescript
   import { migrate_1_5_to_1_6 } from './migrate_1_5_to_1_6';
   ```

3. **Add to Migrations Object**:

   - Add the new migration function to the `migrations` object in `migrations.ts`.

   ```typescript
   const migrations: { [key: string]: IMigrationFunction } = {
     '1.0_to_1.1': migrate_1_0_to_1_1,
     '1.1_to_1.2': migrate_1_1_to_1_2,
     // ...
     '1.5_to_1.6': migrate_1_5_to_1_6 // Add your migration here
   };
   ```

4. **Update Default Settings**:

   - In `defaultSettings.ts`, add `import { returnDefaults_1_6 } from './migrate_1_5_to_1_6'`;
   - Add a new case statement to the `getDefaultSettings` function

   ```typescript
   case '1.6':
       return returnDefaults_1_6();
   ```

   - Update the default case to return `returnDefaults_1_6()`
   - Update `export type PretzelSettingsType = ReturnType<typeof returnDefaults_1_6>;`

5. **Update the plugin.json file with the new version**
   - Update `packages/pretzelai-extension/schema/plugin.json`: Set `pretzelSettingsJSONVersion` to 1.6
