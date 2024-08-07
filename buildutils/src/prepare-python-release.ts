/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { program as commander } from 'commander';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as utils from './utils';
import * as os from 'os';

// Specify the program signature.
commander
  .description('Prepare the Python package for release')
  .option(
    '--github-actions',
    'Skip Git operations and build platform-specific wheels'
  )
  .action(async (options: any) => {
    utils.exitOnUncaughtException();

    const distDir = './dist';

    // Clean the dist directory.
    if (fs.existsSync(distDir)) {
      fs.removeSync(distDir);
    }

    // Update core mode.  This cannot be done until the JS packages are
    // released.
    utils.run('node buildutils/lib/update-core-mode.js');

    // Make the Python release.
    utils.run('python -m pip install -U twine build');

    if (options.githubActions) {
      // Build platform-specific wheel
      const platform = os.platform();
      const arch = os.arch();
      utils.run(
        `python -m build --wheel --plat-name=${getPlatName(platform, arch)}`
      );
    } else {
      // Build the 'any' wheel
      utils.run('python -m build .');
    }

    utils.run('twine check dist/*');

    const files = fs.readdirSync(distDir);
    const hashes = new Map<string, string>();
    files.forEach(file => {
      const shasum = crypto.createHash('sha256');
      const hash = shasum.update(fs.readFileSync(path.join(distDir, file)));
      hashes.set(file, hash.digest('hex'));
    });

    const hashString = Array.from(hashes.entries())
      .map(entry => `${entry[0]}: ${entry[1]}`)
      .join('" -m "');

    if (options.git) {
      // Make the commit and the tag.
      const curr = utils.getPythonVersion();
      utils.run(
        `git commit -am "Publish ${curr}" -m "SHA256 hashes:" -m "${hashString}"`
      );
      utils.run(`git tag v${curr}`);
    }

    // Prompt the user to finalize.
    console.debug('*'.repeat(40));
    console.debug('*'.repeat(40));
    console.debug('Ready to publish!');
    console.debug('Run these command when ready:');
    console.debug('twine upload dist/*');
    console.debug('git push origin <BRANCH> --tags');

    // Emit a system beep.
    process.stdout.write('\x07');
  });

function getPlatName(platform: string, arch: string): string {
  switch (platform) {
    case 'linux':
      return arch === 'x64' ? 'manylinux2014_x86_64' : 'manylinux2014_aarch64';
    case 'darwin':
      return arch === 'x64' ? 'macosx_10_9_x86_64' : 'macosx_11_0_arm64';
    case 'win32':
      return arch === 'x64' ? 'win_amd64' : 'win32';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

commander.parse(process.argv);
