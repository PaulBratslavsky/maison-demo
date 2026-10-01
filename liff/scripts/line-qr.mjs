// Prints the link that opens Maison inside LINE, https://liff.line.me/<your LIFF ID>, with a QR code for LINE's QR
// reader, and saves the code as liff/line/qr/maison-line-qr.png (1024 px) and maison-line-qr.svg. Give a page's path to
// open that page instead of the start: npm run qr -- /visits. The LIFF ID is LINE_MODE_LIFF_ID in liff/.env.
// The link and both files hold your LIFF ID: liff/line/qr/ is gitignored, so keep them out of commits.
// From the repo root: npm run qr. It sits in liff/ so that `qrcode` comes from liff/node_modules.
import { mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import QRCode from 'qrcode';

import { lineInputs, readEnv } from '../../scripts/line-mode.mjs';
import { lineAppUrl } from '../lib/line-app-url.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NAME = 'maison-line-qr';
const BLACK_ON_WHITE = { dark: '#000000', light: '#ffffff' };

/** A page's path, as the app's own links give it: nothing a link to a page doesn't need, such as a query or a scheme. */
const isPagePath = (path) => !/[?#\s]|:\/\//.test(path);

export const main = async (args, { root = ROOT, outDir = join(root, 'liff', 'line', 'qr'), log = console.log } = {}) => {
  const [path = '/'] = args;
  if (!isPagePath(path)) {
    log('No QR code: give a page path, like /visits or /products/weekender-50, without ?, #, :// or spaces.');
    return 1;
  }
  // The same rule as npm run mode:line. The code needs the LIFF ID only, not the channel ID or the domain.
  const { liffId, problems } = lineInputs(readEnv(join(root, 'liff', '.env')));
  const problem = problems.find((text) => text.startsWith('LINE_MODE_LIFF_ID'));
  if (problem) {
    log('No QR code. Set this in liff/.env first:');
    log(`- ${problem}`);
    return 1;
  }
  const url = lineAppUrl(liffId, path);
  log(url);
  log(await QRCode.toString(url, { type: 'terminal', small: true }));
  mkdirSync(outDir, { recursive: true });
  await QRCode.toFile(join(outDir, `${NAME}.png`), url, { type: 'png', width: 1024, margin: 4, color: BLACK_ON_WHITE });
  await QRCode.toFile(join(outDir, `${NAME}.svg`), url, { type: 'svg', margin: 4, color: BLACK_ON_WHITE });
  const where = relative(root, outDir);
  log(`Saved ${NAME}.png (1024 px) and ${NAME}.svg in ${where.startsWith('..') ? outDir : where}. They hold your LIFF ID: keep them out of git.`);
  return 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
