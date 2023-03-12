/* eslint-disable no-await-in-loop */
import * as url from 'node:url';
import {fork} from 'node:child_process';
import JobQueue, {type Job} from '../JobQueue';
import {ALPHABET_ARRAY} from '../constants';
import {type Result} from '.';

async function prefixCrawler(
	letter: string,
	{onWordFound}: {onWordFound?: (results: Result) => void} = {},
) {
	return new Promise<Result[]>(resolve => {
		const href = new URL('./prefix-crawler.js', import.meta.url).href.replace(
			'file://',
			'',
		);

		const child = fork(href, [letter], {
			stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
		});

		child.stderr?.on('data', data => {
			if (!data?.toString()?.includes('ExperimentalWarning')) {
				console.error('>>>', data.toString());
			}
		});

		const results: Result[] = [];

		child.on('message', message => {
			const {type, payload: result} = JSON.parse(message.toString()) as {
				type: string;
				payload: Result;
			};

			switch (type) {
				case 'onWordFound':
					results.push(result);
					onWordFound?.(result);
					break;
				case 'return':
					resolve(results);
					break;
				default:
					throw new Error(`Unknown message type: ${type}`);
			}
		});

		child.on('exit', code => {
			if (code !== 0) {
				throw new Error(`Child process exited with code ${code ?? 'null'}`);
			}

			resolve(results);
		});
	});
}

export async function crawler({
	parallel,
	onWordFound,
	onJobStart,
	onJobFinish,
	onJobScheduled,
	onFinish,
}: {
	parallel?: number;
	onWordFound?: (letter: string, result: Result) => void;
	onJobStart?: (letter: string) => void;
	onJobFinish?: (letter: string, results: Result[]) => void;
	onJobScheduled?: (letter: string) => void;
	onFinish?: (results: Result[]) => void;
} = {}) {
	const results: Result[] = [];
	const jobQueue = new JobQueue({parallel});

	const jobs: Job[] = [];
	for (const letter of ALPHABET_ARRAY) {
		onJobScheduled?.(letter);
		jobs.push(async () => {
			onJobStart?.(letter);
			return [
				letter,
				await prefixCrawler(letter, {
					onWordFound: onWordFound?.bind(null, letter),
				}),
			];
		});
	}

	jobQueue.onJobFinished(async ([letter, results]: [string, Result[]]) => {
		results.push(...results);
		onJobFinish?.(letter, results);
	});

	jobQueue.add(...jobs);

	await jobQueue.wait();
	onFinish?.(results);
	return results;
}

if (import.meta.url.startsWith('file:')) {
	const modulePath = url.fileURLToPath(import.meta.url);
	if (process.argv[1] === modulePath) {
		// Main ESM module
		await crawler({
			parallel: 1,
			onWordFound(letter, result) {
				console.log('wordfound', letter, result);
			},
			onJobStart(letter) {
				console.log('Starting', letter);
			},
			onJobFinish(letter, results) {
				console.log('Finished', letter, results.length);
			},
			onJobScheduled(letter) {
				console.log('Scheduled', letter);
			},
		});
	}
}
