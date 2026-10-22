import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createSolrClient, isMain, readSolrConfig } from './solr-client.mjs';

export async function bootstrap({ config = readSolrConfig(), request = createSolrClient(config), pause = delay, log = console.log } = {}) {
  const fields = JSON.parse(await readFile(new URL('../solr/fields.json', import.meta.url), 'utf8'));
  const fieldTypes = JSON.parse(await readFile(new URL('../solr/field-types.json', import.meta.url), 'utf8'));
  const configName = `${config.collection}.AUTOCREATED`;
  let status;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      status = await request('admin/collections', { query: { action: 'CLUSTERSTATUS' } });
      if (!status.cluster?.live_nodes?.length) throw new Error('No live SolrCloud node.');
      break;
    } catch (error) {
      if (attempt === 29) throw error;
      await pause(1000);
    }
  }
  const collections = status.cluster.collections;
  const existing = collections[config.collection];
  if (existing && existing.configName !== configName) {
    throw new Error(`Existing ${config.collection} uses a different configset. Back up and migrate into a fresh collection; bootstrap will not alter legacy data.`);
  }
  if (Object.entries(collections).some(([name, collection]) => name !== config.collection && collection.configName === configName)) {
    throw new Error(`Configset ${configName} is shared with another collection; refusing schema changes.`);
  }
  if (!existing) {
    // Omitting collection.configName makes Solr create an isolated .AUTOCREATED
    // copy. Explicit Configsets CREATE from trusted _default requires auth in 9.11.
    await request('admin/collections', { query: {
      action: 'CREATE', name: config.collection, numShards: '1', replicationFactor: '1',
    }, timeout: 60000 });
    log(`Created ${config.collection} with one shard and one replica.`);
  }

  const prefix = encodeURIComponent(config.collection);
  const actual = await request(`${prefix}/schema/fields`, { query: { showDefaults: 'true' } });
  const actualTypes = await request(`${prefix}/schema/fieldtypes`);
  const unique = await request(`${prefix}/schema/uniquekey`);
  if (unique.uniqueKey !== 'id') throw new Error('Expected the unique key to be id; refusing schema changes.');
  const definitions = new Map(actual.fields.map((field) => [field.name, field]));
  const expected = [{ name: 'id', type: 'string', stored: true, indexed: true, multiValued: false }, ...fields];
  const additions = [];
  const typeAdditions = [];
  for (const expectedType of fieldTypes) {
    const currentType = actualTypes.fieldTypes.find((type) => type.name === expectedType.name);
    if (!currentType) { typeAdditions.push(expectedType); continue; }
    if (currentType.class !== expectedType.class ||
        JSON.stringify(currentType.analyzer) !== JSON.stringify(expectedType.analyzer)) {
      throw new Error(`Incompatible field type ${expectedType.name}; review an explicit reindexing migration.`);
    }
  }
  for (const field of expected) {
    const current = definitions.get(field.name);
    if (!current) { additions.push(field); continue; }
    for (const [key, value] of Object.entries(field)) {
      if (current[key] !== value) {
        throw new Error(`Incompatible field ${field.name}.${key}; back up and reindex through a reviewed migration. No existing field was changed.`);
      }
    }
  }

  // Validate everything before mutating. Never replace fields, clear records, or reindex implicitly.
  if (additions.length || typeAdditions.length) {
    const commands = {};
    if (typeAdditions.length) commands['add-field-type'] = typeAdditions;
    if (additions.length) commands['add-field'] = additions;
    await request(`${prefix}/schema`, { body: commands });
    log(`Added ${additions.length} schema fields.`);
  }
  const overlay = await request(`${prefix}/config/overlay`);
  if (overlay.overlay?.userProps?.['update.autoCreateFields'] !== 'false' &&
      overlay.overlay?.userProps?.['update.autoCreateFields'] !== false) {
    await request(`${prefix}/config`, { body: { 'set-user-property': { 'update.autoCreateFields': 'false' } } });
  }
  await request(`${prefix}/select`, { query: { q: '*:*', rows: '0' } });
  log(`Schema ready for ${config.collection}; existing records were preserved.`);
}

if (isMain(import.meta.url)) {
  bootstrap().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
