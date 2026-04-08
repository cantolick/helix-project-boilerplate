import { readBlockConfig } from '../../scripts/aem.js';

const DEFAULT_WORDS_PER_MINUTE = 200;

function getWordsPerMinute(config) {
  const configuredValue = config['words-per-minute'] || config.wordsPerMinute;
  const wordsPerMinute = Number.parseInt(configuredValue, 10);

  return Number.isFinite(wordsPerMinute) && wordsPerMinute > 0
    ? wordsPerMinute
    : DEFAULT_WORDS_PER_MINUTE;
}

function getArticleText(block) {
  const main = block.closest('main') || document.querySelector('main');
  if (!main) return '';

  return [...main.querySelectorAll(':scope > .section:not(.blog-sidebar)')]
    .map((section) => section.innerText || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text) {
  if (!text) return 0;

  const matches = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

function getReadingTime(wordCount, wordsPerMinute) {
  if (!wordCount) return 0;

  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

function buildReadingTime(readingTime) {
  const value = document.createElement('p');
  value.className = 'reading-time-value';
  value.textContent = `${readingTime} min read`;

  return value;
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const wordsPerMinute = getWordsPerMinute(config);
  const wordCount = countWords(getArticleText(block));
  const readingTime = getReadingTime(wordCount, wordsPerMinute);

  if (!readingTime) {
    block.remove();
    return;
  }

  block.replaceChildren(buildReadingTime(readingTime));
}
