const MERMAID_ESM_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
const MERMAID_VIEWPORT_MARGIN = '400px 0px';

let mermaidPromise;
let diagramCount = 0;

/**
 * Loads the mermaid library once, on demand, shared across all blocks on the page.
 * @returns {Promise<object>} initialized mermaid API
 */
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import(MERMAID_ESM_URL).then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'var(--body-font-family, sans-serif)',
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

/**
 * Extracts plain text from an authored cell, preserving line breaks
 * that authors enter as <br> or separate paragraphs.
 * @param {Element} cell
 * @returns {string}
 */
function extractText(cell) {
  const clone = cell.cloneNode(true);
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));

  const blocks = [...clone.children].filter((el) => ['P', 'DIV', 'PRE', 'UL', 'OL'].includes(el.tagName));
  if (blocks.length === 0) {
    return clone.textContent.trim();
  }
  return blocks.map((el) => el.textContent.replace(/\n+$/, '')).join('\n').trim();
}

/**
 * Reads the authored block content. Supports key/value rows
 * (title, code) like the code block, or a single-cell diagram definition.
 * @param {Element} block
 * @returns {{title: string, source: string}}
 */
function getBlockData(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const data = {};
  let simpleSource = '';

  rows.forEach((row) => {
    const columns = [...row.children];
    if (columns.length < 2) {
      if (!simpleSource && columns[0]) {
        simpleSource = extractText(columns[0]);
      }
      return;
    }

    const key = columns[0].textContent.trim().toLowerCase();
    data[key] = extractText(columns[1]);
  });

  return {
    title: data.title || '',
    source: data.code || data.diagram || simpleSource,
  };
}

function waitForBlockVisibility(block) {
  return new Promise((resolve) => {
    if (!('IntersectionObserver' in window)) {
      resolve();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry?.isIntersecting) {
        return;
      }

      observer.disconnect();
      resolve();
    }, {
      rootMargin: MERMAID_VIEWPORT_MARGIN,
    });

    observer.observe(block);
  });
}

function showError(block, error) {
  block.classList.add('mermaid-error');
  const note = document.createElement('p');
  note.className = 'mermaid-error-note';
  note.textContent = `Diagram could not be rendered. ${error?.message || ''}`.trim();
  block.querySelector('.mermaid-diagram')?.prepend(note);
}

async function renderDiagram(block, source, title) {
  try {
    await waitForBlockVisibility(block);
    const mermaid = await loadMermaid();

    diagramCount += 1;
    const { svg } = await mermaid.render(`mermaid-diagram-${diagramCount}`, source);

    const diagram = block.querySelector('.mermaid-diagram');
    const canvas = document.createElement('div');
    canvas.className = 'mermaid-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', title || 'Diagram');
    canvas.innerHTML = svg;

    diagram.append(canvas);
    block.classList.add('mermaid-rendered');
  } catch (error) {
    showError(block, error);
  }
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const { title, source } = getBlockData(block);

  if (!source) {
    block.remove();
    return;
  }

  const figure = document.createElement('figure');
  figure.className = 'mermaid-figure';

  const diagram = document.createElement('div');
  diagram.className = 'mermaid-diagram';

  // authored source stays in the DOM until the SVG replaces it, so the
  // content is readable without the library and by non-visual consumers
  const fallback = document.createElement('pre');
  fallback.className = 'mermaid-fallback';
  fallback.textContent = source;
  diagram.append(fallback);
  figure.append(diagram);

  if (title) {
    const caption = document.createElement('figcaption');
    caption.className = 'mermaid-caption';
    caption.textContent = title;
    figure.append(caption);
  }

  block.replaceChildren(figure);
  renderDiagram(block, source, title);
}
