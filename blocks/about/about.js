export default function enhanceContent(block) {
    if (!block) return;

    // Example: Add classes or attributes to specific elements
    const headings = block.querySelectorAll('h2, h3, h4');
    headings.forEach((heading) => {
            heading.classList.add('main-heading');
    });
}
