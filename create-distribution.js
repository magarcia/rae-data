const fs = require("fs");
const path = require("path");
const prettier = require("prettier");

const outputDir = path.join(__dirname, "dist");
const dataDir = path.join(__dirname, "data");

const filenames = fs
  .readdirSync(dataDir)
  .filter((filename) => filename.endsWith(".jsonl"));

const rawData = filenames.map((filename) => [
  filename.split(".")[0],
  loadJsonl(path.join(dataDir, filename)),
]);

for (const [letter, data] of rawData) {
  const entries = data.reduce((acc, { word, ...rest }) => {
    if (!acc.hasOwnProperty(word)) {
      acc[word] = [];
    }
    acc[word].push(rest);
    return acc;
  }, {});
  fs.writeFileSync(
    path.join(outputDir, `${letter}.json`),
    prettier.format(JSON.stringify(entries), { parser: "json" })
  );
}

function loadJsonl(filepath) {
  return fs
    .readFileSync(filepath)
    .toString()
    .split("\n")
    .filter((x) => !!x.trim())
    .map((entry) => JSON.parse(entry));
}
