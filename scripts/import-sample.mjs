import { readFile } from 'node:fs/promises';
import { createSolrClient, readSolrConfig } from './solr-client.mjs';

const config = readSolrConfig();
const request = createSolrClient(config);
try {
  const records = JSON.parse(await readFile(new URL('../samples/sample.json', import.meta.url), 'utf8'));
  await request(`${encodeURIComponent(config.collection)}/update`, {
    query: { commit: 'true' }, body: records,
  });
  console.log(`Imported ${records.length} synthetic fixtures. Repeating this command updates the same IDs.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
