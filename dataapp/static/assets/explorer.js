'use strict';
const form = document.getElementById('record-form');
const input = form.querySelector('input');
const initialId = new URLSearchParams(window.location.search).get('id');
if (initialId && initialId.length <= 256) input.value = initialId;
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (input.value.trim()) window.location.assign(`/documents/by_id/${encodeURIComponent(input.value)}`);
});
