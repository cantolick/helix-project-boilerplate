// Franklin Block: Parks Map
// File: /blocks/parks-map/parks-map.js

import { loadCSS } from '../../scripts/lib-franklin.js';

// Global variables for the block
let map;
let parks = [];
const markers = [];

// Load external dependencies
async function loadDependencies() {
  // Load Leaflet CSS
  await loadCSS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/leaflet.min.css');

  // Load Leaflet JS
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/leaflet.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Initialize the map
function initializeMap(container) {
  console.log('Initializing parks map...');

  // Find the map div within the container
  const mapDiv = container.querySelector('.parks-map-container');

  // Initialize the map centered on Minnesota
  map = window.L.map(mapDiv).setView([46.7296, -94.6859], 6);

  // Add tile layer
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  console.log('Map initialized successfully');
}

// Load parks data from JSON
async function loadParks() {
  console.log('Loading parks data from JSON...');

  try {
    const response = await fetch('parks.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    parks = data.data;
    console.log(`Loaded ${parks.length} parks from JSON`);

    return true;
  } catch (error) {
    console.error('Error loading parks from JSON:', error);
    return false;
  }
}

// Add markers to the map
function addMarkersToMap() {
  console.log('Adding markers to map...');

  parks.forEach((park) => {
    // Use provided coordinates or estimate based on city
    const lat = park.lat || (46.7296 + (Math.random() - 0.5) * 4);
    const lng = park.lng || (-94.6859 + (Math.random() - 0.5) * 6);

    // Set marker color based on visited status
    const fillColor = park.visited ? '#28a745' : '#dc3545';

    const marker = window.L.circleMarker([lat, lng], {
      radius: 8,
      fillColor,
      color: '#333',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
    }).addTo(map);

    marker.bindPopup(`
      <div style="text-align: center;">
        <h3>${park.name}</h3>
        <p>${park.city}, ${park.state || 'MN'}</p>
        <p><strong>Status:</strong> ${park.visited ? 'Visited' : 'Not Visited'}</p>
        ${park.address ? `<p><small>${park.address}</small></p>` : ''}
      </div>
    `);

    markers.push(marker);
  });

  console.log(`Added ${markers.length} markers to map`);
}

// Update statistics
function updateStats(container) {
  const visitedCount = parks.filter((park) => park.visited).length;
  const totalCount = parks.length;
  const percentage = totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : 0;

  container.querySelector('#visitedCount').textContent = visitedCount;
  container.querySelector('#totalCount').textContent = totalCount;
  container.querySelector('#percentageCount').textContent = `${percentage}%`;

  console.log(`Stats updated: ${visitedCount}/${totalCount} (${percentage}%)`);
}

// Create park list
function createParkList(container) {
  console.log('Creating park list...');

  const parkItems = container.querySelector('#parkItems');
  parkItems.innerHTML = '';

  parks.forEach((park) => {
    const item = document.createElement('div');
    item.className = park.visited ? 'park-item visited' : 'park-item not-visited';
    item.innerHTML = `
      <strong>${park.name}</strong><br>
      <small>${park.city}, ${park.state || 'MN'}</small>
      ${park.visited ? '<br><small><em>✓ Visited</em></small>' : ''}
    `;
    parkItems.appendChild(item);
  });

  console.log('Park list created');
}

// Toggle park list visibility
function toggleParkList(container) {
  const parkList = container.querySelector('#parkList');
  const isVisible = parkList.style.display !== 'none';
  parkList.style.display = isVisible ? 'none' : 'block';
  console.log(`Park list ${isVisible ? 'hidden' : 'shown'}`);
}

// Show error message
function showError(container, error) {
  const mapDiv = container.querySelector('.parks-map-container');
  mapDiv.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 400px; background: #f8f9fa; color: #6c757d; text-align: center;">
      <div>
        <h3>Unable to load parks data</h3>
        <p>Please ensure the parks.json file is available.</p>
        <p><small>Error: ${error.message}</small></p>
      </div>
    </div>
  `;
}

// Main block decoration function (Franklin style)
export default async function decorate(block) {
  console.log('Decorating parks-map block...');

  // Create the HTML structure
  block.innerHTML = `
    <div class="parks-map-wrapper">
      <div class="header">
        <h1>🏞️ Minnesota State Parks Visit Tracker</h1>
        <p>Green markers indicate parks you've visited, red markers for parks not yet visited</p>
      </div>
      
      <div class="stats">
        <div class="stat">
          <div class="stat-number" id="visitedCount">0</div>
          <div class="stat-label">Visited</div>
        </div>
        <div class="stat">
          <div class="stat-number" id="totalCount">75</div>
          <div class="stat-label">Total Parks</div>
        </div>
        <div class="stat">
          <div class="stat-number" id="percentageCount">0%</div>
          <div class="stat-label">Completed</div>
        </div>
      </div>

      <div class="instructions">
        <strong>Minnesota State Parks:</strong> This map shows all Minnesota state parks with your visit status.
      </div>

      <div class="parks-map-container" style="height: 600px; width: 100%;"></div>

      <div class="legend">
        <div class="legend-item">
          <div class="legend-color visited"></div>
          <span>Visited Parks</span>
        </div>
        <div class="legend-item">
          <div class="legend-color not-visited"></div>
          <span>Not Visited Parks</span>
        </div>
      </div>

      <div class="toggle-list">
        <button class="toggle-btn" onclick="this.closest('.parks-map-wrapper').toggleParkList()">Show/Hide Park List</button>
      </div>

      <div class="park-list" id="parkList" style="display: none;">
        <h3>All Minnesota State Parks</h3>
        <div id="parkItems"></div>
      </div>
    </div>
  `;

  // Add toggle function to the wrapper
  const wrapper = block.querySelector('.parks-map-wrapper');
  wrapper.toggleParkList = () => toggleParkList(block);

  try {
    // Load dependencies
    await loadDependencies();

    // Load parks data
    const dataLoaded = await loadParks();

    if (!dataLoaded) {
      throw new Error('Failed to load parks data');
    }

    // Initialize map
    initializeMap(block);

    // Add markers and update UI
    addMarkersToMap();
    createParkList(block);
    updateStats(block);

    console.log('Parks map block loaded successfully');
  } catch (error) {
    console.error('Error initializing parks map:', error);
    showError(block, error);
  }
}
