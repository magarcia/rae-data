import process from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function combineFiles(
	inputDir: string,
	output: string,
	jsonlExtension = '.jsonl',
	txtExtension = '.txt',
) {
	const jsonlOutputFile = `${output}${jsonlExtension}`;
	const txtOutputFile = `${output}${txtExtension}`;

	// Get all the JSONL files in the directory
	const jsonlFiles = fs
		.readdirSync(inputDir)
		.filter(filename => path.extname(filename) === jsonlExtension);

	// Open a new file to write all the JSONL data to
	const jsonlOutputPath = path.join(path.dirname(inputDir), jsonlOutputFile);
	fs.writeFileSync(jsonlOutputPath, '');

	// Loop through all the JSONL files and append their contents to the output file
	for (const file of jsonlFiles) {
		const filePath = path.join(inputDir, file);
		const data = fs.readFileSync(filePath, 'utf8');
		fs.appendFileSync(jsonlOutputPath, data);
	}

	// Get all the TXT files in the directory
	const txtFiles = fs
		.readdirSync(inputDir)
		.filter(filename => path.extname(filename) === txtExtension);

	// Open a new file to write all the TXT data to
	const txtOutputPath = path.join(path.dirname(inputDir), txtOutputFile);
	fs.writeFileSync(txtOutputPath, '');

	// Loop through all the TXT files and append their contents to the output file
	for (const file of txtFiles) {
		const filePath = path.join(inputDir, file);
		const data = fs.readFileSync(filePath, 'utf8');
		fs.appendFileSync(txtOutputPath, data);
	}
}

function main() {
	const args = process.argv.slice(2);
	if (args.length < 2) {
		console.log(
			'Usage: node combine-files.js <input directory> <output file name>',
		);
		return;
	}

	const inputDir = args[0]!;
	const fileName = args[1]!;

	combineFiles(inputDir, fileName);
}

main();
