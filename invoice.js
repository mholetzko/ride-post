import * as pdfjs from '/vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
const $ = (s) => document.querySelector(s);
const rows = $('#rows'), form = $('#invoice-form'), status = $('#source-status'), exportStatus = $('#export-status');
const templateFields = ['senderName','senderAddress','phone','email','taxId','taxOffice','recipientName','recipientAddress','accountHolder','bank','iban','bic','city','location','note'];
const currentDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
form.elements.invoiceDate.value = currentDate();
function money(value) { let s = String(value).trim().replace(/\s/g,''); if (!s) return null; if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,''); else s = s.replace(',','.'); if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return null; return Math.round(Number(s)*100); }
const euros = n => (n/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
function addRow(data={}) {
  const tr = document.createElement('tr');
  for (const [key,type] of [['date','date'],['time','time'],['course','text'],['studio','text'],['base','text'],['bonus','text'],['sum','text']]) {
    const td = document.createElement('td'), input = document.createElement('input'); input.type=type; input.name=key; input.value=data[key] || ''; input.setAttribute('aria-label',({date:'Datum',time:'Uhrzeit',course:'Kurs',studio:'Studio',base:'Basis',bonus:'Bonus',sum:'Summe'})[key]); if (['base','bonus','sum'].includes(key)) input.inputMode='decimal'; input.addEventListener('input',updateTotal); td.append(input); tr.append(td);
  }
  const td=document.createElement('td'), button=document.createElement('button'); button.type='button'; button.textContent='×'; button.setAttribute('aria-label','Kurs entfernen'); button.onclick=()=>{tr.remove();updateTotal();};td.append(button);tr.append(td);rows.append(tr);updateTotal();
}
function getRows(){return [...rows.querySelectorAll('tr')].map(tr=>Object.fromEntries([...tr.querySelectorAll('input')].map(i=>[i.name,i.value.trim()])));}
function updateTotal(){const parsed=getRows(); let invalid=false, mismatch=false, sum=0; for(const r of parsed){const b=money(r.base), bonus=money(r.bonus), total=money(r.sum); if(b===null || bonus===null || total===null) invalid=true; else {sum+=total;if(b+bonus!==total)mismatch=true;}} $('#total').textContent=`Gesamt: ${euros(sum)} EUR${invalid?' · Beträge prüfen':''}${mismatch?' · Basis + Bonus stimmt nicht mit Summe überein':''}`;}
function isoDate(d,m,y){const date=new Date(Date.UTC(+y,+m-1,+d)); if(date.getUTCFullYear()!==+y||date.getUTCMonth()!==+m-1||date.getUTCDate()!==+d)return '';return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
async function parsePdf(bytes){
 const pdf=await pdfjs.getDocument({data:bytes, isEvalSupported:false}).promise; const result=[]; let date='', columns=null;
 for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p), content=await page.getTextContent(), lines=[];
  for(const item of content.items){if(!item.str || !item.str.trim())continue;const y=item.transform[5],x=item.transform[4];let line=lines.find(l=>Math.abs(l.y-y)<2);if(!line){line={y,items:[]};lines.push(line);}line.items.push({x,text:item.str.trim()});}
  lines.sort((a,b)=>b.y-a.y);
  for(const line of lines){const items=line.items.sort((a,b)=>a.x-b.x), text=items.map(i=>i.text).join(' '), match=text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);if(match){date=isoDate(match[1],match[2],match[3]);continue;}
   const base=items.find(i=>/^base$/i.test(i.text)),bonus=items.find(i=>/^bonus$/i.test(i.text)),total=items.find(i=>/^total$/i.test(i.text)),studio=items.find(i=>/^studio$/i.test(i.text));if(base&&bonus&&total&&studio){columns={base:base.x,bonus:bonus.x,total:total.x,studio:studio.x};continue;}
   const time=items.find(i=>/^\d{1,2}:\d{2}$/.test(i.text));if(!time||!date||!columns)continue;
   const near=(x)=>items.filter(i=>Math.abs(i.x-x)<15 && money(i.text)!==null).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0];const b=near(columns.base),bn=near(columns.bonus),t=near(columns.total);if(!b||!bn||!t)continue;
   const course=items.filter(i=>i.x>time.x+10&&i.x<columns.studio-8).map(i=>i.text).join(' ');const place=items.filter(i=>i.x>=columns.studio-8&&i.x<columns.base-40).map(i=>i.text).join(' ').replace(/\s+\d+\s*\/\s*\d+.*$/,'');
   result.push({date,time:time.text,course,studio:place,base:euros(money(b.text)),bonus:euros(money(bn.text)),sum:euros(money(t.text))});
  }
 } return result;
}
async function loadPdf(bytes){status.textContent='PDF wird lokal gelesen …';try{if(bytes.byteLength>20*1024*1024)throw new Error('Die Datei ist größer als 20 MB.');const parsed=await parsePdf(bytes);if(!parsed.length)throw new Error('Keine Kurse erkannt. Falls es ein Scan oder ein anderes Layout ist, füge die Kurse bitte manuell hinzu.');rows.replaceChildren();parsed.forEach(addRow);const dates=parsed.map(r=>r.date).sort();const first=dates[0],last=dates[dates.length-1];if(first.slice(0,7)===last.slice(0,7)){form.elements.periodStart.value=first.slice(0,7)+'-01';const [y,m]=first.split('-').map(Number);form.elements.periodEnd.value=`${y}-${String(m).padStart(2,'0')}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;}else{form.elements.periodStart.value=first;form.elements.periodEnd.value=last;}status.textContent=`${parsed.length} Kurse erkannt. Bitte Datum, Kurs und Beträge prüfen und gegebenenfalls bearbeiten.`;}catch(e){status.textContent=`PDF konnte nicht gelesen werden: ${e.message || 'Unbekannter Fehler'}`;}}
$('#source-form').addEventListener('submit',async e=>{e.preventDefault();try{const url=new URL($('#source-url').value);if(url.protocol!=='https:')throw new Error('Bitte einen HTTPS-Link eingeben.');status.textContent='PDF wird direkt im Browser geladen …';const response=await fetch(url.href,{credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error(`Download fehlgeschlagen (HTTP ${response.status}).`);await loadPdf(await response.arrayBuffer());}catch(e){status.textContent=`Link konnte nicht geladen werden. Bitte das PDF herunterladen und hier vom Gerät auswählen. ${e.message || ''}`;}});
$('#source-file').addEventListener('change',async e=>{const file=e.target.files[0];if(file)await loadPdf(await file.arrayBuffer());e.target.value='';});
$('#add-row').onclick=()=>addRow();
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('#save-template').onclick=()=>{const data=Object.fromEntries(templateFields.map(k=>[k,form.elements[k].value]));download(new Blob([JSON.stringify({format:'ride-post-invoice-template',version:1,data},null,2)],{type:'application/json'}),'ride-post-rechnungsvorlage.json');};
$('#template-file').onchange=async e=>{const file=e.target.files[0];try{if(!file)return;if(file.size>100000)throw new Error('Vorlage zu groß.');const data=JSON.parse(await file.text());if(data.format!=='ride-post-invoice-template'||data.version!==1||!data.data||typeof data.data!=='object')throw new Error('Unbekanntes Vorlagenformat.');for(const key of templateFields){const value=data.data[key];if(value!==undefined&&typeof value!=='string')throw new Error('Ungültiges Feld in der Vorlage.');}for(const key of templateFields)form.elements[key].value=(data.data[key]||'').slice(0,3000);exportStatus.textContent='Vorlage lokal geladen.';}catch(error){exportStatus.textContent=`Vorlage konnte nicht geladen werden: ${error.message}`;}finally{e.target.value='';}};
const displayDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s)?`${s.slice(8,10)}.${s.slice(5,7)}.${s.slice(0,4)}`:s;
form.addEventListener('submit',async e=>{e.preventDefault();exportStatus.textContent='';const data=getRows();if(!data.length){exportStatus.textContent='Bitte mindestens einen Kurs hinzufügen.';return;}for(const r of data){const b=money(r.base),bn=money(r.bonus),t=money(r.sum);if(!r.date||!r.time||!r.course||b===null||bn===null||t===null){exportStatus.textContent='Bitte Datum, Uhrzeit, Kurs und alle Beträge für jeden Kurs ausfüllen.';return;}if(b+bn!==t){exportStatus.textContent='Bitte die Beträge prüfen: Basis + Bonus muss der Summe entsprechen.';return;}}if(form.elements.periodStart.value>form.elements.periodEnd.value){exportStatus.textContent='Bitte den Leistungszeitraum prüfen.';return;}
 try {
  const fields = Object.fromEntries([...form.elements].filter(element => element.name).map(element => [element.name, element.value]));
  const invoiceRows = data.map(row => ({ ...row, base: money(row.base), bonus: money(row.bonus), total: money(row.sum) }));
  const bytes = await window.createInvoicePdf(window.PDFLib, fields, invoiceRows);
  download(new Blob([bytes], { type: 'application/pdf' }), 'rechnung.pdf');
  exportStatus.textContent = 'Rechnung lokal erstellt und heruntergeladen.';
 } catch(error) { exportStatus.textContent = 'PDF konnte nicht erstellt werden. Bitte Angaben auf ungewöhnliche Sonderzeichen prüfen.'; }
});
