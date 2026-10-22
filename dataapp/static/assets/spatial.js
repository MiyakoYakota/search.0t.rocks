'use strict';
const form = document.getElementById('spatial-form');
const status = document.getElementById('spatial-status');
const results = document.getElementById('spatial-results');
const rows = document.getElementById('spatial-rows');
const count = document.getElementById('spatial-count');
const button = form.querySelector('button');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  results.hidden = true;
  status.textContent = 'Searching your collection…';
  try {
    const query = new URLSearchParams();
    for (const [name, value] of new FormData(form)) if (typeof value === 'string') query.set(name, value.trim());
    const response = await fetch(`/spatial?${query.toString()}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error((typeof data.error === 'string' && data.error) || data.message || data.errorMessage || 'The search could not be completed.');
    if (!Array.isArray(data.records)) throw new Error('The server returned an unexpected response.');
    rows.replaceChildren();
    for (const record of data.records) {
      const row = document.createElement('tr');
      const id = document.createElement('td');
      const link = document.createElement('a');
      link.href = `/documents/by_id/${encodeURIComponent(String(record.id))}`;
      link.textContent = String(record.id);
      id.append(link);
      row.append(id);
      for (const value of [record.latLong, record.source]) {
        const cell = document.createElement('td');
        cell.textContent = Array.isArray(value) ? value.join(', ') : String(value ?? '—');
        row.append(cell);
      }
      rows.append(row);
    }
    count.textContent = `${data.numDocs ?? data.resultCount ?? data.records.length} matching records · ${data.records.length} shown`;
    status.textContent = data.records.length ? 'Search complete.' : 'No records found in this area.';
    results.hidden = false;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Search unavailable. Try again.';
  } finally {
    button.disabled = false;
  }
});
