import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  loadScript,
  buildBlock,
  getMetadata,
  sampleRUM,
  toCamelCase,
  toClassName,
} from './aem.js';

/**
 * Moves all the attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to?.setAttribute(attr, value);
      from.removeAttribute(attr);
    }
  });
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
export function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch {
      // continue
    }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) {
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const h2 = main.querySelector('h2');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1, h2] }));
    main.prepend(section);
  }
}

function buildRelatedPostsBlock(main) {
  if (!document.body.classList.contains('blog-post') || main.querySelector('.related-posts')) {
    return;
  }

  const section = document.createElement('div');
  section.classList.add('blog-sidebar');
  section.append(buildBlock('related-posts', [
    ['Heading', 'Related posts'],
    ['Limit', '3'],
  ]));
  main.append(section);
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
    buildRelatedPostsBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

function normalizeEsiTables(main) {
  const normalizeKey = (value = '') => value.trim().toLowerCase().replace(/[\s-]/g, '');

  const isEsiTable = (table) => {
    const firstCell = table.querySelector('tr:first-of-type th, tr:first-of-type td');
    return normalizeKey(firstCell?.textContent || '') === 'esi';
  };

  const tables = Array.from(main.querySelectorAll('table')).filter((table) => isEsiTable(table));
  if (tables.length === 0) return;

  loadCSS(`${window.hlx.codeBasePath}/blocks/esi/esi.css`);
  import('../blocks/esi/esi.js').then(({ default: decorateEsiBlock }) => {
    tables.forEach((table) => {
      const config = {};
      table.querySelectorAll('tr').forEach((row) => {
        const cells = row.querySelectorAll('th, td');
        if (cells.length < 2) return;
        const key = normalizeKey(cells[0].textContent || '');
        if (key === 'esi') return;

        const link = cells[1].querySelector('a[href]');
        const value = link ? link.getAttribute('href') : (cells[1].textContent || '').trim();
        if (!value) return;
        config[key] = value;
      });

      if (!config.embedpath) return;

      const esiBlock = document.createElement('div');
      esiBlock.className = 'esi';

      ['embedpath', 'selector', 'fallbackmessage'].forEach((key) => {
        if (!config[key]) return;
        const row = document.createElement('div');
        const keyCell = document.createElement('div');
        const valueCell = document.createElement('div');
        keyCell.textContent = key;
        valueCell.textContent = config[key];
        row.append(keyCell, valueCell);
        esiBlock.append(row);
      });

      table.replaceWith(esiBlock);
      decorateEsiBlock(esiBlock);
    });
  }).catch(() => {
    // If block module import fails, leave authored table markup unchanged.
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  normalizeEsiTables(main);
  decorateSections(main);
  decorateBlocks(main);
}

/**
 * Returns all metadata elements with a given scope/prefix.
 * @param {string} scope The metadata scope/prefix to look for
 * @returns {Object} A map of metadata key/value pairs
 */
function getAllMetadata(scope) {
  return [...document.head.querySelectorAll(`meta[property^="${scope}:"],meta[name^="${scope}-"]`)]
    .reduce((acc, meta) => {
      const id = toClassName(meta.name
        ? meta.name.substring(`${scope}-`.length)
        : meta.getAttribute('property').split(':')[1]);
      acc[id] = meta.getAttribute('content');
      return acc;
    }, {});
}

const AUDIENCES = {
  mobile: () => window.innerWidth < 600,
  desktop: () => window.innerWidth >= 600,
  // Add custom audiences here
};

const pluginContext = {
  getAllMetadata,
  getMetadata,
  loadCSS,
  loadScript,
  sampleRUM,
  toCamelCase,
  toClassName,
};

function isSidekickEnabled() {
  return !!document.querySelector('helix-sidekick, aem-sidekick');
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();

  if (getMetadata('experiment')
    || Object.keys(getAllMetadata('campaign')).length
    || Object.keys(getAllMetadata('audience')).length) {
    // eslint-disable-next-line import/no-relative-packages
    const { loadEager: runEager } = await import('../plugins/experimentation/src/index.js');
    await runEager(document, { audiences: AUDIENCES }, pluginContext);
  }

  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  if (getMetadata('experiment')
    || Object.keys(getAllMetadata('campaign')).length
    || Object.keys(getAllMetadata('audience')).length) {
    const sidekickEnabled = isSidekickEnabled();
    // eslint-disable-next-line import/no-relative-packages
    const { loadLazy: runLazy } = await import('../plugins/experimentation/src/index.js');
    await runLazy(
      document,
      { audiences: AUDIENCES, isProd: () => !sidekickEnabled },
      pluginContext,
    );
  }
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
