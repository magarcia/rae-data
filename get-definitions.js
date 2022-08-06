const { chromium } = require("@playwright/test");
const fs = require("fs");
const os = require("os");

const words = JSON.parse(fs.readFileSync("./allWords.json").toString()).sort();

const total = words.length;
let count = 0;

function sleep(time = 1000, upperTime = 3000) {
  return new Promise((resolve) => {
    setTimeout(resolve, randomIntFromInterval(time, upperTime));
  });
}

async function gatherDefs(words) {
  const browser = await chromium.launch({ headless: true, slowMo: 100 });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36",
    locale: "es-ES",
  });
  const page = await context.newPage();
  const definitions = {};

  let def;
  for (const word of words) {
    try {
      count += 1;
      process.stdout.write("\r\x1b[K");
      process.stdout.write(`Processing: ${count}/${total}`);
      const [_, request] = await Promise.all([
        page.waitForLoadState("networkidle"),
        page.goto(`https://dle.rae.es/${word}?m=form`),
      ]);
      if (request._initializer.status != 200) {
        fs.appendFileSync(
          "./error.log",
          `Error loading word ${word}: https://dle.rae.es/${word}?m=form => HTTP${request._initializer.status}\n`
        );
        continue;
      }
      delete request;
      // Expect a title "to contain" a substring.
      def = await page.evaluate(() => {
        const definitionEntries = Array.from(
          document.querySelectorAll("article p")
        ).filter((x) => x.className.startsWith("j"));
        const result = [];
        for (const entry of definitionEntries) {
          let started = false;
          const wordEntry = {
            number: 0,
            attributes: [],
            definition: "",
            examples: [],
          };
          for (const node of entry.childNodes) {
            if (node.nodeName === "SPAN" && node.className === "n_acep") {
              wordEntry.number = parseInt(node.textContent?.trim() ?? "0", 10);
            } else if (
              (node.nodeName === "ABBR" &&
                ["d", "g", "c"].includes(node.className) &&
                !started) ||
              node.title?.toLowerCase().startsWith("usado también")
            ) {
              wordEntry.attributes.push(node.title.trim());
            } else if (node.nodeName === "SPAN" && node.className === "h") {
              wordEntry.examples.push(node.textContent.trim());
            } else if (started || (!started && node.textContent.trim())) {
              started = true;
              wordEntry.definition += node.textContent;
            }
          }
          wordEntry.definition = wordEntry.definition.trim();
          result.push(wordEntry);
        }
        return result;
      });
    } catch (e) {
      fs.appendFileSync(
        "./error.log",
        `Error loading word ${word}: ${e.message}\n`
      );
      continue;
    }

    // create a locator
    // definitions[word] = def;
    // fs.writeFileSync(
    //   `./data/${normalizeString(
    //     word.charAt(0).toLowerCase()
    //   ).toUpperCase()}.json`,
    //   JSON.stringify(definitions, null, 2)
    // );
    for (const x of def) {
      fs.appendFileSync(
        `./data/${normalizeString(
          word.charAt(0).toLowerCase()
        ).toUpperCase()}.jsonl`,
        JSON.stringify({ ...x, word }) + "\n"
      );
    }
    await sleep();
  }
  browser.close();
}

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

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function splitByStartingInitialLetter(words) {
  return Object.values(
    words.reduce((acc, word) => {
      const char = normalizeString(word.charAt(0).toLowerCase());
      if (!acc.hasOwnProperty(char)) {
        acc[char] = [];
      }
      acc[char].push(word);
      return acc;
    }, {})
  );
}

async function main() {
  const partitions = splitByStartingInitialLetter(words);
  let parts = [];

  for (const part of partitions) {
    const char = normalizeString(part[0].charAt(0).toLowerCase());
    const filename = `./data/${char.toUpperCase()}.jsonl`;
    if (!fs.existsSync(filename)) {
      parts.push(part);
      continue;
    }
    const words = fs
      .readFileSync(filename)
      .toString()
      .split("\n")
      .filter((x) => !!x.trim())
      .map((x) => JSON.parse(x).word);
    const index = part.findIndex((x) => x === words[words.length - 1]);
    parts.push(part.slice(index + 1));
    count += index;
  }

  parts = parts.filter((x) => !!x.length);
  if (parts.length < 5) {
    const fparts = parts.flat();
    parts = [];
    const chunkSize = Math.ceil(fparts.length / os.cpus().length);
    for (let i = 0; i < fparts.length; i += chunkSize) {
      const chunk = fparts.slice(i, i + chunkSize);
      // do whatever
      parts.push(chunk);
    }
  }
  let counter = 0;
  await Promise.all(
    parts.map(async (words) => {
      console.log(`Launching browser ${++counter}`);
      await gatherDefs(words);
    })
  );
}

main();
