/**
 * ESI block decorator for preview servers (aem.page).
 *
 * On production (live), the Cloudflare Worker replaces this block entirely
 * with the fetched fragment wrapped in an eds-embed component.
 *
 * On preview servers, we show a visual placeholder so authors can see where
 * ESI substitution will occur.
 */
export default function decorate(block) {
  // Extract config from the block table
  const rows = Array.from(block.querySelectorAll(':scope > div'));
  const config = {};

  rows.forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells.length === 2) {
      const key = cells[0].textContent.trim().toLowerCase();
      const value = cells[1].textContent.trim();
      config[key] = value;
    }
  });

  // Create a visual preview container
  const preview = document.createElement('div');
  preview.className = 'esi-preview';

  const title = document.createElement('div');
  title.className = 'esi-preview-title';
  title.textContent = 'ESI Fragment Preview';
  preview.appendChild(title);

  if (config.embedpath) {
    const pathLabel = document.createElement('div');
    pathLabel.className = 'esi-preview-label';
    pathLabel.textContent = 'Embed Path:';
    preview.appendChild(pathLabel);

    const pathValue = document.createElement('code');
    pathValue.className = 'esi-preview-path';
    pathValue.textContent = config.embedpath;
    preview.appendChild(pathValue);
  }

  if (config.selector) {
    const selectorLabel = document.createElement('div');
    selectorLabel.className = 'esi-preview-label';
    selectorLabel.textContent = 'Selector:';
    preview.appendChild(selectorLabel);

    const selectorValue = document.createElement('code');
    selectorValue.className = 'esi-preview-selector';
    selectorValue.textContent = config.selector;
    preview.appendChild(selectorValue);
  }

  const footer = document.createElement('div');
  footer.className = 'esi-preview-footer';
  footer.textContent = 'This placeholder appears only on preview. On production, the Cloudflare Worker fetches and inlines the fragment.';
  preview.appendChild(footer);

  // Replace the block table with the preview
  block.innerHTML = '';
  block.appendChild(preview);
  block.classList.add('esi-decorated');
}
