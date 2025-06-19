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
  // Find the map div within the container
  const mapDiv = container.querySelector('.parks-map-container');

  // Ensure the container has proper dimensions before initializing
  if (mapDiv.offsetHeight === 0) {
    mapDiv.style.height = '600px';
  }

  // Initialize the map centered on Minnesota with zoom limits
  map = window.L.map(mapDiv, {
    minZoom: 5, // Can't zoom out past this level
    maxZoom: 18, // Can't zoom in past this level
  }).setView([46.7296, -94.6859], 6);

  // Add tile layer
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  // Force map to recognize its container size
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}

// Load parks data from JSON
async function loadParks() {
  try {
    const response = await fetch('parks.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Convert string values to proper types
    parks = data.data.map((park) => ({
      ...park,
      visited: park.visited === 'true',
      lat: parseFloat(park.lat),
      lng: parseFloat(park.lng),
    }));

    return true;
  } catch (error) {
    return false;
  }
}

// Add markers to the map
function addMarkersToMap() {
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

    // Build popup content with new fields
    let popupContent = `
      <div style="text-align: center; max-width: 300px;">
        <h3>${park.name}</h3>
        <p><strong>Status:</strong> ${park.visited ? 'Visited' : 'Not Visited'}</p>
    `;

    if (park.description) {
      popupContent += `<p style="text-align: left; font-size: 0.9em;"><strong>Description:</strong> ${park.description}</p>`;
    }

    if (park.notes) {
      popupContent += `<p style="text-align: left; font-size: 0.9em;"><strong>Notes:</strong> ${park.notes}</p>`;
    }

    if (park.directions) {
      popupContent += `<p style="text-align: left; font-size: 0.9em;"><strong>Directions:</strong> ${park.directions}</p>`;
    }

    if (park.address) {
      popupContent += `<p style="font-size: 0.8em;">${park.address}</p>`;
    }

    if (park.url) {
      popupContent += `<p><a href="https://www.dnr.state.mn.us${park.url}" target="_blank" style="color: #007bff;">https://www.dnr.state.mn.us${park.url}</a></p>`;
    }

    popupContent += '</div>';

    marker.bindPopup(popupContent);
    markers.push(marker);
  });
}

// Update statistics
function updateStats(container) {
  const visitedCount = parks.filter((park) => park.visited).length;
  const totalCount = parks.length;
  const percentage = totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : 0;

  container.querySelector('#visitedCount').textContent = visitedCount;
  container.querySelector('#totalCount').textContent = totalCount;
  container.querySelector('#percentageCount').textContent = `${percentage}%`;
}

// Create park list
function createParkList(container) {
  const parkItems = container.querySelector('#parkItems');
  parkItems.innerHTML = '';

  parks.forEach((park) => {
    const item = document.createElement('div');
    item.className = park.visited ? 'park-item visited' : 'park-item not-visited';

    let itemContent = `
      <strong>${park.name}</strong>
      ${park.visited ? '<br><small><em>✓ Visited</em></small>' : ''}
    `;

    if (park.description) {
      itemContent += `<br><small style="color: #666;">${park.description}</small>`;
    }

    if (park.notes) {
      itemContent += `<br><strong>Notes: </strong><small style="color:rgba(68, 68, 68, 0.58); font-style: italic;">${park.notes}</small>`;
    }

    if (park.url) {
      itemContent += `<br><small><a href="https://www.dnr.state.mn.us${park.url}" target="_blank" style="color: #007bff;">https://www.dnr.state.mn.us${park.url}</a></small>`;
    }

    item.innerHTML = itemContent;
    parkItems.appendChild(item);
  });
}

// Toggle park list visibility
function toggleParkList(container) {
  const parkList = container.querySelector('#parkList');
  const isVisible = parkList.style.display !== 'none';
  parkList.style.display = isVisible ? 'none' : 'block';
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

    // Small delay to ensure DOM is ready, then initialize map
    setTimeout(() => {
      initializeMap(block);
      addMarkersToMap();
      createParkList(block);
      updateStats(block);
    }, 50);
  } catch (error) {
    showError(block, error);
  }
}
