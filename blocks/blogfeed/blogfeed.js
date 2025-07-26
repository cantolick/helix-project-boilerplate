/* eslint-disable no-restricted-globals */
// blocks/blog-feed/blog-feed.js
// import { fetchPlaceholders } from '../../scripts/lib-franklin.js';

let blogData = [];
// const currentPage = 0;
// const itemsPerPage = 6;
// const isLoading = false;
let hasMoreContent = true;

/**
 * Fetch blog data from query index
 */
async function fetchBlogData() {
  try {
    const response = await fetch('/query-index.json');
    if (!response.ok) throw new Error('Failed to fetch blog data');

    const result = await response.json();
    blogData = result.data || [];
    return blogData;
  } catch (error) {
    console.error('Error fetching blog data:', error);
    return [];
  }
}

/**
 * Format date from time element or text
 */
function formatDate(dateString) {
  if (!dateString) return '';

  // Handle datetime attributes and various text formats
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    // If it's just "Feb 2019" format, return as is
    return dateString;
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}

/**
 * Extract first paragraph of content as description
 */
function extractDescription(content) {
  if (!content) return '';

  // Create a temporary div to parse HTML content
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;

  // Get the first paragraph
  const firstP = tempDiv.querySelector('p');
  if (firstP) {
    return `${firstP.textContent.trim().substring(0, 150)}...`;
  }

  // Fallback to truncated text content
  return `${tempDiv.textContent.trim().substring(0, 150)}...`;
}

/**
 * Create a blog card element matching your structure
 */
function createBlogCard(item) {
  const card = document.createElement('article');
  card.className = 'blog-card';

  const title = item.title || 'Untitled';
  const description = item.description || extractDescription(item.content) || '';
  const date = formatDate(item.lastModified);
  const author = item.author || '';
  const path = item.path || '#';
  const { image } = item;

  // Create the card HTML structure
  let imageHTML = '';
  if (image) {
    imageHTML = `
      <div class="blog-card-image">
        <img src="${image}" alt="${title}" loading="lazy">
      </div>
    `;
  }

  card.innerHTML = `
    ${imageHTML}
    <div class="blog-card-content">
      <div class="blog-card-header">
        <h2 class="main-heading">
          <a href="${path}">${title}</a>
        </h2>
        ${date ? `<time class="date">${date}</time>` : ''}
      </div>
      <div class="blog-card-body">
        <p class="blog-card-description">${description}</p>
        <a href="${path}" class="blog-card-link">Read more</a>
      </div>
      ${author ? `<div class="blog-card-meta"><span class="author">by ${author}</span></div>` : ''}
    </div>
  `;

  return card;
}

/**
 * Create a blog entry in the same format as your example
 */
function createBlogEntry(item) {
  const entry = document.createElement('div');
  entry.className = 'blog-entry';

  const title = item.title || 'Untitled';
  const description = item.description || extractDescription(item.content) || '';
  const date = formatDate(item.lastModified);
  const author = item.author || '';
  const path = item.path || '#';
  const { image } = item;

  // Create title ID from title text
  const titleId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Create datetime attribute if we have a valid date
  let datetimeAttr = '';
  const dateObj = new Date(item.lastModified);
  if (!isNaN(dateObj.getTime())) {
    datetimeAttr = `datetime="${dateObj.toISOString().split('T')[0]}"`;
  }

  let imageHTML = '';
  if (image) {
    imageHTML = `
      <picture>
        <img loading="lazy" alt="${title}" src="${image}" class="blog-image">
      </picture>
    `;
  }

  entry.innerHTML = `
    <div>
      <div>
        <h2 id="${titleId}" class="main-heading">
          <a href="${path}">${title}</a>
        </h2>
        ${date ? `<time ${datetimeAttr} class="date">${date}</time>` : ''}
        <p>${description}</p>
        ${imageHTML}
        <a href="${path}" class="read-more-link">Read full article →</a>
        ${author ? `<p class="author-info"><em>by ${author}</em></p>` : ''}
      </div>
    </div>
  `;

  return entry;
}

/**
 * Load and display blog posts
 */
function loadBlogPosts(container, loadingIndicator, useCardLayout = true) {
  const feedContainer = container.querySelector('.blog-feed-posts');
  feedContainer.innerHTML = ''; // Clear previous content

  blogData.forEach((item) => {
    const blogElement = useCardLayout ? createBlogCard(item) : createBlogEntry(item);
    feedContainer.appendChild(blogElement);
  });

  loadingIndicator.style.display = 'none';
  hasMoreContent = false;
}

/**
 * Setup intersection observer for infinite scroll
 */
function setupInfiniteScroll(container, loadingIndicator, useCardLayout) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && hasMoreContent) {
        loadBlogPosts(container, loadingIndicator, useCardLayout);
      }
    });
  }, {
    rootMargin: '100px',
  });

  observer.observe(loadingIndicator);
}

/**
 * Apply your enhanceContent function to the loaded content
 */
function enhanceContent(block) {
  if (!block) return;

  // Example: Add classes or attributes to specific elements
  const headings = block.querySelectorAll('h2, h3, h4');
  headings.forEach((heading) => {
    if (heading.tagName.toLowerCase() === 'h2') {
      // Add a class to h2 elements
      heading.classList.add('main-heading');
    } else if (heading.tagName.toLowerCase() === 'h3') {
      // Add a class to h3 elements
      heading.classList.add('sub-heading');
    } else if (heading.tagName.toLowerCase() === 'h4') {
      // Add a class to h4 elements
      heading.classList.add('date');
      // Use the text content of the h4 element as the date
      const textContent = heading.textContent.trim();

      // Attempt to parse the text content as a date
      const date = new Date(textContent);

      // Check if the parsed date is valid
      // eslint-disable-next-line no-restricted-globals
      if (!isNaN(date.getTime())) {
        // Format the date in ISO format for the datetime attribute
        const isoDate = date.toISOString().split('T')[0]; // Get only the date part

        // Create a new time element
        const timeElement = document.createElement('time');
        timeElement.setAttribute('datetime', isoDate);
        timeElement.textContent = textContent;
        timeElement.classList.add('date');

        // Replace the h4 element with the new time element
        heading.replaceWith(timeElement);
      }
    }
  });
}

/**
 * Decorate the blog feed block
 */
export default async function decorate(block) {
  // Add loading class
  block.classList.add('loading');

  // Check if this should use card layout or entry layout
  const useCardLayout = block.classList.contains('cards') || (block.hasAttribute('data-layout') && block.getAttribute('data-layout') === 'cards');

  // Create container structure
  const containerClass = useCardLayout ? 'blog-feed-grid' : 'blog-feed-entries';

  block.innerHTML = `
    <div class="blog-feed-container">
      <div class="blog-feed-posts ${containerClass}"></div>
      <div class="blog-feed-loading">
        <div class="loading-spinner"></div>
        <p>Loading more posts...</p>
      </div>
    </div>
  `;

  const container = block.querySelector('.blog-feed-container');
  const loadingIndicator = block.querySelector('.blog-feed-loading');

  try {
    // Fetch blog data
    await fetchBlogData();

    if (blogData.length === 0) {
      block.innerHTML = '<p class="no-posts">No blog posts found.</p>';
      return;
    }

    // Load initial posts
    loadBlogPosts(container, loadingIndicator, useCardLayout);

    // Setup infinite scroll
    setupInfiniteScroll(container, loadingIndicator, useCardLayout);

    // Apply content enhancements after each load
    const observer = new MutationObserver(() => {
      enhanceContent(container);
    });

    observer.observe(container.querySelector('.blog-feed-posts'), {
      childList: true,
    });
  } catch (error) {
    console.error('Error setting up blog feed:', error);
    block.innerHTML = '<p class="error">Failed to load blog posts.</p>';
  } finally {
    block.classList.remove('loading');
    // Apply initial enhancements
    enhanceContent(block);
  }
}
