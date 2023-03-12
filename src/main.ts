import * as url from 'node:url';

import JobQueue, {type Job} from './JobQueue';

async function performWork(number: number): Promise<number> {
	const waitTime = Math.floor(Math.random() * 1000); // Wait time in milliseconds
	return new Promise(resolve => {
		setTimeout(() => {
			resolve(number);
		}, waitTime);
	});
}

async function main() {
	const jobQueue = new JobQueue({parallel: 3});

	const jobs: Job[] = [];
	for (let i = 0; i < 10; i++) {
		jobs.push(async () => performWork(i));
	}

	jobQueue.onJobFinished(result => {
		console.log('Job result:', result);
	});

	for (const job of jobs) {
		jobQueue.add(job);
	}

	await jobQueue.wait();
}

if (import.meta.url.startsWith('file:')) {
	const modulePath = url.fileURLToPath(import.meta.url);
	if (process.argv[1] === modulePath) {
		// Main ESM module
		await main();
	}
}
