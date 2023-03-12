import * as url from 'node:url';
import * as dotenv from 'dotenv';
import main from './rae-crawler';

dotenv.config();

if (import.meta.url.startsWith('file:')) {
	const modulePath = url.fileURLToPath(import.meta.url);
	if (process.argv[1] === modulePath) {
		// Main ESM module
		await main();
	}
}
