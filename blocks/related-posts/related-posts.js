import { readBlockConfig, getMetadata } from '../../scripts/aem.js';

function normalizeList(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeList(item));
  }

  return `${value}`
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getCurrentPageTags() {
  const propertyTags = [...document.head.querySelectorAll('meta[property="article:tag"]')]
    .map((meta) => meta.content);

  return [...new Set([
    ...normalizeList(propertyTags),
    ...normalizeList(getMetadata('tag')),
  ])];
}

function getCurrentPath() {
  return window.location.pathname.replace(/\/$/, '') || '/';
}

function getPostTags(post) {
  return normalizeList(post.tags);
}

function getSortableTime(post) {
  return new Date(post.date || 0).getTime() || 0;
}

function getMatchingPosts(posts, currentPath, currentTags, limit) {
  return posts
    .filter((post) => post.path && post.path !== currentPath)
    .map((post) => {
      const matchCount = getPostTags(post).filter((tag) => currentTags.includes(tag)).length;
      return {
        ...post,
        matchCount,
      };
    })
    .filter((post) => post.matchCount > 0)
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) {
        return b.matchCount - a.matchCount;
      }

      return getSortableTime(b) - getSortableTime(a);
    })
    .slice(0, limit);
}

function formatDisplayDate(post) {
  const value = post.lastModified || post.date;
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}

function renderEmpty(block, heading, message) {
  block.innerHTML = `
    <aside class="related-posts-panel" aria-labelledby="related-posts-heading">
      <h2 id="related-posts-heading">${heading}</h2>
      <p class="related-posts-empty">${message}</p>
    </aside>
  `;
}

function renderPosts(block, heading, posts) {
  const items = posts.map((post) => {
    const date = formatDisplayDate(post);

    return `
      <li class="related-posts-item">
        <article>
          <p class="related-posts-item-title"><a href="${post.path}">${post.title || 'Untitled'}</a></p>
          ${date ? `<time class="related-posts-item-date">${date}</time>` : ''}
        </article>
      </li>
    `;
  }).join('');

  block.innerHTML = `
    <aside class="related-posts-panel" aria-labelledby="related-posts-heading">
      <h2 id="related-posts-heading">${heading}</h2>
      <ul class="related-posts-list">
        ${items}
      </ul>
    </aside>
  `;
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const heading = config.heading || 'Related posts';
  const limit = Number.parseInt(config.limit, 10) || 3;
  const section = block.closest('.section');
  const currentTags = getCurrentPageTags();

  section?.classList.add('blog-sidebar');

  if (!currentTags.length) {
    section?.remove();
    return;
  }

  try {
    const response = await fetch('/query-index.json');
    if (!response.ok) throw new Error('Failed to fetch related posts');

    const result = await response.json();
    const posts = Array.isArray(result.data) ? result.data : [];
    const matches = getMatchingPosts(posts, getCurrentPath(), currentTags, limit);

    if (!matches.length) {
      renderEmpty(block, heading, 'No related posts yet.');
      return;
    }

    renderPosts(block, heading, matches);
  } catch (error) {
    renderEmpty(block, heading, 'Unable to load related posts.');
  }
}
