'use strict';
const form = document.getElementById('search-form');
const status = document.getElementById('form-status');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = new URLSearchParams();
  let positive = false;
  for (const [name, value] of new FormData(form)) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    query.append(name, value.trim());
    if (!name.startsWith('not')) positive = true;
  }
  if (!positive) {
    status.textContent = 'Enter at least one search field, in addition to any exclusions.';
    form.querySelector('input').focus();
    return;
  }
  window.location.assign(`/records?${query.toString()}`);
});
form.addEventListener('reset', () => { status.textContent = ''; });
