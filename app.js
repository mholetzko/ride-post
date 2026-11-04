'use strict';

const $ = id => document.getElementById(id);
const canvas = $('post');
const ctx = canvas.getContext('2d');
const state = {week: monday(new Date()), events: [], photos: [], commons: [], instructors: [], photo: null, image: null, eventsReady: false, eventError: false, photoRequest: 0, eventRequest: 0, design: 'dark', settings: null, zoom: 1, imageX: 0, imageY: 0, mode: 'week', drafts: {song:{title:'',subtitle:'',body:'',cta:''},ride:{title:'',subtitle:'',body:'',cta:''}}, recording:false, animationZoom:1};
const DEFAULT_STYLE = Object.freeze({font:'modern',ink:'#6d2339',light:'#f4dfda',accent:'#e6b1bd',paper:'#f4f3ed'});
const FONT_CHOICES = Object.freeze({modern:'-apple-system, BlinkMacSystemFont, Arial, sans-serif',serif:'Georgia, Times New Roman, serif',condensed:'Impact, Arial Narrow, sans-serif',rounded:'Trebuchet MS, Verdana, sans-serif'});
let postStyle = {...DEFAULT_STYLE};
function fontFamily(){return FONT_CHOICES[postStyle.font] || FONT_CHOICES.modern;}
const headlines = ['THE WEEK AHEAD', 'YOUR WEEK, YOUR RIDE', 'MEET ME ON THE BIKE', 'THIS WEEK’S LINEUP', 'LET’S RIDE THIS WEEK', 'NEXT UP: THE RIDES'];
let wordingOffset = 0;
const dayNames = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
const monthNames = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

function monday(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - (result.getDay() + 6) % 7);
  return result;
}
function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function parseDate(value) {
  const parts = String(value || '').slice(0,10).split('-').map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? new Date(parts[0], parts[1]-1, parts[2]) : null;
}
function shortDate(date) {return `${String(date.getDate()).padStart(2,'0')}. ${monthNames[date.getMonth()]}`;}
function weekRange() {
  const end = new Date(state.week); end.setDate(end.getDate()+6);
  return `${shortDate(state.week)} — ${shortDate(end)}`;
}
function setText(el, value) {el.textContent = value;}
function notice(target, text, error=false) {
  target.replaceChildren();
  const p = document.createElement('p'); p.className = 'notice' + (error ? ' error' : ''); p.textContent = text; target.append(p);
}
function displayName() {return (state.settings?.instructor_name || 'Matthias').split(' // ')[0].trim();}
function displayCities() {const cities=new Set(state.events.map(e=>e.studio==='Stuttgart'?'STUTTGART':'MUNICH'));return cities.size ? [...cities].sort().join(' / ') : 'BLACKBIKE';}
function loadPostStyle() {
  try {
    const saved=JSON.parse(localStorage.getItem('ride-post-style') || '{}');
    if (Object.hasOwn(FONT_CHOICES,saved.font)) postStyle.font=saved.font;
    for(const key of ['ink','light','accent','paper']) if(/^#[0-9a-f]{6}$/i.test(saved[key] || '')) postStyle[key]=saved[key];
  } catch {postStyle={...DEFAULT_STYLE};}
  syncStyleControls();
}
function syncStyleControls() {
  $('font-choice').value=postStyle.font;
  for(const key of ['ink','light','accent','paper']) $('color-'+key).value=postStyle[key];
}
function savePostStyle() {
  try {localStorage.setItem('ride-post-style',JSON.stringify(postStyle));} catch {}
  draw();
}
function updateInstructorLabel() {$('instructor-label').textContent = displayName().toUpperCase();}
function renderInstructorList() {
  const query=$('instructor').value.trim().toLocaleLowerCase('de-DE');
  const list=$('instructor-options');list.replaceChildren();
  const matches=state.instructors.filter(i=>i.name.toLocaleLowerCase('de-DE').includes(query));
  for(const instructor of matches) {
    const option=document.createElement('option');option.value=instructor.handle;option.textContent=instructor.name;list.append(option);
  }
  if(matches.some(i=>i.handle===state.settings?.instructor_handle)) list.value=state.settings.instructor_handle;
  else list.selectedIndex=-1;
  $('instructor-status').textContent=matches.length ? `${matches.length} ${matches.length===1 ? 'Motivator' : 'Motivatoren'}${query ? ' gefunden' : ' verfügbar'}.` : 'Kein Motivator gefunden. Versuche einen anderen Namen.';
}
async function loadSettings() {
  try {state.settings = JSON.parse(localStorage.getItem('ride-post-instructor') || 'null');} catch {state.settings = null;}
  if (!state.settings || !/^[a-z0-9-]{1,100}$/.test(state.settings.instructor_handle || '') || typeof state.settings.instructor_name !== 'string') state.settings={instructor_handle:'matthias-eng',instructor_name:'Matthias'};
  state.instructors = [{handle: state.settings.instructor_handle, name: state.settings.instructor_name}];
  $('instructor').value = ''; renderInstructorList(); updateInstructorLabel();
}
async function loadInstructors() {
  try {
    const data = await getJSON('/api/instructors');
    const instructors = Array.isArray(data.instructors) ? data.instructors : [];
    if (!instructors.some(i => i.handle === state.settings.instructor_handle)) instructors.push({handle:state.settings.instructor_handle,name:state.settings.instructor_name});
    state.instructors = instructors;
    renderInstructorList();
  } catch (error) {$('instructor-status').textContent = 'Instructor-Liste nicht verfügbar. Bitte Internetverbindung prüfen und Liste erneut laden.';}
}
function resolveInstructor(input) {
  const normalize = value => value.trim().toLocaleLowerCase('de-DE');
  const target=normalize(input);
  if(!target) throw new Error('Bitte einen Instructor eingeben.');
  const exact=state.instructors.filter(i=>normalize(i.name)===target || normalize(i.handle)===target);
  if(exact.length===1) return exact[0];
  if(exact.length>1) throw new Error('Mehrere Instructor haben diesen Namen. Bitte einen vollständigen Vorschlag auswählen.');
  const short=state.instructors.filter(i=>normalize(i.name.split(' // ')[0])===target);
  if(short.length===1) return short[0];
  if(short.length>1) throw new Error('Mehrere Instructor haben diesen Namen. Bitte einen vollständigen Vorschlag auswählen.');
  throw new Error('Instructor nicht gefunden. Bitte Namen aus den CodexFit-Vorschlägen auswählen oder Liste erneut laden.');
}
async function getJSON(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {signal: controller.signal});
    let body; try {body = await res.json();} catch {throw new Error('Die Antwort konnte nicht gelesen werden.');}
    if (!res.ok) throw new Error(body.error || 'Die Daten konnten nicht geladen werden.');
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.');
    throw error;
  } finally {clearTimeout(timeout);}
}
function renderEvents() {
  const root = $('events'); root.replaceChildren();
  if (!state.events.length) { notice(root,`Für diese Woche wurden keine Kurse mit ${displayName()} gefunden.`); return; }
  for (const event of state.events) {
    const date = parseDate(event.date);
    const row = document.createElement('div'); row.className='event-row';
    const day = document.createElement('div'); day.className='event-date'; day.textContent = date ? `${String(date.getDate()).padStart(2,'0')}.` : '—';
    const weekday = document.createElement('span'); weekday.textContent = date ? dayNames[date.getDay()] : ''; day.append(weekday);
    const main = document.createElement('div'); main.className='event-main'; main.textContent=event.course || 'Class';
    const studio = document.createElement('small'); studio.textContent=event.studio || ''; main.append(studio);
    if (event.theme) {const special=document.createElement('small'); special.textContent=`SPECIAL: ${event.theme}`;main.append(special);const search=document.createElement('button');search.type='button';search.className='special-search-link';search.textContent='Bild zum Special suchen ↗';search.addEventListener('click',()=>{$('commons-query').value=event.theme;$('commons-form').requestSubmit();});main.append(search);}
    const time = document.createElement('div'); time.className='event-time'; time.textContent=String(event.time || '').slice(0,5);
    row.append(day,main,time); root.append(row);
  }
}
async function loadWeek() {
  const request = ++state.eventRequest;
  state.eventsReady = false; state.eventError = false; state.events = [];
  $('week-label').textContent = weekRange();
  const end = new Date(state.week); end.setDate(end.getDate()+6);
  $('week-year').textContent = state.week.getFullYear() === end.getFullYear() ? String(state.week.getFullYear()) : `${state.week.getFullYear()} / ${end.getFullYear()}`;
  notice($('events'),'Termine werden geladen …'); $('retry').hidden = true; draw();
  try {
    const data = await getJSON(`/api/events?week=${iso(state.week)}&instructor=${encodeURIComponent(state.settings.instructor_handle)}`);
    if (request !== state.eventRequest) return;
    state.events = Array.isArray(data.events) ? data.events : [];
    state.eventsReady = true; renderEvents(); draw();
  } catch (err) {
    if (request !== state.eventRequest) return;
    state.eventError = true; notice($('events'), `Termine konnten nicht geladen werden: ${err.message}`, true); $('retry').hidden = false; draw();
  }
}
function renderPhotos() {
  const grid = $('photos'); grid.replaceChildren();
  if (!state.photos.length) {notice(grid,'Keine Bilder gefunden.'); return;}
  for (const photo of state.photos) {
    const button = document.createElement('button'); button.type='button'; button.className='photo-button';
    button.setAttribute('aria-label', `Foto auswählen: ${photo.name}`);
    button.setAttribute('aria-pressed', String(state.photo?.id === photo.id));
    const img = document.createElement('img'); img.src=photo.url; img.alt=''; img.loading='lazy'; img.decoding='async';
    button.append(img); button.addEventListener('click', () => choosePhoto(photo)); grid.append(button);
  }
}
function renderCommons() {
  const root=$('commons-results');root.replaceChildren();
  for (const photo of state.commons) {
    const button=document.createElement('button');button.type='button';button.className='photo-button';
    button.setAttribute('aria-label',`Special-Bild auswählen: ${photo.name}`);button.setAttribute('aria-pressed',String(state.photo?.id===photo.id));
    const img=document.createElement('img');img.src=photo.url;img.alt='';img.loading='lazy';button.append(img);button.addEventListener('click',()=>choosePhoto(photo));root.append(button);
  }
}
async function searchCommons() {
  const q=$('commons-query').value.trim();if(!q)return;
  $('commons-status').textContent='Bilder werden gesucht …';$('commons-results').replaceChildren();state.commons=[];
  try {
    const result=await getJSON(`/api/commons/search?q=${encodeURIComponent(q)}`);
    state.commons=Array.isArray(result.images)?result.images:[];renderCommons();
    $('commons-status').textContent=state.commons.length?`${state.commons.length} Bilder gefunden. Wähle ein Bild aus.`:'Keine Bilder gefunden. Versuche einen anderen Suchbegriff.';
  } catch(error) {$('commons-status').textContent=`Bildsuche fehlgeschlagen: ${error.message}`;}
}
function showCredit(photo) {
  const credit=$('commons-credit');credit.hidden=!photo?.source;
  if (!photo?.source) return;
  $('commons-credit-title').textContent=photo.name;
  $('commons-credit-info').textContent=`${photo.artist || 'Urheber nicht angegeben'} · ${photo.license || 'Lizenz auf der Quellseite prüfen'}`;
  $('commons-credit-link').href=photo.source;
}
let photoDB = null;
function openPhotoDB() {
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('ride-post-photos',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('photos',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('Browserspeicher ist blockiert. Bitte andere App-Tabs schließen.'));
  });
}
function photoDBOperation(mode, action) {
  return new Promise((resolve,reject)=>{
    const tx=photoDB.transaction('photos',mode);let req;
    try {req=action(tx.objectStore('photos'));} catch(err) {reject(err);return;}
    tx.oncomplete=()=>resolve(req?.result);tx.onerror=()=>reject(tx.error || new Error('Speichern fehlgeschlagen.'));tx.onabort=()=>reject(tx.error || new Error('Speichern abgebrochen.'));
  });
}
async function loadPhotos() {
  try {
    if(!photoDB) photoDB=await openPhotoDB();
    for(const photo of state.photos) if(photo.local && photo.url) URL.revokeObjectURL(photo.url);
    const saved=await photoDBOperation('readonly',store=>store.getAll());
    state.photos=saved.map(p=>({id:p.id,name:p.name,url:URL.createObjectURL(p.blob),local:true}));
    $('photo-count').textContent=`${state.photos.length} BILDER`;renderPhotos();
    if(state.photos.length) choosePhoto(state.photos[0]);
    else {state.photo=null;state.image=null;draw();}
  } catch(err) {notice($('photos'),`Browserspeicher nicht verfügbar: ${err.message}`,true);}
}
async function importPhotos(fileList) {
  const files=Array.from(fileList).filter(f=>['image/jpeg','image/png','image/webp'].includes(f.type));
  if(!files.length){$('photo-status').textContent='Keine unterstützten Bilder gefunden. Bitte JPG, PNG oder WebP auswählen.';return;}
  if(!photoDB){$('photo-status').textContent='Der Browserspeicher ist nicht verfügbar.';return;}
  $('photo-status').textContent=`${files.length} Bilder werden lokal gespeichert …`;
  let count=0;
  try {
    if(navigator.storage?.persist) await navigator.storage.persist();
    for(const file of files){await photoDBOperation('readwrite',store=>store.put({id:crypto.randomUUID(),name:file.name,blob:file}));count++;}
    $('photo-status').textContent=`${count} Bilder in diesem Browser gespeichert.`;
  } catch(error) {$('photo-status').textContent=`${count} Bilder gespeichert. Weitere Bilder konnten nicht gespeichert werden – möglicherweise ist der Browserspeicher voll.`;}
  await loadPhotos();
}
function choosePhoto(photo) {
  const request = ++state.photoRequest; state.photo = photo; state.image = null;
  resetImageTransform();
  renderPhotos();renderCommons();showCredit(photo);draw();
  const image = new Image();
  image.onload = () => {if (request === state.photoRequest) {state.image = image; draw();}};
  image.onerror = () => {if (request === state.photoRequest) {$('photo-status').textContent='Dieses Bild konnte nicht geladen werden. Bitte ein anderes auswählen.'; draw();}};
  image.src=photo.url;
}
function drawPhoto(image,x,y,width,height,mode='cover') {
  const base=(mode==='contain' ? Math.min : Math.max)(width/image.naturalWidth,height/image.naturalHeight);
  const w=image.naturalWidth*base*state.zoom*state.animationZoom,h=image.naturalHeight*base*state.zoom*state.animationZoom;
  const dx=x+(width-w)/2+state.imageX*Math.abs(w-width)/2;
  const dy=y+(height-h)/2+state.imageY*Math.abs(h-height)/2;
  ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();ctx.drawImage(image,dx,dy,w,h);ctx.restore();
}
function resetImageTransform() {
  state.zoom=1;state.imageX=0;state.imageY=0;
  $('image-zoom').value='100';$('image-x').value='0';$('image-y').value='0';$('zoom-value').textContent='100 %';
}
function fitText(text, maxWidth, startSize, weight=700, minSize=20) {
  let size = startSize;
  do {ctx.font=`${weight} ${size}px ${fontFamily()}`; if(ctx.measureText(text).width<=maxWidth) break; size-=2;} while(size>minSize);
  return size;
}
function storyDraft() {return state.drafts[state.mode];}
function setMode(mode) {
  if (!['week','song','ride'].includes(mode)) return;
  state.mode=mode;
  for(const key of ['week','song','ride']) $('mode-'+key).setAttribute('aria-pressed',String(mode===key));
  $('week-panel').hidden=mode!=='week';$('story-panel').hidden=mode==='week';
  $('wording-next').hidden=mode!=='week' || state.design!=='light';
  if(mode!=='week') {
    const song=mode==='song',draft=storyDraft();
    $('story-step').textContent=song?'01 / DEIN TRACK':'01 / DEIN RIDE-TIPP';
    $('story-heading').textContent=song?'What’s on repeat?':'Let’s break it down.';
    $('story-intro').textContent=song?'Verrate uns den Track, den du gerade feierst.':'Erkläre eine Bewegung, ein Gefühl oder einen kleinen Ride-Moment.';
    $('story-title-label').textContent=song?'Track / Remix':'Titel / Thema';
    $('story-title').placeholder=song?'Tracktitel oder Remix':'z. B. Find your rhythm';
    $('story-subtitle-label').textContent=song?'Artist / Remix von':'Unterzeile';
    $('story-subtitle').placeholder=song?'Artist oder Remix-Credit':'z. B. Dein erster Ride';
    $('story-body-label').textContent=song?'Deine Notiz':'Deine Erklärung';
    $('story-body').placeholder=song?'Was macht den Track besonders?':'Was sollen deine Rider wissen?';
    $('story-cta').placeholder=song?'z. B. SAVE THIS TRACK':'z. B. TRY IT ON YOUR NEXT RIDE';
    $('story-help').textContent=song?'Die Angaben kannst du frei ändern. Füge beim Posten den Musik- oder Remix-Credit hinzu.':'Kurz und klar: Erkläre einen Gedanken pro Post.';
    for(const field of ['title','subtitle','body','cta']) $('story-'+field).value=draft[field];
  }
  draw();
}
function splitLines(text,maxWidth,maxLines) {
  const words=String(text||'').trim().split(/\s+/).filter(Boolean),lines=[];let line='';
  for(const word of words) {
    const next=line?line+' '+word:word;
    if(ctx.measureText(next).width<=maxWidth){line=next;continue;}
    if(line){lines.push(line);line='';}
    if(lines.length>=maxLines)break;
    let rest=word;
    while(rest && ctx.measureText(rest).width>maxWidth) {
      let n=rest.length;while(n>1 && ctx.measureText(rest.slice(0,n)).width>maxWidth)n--;
      lines.push(rest.slice(0,n));rest=rest.slice(n);
      if(lines.length>=maxLines)break;
    }
    line=rest;
    if(lines.length>=maxLines)break;
  }
  if(line&&lines.length<maxLines)lines.push(line);
  const compact=lines.slice(0,maxLines);
  if(compact.join(' ').replace(/\s/g,'').length<String(text||'').replace(/\s/g,'').length && compact.length){let last=compact[compact.length-1];while(last && ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);compact[compact.length-1]=last+'…';}
  return compact;
}
function drawStory() {
  const draft=storyDraft(),isSong=state.mode==='song';let top;
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
  if(state.design==='light') {
    drawPhoto(state.image,0,0,1080,900);const shade=ctx.createLinearGradient(0,0,0,900);shade.addColorStop(0,'rgba(0,0,0,.38)');shade.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=shade;ctx.fillRect(0,0,1080,900);
    ctx.fillStyle=postStyle.paper;ctx.fillRect(0,900,1080,450);top=900;
  } else if(state.design==='frame') {
    ctx.fillStyle=postStyle.ink;ctx.fillRect(0,0,1080,1350);drawPhoto(state.image,54,54,972,738,'contain');
    const shade=ctx.createLinearGradient(0,54,0,310);shade.addColorStop(0,'rgba(0,0,0,.48)');shade.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=shade;ctx.fillRect(54,54,972,256);top=800;
  } else {
    drawPhoto(state.image,0,0,1080,1350);const shade=ctx.createLinearGradient(0,0,0,1350);shade.addColorStop(0,'rgba(0,0,0,.42)');shade.addColorStop(.35,'rgba(0,0,0,.06)');shade.addColorStop(.58,'rgba(0,0,0,.65)');shade.addColorStop(1,'rgba(0,0,0,.96)');ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1350);top=670;
  }
  ctx.fillStyle=postStyle.light;ctx.font=`700 24px ${fontFamily()}`;ctx.fillText(`${displayName().toUpperCase()}  /  BLACKBIKE`,72,83);
  const darkText=state.design==='light',ink=darkText?postStyle.ink:postStyle.light,accent=darkText?postStyle.ink:postStyle.accent;
  let y=top+48;ctx.fillStyle=accent;ctx.font=`800 21px ${fontFamily()}`;ctx.fillText(isSong?'ON REPEAT / SONG DROP':'THE RIDE / RIDE NOTES',72,y);
  y+=57;ctx.fillStyle=ink;const title=(draft.title|| (isSong?'DEIN TRACK':'DEIN RIDE-TIPP')).toUpperCase();
  ctx.font=`800 ${darkText?48:64}px ${fontFamily()}`;const titleLines=splitLines(title,936,2);for(const line of titleLines){ctx.fillText(line,72,y);y+=darkText?53:69;}
  if(draft.subtitle.trim()){ctx.fillStyle=accent;ctx.font=`700 24px ${fontFamily()}`;for(const line of splitLines(draft.subtitle.trim(),930,1)){ctx.fillText(line,72,y+3);y+=31;}}
  if(draft.body.trim()){ctx.fillStyle=ink;ctx.font=`500 ${darkText?22:26}px ${fontFamily()}`;y+=8;for(const line of splitLines(draft.body.trim(),930,3)){ctx.fillText(line,72,y);y+=darkText?28:33;}}
  const cta=(draft.cta.trim()||(isSong?'SAVE THIS TRACK':'TRY IT ON YOUR NEXT RIDE')).toUpperCase();
  ctx.fillStyle=accent;fitText(cta,900,21,800,14);ctx.fillText(cta,72,1300);
  ctx.textAlign='right';ctx.fillText('↗',1008,1300);ctx.textAlign='left';
}
function drawEditorial() {
  drawPhoto(state.image,0,0,1080,900);
  const topShade=ctx.createLinearGradient(0,0,0,900); topShade.addColorStop(0,'rgba(0,0,0,.38)');topShade.addColorStop(.5,'rgba(0,0,0,0)');topShade.addColorStop(1,'rgba(0,0,0,.22)');
  ctx.fillStyle=topShade;ctx.fillRect(0,0,1080,900);
  ctx.fillStyle=postStyle.light;ctx.textAlign='left';ctx.font=`700 24px ${fontFamily()}`;ctx.fillText(`${displayName().toUpperCase()}  /  ${displayCities()}`,72,83);
  ctx.fillStyle=postStyle.paper;ctx.fillRect(0,900,1080,450);
  const weekIndex=Math.floor(Date.UTC(state.week.getFullYear(),state.week.getMonth(),state.week.getDate()) / 604800000);
  const headline=headlines[((weekIndex + wordingOffset) % headlines.length + headlines.length) % headlines.length];
  ctx.fillStyle=postStyle.ink;fitText(headline,936,58,800,32);ctx.fillText(headline,70,972);
  ctx.fillStyle=postStyle.ink;ctx.font=`700 21px ${fontFamily()}`;ctx.fillText(`${weekRange()}  ${state.week.getFullYear()}`,74,1004);
  if (!state.eventsReady || !state.events.length) {
    ctx.fillStyle='#5e6259';ctx.font=`500 24px ${fontFamily()}`;ctx.fillText(state.eventError ? 'Termine konnten nicht geladen werden' : state.eventsReady ? 'Keine Kurse in dieser Woche' : 'Termine werden geladen …',74,1075);
  } else {
    const top=1024, rowHeight=Math.min(62, 246/state.events.length);
    const size=Math.max(14,Math.min(27,Math.floor(rowHeight*.42)));
    state.events.forEach((event,i)=>{
      const y=top+i*rowHeight;ctx.strokeStyle='#c6c8bd';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(74,y);ctx.lineTo(1006,y);ctx.stroke();
      const date=parseDate(event.date);const dateText=date?`${dayNames[date.getDay()]} ${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.`:'—';
      const baseline=y+rowHeight*(event.theme ? .46 : .65);ctx.textAlign='left';ctx.fillStyle=postStyle.ink;ctx.font=`800 ${size}px ${fontFamily()}`;ctx.fillText(dateText,74,baseline);
      const label=[event.studio,event.course].filter(Boolean).join('  /  ').toUpperCase();fitText(label,480,size,700,12);ctx.fillText(label,310,baseline);
      ctx.font=`800 ${size}px ${fontFamily()}`;ctx.textAlign='right';ctx.fillText(String(event.time || '').slice(0,5),1006,baseline);ctx.textAlign='left';
      if (event.theme) {const theme=String(event.theme).toUpperCase();ctx.fillStyle=postStyle.ink;fitText(theme,690,Math.min(19,Math.max(12,Math.floor(rowHeight*.24))),700,10);ctx.fillText(theme,310,y+rowHeight*.82);}
    });
  }
  ctx.fillStyle=postStyle.ink;ctx.font=`700 20px ${fontFamily()}`;ctx.fillText('SEE YOU ON THE BIKE',74,1303);
  ctx.textAlign='right';ctx.fillText('↗',1006,1303);ctx.textAlign='left';
}
function drawFrame() {
  ctx.fillStyle=postStyle.ink;ctx.fillRect(0,0,1080,1350);
  drawPhoto(state.image,54,54,972,738,'contain');
  const shade=ctx.createLinearGradient(0,54,0,310);shade.addColorStop(0,'rgba(0,0,0,.48)');shade.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=shade;ctx.fillRect(54,54,972,256);
  ctx.fillStyle=postStyle.light;ctx.textAlign='left';ctx.font=`700 22px ${fontFamily()}`;ctx.fillText(`${displayName().toUpperCase()}  /  ${displayCities()}`,82,105);
  ctx.fillStyle=postStyle.light;fitText('RIDE WITH ME',936,58,800,32);ctx.fillText('RIDE WITH ME',70,875);
  ctx.fillStyle=postStyle.accent;ctx.font=`700 22px ${fontFamily()}`;ctx.fillText(`${weekRange()}  ${state.week.getFullYear()}`,72,911);
  if (!state.eventsReady || !state.events.length) {
    ctx.fillStyle=postStyle.light;ctx.font=`500 24px ${fontFamily()}`;ctx.fillText(state.eventError ? 'Termine konnten nicht geladen werden' : state.eventsReady ? 'Keine Kurse in dieser Woche' : 'Termine werden geladen …',72,980);
  } else {
    const top=936,rowHeight=Math.min(68, 320/state.events.length);
    const size=Math.max(14,Math.min(27,Math.floor(rowHeight*.42)));
    state.events.forEach((event,i)=>{
      const y=top+i*rowHeight;ctx.strokeStyle='rgba(255,245,240,.32)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(72,y);ctx.lineTo(1008,y);ctx.stroke();
      const date=parseDate(event.date),dateText=date?`${dayNames[date.getDay()]} ${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.`:'—';
      const baseline=y+rowHeight*(event.theme ? .46 : .65);ctx.fillStyle=postStyle.light;ctx.textAlign='left';ctx.font=`800 ${size}px ${fontFamily()}`;ctx.fillText(dateText,72,baseline);
      const label=[event.studio,event.course].filter(Boolean).join('  /  ').toUpperCase();fitText(label,480,size,700,12);ctx.fillText(label,310,baseline);
      ctx.font=`800 ${size}px ${fontFamily()}`;ctx.textAlign='right';ctx.fillText(String(event.time||'').slice(0,5),1008,baseline);ctx.textAlign='left';
      if(event.theme){ctx.fillStyle=postStyle.accent;fitText(String(event.theme).toUpperCase(),690,Math.min(19,Math.max(12,Math.floor(rowHeight*.24))),700,10);ctx.fillText(String(event.theme).toUpperCase(),310,y+rowHeight*.82);}
    });
  }
  ctx.fillStyle=postStyle.accent;ctx.font=`700 20px ${fontFamily()}`;ctx.fillText('SEE YOU ON THE BIKE',72,1303);ctx.textAlign='right';ctx.fillText('↗',1008,1303);ctx.textAlign='left';
}
function draw() {
  const canDownload = !!state.image && (state.mode==='week' ? state.eventsReady && state.events.length>0 : !!storyDraft().title.trim());
  $('download').disabled = !canDownload || state.recording;
  $('video-download').disabled = !canDownload || state.recording || !videoSupported();
  if (!state.image) {$('canvas-placeholder').hidden=false; return;}
  $('canvas-placeholder').hidden=true;
  ctx.clearRect(0,0,1080,1350);
  if(state.mode!=='week'){drawStory();return;}
  if (state.design === 'light') {drawEditorial(); return;}
  if (state.design === 'frame') {drawFrame(); return;}
  drawPhoto(state.image,0,0,1080,1350);
  const shade = ctx.createLinearGradient(0,0,0,1350);
  shade.addColorStop(0,'rgba(0,0,0,.44)'); shade.addColorStop(.35,'rgba(0,0,0,.06)'); shade.addColorStop(.53,'rgba(0,0,0,.38)'); shade.addColorStop(1,'rgba(0,0,0,.95)');
  ctx.fillStyle=shade; ctx.fillRect(0,0,1080,1350);
  ctx.textBaseline='alphabetic'; ctx.fillStyle=postStyle.light;
  ctx.font=`700 24px ${fontFamily()}`;
  ctx.fillText(`${displayName().toUpperCase()}  /  ${displayCities()}`,72,83);
  ctx.textAlign='right'; ctx.fillText('↗',1008,83); ctx.textAlign='left';
  const events=state.events;
  const listHeight=Math.min(650, Math.max(160, events.length*85));
  const listBottom=1230; const listTop=listBottom-listHeight;
  let headingY=Math.min(820,listTop-45); headingY=Math.max(280,headingY);
  ctx.fillStyle=postStyle.accent; fitText('RIDE SCHEDULE',936,82,800,38);
  ctx.fillText('RIDE SCHEDULE',68,headingY);
  ctx.fillStyle=postStyle.accent; ctx.font=`700 28px ${fontFamily()}`;
  ctx.fillText(`${weekRange()}  ${state.week.getFullYear()}`,72,headingY+43);
  if (!state.eventsReady) {
    ctx.fillStyle=postStyle.light;ctx.font=`500 25px ${fontFamily()}`;ctx.fillText(state.eventError ? 'Termine konnten nicht geladen werden' : 'Termine werden geladen …',72, listTop+50);
  } else if (!events.length) {
    ctx.fillStyle=postStyle.light;ctx.font=`500 25px ${fontFamily()}`;ctx.fillText('Keine Kurse in dieser Woche',72,listTop+50);
  } else {
    const rowHeight=listHeight/events.length;
    const textSize=Math.max(16,Math.min(31,Math.floor(rowHeight*.39)));
    events.forEach((event,i) => {
      const top=listTop+i*rowHeight;
      ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(72,top);ctx.lineTo(1008,top);ctx.stroke();
      const date=parseDate(event.date); const dateText=date?`${dayNames[date.getDay()]} ${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.`:'—';
      const y=top+rowHeight*(event.theme ? .45 : .62);
      ctx.fillStyle=postStyle.light; ctx.textAlign='left'; ctx.font=`800 ${textSize}px ${fontFamily()}`;ctx.fillText(dateText,72,y);
      const studio=String(event.studio || '').replace(/^blackBIKE\s*/i,'').toUpperCase();
      const course=String(event.course || '').toUpperCase();
      const label=[studio,course].filter(Boolean).join('  /  ');
      fitText(label, 480, textSize, 700, 12);ctx.fillText(label,310,y);
      const time=String(event.time || '').slice(0,5);
      ctx.font=`800 ${textSize}px ${fontFamily()}`;ctx.textAlign='right';ctx.fillText(time,1008,y);ctx.textAlign='left';
      if (event.theme) {const theme=String(event.theme).toUpperCase();ctx.fillStyle=postStyle.accent;fitText(theme,690,Math.min(20,Math.max(12,Math.floor(rowHeight*.24))),700,10);ctx.fillText(theme,310,top+rowHeight*.83);}
    });
  }
  ctx.fillStyle=postStyle.light;ctx.font=`700 20px ${fontFamily()}`;ctx.fillText('SEE YOU ON THE BIKE',72,1300);
  ctx.textAlign='right';ctx.fillText('↗',1008,1300);ctx.textAlign='left';
}
$('prev-week').addEventListener('click',()=>{state.week.setDate(state.week.getDate()-7); loadWeek();});
$('next-week').addEventListener('click',()=>{state.week.setDate(state.week.getDate()+7); loadWeek();});
$('retry').addEventListener('click',loadWeek);
$('reload-instructors').addEventListener('click',loadInstructors);
$('commons-form').addEventListener('submit',event=>{event.preventDefault();searchCommons();});
$('commons-copy').addEventListener('click',async()=>{
  const photo=state.photo;if(!photo?.source)return;
  const credit=[photo.name,photo.artist,photo.license,photo.source].filter(Boolean).join(' · ');
  try {await navigator.clipboard.writeText(credit);$('commons-copy').textContent='Quellenangabe kopiert ✓';}
  catch { $('commons-copy').textContent='Bitte Angaben auf der Quellseite kopieren'; }
});
function saveInstructor(instructor) {
  const data = {instructor_handle:instructor.handle,instructor_name:instructor.name};
  try {
    localStorage.setItem('ride-post-instructor',JSON.stringify(data));
    state.settings=data; updateInstructorLabel(); $('settings-status').textContent=`${instructor.name} ausgewählt und gespeichert.`; $('settings-panel').open=false; draw();
    loadWeek();
  } catch(error) {$('settings-status').textContent=error.message;}
}
$('instructor').addEventListener('input',()=>{renderInstructorList();$('settings-status').textContent='';});
$('instructor-options').addEventListener('change',()=>{
  const instructor=state.instructors.find(i=>i.handle===$('instructor-options').value);
  if(instructor) saveInstructor(instructor);
});
$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const selected=state.instructors.find(i=>i.handle===$('instructor-options').value);
    const instructor=selected || resolveInstructor($('instructor').value);
    saveInstructor(instructor);
  } catch(error) {$('settings-status').textContent=error.message;}
});
for(const id of ['image-zoom','image-x','image-y']) $(id).addEventListener('input',()=>{
  state.zoom=Number($('image-zoom').value)/100;state.imageX=Number($('image-x').value)/100;state.imageY=Number($('image-y').value)/100;
  $('zoom-value').textContent=`${$('image-zoom').value} %`;draw();
});
$('image-reset').addEventListener('click',()=>{resetImageTransform();draw();});
$('font-choice').addEventListener('change',()=>{if(Object.hasOwn(FONT_CHOICES,$('font-choice').value))postStyle.font=$('font-choice').value;savePostStyle();});
for(const key of ['ink','light','accent','paper']) $('color-'+key).addEventListener('input',()=>{postStyle[key]=$('color-'+key).value;savePostStyle();});
$('custom-reset').addEventListener('click',()=>{postStyle={...DEFAULT_STYLE};syncStyleControls();savePostStyle();});
$('file-input').addEventListener('change',event=>{importPhotos(event.target.files);event.target.value='';});
$('folder-input').addEventListener('change',event=>{importPhotos(event.target.files);event.target.value='';});
$('clear-photos').addEventListener('click',async()=>{
  if(!photoDB || !state.photos.length || !confirm('Alle gespeicherten Fotos aus diesem Browser entfernen? Deine Originaldateien bleiben erhalten.'))return;
  try {await photoDBOperation('readwrite',store=>store.clear());$('photo-status').textContent='Galerie in diesem Browser geleert.';await loadPhotos();}
  catch(error){$('photo-status').textContent=`Galerie konnte nicht geleert werden: ${error.message}`;}
});
function chooseDesign(design) {state.design=design;$('wording-next').hidden=design!=='light'||state.mode!=='week';$('design-dark').setAttribute('aria-pressed',String(design==='dark'));$('design-light').setAttribute('aria-pressed',String(design==='light'));$('design-frame').setAttribute('aria-pressed',String(design==='frame'));draw();}
$('design-dark').addEventListener('click',()=>chooseDesign('dark'));
$('design-light').addEventListener('click',()=>chooseDesign('light'));
$('design-frame').addEventListener('click',()=>chooseDesign('frame'));
$('wording-next').addEventListener('click',()=>{wordingOffset++;draw();});
for(const mode of ['week','song','ride']) $('mode-'+mode).addEventListener('click',()=>setMode(mode));
for(const field of ['title','subtitle','body','cta']) $('story-'+field).addEventListener('input',()=>{if(state.mode!=='week'){storyDraft()[field]=$('story-'+field).value;draw();}});
function videoMime() {
  if(typeof MediaRecorder==='undefined' || typeof canvas.captureStream!=='function' || typeof MediaRecorder.isTypeSupported!=='function') return '';
  return ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m)) || '';
}
function videoSupported() {return !!videoMime();}
function saveBlob(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function exportVideo() {
  if($('video-download').disabled)return;
  const mime=videoMime();if(!mime){$('video-status').textContent='Videoexport wird von diesem Browser nicht unterstützt.';return;}
  let stream,recorder,timer,failed=false;
  try {
    stream=canvas.captureStream(30);
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});
    const chunks=[];recorder.ondataavailable=e=>{if(e.data && e.data.size)chunks.push(e.data);};
    recorder.onerror=()=>{failed=true;$('video-status').textContent='Video konnte nicht erstellt werden. Bitte versuche es erneut.';};
    recorder.onstop=()=>{
      clearInterval(timer);stream.getTracks().forEach(track=>track.stop());state.recording=false;state.animationZoom=1;draw();
      if(!failed && chunks.length){const type=recorder.mimeType||mime,ext=type.startsWith('video/mp4')?'mp4':'webm';saveBlob(new Blob(chunks,{type}),`ride-post-${state.mode}-${iso(state.week)}.${ext}`);$('video-status').textContent=`Video gespeichert (${ext.toUpperCase()}) · ohne Ton`;}
      else if(!failed)$('video-status').textContent='Video konnte nicht erstellt werden. Bitte versuche es erneut.';
    };
    state.recording=true;draw();$('video-status').textContent='Video wird erstellt … bitte den Tab offen lassen.';recorder.start(250);
    const start=Date.now();timer=setInterval(()=>{const progress=Math.min(1,(Date.now()-start)/6000);state.animationZoom=1+progress*.04;draw();if(progress>=1){clearInterval(timer);if(recorder.state!=='inactive')recorder.stop();}},50);
  } catch(error) {
    clearInterval(timer);stream?.getTracks().forEach(track=>track.stop());state.recording=false;state.animationZoom=1;draw();$('video-status').textContent='Videoexport konnte nicht gestartet werden. Bitte einen anderen Browser versuchen.';
  }
}
$('video-download').addEventListener('click',exportVideo);
$('download').addEventListener('click',()=>{
  if ($('download').disabled) return;
  canvas.toBlob(blob=>{
    if (!blob) {alert('Das Bild konnte nicht gespeichert werden.'); return;}
    saveBlob(blob,`ride-post-${state.mode}-${iso(state.week)}.png`);
  },'image/png');
});
loadPostStyle();
if(!videoSupported()) $('video-status').textContent='Videoexport wird von diesem Browser nicht unterstützt. Das Bild kannst du weiterhin herunterladen.';
loadSettings().then(()=>{loadWeek();loadPhotos();loadInstructors();}).catch(error=>{notice($('events'),`Einstellungen konnten nicht geladen werden: ${error.message}`,true);notice($('photos'),'Bitte die App neu starten.',true);});
