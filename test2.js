const fs = require("fs");

const oAllWords = fs.readFileSync("./all-words.txt").toString().split("\n");
const allWords = JSON.parse(fs.readFileSync("./allWords.json").toString());

let inOldWords = oAllWords
  .filter((x) => !allWords.includes(x))
  .filter((x) => !!x.trim())
  .filter((x) => !x.includes("-"))
  .filter((x) => isLetter(normalizeString(x.charAt(0))));
// let inNewWords = allWords.filter((x) => !oAllWords.includes(x)).length;
// let missingTotal = oAllWords
//   .filter((x) => !allWords.includes(x))
//   .concat(allWords.filter((x) => !oAllWords.includes(x))).length;

// console.log({
//   inOldWords,
//   inNewWords,
//   missingTotal,
// });
function isLetter(str) {
  return str.length === 1 && str.match(/[a-z]/i);
}

fs.writeFileSync(
  "./allWords.json",
  JSON.stringify(allWords.concat(inOldWords).sort(), null, 2)
);

function normalizeString(word) {
  return word
    .toLowerCase()
    .replace(/[àá]/g, "a")
    .replace(/[èé]/g, "e")
    .replace(/[ïíì]/g, "i")
    .replace(/[öòó]/g, "o")
    .replace(/[üùú]/g, "u")
    .replace(/-/g, "");
}
