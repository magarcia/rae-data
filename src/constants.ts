/* eslint-disable @typescript-eslint/naming-convention */
export const ALPHABET = 'aábcdeéèëêfghiíïîjklmnñoópqrstuúüvwxyz-' as const;
export const SIMPLIFIED_ALPHABET = 'abcdefghijklmnñopqrstuvwxyz-' as const;
export const ALPHABET_ARRAY = SIMPLIFIED_ALPHABET.split(
	'',
) as readonly string[];
