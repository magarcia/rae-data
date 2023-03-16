import WiktionaryScraper from 'js-wiktionary-scraper';

const api = new WiktionaryScraper('es');
var word_data = await api.fetchData('mama', 'Español');
console.log(word_data);
