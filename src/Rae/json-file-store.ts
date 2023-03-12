import {promisify} from 'util';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import _debug from 'debug';

const debug = _debug('json-file-store');

type ExternalBuffer = {
	index: number;
	buffer: Buffer;
};

export async function write<T>(
	path: string,
	data: T,
	options: {zip?: boolean} = {},
): Promise<void> {
	debug('Writing file', path);
	const externalBuffers: ExternalBuffer[] = [];

	let dataString: string | Buffer = JSON.stringify(data, (_, value) => {
		if (value?.type === 'Buffer' && value.data?.length >= 1024) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const buffer = Buffer.from(value.data);
			externalBuffers.push({
				index: externalBuffers.length,
				buffer,
			});
			return {
				type: 'ExternalBuffer',
				index: externalBuffers.length - 1,
				size: buffer.length,
			};
		}

		if (value === Infinity || value === -Infinity) {
			return {type: 'Infinity', sign: Math.sign(value as number)};
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return value;
	});

	let zipExtension = '';
	if (options.zip) {
		zipExtension = '.gz';
		dataString = await promisify(zlib.deflate)(dataString);
	}

	await fs.writeFile(path + '.json' + zipExtension, dataString, 'utf8');

	await Promise.all(
		externalBuffers.map(async externalBuffer => {
			let {buffer} = externalBuffer;
			if (options.zip) {
				buffer = await promisify(zlib.deflate)(buffer);
			}

			await fs.writeFile(
				`${path}-${externalBuffer.index}.bin${zipExtension}`,
				buffer,
				'utf8',
			);
		}),
	);
}

type ReadOptions = {
	zip?: boolean;
};

export async function read<T>(
	path: string,
	options: ReadOptions = {},
): Promise<T> {
	debug(`Reading ${path} (zip: ${options.zip?.toString() ?? 'false'})`);
	let zipExtension = '';
	if (options.zip) {
		zipExtension = '.gz';
	}

	let dataString: string;
	if (options.zip) {
		const compressedData = await fs.readFile(`${path}`);
		dataString = (await promisify(zlib.unzip)(compressedData)).toString();
	} else {
		dataString = await fs.readFile(`${path}.json${zipExtension}`, 'utf8');
	}

	const externalBuffers: ExternalBuffer[] = [];
	const data: T = JSON.parse(dataString, (_, value) => {
		if (value?.type === 'Buffer' && value?.data) {
			return Buffer.from(
				value.data as WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>,
			);
		}

		if (
			value?.type === 'ExternalBuffer' &&
			typeof value.index === 'number' &&
			typeof value.size === 'number'
		) {
			const buffer = Buffer.alloc(value.size as number);
			externalBuffers.push({
				index: Number(value.index),
				buffer,
			});
			return buffer;
		}

		if (value?.type === 'Infinity' && typeof value.sign === 'number') {
			return Infinity * value.sign;
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return value;
	}) as T;

	await Promise.all(
		externalBuffers.map(async externalBuffer => {
			if (options.zip) {
				const bufferCompressed = await fs.readFile(
					`${path}-${externalBuffer.index}.bin${zipExtension}`,
				);
				const buffer = await promisify(zlib.unzip)(bufferCompressed);
				buffer.copy(externalBuffer.buffer);
			} else {
				const fd = await fs.open(
					`${path}-${externalBuffer.index}.bin${zipExtension}`,
					'r',
				);
				await fd.read(
					externalBuffer.buffer,
					0,
					externalBuffer.buffer.length,
					0,
				);
				await fd.close();
			}
		}),
	);

	return data;
}

type DeleteOptions = {
	zip?: boolean;
};

export async function deleteFile(
	path: string,
	options: DeleteOptions = {},
): Promise<void> {
	let zipExtension = '';
	if (options.zip) {
		zipExtension = '.gz';
	}

	await fs.unlink(`${path}.json${zipExtension}`);

	const promises = [];
	for (let i = 0; i < Infinity; i++) {
		promises.push(fs.unlink(`${path}-${i}.bin${zipExtension}`));
	}

	try {
		await Promise.all(promises);
	} catch (err: any) {
		if (err.code === 'ENOENT') {
			// Every binary is deleted, we are done
		} else {
			throw err as Error;
		}
	}

	debug(
		`Files deleted: ${path}.json${zipExtension} ${path}-*.bin${zipExtension}`,
	);
}

export default {
	write,
	read,
	delete: deleteFile,
};
