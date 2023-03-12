/* eslint-disable no-await-in-loop */
// import * as url from 'node:url';
import {Rae} from '../Rae';
import {ALPHABET_ARRAY} from '../constants';
import {type Result} from '.';

export async function prefixCrawler(
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

const rae = new Rae({
	username: process.env.RAE_USERNAME!,
	password: process.env.RAE_PASSWORD!,
});
const letter = process.argv.slice(2)[0];

if (!letter) {
	throw new Error('Missing letter');
}

const results = await prefixCrawler(letter, rae, new Set(), {
	onWordFound(result: Result) {
		if (process.send) {
			process.send(JSON.stringify({type: 'onWordFound', payload: result}));
		}

		console.log(result);
	},
});

process.send?.(JSON.stringify({type: 'return', payload: results}));
