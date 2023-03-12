/* eslint-disable no-await-in-loop */
import * as url from 'node:url';
import path from 'node:path';
import {promises as fs, createWriteStream} from 'node:fs';
import {Listr} from 'listr2';
import JobQueue, {type Job} from './JobQueue';
import {Rae} from './Rae';
import {sort} from './utils';
import {ALPHABET_ARRAY} from './constants';

type Result = {
	word: string;
	header: string;
	id: string;
	grp: number;
};

async function prefixCrawler(
	prefix: string,
	rae: Rae,
	processed: Set<string>,
	{onWordFound}: {onWordFound?: (results: Result) => void} = {},
): Promise<Result[]> {
	const foundWords: Result[] = [];
	for (const letter of ALPHABET_ARRAY) {
		const query = prefix + letter;
		const keys = await rae.keys(query);
		const words = await Promise.all(
			keys
				.filter(word => !processed.has(word))
				.map(async word => {
					const results = await rae.search(word, Rae.MODE.PREFIX);
					processed.add(word);
					const result = {
						word,
						...results[0]!,
					};
					onWordFound?.(result);
					return result;
				}),
		);
		if (keys.length >= 10) {
			words.push(
				...(await prefixCrawler(query, rae, processed, {onWordFound})),
			);
		}

		foundWords.push(...words);
	}

	return foundWords;
}

async function crawler(
	rae: Rae,
	{
		parallel = 10,
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
	},
) {
	const results: Result[] = [];
	const jobQueue = new JobQueue({parallel});

	const processed = new Set<string>();

	const jobs: Job[] = [];
	for (const letter of ALPHABET_ARRAY) {
		onJobScheduled?.(letter);
		jobs.push(async () => {
			onJobStart?.(letter);
			return [
				letter,
				await prefixCrawler(letter, rae, processed, {
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

function toJsonl(results: Result[]): string {
	return sort(
		Array.from(
			new Map(Array.from(results).map(item => [item.word, item])).values(),
		),
	)
		.map(x => JSON.stringify(x))
		.join('\n');
}

function toTxt(results: Result[]): string {
	return sort(
		Array.from(new Set(Array.from(results).map(item => item.word))),
	).join('\n');
}

type JobStats = {
	found: number;
	results: Result[];
	finished: boolean;
	started: boolean;
};

export default async function main(outputFolder = 'data') {
	const {argv} = process;
	const isVerbose = argv.includes('--verbose') || argv.includes('-v');

	const rawFile = path.join(outputFolder, 'raw.jsonl');
	const resultsFile = path.join(outputFolder, 'results.jsonl');
	const allWords = path.join(outputFolder, 'all.txt');
	const lettersFolder = path.join(outputFolder, 'letters');

	const wordTasks = new Listr([], {concurrent: true});

	// Ensure output folder exists
	await fs.mkdir(path.join(outputFolder, 'letters'), {recursive: true});

	// Create empty raw file, and clear it if it already exists
	await fs.writeFile(rawFile, '');
	const writer = createWriteStream(rawFile, {
		flags: 'a',
		encoding: 'utf8',
		mode: 0o666,
	});

	const jobStats = new Map<string, JobStats>();

	const onWordFound = (letter: string, result: Result) => {
		const stats = jobStats.get(letter);
		if (stats) {
			stats.results.push(result);
			stats.found++;
		}

		writer.write(`${JSON.stringify(result)}\n`);
	};

	const onJobFinish = async (letter: string, results: Result[]) => {
		const stats = jobStats.get(letter);
		if (stats) {
			stats.finished = true;
			stats.found = results.length;
			stats.results = results;
		}

		if (results.length > 0) {
			const filename = path.join(lettersFolder, letter);
			await Promise.all([
				fs.writeFile(`${filename}.jsonl`, toJsonl(results)),
				fs.writeFile(`${filename}.txt`, toTxt(results)),
			]);
		}
	};

	const onJobScheduled = (letter: string) => {
		jobStats.set(letter, {
			found: 0,
			results: [],
			finished: false,
			started: false,
		});
		wordTasks.add({
			title: `Scheduled job for ${letter}`,
			async task(_, task) {
				await new Promise(resolve => {
					const interval = setInterval(() => {
						const stats = jobStats.get(letter);
						if (stats) {
							if (stats.started) {
								task.title = `Started job for ${letter}`;
							}

							if (stats.found > 0) {
								task.title = `Words found for ${letter}: ${stats.found ?? 0}`;
							}

							if (stats.finished) {
								task.title = `Finished job for ${letter}: ${stats.found ?? 0}`;
								clearInterval(interval);
								resolve(stats.results);
							}
						}
					}, 100);
				});
			},
		});
	};

	const onJobStart = (letter: string) => {
		const stats = jobStats.get(letter);
		if (stats) {
			stats.started = true;
		}
	};

	const rae = new Rae({
		username: process.env.RAE_USERNAME!,
		password: process.env.RAE_PASSWORD!,
	});

	const crawling = crawler(rae, {
		onWordFound,
		onJobFinish,
		onJobStart,
		onJobScheduled,
	});

	const tasks = new Listr(
		[
			{
				title: 'Crawling words',
				task(ctx, task): Listr | Promise<void> {
					crawling
						.then(([results]) => {
							ctx.results = results;
						})
						.catch(error => {
							ctx.skip = true;
							throw error as Error;
						});

					if (isVerbose) {
						return wordTasks;
					}

					return new Promise(resolve => {
						const interval = setInterval(() => {
							const stats = Array.from(jobStats.values());
							const total = stats.reduce((acc, curr) => acc + curr.found, 0);
							const finished = stats.filter(x => x.finished).length;
							const totalJobs = stats.length;

							task.title = `Crawling words: ${total} (${finished}/${totalJobs})`;

							if (finished === totalJobs) {
								clearInterval(interval);
								task.title = `Words found: ${total} (${finished}/${totalJobs})`;
								resolve();
							}
						}, 100);
					});
				},
			},
			{
				title: 'Writing results',
				async task(ctx, task) {
					if (ctx.skip) {
						task.skip('Crawling failed');
						return;
					}

					await Promise.all([
						fs.writeFile(resultsFile, toJsonl(ctx.results as Result[])),
						fs.writeFile(allWords, toTxt(ctx.results as Result[])),
					]);
				},
			},
		],
		{concurrent: false},
	);

	await tasks.run();
}

if (import.meta.url.startsWith('file:')) {
	const modulePath = url.fileURLToPath(import.meta.url);
	if (process.argv[1] === modulePath) {
		// Main ESM module
		await main();
	}
}
