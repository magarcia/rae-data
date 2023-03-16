import process from 'node:process';
import url from 'node:url';
import got, {type RequestError, type Got} from 'got';
import {load} from 'cheerio';
import _debug from 'debug';
import Keyv from 'keyv';
import DiskStorageAdapter from './disk-storage-adapter';

const debug = _debug('rae');
const debugGot = _debug('got');

type ModeKeys = keyof typeof Rae.MODE;
type ModeValues = (typeof Rae.MODE)[ModeKeys];

export default class Rae {
	/* eslint-disable @typescript-eslint/naming-convention */
	static readonly MODE = {
		PREFIX: 31,
		SUFFIX: 32,
		INFIX: 33,
	} as const;
	/* eslint-enable @typescript-eslint/naming-convention */

	private readonly client: Got;

	constructor({username, password}: {username: string; password: string}) {
		const options = {
			// For HTTPS: 'https://193.145.222.40/data',
			prefixUrl: 'http://193.145.222.39/data',
			headers: this.buildHeaders(username, password),
			cache: this.createCache(),
			hooks: this.createGotHooks(),
		};

		this.client = got.extend(options);
	}

	async keys(query: string): Promise<string[]> {
		debug('Fetching keys for %s', query);
		const params = {q: query, callback: 'jsonp123'};
		const response = await this.request('keys', params);
		const result = JSON.parse(response.body.slice(9, -1)) as string[];
		if (result.length > 0) {
			debug('Found %d keys for %s', result.length, query);
		}

		return result;
	}

	async get(id: string) {
		debug('Fetching definition for %s', id);
		const response = await this.request('fetch', {id});

		return this.parseDefinitions(response.body);
	}

	async search(query: string, mode: ModeValues = Rae.MODE.PREFIX) {
		debug('Searching for %s in mode %d', query, mode);
		const params = {w: query, m: mode, t: 200};
		const response = await this.request('search', params);
		const results = JSON.parse(response.body).res as unknown as Array<{
			header: string;
			id: string;
			grp: number;
		}>;

		return results;
	}

	private async request(
		endpoint: string,
		searchParams: Record<string, string | number> | undefined,
	) {
		return this.client(endpoint, {searchParams});
	}

	private parseDefinitions(html: string) {
		const definitions = [];
		const $ = load(html);
		for (const _el of $('[class^="j"]').toArray()) {
			const el = $(_el);

			// Extract entry number
			const entry = parseInt(el.find('.n_acep').text()?.trim(), 10);
			el.find('.n_acep').remove();

			// Extract type
			const type = el.find('abbr').first().attr('title')?.trim();
			el.find('abbr').first().remove();

			// Extract examples
			const examples = el
				.find('.h')
				.toArray()
				.map(x => {
					const content = $(x).text().trim();
					$(x).remove();
					return content;
				});

			// Extract characteristics and replace abbreviations
			const characteristics: string[] = [];
			Array.from(el.find('abbr')).forEach(x => {
				switch ($(x).text()) {
					case 'desus.':
						characteristics.push('desuso');
						$(x).remove();
						break;
					case 'U.':
						break;
					default:
						$(x).text(x.attribs.title!.trim());
						break;
				}
			});

			const definition = el.text().trim();

			definitions.push({entry, type, definition, characteristics, examples});
		}

		return definitions;
	}

	private createCache() {
		const store = new DiskStorageAdapter<string>({
			path: '.cache',
			subdirs: true,
			ttl: 1000 * 60 * 60 * 24 * 7, // 1 week
		});
		const keyv = new Keyv({store});
		keyv.setMaxListeners(1000);

		return keyv;
	}

	private buildHeaders(username: string, password: string) {
		const token = Buffer.from(`${username}:${password}`).toString('base64');

		return {
			'User-Agent': 'Diccionario/2 CFNetwork/808.2.16 Darwin/16.3.0',
			'Content-Type': 'application/x-www-form-urlencoded',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'Authorization': `Basic ${token}`,
		};
	}

	private createGotHooks(): Record<string, unknown> {
		return {
			beforeRequest: [
				(options: {url: {href: string}}) => {
					debugGot(`Request URL: ${options.url.href}`);
				},
			],
			beforeRetry: [
				(error: RequestError, retryCount: number) => {
					debugGot(
						`Retrying [${retryCount}] ${error.options.url?.toString() ?? ''}: ${
							error.code
						}`,
					);
				},
			],
			afterResponse: [
				(response: Response) => {
					debugGot(`Response URL: ${response.url}`);
					return response;
				},
			],
			beforeError: [
				(error: RequestError) => {
					debugGot(`Error: ${error.code}`);
					console.trace();
					return error;
				},
			],
		};
	}
}

if (import.meta.url.startsWith('file:')) {
	const modulePath = url.fileURLToPath(import.meta.url);
	if (process.argv[1] === modulePath) {
		// Main ESM module
		const rae = new Rae({
			username: process.env.RAE_USERNAME!,
			password: process.env.RAE_PASSWORD!,
		});
		console.log('Keys: ', await rae.keys('hola'));
		console.log('Search: ', await rae.search('holandes', Rae.MODE.PREFIX));
		console.log('Get: ', await rae.get('KYwyn6b'));
	}
}
