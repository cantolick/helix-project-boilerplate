import { createOptimizedPicture } from '../../scripts/lib-franklin.js';

export default function decorate(block) {
  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.innerHTML = row.innerHTML;
    [...li.children].forEach((div, index) => {
      if (index === 0) {
        div.className = 'vtimeline-date';
        const iconDiv = document.createElement('div');
        iconDiv.className = 'vtimeline-icon';
        const icon = document.createElement('i');
        icon.className = 'fa fa-map-marker';
        iconDiv.appendChild(icon);
        div.insertAdjacentElement('afterend', iconDiv);
      } else {
        div.className = 'vtimeline-content';
      }
    });
    ul.append(li);
  });
  ul.querySelectorAll('img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }])));
  block.textContent = '';
  block.append(ul);
  // Example: Add classes or attributes to specific elements
  const headings = block.querySelectorAll('h2, h3, h4');
  headings.forEach((heading) => {
        // Add a class to h2 elements
        heading.classList.add('heading');
  });
}
