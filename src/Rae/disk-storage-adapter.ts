import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import lockFile from 'proper-lockfile';
import _debug from 'debug';

import jsonFileStore from './json-file-store';

const debug = _debug('cache');

type DiskStoreOptions = {
	path: string;
	ttl: number;
	maxsize: number;
	subdirs: boolean;
	zip: boolean;
	lockFileOptions: {
		wait: number;
		pollPeriod: number;
		stale: number;
		retries: number;
		retryWait: number;
	};
};

type CacheEntry<T> = {
	expireTime: number;
	key: string;
	val: T;
};

export default class DiskStorageAdapter<V> {
	options: DiskStoreOptions;

	constructor(options: Partial<Omit<DiskStoreOptions, 'lockFile'>> = {}) {
		debug('Creating new DiskStorageAdapter with options %O', options);
		this.options = {
			...options,
			path: options.path ?? './cache' /* path for cached files  */,
			ttl: options.ttl ?? 60 * 60 /* time before expiring in seconds */,
			maxsize: options.maxsize ?? Infinity /* max size in bytes on disk */,
			subdirs: options.subdirs ?? true,
			zip: options.zip ?? false,
			lockFileOptions: {
				// Check lock at 0ms 50ms 100ms ... 400ms 1400ms 1450ms... up to 10 seconds, after that just assume the lock is staled
				wait: 400,
				pollPeriod: 50,
				stale: 10 * 1000,
				retries: 10,
				retryWait: 600,
			},
		};

		fs.stat(this.options.path).catch(async () => {
			await fs.mkdir(this.options.path, {recursive: true});
		});
	}

	async get(key: string): Promise<V | undefined> {
		const data = await this.readFile(key);
		if (data) {
			debug.extend('get')('Cache hit for key %s', key);
			return data.val;
		}

		debug.extend('get')('Cache miss for key %s', key);
		return undefined;
	}

	async delete(key: string): Promise<boolean> {
		const filePath = this.getFilePathByKey(key);
		if (this.options.subdirs) {
			// Check if the folder exists to fail faster
			const dir = path.dirname(filePath);
			await fs.access(dir, fs.constants.W_OK);
		}

		const unlock = await this.lock(filePath);
		try {
			await jsonFileStore.delete(filePath, this.options);
			debug.extend('delete')('Deleted key %s', key);
		} catch (err: any) {
			// Ignore deleting non existing keys
			if (err.code === 'ENOENT') {
				return false;
			}

			if (err.code === 'ELOCKED') {
				err.file = filePath;
			}

			throw err as Error;
		} finally {
			await unlock();
		}

		return true;
	}

	async has(key: string): Promise<boolean> {
		return (await this.get(key)) !== undefined;
	}

	async set(key: string, val: V, ttl?: number): Promise<void> {
		debug.extend('set')('Setting key %s', key);
		const filePath = this.getFilePathByKey(key);

		const _ttl = (ttl ?? this.options.ttl) * 1000;
		const data = {
			expireTime: Date.now() + _ttl,
			key,
			val,
		};

		await this.ensureDirExists(path.dirname(filePath));

		const unlock = await this.lock(filePath);
		try {
			await jsonFileStore.write(filePath, data, this.options);
			debug.extend('set')('Wrote key %s', key);
		} catch (err: any) {
			if (err.code === 'ELOCKED') {
				err.file = filePath;
			}

			throw err as Error;
		} finally {
			await unlock();
		}
	}

	async clear(): Promise<void> {
		debug.extend('clear')('Clearing cache');
		return this.deletePath(this.options.path, 2);
	}

	private async deletePath(fileOrDir: string, maxDeep: number) {
		if (maxDeep < 0) {
			return;
		}

		const stats = await fs.stat(fileOrDir);
		if (stats.isDirectory()) {
			const files = await fs.readdir(fileOrDir);

			await Promise.all(
				files.map(async file => {
					await this.deletePath(path.join(fileOrDir, file), maxDeep - 1);
				}),
			);
		} else if (
			stats.isFile() &&
			/[/\\]diskstore-[0-9a-fA-F/\\]+(\.json|-\d\.bin)/.test(fileOrDir)
		) {
			// Delete the file if it is a diskstore file
			await fs.unlink(fileOrDir);
		}
	}

	private getFilePathByKey(key: string): string {
		const hash = crypto.createHash('md5').update(key).digest('hex');
		if (this.options.subdirs) {
			// Create subdirs with the first 3 chars of the hash
			return path.join(
				this.options.path,
				`diskstore-${hash.substring(0, 3)}`,
				hash.substring(3),
			);
		}

		return path.join(this.options.path, `diskstore-${hash}`);
	}

	private async ensureDirExists(dir: string): Promise<void> {
		try {
			await fs.access(dir, fs.constants.W_OK);
		} catch (err: any) {
			fs.mkdir(dir, {recursive: true}).catch(err => {
				if (err.code !== 'EEXIST') {
					// eslint-disable-next-line @typescript-eslint/no-throw-literal
					throw err;
				}
			});
		}
	}

	private async lock(filePath: string) {
		let zipExtension = '';
		if (this.options.zip) {
			zipExtension = '.gz';
		}

		const lockFilePath = `${filePath}.json${zipExtension}`;
		try {
			return await lockFile.lock(lockFilePath, this.options.lockFileOptions);
		} catch (err: any) {
			if (err.code === 'ENOENT') {
				return async () => Promise.resolve();
			}

			throw err as Error;
		}
	}

	private async readFile(key: string): Promise<CacheEntry<V> | undefined> {
		const filePath = this.getFilePathByKey(key);
		try {
			const data: CacheEntry<V> = (await jsonFileStore
				.read(filePath, this.options)
				.catch(async err => {
					if (err.code === 'ENOENT') {
						throw err as Error;
					}

					// Maybe the file is currently written to, lets lock it and read again
					const unlock = await this.lock(filePath);
					try {
						return await jsonFileStore.read(filePath, this.options);
					} catch (err: any) {
						if (err.code === 'ELOCKED') {
							throw err as Error;
						}

						throw err as Error;
					} finally {
						await unlock();
					}
				})) as CacheEntry<V>;
			if (data.expireTime <= Date.now()) {
				// Cache expired
				this.delete(key).catch(() => 0 /* ignore */);
				return undefined;
			}

			if (data.key !== key) {
				// Hash collision
				return undefined;
			}

			return data;
		} catch (err: any) {
			// File does not exist lets return a cache miss
			if (err.code === 'ENOENT') {
				return undefined;
			}

			throw err as Error;
		}
	}
}
