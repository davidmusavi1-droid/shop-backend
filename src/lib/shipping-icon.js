// Only the eight locally bundled Lucide symbols can be rendered.
const names = new Set(['package', 'truck', 'bike', 'gift', 'clock', 'wallet', 'map-pin', 'package-search']);
module.exports = function shippingIcon(name) {
  if (!names.has(name)) throw new Error('Unknown shipping icon');
  return `<svg class="shipping-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="/shipping-icons.svg#${name}"></use></svg>`;
};
