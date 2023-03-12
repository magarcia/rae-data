import {ALPHABET} from './constants';

export function spanishCompare(a: string, b: string) {
	const indexA = ALPHABET.indexOf(a[0]!);
	const indexB = ALPHABET.indexOf(b[0]!);
	return indexA === indexB ? a.localeCompare(b) : indexA - indexB;
}

/**
 * Sorts an array in place, using the Spanish alphabet for string. This method
 * mutates the array and returns a reference to the same array.
 * @param list - List to sort
 * @returns {T[]}
 */
export function sort<T>(list: T[]): T[] | string[] {
	if (typeof list[0] === 'string') {
		return (list as unknown[] as string[]).sort(spanishCompare);
	}

	// eslint-disable-next-line @typescript-eslint/require-array-sort-compare
	return list.sort();
}
