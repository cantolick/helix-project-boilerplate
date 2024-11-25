// eslint-disable-next-line import/no-cycle
import { sampleRUM } from './lib-franklin.js';

// Core Web Vitals RUM collection
sampleRUM('cwv');

// add more delayed functionality here
const latoFont = document.createElement('link');
latoFont.href = 'https://fonts.googleapis.com/css?family=Lato:300,400,700,900';
latoFont.rel = 'stylesheet';
latoFont.defer = true;
document.head.appendChild(latoFont);

const fontAwesome = document.createElement('link');
fontAwesome.rel = 'stylesheet';
fontAwesome.href = 'styles/font-awesome.min.css';
fontAwesome.defer = true;
document.head.appendChild(fontAwesome);
