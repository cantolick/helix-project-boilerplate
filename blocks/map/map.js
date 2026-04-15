import{loadCSS,readBlockConfig}from'../../scripts/aem.js';const LEAFLET_CSS_URL='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/leaflet.min.css';const LEAFLET_JS_URL='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/leaflet.min.js';const MAP_VIEWPORT_MARGIN='300px 0px';const PARK_DETAILS_URL_BASE='https://www.dnr.state.mn.us';const PARK_LINK_COLOR='#005a9c';const PARK_SECONDARY_TEXT_COLOR='#505050';const MARKER_COLORS={visited:'#2f7d32',notVisited:'#66b3e1',};function parseVisitedValue(value){if(typeof value==='boolean')return value;if(typeof value==='number')return value===1;if(typeof value==='string'){const normalized=value.trim().toLowerCase();return ['true','1','yes','y','visited'].includes(normalized);}return false;}async function loadDependencies(){const cssPromise=loadCSS(LEAFLET_CSS_URL);const scriptPromise=new Promise((resolve,reject)=>{if(window.L){resolve();return;}const existingScript=document.querySelector(`script[src="${LEAFLET_JS_URL}"]`);if(existingScript){existingScript.addEventListener('load',resolve,{once:true});existingScript.addEventListener('error',reject,{once:true});return;}const script=document.createElement('script');script.src=LEAFLET_JS_URL;script.async=true;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});await Promise.all([cssPromise,scriptPromise]);}function initializeMap(container){const mapDiv=container.querySelector('.parks-map-container');mapDiv.replaceChildren();if(mapDiv.offsetHeight===0){mapDiv.style.height='600px';}const mapInstance=window.L.map(mapDiv,{minZoom:5,maxZoom:18,}).setView([46.7296,-94.6859],6);window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',}).addTo(mapInstance);requestAnimationFrame(()=>{requestAnimationFrame(()=>{mapInstance.invalidateSize();});});return mapInstance;}function getAuthoredDataEndpoint(block,config={}){const configuredEndpoint=config.dataEndpoint||config.endpoint||config.data;if(configuredEndpoint){return Array.isArray(configuredEndpoint)?configuredEndpoint[0]:configuredEndpoint;}const jsonLink=block.querySelector('a[href*=".json"]');if(jsonLink?.href){return jsonLink.getAttribute('href');}const endpointText=[...block.querySelectorAll('p, li, div')].map((el)=>el.textContent?.trim()).find((text)=>text&&/\.json(\?|$)/i.test(text));if(endpointText){return endpointText;}return 'parks.json';}function getSectionConfig(block){const section=block.closest('.section');if(!section?.dataset){return {};}return {title:section.dataset.title,description:section.dataset.description,dataEndpoint:section.dataset.dataEndpoint,endpoint:section.dataset.endpoint,data:section.dataset.data,};}async function loadParks(dataEndpoint){try{const response=await fetch(dataEndpoint);if(!response.ok){throw new Error(`HTTP error! status: ${response.status}`);}const data=await response.json();return data.data.map((park)=>({...park,visited:parseVisitedValue(park.visited),lat:parseFloat(park.lat),lng:parseFloat(park.lng),}));}catch(error){return null;}}function addMarkersToMap(mapInstance,parksData){parksData.forEach((park)=>{const lat=park.lat||(46.7296+(Math.random()-0.5)*4);const lng=park.lng||(-94.6859+(Math.random()-0.5)*6);const fillColor=park.visited?MARKER_COLORS.visited:MARKER_COLORS.notVisited;const marker=window.L.circleMarker([lat,lng],{radius:8,fillColor,color:'#333',weight:2,opacity:1,fillOpacity:0.8,}).addTo(mapInstance);let popupContent=`
      <div style="text-align: center; max-width: 300px;">
        <h3>${park.name}</h3>
        <p><strong>Status:</strong> ${park.visited?'Visited':'Not Visited'}</p>
    `;if(park.description){popupContent+=`<p style="text-align: left; font-size: 0.9em;"><strong>Description:</strong> ${park.description}</p>`;}if(park.notes){popupContent+=`<p style="text-align: left; font-size: 0.9em;"><strong>Notes:</strong> ${park.notes}</p>`;}if(park.directions){popupContent+=`<p style="text-align: left; font-size: 0.9em;"><strong>Directions:</strong> ${park.directions}</p>`;}if(park.url){popupContent+=`<p><a href="${PARK_DETAILS_URL_BASE}${park.url}" target="_blank" rel="noopener noreferrer" aria-label="View park details for ${park.name} on the Minnesota DNR website" style="color: ${PARK_LINK_COLOR};">View Park Details</a></p>`;}popupContent+='</div>';marker.bindPopup(popupContent);});}function updateStats(container,parksData){const visitedCount=parksData.filter((park)=>park.visited).length;const totalCount=parksData.length;const percentage=totalCount>0?Math.round((visitedCount/totalCount)*100):0;container.querySelector('#visitedCount').textContent=visitedCount;container.querySelector('#totalCount').textContent=totalCount;container.querySelector('#percentageCount').textContent=`${percentage}%`;}function createParkList(container,parksData){const parkItems=container.querySelector('#parkItems');parkItems.innerHTML='';parksData.forEach((park)=>{const item=document.createElement('div');item.className=park.visited?'park-item visited':'park-item not-visited';let itemContent=`
      <strong>${park.name}</strong>
      ${park.visited?'<br><small><em>✓ Visited</em></small>':''}
    `;if(park.description){itemContent+=`<br><small style="color: #666;">${park.description}</small>`;}if(park.notes){itemContent+=`<br><strong>Notes: </strong><small style="color:${PARK_SECONDARY_TEXT_COLOR}; font-style: italic;">${park.notes}</small>`;}if(park.url){itemContent+=`<br><small><a href="${PARK_DETAILS_URL_BASE}${park.url}" target="_blank" rel="noopener noreferrer" aria-label="View park details for ${park.name} on the Minnesota DNR website" style="color: ${PARK_LINK_COLOR};">View Park Details</a></small>`;}item.innerHTML=itemContent;parkItems.appendChild(item);});}function toggleParkList(container){const parkList=container.querySelector('#parkList');const isVisible=parkList.style.display!=='none';parkList.style.display=isVisible?'none':'block';return!isVisible;}function updateToggleButton(button,isVisible){button.textContent=isVisible?'Hide Park List':'Show Park List';button.setAttribute('aria-expanded',String(isVisible));}function waitForBlockVisibility(block){return new Promise((resolve)=>{if(!('IntersectionObserver'in window)){resolve();return;}const observer=new IntersectionObserver((entries)=>{const[entry]=entries;if(!entry?.isIntersecting){return;}observer.disconnect();resolve();},{rootMargin:MAP_VIEWPORT_MARGIN,});observer.observe(block);});}function showError(container,error){const mapDiv=container.querySelector('.parks-map-container');mapDiv.innerHTML=`
    <div style="display: flex; align-items: center; justify-content: center; height: 400px; background: #f8f9fa; color: #6c757d; text-align: center;">
      <div>
        <h3>Unable to load parks data</h3>
        <p>Please ensure the parks.json file is available.</p>
        <p><small>Error: ${error.message}</small></p>
      </div>
    </div>
  `;}async function activateMapBlock(block,dataEndpoint){try{await waitForBlockVisibility(block);const[parksData]=await Promise.all([loadParks(dataEndpoint),loadDependencies(),]);if(!parksData){throw new Error('Failed to load parks data');}requestAnimationFrame(()=>{const mapInstance=initializeMap(block);addMarkersToMap(mapInstance,parksData);createParkList(block,parksData);updateStats(block,parksData);});}catch(error){showError(block,error);}}export default async function decorate(block){const sectionConfig=getSectionConfig(block);const blockConfig=readBlockConfig(block);const config={...sectionConfig,...blockConfig};const dataEndpoint=getAuthoredDataEndpoint(block,config);const authoredTitle=(config.title&&!Array.isArray(config.title)?config.title:block.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim());const authoredDescription=(config.description&&!Array.isArray(config.description)?config.description:[...block.querySelectorAll('p')].map((paragraph)=>paragraph.textContent?.trim()).find((text)=>text&&!/\.json(\?|$)/i.test(text)));const headerTitle=authoredTitle||'🏞️ Minnesota State Parks Visit Tracker';const headerDescription=authoredDescription||"Green markers indicate parks you've visited, red markers for parks not yet visited";block.innerHTML=`
    <div class="parks-map-wrapper">
      <div class="header">
        <h1>${headerTitle}</h1>
        <p>${headerDescription}</p>
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
      <div class="parks-map-container" aria-live="polite">
        <div class="parks-map-placeholder">Interactive map loads when this section approaches the viewport.</div>
      </div>
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
        <button class="toggle-btn" type="button" aria-expanded="false">Show Park List</button>
      </div>

      <div class="park-list" id="parkList" style="display: none;">
        <div id="parkItems"></div>
      </div>
    </div>
  `;const wrapper=block.querySelector('.parks-map-wrapper');const toggleButton=wrapper.querySelector('.toggle-btn');wrapper.toggleParkList=()=>{const isVisible=toggleParkList(block);updateToggleButton(toggleButton,isVisible);};toggleButton.addEventListener('click',()=>{wrapper.toggleParkList();});activateMapBlock(block,dataEndpoint);}