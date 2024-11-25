export default function enhanceContent(block) {
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