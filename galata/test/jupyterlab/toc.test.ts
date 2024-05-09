// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { expect, galata, test } from '@jupyterlab/galata';
import * as path from 'path';

const fileName = 'toc_notebook.ipynb';

test.use({ tmpPath: 'test-toc-general' });

test.describe('Table of Contents', () => {
  test.beforeAll(async ({ request, tmpPath }) => {
    const contents = galata.newContentsHelper(request);
    await contents.uploadFile(
      path.resolve(__dirname, `./notebooks/${fileName}`),
      `${tmpPath}/${fileName}`
    );
  });

  test.beforeEach(async ({ page, tmpPath }) => {
    await page.notebook.openByPath(`${tmpPath}/${fileName}`);
    await page.notebook.activate(fileName);

    await page.sidebar.openTab('table-of-contents');

    await page.click('.jp-toc-numberingButton');
  });

  test.afterEach(async ({ page }) => {
    await page.notebook.close(true);
  });

  test.afterAll(async ({ request, tmpPath }) => {
    const contents = galata.newContentsHelper(request);
    await contents.deleteDirectory(tmpPath);
  });

  test('Open Table of Contents panel', async ({ page }) => {
    const imageName = 'toc-panel.png';
    const tocPanel = page.sidebar.getContentPanelLocator(
      (await page.sidebar.getTabPosition('table-of-contents')) ?? undefined
    );

    expect(await tocPanel.screenshot()).toMatchSnapshot(imageName);
  });

  test('Toggle list', async ({ page }) => {
    await page.notebook.selectCells(0);

    const tocPanel = page.sidebar.getContentPanelLocator(
      (await page.sidebar.getTabPosition('table-of-contents')) ?? undefined
    );
    const numberingButton = tocPanel.locator(
      'jp-button[data-command="toc:display-numbering"]'
    );
    await expect(numberingButton).toHaveCount(1);

    const imageName = 'toggle-numbered-list.png';
    await numberingButton.click();

    expect(await tocPanel.screenshot()).toMatchSnapshot(imageName);
  });

  test('Notebook context menu', async ({ page }) => {
    await page.notebook.selectCells(0);

    const tocPanel = page.sidebar.getContentPanelLocator(
      (await page.sidebar.getTabPosition('table-of-contents')) ?? undefined
    );

    await Promise.all([
      page.locator(
        '.jp-TableOfContents-tree >> .jp-tocItem-active >> text="2. Multiple output types"'
      ),
      page
        .locator('.jp-TableOfContents-tree >> text="2. Multiple output types"')
        .click({
          button: 'right'
        })
    ]);

    const menu = await page.menu.getOpenMenuLocator();

    await menu
      ?.locator('text=Select and Run Cell(s) for this Heading')
      ?.click();

    await page
      .locator('.jp-TableOfContents-tree >> text="2. HTML title"')
      .waitFor();

    expect(await tocPanel.screenshot()).toMatchSnapshot(
      'notebook-output-headings.png'
    );
  });
});
