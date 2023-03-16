import * as url from 'node:url';
import * as dotenv from 'dotenv';
import mainWordCrawler from './rae-word-crawler';
import mainDefinitionCrawler from './rae-definition-crawler';

dotenv.config();

if (import.meta.url.startsWith('file:')) {
	const modulePath = url.fileURLToPath(import.meta.url);
	if (process.argv[1] === modulePath) {
		// Main ESM module
		if (process.argv.length !== 3) {
			console.error('Usage: node index.js <word|definition>');
			process.exit(1);
		}

		const command = process.argv[2];
		if (command === 'word') {
			await mainWordCrawler();
		} else if (command === 'definition') {
			await mainDefinitionCrawler();
		} else {
			console.error('Invalid command:', command);
			console.error('Usage: node index.js <word|definition>');
			process.exit(1);
		}
	}
}
