const fs = require("fs");

const files = fs.readdirSync("./data");

let words = [];
for (const file of files) {
  words = [
    ...words,
    ...fs
      .readFileSync(`./data/${file}`)
      .toString()
      .split("\n")
      .filter((x) => !!x.trim())
      .map((x) => JSON.parse(x).word),
  ];
}

console.log("new", words.length);
console.log(
  "old",
  JSON.parse(fs.readFileSync("./allWords.json").toString()).length
);
fs.writeFileSync("./allWords2.json", JSON.stringify(words));
