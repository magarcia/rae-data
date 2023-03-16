import * as url from 'node:url';
import os from 'node:os';
import {promises as fs} from 'node:fs';
import {Rae} from './Rae';
import JobQueue from './JobQueue';

type Entry = {
	word: string;
	header: string;
	id: string;
	grp: number;
};

type CompleteEntry = {
	definitions: {
		entry: number;
		type: string | undefined;
		definition: string;
		characteristics: string[];
		examples: string[];
	}[];
	word: string;
	header: string;
	id: string;
	grp: number;
};

// Define a function to read a JSONL file and extract the IDs from each line
async function readJsonlFile(filePath: string): Promise<Entry[]> {
	const data = await fs.readFile(filePath, 'utf8');

	return data
		.trim()
		.split('\n')
		.map(line => {
			const obj = JSON.parse(line) as Entry;
			return obj;
		});
}

async function getDefinitions(entries: Entry[]) {
	const rae = new Rae({
		username: process.env.RAE_USERNAME!,
		password: process.env.RAE_PASSWORD!,
	});

	const results: CompleteEntry[] = [];
	const jobQueue = new JobQueue({
		parallel: os.cpus().length,
	});

	const batchSize = 100;
	const batchCount = Math.ceil(entries.length / batchSize);

	for (let i = 0; i < batchCount; i++) {
		const batch = entries.slice(i * batchSize, (i + 1) * batchSize);
		jobQueue.add(
			...batch.map(entry => async () => {
				console.log(`Getting definitions for ${entry.word}`);
				return {
					...entry,
					definitions: await rae.get(entry.id),
				};
			}),
		);

		// eslint-disable-next-line no-await-in-loop
		await jobQueue.wait();
	}

	jobQueue.onJobFinished(() => {
		console.log('Job finished');
	});

	await jobQueue.wait();

	return results.flat();
}

function partitionEntriesByFirstLetter(entries: CompleteEntry[]) {
	const partitions: Record<string, CompleteEntry[]> = {};

	for (const entry of entries) {
		const firstLetter = entry.word.charAt(0).toUpperCase();
		if (!partitions[firstLetter]) {
			partitions[firstLetter] = [];
		}

		partitions[firstLetter]!.push(entry);
	}

	return partitions;
}

async function writeEntriesToJsonlFile(
	entries: CompleteEntry[],
	filePath: string,
) {
	const lines = entries.map(entry => JSON.stringify(entry)).join('\n');
	await fs.writeFile(filePath, lines);
}

export default async function main(jsonlFile: string) {
	const words = await readJsonlFile(jsonlFile);
	const entries = await getDefinitions(words);

	const partitions = partitionEntriesByFirstLetter(entries);

	await Promise.all(
		Object.keys(partitions).map(async letter => {
			const filePath = `${letter}.jsonl`;
			const partition = partitions[letter]!;

			await writeEntriesToJsonlFile(partition, filePath);
		}),
	);
}

if (import.meta.url.startsWith('file:')) {
	const modulePath = url.fileURLToPath(import.meta.url);
	if (process.argv[1] === modulePath) {
		// Main ESM module
		if (process.argv.length !== 3) {
			console.error('Usage: node read-jsonl-file.ts <jsonl-file>');
			process.exit(1);
		}

		await main(process.argv[2]!);
	}
}
