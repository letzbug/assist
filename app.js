'use strict';
const $=id=>document.getElementById(id);
const API='https://cameron-assist-api.letzbug.workers.dev';
let db,docs=[],current=null,page=1,zoom=1,readable='',pdfCache=new Map(),activeAudio=null,sequence=0,consent=false,waitingQuestion=null,mode="vision",speechSpeed=1,summaryText="",summaryDoc="",fitStep=0,textScale=1,viewReflow=false;
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const status=t=>{$('status').textContent=t};
const answer=t=>{$('answer').textContent=t};
async function initDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('cameron-assist-v04',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('docs'))r.result.createObjectStore('docs',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
const store=(mode='readonly')=>db.transaction('docs',mode).objectStore('docs');
let loadingPDF;
async function pdfLib(){if(window.pdfjsLib)return pdfjsLib;if(!loadingPDF)loadingPDF=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';ok(pdfjsLib)};s.onerror=()=>no(Error('PDF-Bibliothek konnte nicht geladen werden.'));document.head.append(s)});return loadingPDF}
async function getPDF(d){if(pdfCache.has(d.id))return pdfCache.get(d.id);const lib=await pdfLib();const p=await lib.getDocument({data:new Uint8Array(d.bytes.slice(0))}).promise;pdfCache.set(d.id,p);return p}
async function updateDocs(id){docs=await req(store().getAll());docs.sort((a,b)=>b.created-a.created);$('doc').replaceChildren();if(!docs.length){const o=new Option('Kein Dokument','');$('doc').add(o)}for(const d of docs)$('doc').add(new Option(d.name,d.id));current=docs.find(d=>d.id===id)||docs.find(d=>d.id===current?.id)||docs[0]||null;$('doc').value=current?.id||'';page=1;resetView();await render()}
async function upload(files){for(const file of files){try{const ext=file.name.split('.').pop().toLowerCase();if(!['pdf','txt','md'].includes(ext))throw Error('Bitte PDF, TXT oder MD verwenden.');if(file.size>25e6)throw Error('Datei größer als 25 MB.');const d={id:crypto.randomUUID(),name:file.name,type:ext,bytes:await file.arrayBuffer(),created:Date.now(),pages:1};if(ext==='pdf')d.pages=(await getPDF(d)).numPages;else d.text=new TextDecoder().decode(d.bytes);await req(store('readwrite').put(d));current=d;status('Geöffnet: '+d.name)}catch(e){status(file.name+': '+e.message)}}await updateDocs(current?.id)}
async function pageText(d,n){if(d.type!=='pdf')return d.text||'';const p=await(await getPDF(d)).getPage(n),c=await p.getTextContent();return c.items.map(i=>i.str).join(' ').trim()}
let renderSeq=0;
function resetView(){zoom=1;fitStep=0;textScale=1;viewReflow=false}
function readingValues(){return {font:$('readingFont').value==='dys'?"'OpenDyslexic',Arial,sans-serif":"Arial,Verdana,sans-serif",size:Number($('fontSize').value)*textScale,line:Number($('lineSpace').value),bg:$('paperColor').value==='dark'?'#22212c':$('paperColor').value==='white'?'#fff':'#fff5dc',fg:$('paperColor').value==='dark'?'#fff':'#222'}}
function createTextPage(text,optimized){const el=document.createElement('article');el.className='text-page'+(optimized?' optimized':'');el.textContent=text||'Kein auslesbarer Text. Für gescannte Seiten wird OCR benötigt.';$('page').append(el);applyReadingStyle();return el}
function fitPageWidth(){const target=$('page');return Math.max(240,target.clientWidth-28)}

async function render(){
 const ticket=++renderSeq,target=$('page');target.replaceChildren();readable='';
 if(!current){$('docname').textContent='Dein Dokument erscheint hier';$('pagecount').textContent='–';target.innerHTML='<div class="empty"><span>📄</span><p>Öffne ein PDF oder einen Text.</p><p class="secondary">Du kannst die Datei auch hierher ziehen.</p></div>';return}
 page=Math.max(1,Math.min(page,current.pages||1));$('docname').textContent=current.name;$('pagecount').textContent=page+' / '+current.pages;
 try{
  if(mode==='reading'||viewReflow){
   const text=summaryDoc===current.id&&summaryText&&mode==='reading'?summaryText:await (mode==='reading'?allText():pageText(current,page));
   if(ticket!==renderSeq)return;readable=text;createTextPage(text,true);if(!text.trim())status('Dieses Dokument enthält keinen auslesbaren Text. Ein Scan benötigt OCR.');return;
  }
  if(current.type==='pdf'){
   const pdf=await getPDF(current),p=await pdf.getPage(page);if(ticket!==renderSeq)return;
   const base=p.getViewport({scale:1}),available=fitPageWidth(),scale=(available/base.width)*(fitStep?1:.88)*zoom;
   const viewport=p.getViewport({scale}),canvas=document.createElement('canvas');
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
   target.append(canvas);await p.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   const text=await pageText(current,page);if(ticket!==renderSeq)return;readable=text;
   if(!text)status('PDF-Seite sichtbar. Ohne OCR lässt sich Schrift in Scans nicht einzeln vergrößern.');
  }else{readable=current.text||'';createTextPage(readable,false)}
 }catch(e){target.textContent='Dokument konnte nicht geöffnet werden: '+e.message;status(e.message)}
}
async function allText(){if(!current)return '';if(current.type!=='pdf')return current.text||'';let parts=[],length=0;for(let n=1;n<=current.pages;n++){const t=await pageText(current,n);if(length+t.length>90000)break;parts.push('Seite '+n+'\n'+(t||'[Kein auslesbarer Text]'));length+=t.length}return parts.join('\n\n')}
function applyReadingStyle(){
 const el=$('page').querySelector('.text-page');if(!el)return;
 const v=readingValues(),isReading=mode==='reading'||viewReflow;
 el.style.fontFamily=isReading?v.font:'Arial,Verdana,sans-serif';
 el.style.fontSize=(isReading?v.size:24*textScale)+'px';el.style.lineHeight=isReading?v.line:1.65;
 el.style.background=isReading?v.bg:'#fff';el.style.color=isReading?v.fg:'#222';
 el.style.width=(fitStep?'100%':'88%');el.style.maxWidth='none';el.style.minHeight='100%';
}
async function zoomIn(){
 if(!current)return;
 if(fitStep===0){fitStep=1;zoom=1;status('Dokument füllt jetzt die verfügbare Breite. Nochmals A+ für größere Schrift.');await render();return}
 if(current.type==='pdf'&&mode==='vision'&&!viewReflow){
  const text=await pageText(current,page);
  if(!text.trim()){zoom=Math.min(3,zoom+.2);status('Scan ohne Text: Die ganze Seite wird vergrößert. Für einzelne Schriftzeichen ist OCR nötig.');await render();return}
  viewReflow=true;status('Textansicht aktiviert: Schrift kann jetzt vergrößert werden. A− kehrt zur Originalseite zurück.');
 }
 textScale=Math.min(3,Math.round((textScale+.15)*100)/100);await render();
}
async function zoomOut(){
 if(!current)return;
 if(textScale>1){textScale=Math.max(1,Math.round((textScale-.15)*100)/100);await render();return}
 if(viewReflow){viewReflow=false;await render();return}
 if(zoom>1){zoom=Math.max(1,zoom-.2);await render();return}
 if(fitStep){fitStep=0;await render();return}
 status('Die kleinste Ansicht ist erreicht.');
}
function stop(){sequence++;if(activeAudio){activeAudio.pause();activeAudio=null}speechSynthesis?.cancel()}
function browserSpeak(text){if(!('speechSynthesis' in window))return status('Keine Sprachausgabe verfügbar.');const u=new SpeechSynthesisUtterance(text.slice(0,10000));u.lang='de-DE';u.rate=speechSpeed;speechSynthesis.speak(u)}
async function speak(text){if(!text.trim())return status('Kein auslesbarer Text. Gescannte Seiten benötigen OCR.');stop();const ticket=sequence;const chunks=text.match(/[\s\S]{1,1400}/g)||[];for(const chunk of chunks){if(ticket!==sequence)return;try{const r=await fetch(API+'/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:chunk,speed:speechSpeed})});if(!r.ok)throw Error('HTTP '+r.status);const blob=await r.blob();if(ticket!==sequence)return;const url=URL.createObjectURL(blob),audio=new Audio(url);activeAudio=audio;try{await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onerror=()=>reject(Error('Audiofehler'));audio.play().catch(reject)})}finally{URL.revokeObjectURL(url);if(activeAudio===audio)activeAudio=null}}catch(e){status('Grok-Stimme derzeit nicht verfügbar. Browserstimme wird verwendet.');browserSpeak(chunk);return}}}
async function contextText(q){const m=q.match(/(?:seite|page)\s*(\d+)/i);if(m){const n=Number(m[1]);if(n<1||n>current.pages)throw Error('Diese Seite existiert nicht.');page=n;await render()}const requestedWhole=/gesamten|ganzen|ganze dokument|alles|zusammenfass|worum|was ist das/i.test(q);if(!requestedWhole||current.type!=='pdf')return {text:readable,page};let texts=[],length=0;for(let n=1;n<=current.pages;n++){const t=await pageText(current,n);if(length+t.length>20000)break;texts.push('Seite '+n+': '+t);length+=t.length}return {text:texts.join('\n\n'),page:'mehrere'}}
async function askQuestion(q){if(!current)return answer('Bitte öffne zuerst ein Dokument.');if(!q)return;answer('Cameron liest dein Dokument …');try{const context=await contextText(q);if(!context.text.trim())return answer('Die Seite ist sichtbar, enthält aber keinen auslesbaren Text. Für Scans brauchen wir OCR.');const r=await fetch(API+'/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,documentName:current.name,page:context.page,context:context.text})});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'KI momentan nicht erreichbar');const reply=String(data.answer||'Keine Antwort erhalten.');answer(reply);if(mode==='reading'&&/fasse|zusammenfass/i.test(q)){summaryText=reply;summaryDoc=current.id;const el=$('page').querySelector('.optimized');if(el){el.textContent=reply;applyReadingStyle()}}await speak(reply)}catch(e){answer('Ich kann diese Frage gerade nicht beantworten: '+e.message)}}
async function summarize(){if(!current)return status('Bitte zuerst ein Dokument öffnen.');$('question').value='Fasse das gesamte Dokument in einfacher Sprache zusammen. Erhalte wichtige Beträge, Daten und Fristen.';await ask()}
function setMode(next){mode=next;resetView();summaryText='';summaryDoc='';for(const [id,value] of [['modeVision','vision'],['modeReading','reading']]){$(id).classList.toggle('active',next===value);$(id).setAttribute('aria-pressed',String(next===value))}for(const id of ['fontLabel','sizeLabel','spaceLabel','colorLabel'])$(id).hidden=next!=='reading';render()}
async function printOptimized(){
 if(!current)return status('Bitte zuerst ein Dokument öffnen.');
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const popup=window.open('','_blank');if(!popup)return status('Bitte Pop-ups für den Druck erlauben.');
 const isText=mode==='reading'||viewReflow||current.type!=='pdf';
 const v=readingValues(),fontUrl=new URL('fonts/OpenDyslexic-Regular.otf',document.baseURI).href,fontBoldUrl=new URL('fonts/OpenDyslexic-Bold.otf',document.baseURI).href;
 const fontCss=`@font-face{font-family:OpenDyslexic;src:url("${fontUrl}") format("opentype");font-weight:400}@font-face{font-family:OpenDyslexic;src:url("${fontBoldUrl}") format("opentype");font-weight:700}`;
 const common=`${fontCss}@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font-family:${isText?v.font:'Arial,sans-serif'};font-size:${isText?v.size:24*textScale}px;line-height:${isText?v.line:1.65};background:${isText?v.bg:'#fff'};color:${isText?v.fg:'#222'};overflow-wrap:anywhere}h1{font:700 16px Arial;margin:0 0 12px}article{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
 let content='';
 if(isText){const text=mode==='reading'&&summaryDoc===current.id&&summaryText?summaryText:mode==='reading'?await allText():current.type==='pdf'?await pageText(current,page):current.text||'';
  if(!text.trim()){popup.close();return status('Kein auslesbarer Text. Gescannte Seiten benötigen OCR.')}content='<h1>'+escape(current.name)+'</h1><article>'+escape(text)+'</article>';
 }else{
  // Original-PDF: print all pages at A4 width, retaining the original page graphics.
  const pdf=await getPDF(current),imgs=[];
  for(let n=1;n<=pdf.numPages;n++){
   const pg=await pdf.getPage(n),base=pg.getViewport({scale:1}),vp=pg.getViewport({scale:Math.min(2.2,1500/base.width)}),c=document.createElement('canvas');
   c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
   imgs.push('<img alt="Seite '+n+'" src="'+c.toDataURL('image/png')+'">');
  }
  content=imgs.join('');
 }
 const imageCss=isText?'':'img{display:block;width:100%;height:auto;max-height:265mm;object-fit:contain;break-after:page}img:last-child{break-after:auto}@page{margin:10mm}';
 popup.document.write('<!doctype html><html lang="de"><head><meta charset="utf-8"><title>'+escape(current.name)+'</title><style>'+common+imageCss+'</style></head><body>'+content+'</body></html>');popup.document.close();
 await popup.document.fonts.ready.catch(()=>{});await Promise.all([...popup.document.images].map(img=>img.decode().catch(()=>{})));
 popup.focus();popup.print();
}
async function ask(){const q=$('question').value.trim();if(!q)return;if(!consent){waitingQuestion=q;$('consent').hidden=false;return}await askQuestion(q)}
$('file').addEventListener('change',e=>upload(e.target.files));$('doc').addEventListener('change',async e=>{current=docs.find(d=>d.id===e.target.value)||null;page=1;resetView();await render()});$('prev').onclick=async()=>{page--;await render()};$('next').onclick=async()=>{page++;await render()};$('zoomin').onclick=zoomIn;$('zoomout').onclick=zoomOut;$('read').onclick=()=>speak(readable);$('stop').onclick=stop;$('modeVision').onclick=()=>setMode('vision');$('modeReading').onclick=()=>setMode('reading');$('summary').onclick=summarize;$('export').onclick=printOptimized;for(const id of ['readingFont','fontSize','lineSpace','paperColor'])$(id).addEventListener('change',()=>{applyReadingStyle();status('Leseansicht aktualisiert – diese Einstellungen werden auch gedruckt.')});$('speechSpeed').onchange=e=>speechSpeed=Number(e.target.value);$('ask').onclick=ask;$('question').addEventListener('keydown',e=>{if(e.key==='Enter')ask()});$('cancelConsent').onclick=()=>{$('consent').hidden=true;waitingQuestion=null};$('agreeConsent').onclick=()=>{consent=true;$('consent').hidden=true;if(waitingQuestion)askQuestion(waitingQuestion);waitingQuestion=null};$('mic').onclick=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return status('Spracherkennung ist in diesem Browser nicht verfügbar. Bitte tippe deine Frage.');const r=new SR();r.lang='de-DE';r.onresult=e=>{$('question').value=e.results[0][0].transcript;ask()};r.onerror=()=>status('Mikrofon konnte nicht gestartet werden.');r.start()};
const area=$('page');area.addEventListener('dragover',e=>{e.preventDefault()});area.addEventListener('drop',e=>{e.preventDefault();upload(e.dataTransfer.files)});
initDb().then(async d=>{db=d;await updateDocs()}).catch(e=>status('Browser-Speicher nicht verfügbar: '+e.message));
