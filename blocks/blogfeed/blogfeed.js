import{readBlockConfig}from'../../scripts/aem.js';let blogData=[];function getDateSource(item){return item.date||item.lastModified||'';}function getDisplayDateSource(item){return item.lastModified||item.date||'';}function getDateTimestamp(value){if(!value)return 0;const timestamp=new Date(value).getTime();return Number.isNaN(timestamp)?0:timestamp;}function getSectionConfig(block){const section=block.closest('.section');if(!section?.dataset){return {};}return {path:section.dataset.path,endpoint:section.dataset.endpoint,dataEndpoint:section.dataset.dataEndpoint,feed:section.dataset.feed,source:section.dataset.source,cacheVersion:section.dataset.cacheVersion,version:section.dataset.version,v:section.dataset.v,layout:section.dataset.layout,};}function resolveFeedConfig(block){const sectionConfig=getSectionConfig(block);const blockConfig=readBlockConfig(block);const config={...sectionConfig,...blockConfig};const endpoint=config.path||config.dataEndpoint||config.endpoint||config.feed||config.source||'/query-index.json';const cacheVersion=config.cacheVersion||config.version||config.v||'';const useCardLayout=(config.layout&&`${config.layout}`.toLowerCase()==='cards')||block.classList.contains('cards');return {endpoint,cacheVersion,useCardLayout};}function buildEndpointUrl(endpoint,cacheVersion){const url=new URL(endpoint,window.location.origin);if(cacheVersion){url.searchParams.set('v',cacheVersion);}return `${url.pathname}${url.search}`;}async function fetchBlogData(endpoint,cacheVersion){try{const response=await fetch(buildEndpointUrl(endpoint,cacheVersion));if(!response.ok)throw new Error('Failed to fetch blog data');const result=await response.json();blogData=result.data||[];blogData.sort((a,b)=>{const dateA=getDateTimestamp(getDateSource(a));const dateB=getDateTimestamp(getDateSource(b));return dateB-dateA;});return blogData;}catch(error){return [];}}function formatDate(dateString){if(!dateString)return '';const date=new Date(dateString);if(Number.isNaN(date.getTime())){return dateString;}return date.toLocaleDateString('en-US',{year:'numeric',month:'long',});}function extractDescription(content){if(!content)return '';const tempDiv=document.createElement('div');tempDiv.innerHTML=content;const firstP=tempDiv.querySelector('p');if(firstP){return `${firstP.textContent.trim().substring(0,150)}...`;}return `${tempDiv.textContent.trim().substring(0,150)}...`;}function createBlogCard(item){const card=document.createElement('article');card.className='blog-card';const title=item.title||'Untitled';const description=item.description||extractDescription(item.content)||'';const date=formatDate(getDisplayDateSource(item));const author=item.author||'';const path=item.path||'#';const{image}=item;let imageHTML='';if(image){imageHTML=`
      <div class="blog-card-image">
        <img src="${image}" alt="${title}" loading="lazy">
      </div>
    `;}card.innerHTML=`
    ${imageHTML}
    <div class="blog-card-content">
      <div class="blog-card-header">
        <h2 class="main-heading">
          <a href="${path}">${title}</a>
        </h2>
        ${date?`<time class="date">${date}</time>`:''}
      </div>
      <div class="blog-card-body">
        <p class="blog-card-description">${description}</p>
        <a href="${path}" class="blog-card-link">Read more</a>
      </div>
      ${author?`<div class="blog-card-meta"><span class="author">by ${author}</span></div>`:''}
    </div>
  `;return card;}function createBlogEntry(item){const entry=document.createElement('div');entry.className='blog-entry';const title=item.title||'Untitled';const description=item.description||extractDescription(item.content)||'';const date=formatDate(getDisplayDateSource(item));const author=item.author||'';const path=item.path||'#';const{image}=item;const titleId=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');let datetimeAttr='';const dateObj=new Date(getDisplayDateSource(item));if(!Number.isNaN(dateObj.getTime())){datetimeAttr=`datetime="${dateObj.toISOString().split('T')[0]}"`;}let imageHTML='';if(image){imageHTML=`
      <picture>
        <img loading="lazy" alt="${title}" src="${image}" class="blog-image">
      </picture>
    `;}entry.innerHTML=`
    <div>
      <div>
        <h2 id="${titleId}" class="main-heading">
          <a href="${path}">${title}</a>
        </h2>
        ${date?`<time ${datetimeAttr} class="date">${date}</time>`:''}
        <p>${description}</p>
        ${imageHTML}
        <a href="${path}" class="read-more-link">Read full article →</a>
        ${author?`<p class="author-info"><em>by ${author}</em></p>`:''}
      </div>
    </div>
  `;return entry;}function loadBlogPosts(container,loadingIndicator,useCardLayout=true){const feedContainer=container.querySelector('.blog-feed-posts');feedContainer.innerHTML='';blogData.forEach((item)=>{const blogElement=useCardLayout?createBlogCard(item):createBlogEntry(item);feedContainer.appendChild(blogElement);});loadingIndicator.style.display='none';}function enhanceContent(block){if(!block)return;const headings=block.querySelectorAll('h2, h3, h4');headings.forEach((heading)=>{if(heading.tagName.toLowerCase()==='h2'){heading.classList.add('main-heading');}else if(heading.tagName.toLowerCase()==='h3'){heading.classList.add('sub-heading');}else if(heading.tagName.toLowerCase()==='h4'){heading.classList.add('date');const textContent=heading.textContent.trim();const date=new Date(textContent);if(!Number.isNaN(date.getTime())){const isoDate=date.toISOString().split('T')[0];const timeElement=document.createElement('time');timeElement.setAttribute('datetime',isoDate);timeElement.textContent=textContent;timeElement.classList.add('date');heading.replaceWith(timeElement);}}});}export default async function decorate(block){block.classList.add('loading');const feedConfig=resolveFeedConfig(block);const{useCardLayout}=feedConfig;const containerClass=useCardLayout?'blog-feed-grid':'blog-feed-entries';block.innerHTML=`
    <div class="blog-feed-container">
      <div class="blog-feed-posts ${containerClass}"></div>
      <div class="blog-feed-loading">
        <div class="loading-spinner"></div>
        <p>Loading posts...</p>
      </div>
    </div>
  `;const container=block.querySelector('.blog-feed-container');const loadingIndicator=block.querySelector('.blog-feed-loading');try{await fetchBlogData(feedConfig.endpoint,feedConfig.cacheVersion);if(blogData.length===0){block.innerHTML='<p class="no-posts">No blog posts found.</p>';return;}loadBlogPosts(container,loadingIndicator,useCardLayout);const observer=new MutationObserver(()=>{enhanceContent(container);});observer.observe(container.querySelector('.blog-feed-posts'),{childList:true,});}catch(error){block.innerHTML='<p class="error">Failed to load blog posts.</p>';}finally{block.classList.remove('loading');enhanceContent(block);}}