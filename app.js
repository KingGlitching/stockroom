(function(){
const APP_URL=location.origin+location.pathname;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const S={items:{},bins:{},stock:{},log:[]};
let db=null,mode="local",loaded=false,current="find";

/* ---------------- sample data for the offline preview ---------------- */
const SAMPLE={
 items:{sample1:{name:'Hex bolt 3/8" x 2", zinc (sample)',code:"0076174501230",kind:"bought",min:50,cost:0.18,cat:"Hardware",sup:"Fastenal"},
        sample2:{name:"Oak shelf bracket (sample)",code:"INV-104233",kind:"made",min:10,cost:6.5,cat:"Finished goods",sup:"Shop build"},
        sample3:{name:'Packing tape 2" clear (sample)',code:"0021200012341",kind:"bought",min:12,cost:2.25,cat:"Shipping",sup:"Uline"}},
 bins:{"A01-R01-S1":{aisle:"A01",rack:"R01",shelf:"S1"},"A01-R02-S3":{aisle:"A01",rack:"R02",shelf:"S3"},"A02-R01-S2":{aisle:"A02",rack:"R01",shelf:"S2"},"B01-R01-S1":{aisle:"B01",rack:"R01",shelf:"S1"},"C01-R04-S2":{aisle:"C01",rack:"R04",shelf:"S2"}},
 stock:{"sample1__A01-R02-S3":{itemId:"sample1",binId:"A01-R02-S3",qty:180},"sample1__A02-R01-S2":{itemId:"sample1",binId:"A02-R01-S2",qty:60},"sample2__B01-R01-S1":{itemId:"sample2",binId:"B01-R01-S1",qty:4},"sample3__C01-R04-S2":{itemId:"sample3",binId:"C01-R04-S2",qty:36}}
};

/* ---------------- helpers ---------------- */
function toast(t,k){const el=$("#toast");el.textContent=t;el.className="toast "+(k||"");el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2600)}
const num=s=>{const m=String(s||"").match(/\d+/);return m?parseInt(m[0],10):0};
const binId=(a,r,s,x)=>[a,r,s,x].map(v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"")).filter(Boolean).join("-");
function routeKey(b){ // S-shape walking route: odd aisles walk racks up, even aisles walk them back down
  const a=num(b.aisle),letter=(String(b.aisle).match(/[A-Z]/i)||["A"])[0].toUpperCase().charCodeAt(0),r=num(b.rack);
  const lane=(letter-65)*100+a;const rr=lane%2?r:1000-r;
  return [lane,rr,num(b.shelf),b.slot||""];
}
function byRoute(x,y){const a=routeKey(x),b=routeKey(y);for(let i=0;i<4;i++){if(a[i]<b[i])return -1;if(a[i]>b[i])return 1}return 0}
const binsSorted=()=>Object.entries(S.bins).map(([id,b])=>({id,...b})).sort(byRoute);
function stockOf(itemId){return Object.values(S.stock).filter(s=>s.itemId===itemId&&s.qty>0).map(s=>({...s,bin:{id:s.binId,...(S.bins[s.binId]||{})}})).sort((a,b)=>byRoute(a.bin,b.bin))}
function stockIn(bId){return Object.values(S.stock).filter(s=>s.binId===bId&&s.qty>0)}
const total=id=>stockOf(id).reduce((n,s)=>n+s.qty,0);
const isLow=id=>{const i=S.items[id];return i&&Number(i.min)>0&&total(id)<=Number(i.min)};
const money=n=>n===""||n==null||isNaN(n)?"—":"$"+Number(n).toFixed(2);
function plate(b,xl){
  if(!b||!b.id)return `<div class="plate none ${xl?"xl":""}"><div><small>Bin</small><strong>None</strong></div></div>`;
  const p=[["Aisle",b.aisle],["Rack",b.rack],["Shelf",b.shelf],["Bin",b.slot]].filter(x=>x[1]);
  return `<div class="plate ${xl?"xl":""}">${p.map(x=>`<div><small>${x[0]}</small><strong>${esc(x[1])}</strong></div>`).join("")}</div>`;
}
function newCode(){let c;do{c="INV-"+(100000+Math.floor(Math.random()*900000))}while(Object.values(S.items).some(i=>i.code===c));return c}
const newId=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* ---------------- storage ---------------- */
function localSave(){try{localStorage.setItem("stockroom-v2",JSON.stringify(S))}catch(e){}}
function localLoad(){try{const r=JSON.parse(localStorage.getItem("stockroom-v2"));if(r&&r.items)return r}catch(e){}return null}
async function put(coll,id,data){
  if(db){await db.collection(coll).doc(id).set(data);}
  else{S[coll][id]=data;localSave();renderAll();}
}
async function del(coll,id){
  if(db){await db.collection(coll).doc(id).delete();}
  else{delete S[coll][id];localSave();renderAll();}
}
async function addLog(e){
  e.at=Date.now();
  if(db){try{await db.collection("log").add(e)}catch(x){}}
  else{S.log.unshift(e);S.log=S.log.slice(0,60);localSave();}
}
async function setStock(itemId,bId,qty){
  const id=itemId+"__"+bId;
  if(qty<=0){if(S.stock[id])await del("stock",id);if(db)delete S.stock[id];}
  else{await put("stock",id,{itemId,binId:bId,qty});if(db)S.stock[id]={itemId,binId:bId,qty};}
}
const qtyAt=(itemId,bId)=>(S.stock[itemId+"__"+bId]||{}).qty||0;

const fromLocal=localLoad()||{...SAMPLE,log:[]};Object.assign(S,JSON.parse(JSON.stringify(fromLocal)));
function loadScript(src){return new Promise((ok,no)=>{const t=document.createElement("script");t.src=src;t.onload=ok;t.onerror=no;document.head.appendChild(t)})}
function signInGate(auth){
  return new Promise(res=>{
    auth.onAuthStateChanged(u=>{
      if(u){document.querySelectorAll(".gate").forEach(g=>g.remove());$("main").hidden=false;$("header").hidden=false;res(u);return}
      $("main").hidden=true;
      if(!$(".gate")){const g=document.createElement("div");g.className="gate wrap";
        g.innerHTML=`<div class="card"><h2>Sign in to Stockroom</h2><p class="hint">Inventory is shared between everyone on the team. Sign in with the Google account the owner approved.</p><button class="btn primary" id="gsign">Sign in with Google</button><p class="hint" id="gmsg"></p></div>`;
        document.body.insertBefore(g,$("#toast"));
        $("#gsign").onclick=async()=>{const p=new firebase.auth.GoogleAuthProvider();try{await auth.signInWithPopup(p)}catch(e){try{await auth.signInWithRedirect(p)}catch(x){$("#gmsg").textContent="Sign-in failed: "+(x.message||x.code)}}};}
    });
  });
}
(async()=>{
  await null; // let the rest of the script finish setting up before the first render
  const cfg=window.STOCKROOM_FIREBASE;
  if(cfg&&cfg.apiKey){
    try{
      const v="10.12.2",base="https://www.gstatic.com/firebasejs/"+v+"/";
      await loadScript(base+"firebase-app-compat.js");
      await Promise.all([loadScript(base+"firebase-auth-compat.js"),loadScript(base+"firebase-firestore-compat.js")]);
      firebase.initializeApp(cfg);
      const user=await signInGate(firebase.auth());
      db=firebase.firestore();
      try{await db.enablePersistence({synchronizeTabs:true})}catch(e){}
      mode="shared";S.items={};S.bins={};S.stock={};S.log=[];
      const pending=new Set(["items","bins","stock"]);
      const sub=c=>db.collection(c).onSnapshot(snap=>{S[c]={};snap.docs.forEach(d=>S[c][d.id]=d.data());pending.delete(c);if(!pending.size)loaded=true;renderAll()},e=>toast(e.code==="permission-denied"?"This account isn't allowed in. Ask the owner to add "+(user.email||"you")+".":"Couldn't load inventory. Check your connection.","bad"));
      ["items","bins","stock"].forEach(sub);
      db.collection("log").orderBy("at","desc").limit(40).onSnapshot(snap=>{S.log=snap.docs.map(d=>d.data());if(current==="find")renderFind(true)},()=>{});
    }catch(e){console.error(e);toast("Couldn't connect to the shared database. Using this device only.","bad");db=null;loaded=true}
  }else loaded=true;
  renderAll();openHash();
})();
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});

/* ---------------- scanning ---------------- */
// Accepts: QR links printed by this app (#bin-… / #item-…), product barcodes, bin codes, or pasted text from a scanner app.
// UPC-A (12 digits) and EAN-13 with a leading 0 are the same product code, so compare them without leading zeros
function sameCode(a,b){a=String(a||"").trim().toUpperCase();b=String(b||"").trim().toUpperCase();if(!a||!b)return false;if(a===b)return true;
  return /^\d{8,14}$/.test(a)&&/^\d{8,14}$/.test(b)&&a.replace(/^0+/,"")===b.replace(/^0+/,"")}
function resolve(raw){
  const s=String(raw||"").trim();if(!s)return null;
  const m=s.match(/#(bin|item)-([A-Za-z0-9._~-]+)/);
  if(m){if(m[1]==="bin")return S.bins[m[2]]?{type:"bin",id:m[2]}:{type:"newbin",id:m[2]};
        return S.items[m[2]]?{type:"item",id:m[2]}:{type:"unknown",code:s};}
  const up=s.toUpperCase();
  if(S.bins[up])return {type:"bin",id:up};
  const it=Object.entries(S.items).find(([,i])=>sameCode(i.code,s));
  if(it)return {type:"item",id:it[0]};
  if(/^[A-Z]{0,2}\d{1,3}-[A-Z]{0,2}\d{1,3}-[A-Z]{0,2}\d{1,3}(-[A-Z0-9]{1,3})?$/.test(up))return {type:"newbin",id:up};
  return {type:"unknown",code:s};
}
let photoCb=null;
$("#photo").addEventListener("change",async e=>{
  const f=e.target.files[0];e.target.value="";if(!f||!photoCb)return;
  toast("Reading code…");const code=await decodePhoto(f);
  if(!code){toast("No code found. Hold the phone steady, fill the frame, and use good light.","bad");return}
  photoCb(code);
});
async function decodePhoto(file){
  if("BarcodeDetector" in window){try{const r=await new BarcodeDetector().detect(await createImageBitmap(file));if(r&&r[0])return r[0].rawValue}catch(e){}}
  if(!window.ZXing)return null;
  const url=URL.createObjectURL(file);
  try{const h=new Map();h.set(ZXing.DecodeHintType.TRY_HARDER,true);return (await new ZXing.BrowserMultiFormatReader(h).decodeFromImageUrl(url)).getText()}
  catch(e){return null}finally{URL.revokeObjectURL(url)}
}
/* ---- live camera scanner ---- */
const SC={stream:null,raf:0,onCode:null,facing:"environment",last:"",hits:0,busy:false,detector:null,zx:null,canvas:document.createElement("canvas"),torch:false};
async function openScanner(onCode){
  SC.onCode=onCode;SC.last="";SC.hits=0;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){photoCb=onCode;$("#photo").click();return}
  $("#scanner").hidden=false;$("#scanner").classList.remove("hit");$("#scanMsg").textContent="Starting camera…";
  try{await startStream()}
  catch(e){closeScanner();toast(e&&e.name==="NotAllowedError"?"Camera blocked. Allow camera access for this site in your browser settings.":"Couldn't open the camera. Try a photo instead.","bad");return}
  $("#scanMsg").textContent="Point at a barcode or QR";
  if(!SC.detector&&"BarcodeDetector" in window){try{const f=await BarcodeDetector.getSupportedFormats();if(f&&f.length)SC.detector=new BarcodeDetector({formats:f})}catch(e){}}
  if(!SC.detector&&!SC.zx&&window.ZXing){const h=new Map();h.set(ZXing.DecodeHintType.TRY_HARDER,true);h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.QR_CODE,ZXing.BarcodeFormat.CODE_128,ZXing.BarcodeFormat.CODE_39,ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,ZXing.BarcodeFormat.ITF,ZXing.BarcodeFormat.DATA_MATRIX]);SC.zx=new ZXing.MultiFormatReader();SC.zx.setHints(h)}
  loop();
}
async function startStream(){
  if(SC.stream)SC.stream.getTracks().forEach(t=>t.stop());
  SC.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:SC.facing},width:{ideal:1920},height:{ideal:1080}}});
  const v=$("#scanVideo");v.srcObject=SC.stream;await v.play().catch(()=>{});
  const track=SC.stream.getVideoTracks()[0];let caps={};try{caps=track.getCapabilities?track.getCapabilities():{}}catch(e){}
  $("#scanTorch").hidden=!caps.torch;SC.torch=false;$("#scanTorch").classList.remove("on");
  try{if(caps.focusMode&&caps.focusMode.includes("continuous"))await track.applyConstraints({advanced:[{focusMode:"continuous"}]})}catch(e){}
}
function closeScanner(){
  cancelAnimationFrame(SC.raf);SC.raf=0;
  if(SC.stream){SC.stream.getTracks().forEach(t=>t.stop());SC.stream=null}
  $("#scanVideo").srcObject=null;$("#scanner").hidden=true;
}
let lastTick=0;
function loop(t){
  SC.raf=requestAnimationFrame(loop);
  if(SC.busy||(t&&t-lastTick<120))return;lastTick=t||0;
  const v=$("#scanVideo");if(!v.videoWidth)return;
  SC.busy=true;
  scanFrame(v).then(code=>{SC.busy=false;if(code&&SC.raf)gotCode(code.text,code.qr)}).catch(()=>{SC.busy=false});
}
async function scanFrame(v){
  if(SC.detector){const r=await SC.detector.detect(v);if(r&&r[0])return {text:r[0].rawValue,qr:r[0].format==="qr_code"};return null}
  if(!SC.zx)return null;
  // crop the middle of the frame (where the yellow box is) and scale it down for speed
  const vw=v.videoWidth,vh=v.videoHeight,cw=Math.round(vw*.9),ch=Math.round(vh*.6),sx=(vw-cw)/2,sy=(vh-ch)/2;
  const scale=Math.min(1,1000/cw),c=SC.canvas;c.width=Math.round(cw*scale);c.height=Math.round(ch*scale);
  const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(v,sx,sy,cw,ch,0,0,c.width,c.height);
  try{const bmp=new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c)));const r=SC.zx.decodeWithState(bmp);return {text:r.getText(),qr:r.getBarcodeFormat()===ZXing.BarcodeFormat.QR_CODE}}
  catch(e){return null}
}
function gotCode(text,qr){
  // 1D barcodes must read the same twice in a row to avoid misreads; QR codes have their own error check
  if(!qr){if(text===SC.last)SC.hits++;else{SC.last=text;SC.hits=1}if(SC.hits<2)return}
  $("#scanner").classList.add("hit");
  try{navigator.vibrate&&navigator.vibrate(60)}catch(e){}
  beep();
  const cb=SC.onCode;setTimeout(()=>{closeScanner();cb&&cb(text)},150);
  cancelAnimationFrame(SC.raf);SC.raf=0;
}
let actx=null;
function beep(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=1800;g.gain.value=.08;o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+.09)}catch(e){}}
$("#scanClose").onclick=closeScanner;
$("#scanFlip").onclick=async()=>{SC.facing=SC.facing==="environment"?"user":"environment";try{await startStream()}catch(e){toast("Couldn't switch cameras.","bad")}};
$("#scanTorch").onclick=async()=>{const tr=SC.stream&&SC.stream.getVideoTracks()[0];if(!tr)return;SC.torch=!SC.torch;try{await tr.applyConstraints({advanced:[{torch:SC.torch}]});$("#scanTorch").classList.toggle("on",SC.torch)}catch(e){toast("Flashlight isn't available.","bad")}};
$("#scanPhoto").onclick=()=>{const cb=SC.onCode;closeScanner();photoCb=cb;$("#photo").click()};
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#scanner").hidden)closeScanner()});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&!$("#scanner").hidden)closeScanner()});

// Builds a scan field: live camera (Scan button), Bluetooth/USB scanners (they type + Enter), pasted scanner-app results, or typing.
function scanField(host,id,placeholder,onCode){
  host.innerHTML=`<div class="scan"><input id="${id}" placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go"><button class="btn sign cam" type="button" id="${id}-cam">Scan</button></div>`;
  const inp=host.querySelector("input");
  const go=()=>{const v=inp.value.trim();if(v){inp.value="";onCode(v)}};
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();go()}});
  inp.addEventListener("paste",()=>setTimeout(go,30));
  host.querySelector(".cam").onclick=()=>openScanner(onCode);
  return inp;
}

/* ---------------- codes & labels ---------------- */
function drawBarcode(canvas,code,o){try{JsBarcode(canvas,code,Object.assign({format:"CODE128",displayValue:true,font:"IBM Plex Mono",fontSize:16,height:64,margin:8,background:"#ffffff",lineColor:"#111111"},o||{}));return true}catch(e){return false}}
function drawQR(ctx,text,x,y,size){
  const q=qrcode(0,"M");q.addData(text);q.make();const n=q.getModuleCount(),cell=Math.floor(size/(n+4)),off=Math.floor((size-cell*n)/2);
  ctx.fillStyle="#fff";ctx.fillRect(x,y,size,size);ctx.fillStyle="#000";
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))ctx.fillRect(x+off+c*cell,y+off+r*cell,cell,cell);
}
const binLink=id=>APP_URL+"#bin-"+id, itemLink=id=>APP_URL+"#item-"+id;
function qrCanvas(text,size){const c=document.createElement("canvas");c.width=c.height=size;drawQR(c.getContext("2d"),text,0,0,size);return c}
function binLabel(id){
  const b={id,...S.bins[id]},W=600,H=300,c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
  x.fillStyle="#fff";x.fillRect(0,0,W,H);x.strokeStyle="#111";x.lineWidth=3;x.strokeRect(1.5,1.5,W-3,H-3);
  x.fillStyle="#f2c418";x.fillRect(0,0,330,H);x.fillStyle="#111";x.textBaseline="alphabetic";
  const parts=[["AISLE",b.aisle],["RACK",b.rack],["SHELF",b.shelf],["BIN",b.slot]].filter(p=>p[1]);
  const rowH=(H-40)/parts.length;
  parts.forEach((p,k)=>{const y=24+k*rowH;x.font="600 18px 'Barlow Condensed', Arial";x.fillText(p[0],22,y+20);x.font=`800 ${Math.min(76,rowH-6)}px 'Barlow Condensed', Arial`;x.fillText(p[1],110,y+rowH-12)});
  drawQR(x,binLink(id),340,20,240);
  x.font="600 16px 'IBM Plex Mono', monospace";x.textAlign="center";x.fillText(id,460,284);
  return c;
}
function itemLabel(id){
  const i=S.items[id],W=600,H=300,c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
  x.fillStyle="#fff";x.fillRect(0,0,W,H);x.strokeStyle="#111";x.lineWidth=2;x.strokeRect(1,1,W-2,H-2);
  x.fillStyle="#111";x.font="600 24px 'IBM Plex Sans', Arial";let n=i.name||"";while(x.measureText(n).width>W-190&&n.length>3)n=n.slice(0,-2);if(n!==i.name)n=n.slice(0,-1)+"…";x.fillText(n,20,44);
  x.font="600 15px 'IBM Plex Sans', Arial";x.fillStyle="#555";x.fillText((i.kind==="made"?"MADE IN-HOUSE":"PURCHASED")+(i.cat?" · "+i.cat.toUpperCase():""),20,70);
  drawQR(x,itemLink(id),W-160,14,146);
  const b=document.createElement("canvas");
  if(i.code&&drawBarcode(b,i.code,{height:110,fontSize:22,margin:0})){const s=Math.min((W-40)/b.width,(H-180)/b.height*1.6,2);x.drawImage(b,20,168,Math.min(b.width*s,W-40),H-186)}
  return c;
}
function sheetCanvas(ids,maker){
  const cols=ids.length===1?1:3,W=600,H=300,pad=24,rows=Math.ceil(ids.length/cols);
  const s=document.createElement("canvas");s.width=cols*W+(cols+1)*pad;s.height=rows*H+(rows+1)*pad;const x=s.getContext("2d");
  x.fillStyle="#fff";x.fillRect(0,0,s.width,s.height);
  ids.forEach((id,k)=>x.drawImage(maker(id),pad+(k%cols)*(W+pad),pad+Math.floor(k/cols)*(H+pad)));
  return s;
}
async function saveSheet(ids,maker,filename){
  if(!ids.length){toast("Nothing to label yet");return}
  const blob=await new Promise(r=>sheetCanvas(ids,maker).toBlob(r,"image/png"));
  const file=new File([blob],filename,{type:"image/png"});
  // on phones, the share sheet lets him save to Photos or send straight to a label printer app
  if(navigator.canShare&&navigator.canShare({files:[file]})&&matchMedia("(pointer:coarse)").matches){try{await navigator.share({files:[file],title:filename});return}catch(e){if(e.name==="AbortError")return}}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);toast("Labels saved","good");
}
function printLabels(ids,maker){
  if(!ids.length){toast("Nothing to label yet");return}
  const area=$("#printArea");area.innerHTML='<div class="sheet"></div>';
  ids.forEach(id=>{const img=new Image();img.src=maker(id).toDataURL("image/png");img.alt="";area.firstChild.appendChild(img)});
  setTimeout(()=>window.print(),300);
}

/* ---------------- navigation ---------------- */
function show(v){
  current=v;
  document.querySelectorAll(".view").forEach(s=>s.hidden=s.id!=="v-"+v);
  const tab={item:"find",bin:"bins",edit:"find"}[v]||v;
  document.querySelectorAll("nav button").forEach(b=>b.setAttribute("aria-selected",b.dataset.view===tab));
  window.scrollTo(0,0);
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{const v=b.dataset.view;({find:renderFind,stow:renderStow,pick:renderPick,bins:renderBins,labels:renderLabels})[v]();show(v);setTimeout(()=>{const f=$("#v-"+v+" .scan input");if(f&&matchMedia("(pointer:fine)").matches)f.focus()},50)});
function openHash(){
  const h=(location.hash||"").slice(1);const m=h.match(/^(bin|item)-(.+)$/);if(!m)return;
  if(!loaded){setTimeout(openHash,300);return}
  if(m[1]==="bin"){if(S.bins[m[2]])openBin(m[2]);else toast("Bin "+m[2]+" isn't set up yet","bad")}
  else if(S.items[m[2]])openItem(m[2]);else toast("That item no longer exists","bad");
}
window.addEventListener("hashchange",openHash);
function handleScanGeneral(raw){
  const r=resolve(raw);if(!r)return;
  if(r.type==="item")openItem(r.id);
  else if(r.type==="bin")openBin(r.id);
  else if(r.type==="newbin"){renderBins(r.id);show("bins");toast("New bin code. Set it up below.")}
  else {editItem(null,{code:r.code});toast("Not in inventory yet. Add it below.")}
}
function renderAll(){
  const ni=Object.keys(S.items).length,nb=Object.keys(S.bins).length;
  $("#count").textContent=loaded?`${ni} item${ni===1?"":"s"} · ${nb} bin${nb===1?"":"s"}${mode==="local"?" · this device only":""}`:"Loading inventory…";
  ({find:()=>renderFind(true),stow:()=>renderStow(true),pick:()=>renderPick(true),bins:()=>renderBins(null,true),labels:renderLabels,item:()=>S.items[openItem.id]?openItem(openItem.id,true):renderFind(),bin:()=>S.bins[openBin.id]?openBin(openBin.id,true):(renderBins(),show("bins")),edit:()=>{}})[current]();
}

/* ---------------- FIND ---------------- */
let findQ="",findFilter="all";
function renderFind(refresh){
  const v=$("#v-find");
  if(!refresh||!v.querySelector("#fq")){
    v.innerHTML=`<div class="card" style="gap:10px">
      <div class="prompt">Scan anything or search</div><div id="findScan"></div>
      <input id="fq" type="search" placeholder="Search by name, supplier, category…" autocomplete="off" aria-label="Search">
      <div class="chips" id="ff">${[["all","All"],["bought","Purchased"],["made","Made in-house"],["low","Low stock"]].map(([k,t])=>`<button class="chip" data-k="${k}" aria-pressed="${k===findFilter}">${t}</button>`).join("")}</div>
    </div><ul class="list" id="fres"></ul><div id="flog"></div>`;
    scanField(v.querySelector("#findScan"),"fscan","Scan or type any code",handleScanGeneral);
    const q=v.querySelector("#fq");q.value=findQ;q.oninput=()=>{findQ=q.value;renderFind(true)};
    v.querySelector("#ff").onclick=e=>{const b=e.target.closest(".chip");if(!b)return;findFilter=b.dataset.k;v.querySelectorAll(".chip").forEach(c=>c.setAttribute("aria-pressed",c===b));renderFind(true)};
  }
  const words=findQ.toLowerCase().split(/\s+/).filter(Boolean);
  const list=Object.entries(S.items).filter(([id,i])=>{
    if(findFilter==="low"&&!isLow(id))return false;
    if((findFilter==="made"||findFilter==="bought")&&i.kind!==findFilter)return false;
    const hay=[i.name,i.code,i.cat,i.sup,i.notes,...stockOf(id).map(s=>s.binId)].join(" ").toLowerCase();
    return words.every(w=>hay.includes(w));
  }).sort((a,b)=>(a[1].name||"").localeCompare(b[1].name||""));
  $("#fres").innerHTML=!loaded?`<li class="empty">Loading…</li>`:list.length?list.map(([id,i])=>{const st=stockOf(id);return `<li><button class="row" data-id="${id}">
      ${plate(st[0]&&st[0].bin)}
      <div class="meta"><div class="name">${esc(i.name)}</div><div class="sub">${esc(i.code||"no barcode")}${st.length>1?` · in ${st.length} bins`:""}</div></div>
      <div class="qty ${isLow(id)?"low":""}"><b>${total(id)}</b>on hand</div></button></li>`}).join("")
    :`<li class="empty">${Object.keys(S.items).length?"Nothing matches. Try fewer words.":"No items yet. Go to <b>Stow</b> and scan your first product into a bin."}</li>`;
  $("#fres").querySelectorAll(".row").forEach(r=>r.onclick=()=>openItem(r.dataset.id));
  const lg=S.log.slice(0,8);
  $("#flog").innerHTML=lg.length?`<h3 style="margin:8px 0">Recent activity</h3><ul class="list log">${lg.map(e=>`<li class="row"><span class="verb ${e.type}">${esc(e.type)}</span><div class="meta"><div class="name">${esc((S.items[e.itemId]||{}).name||e.itemName||"Item")}</div><div class="sub">${esc(e.binId||"")} · ${new Date(e.at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</div></div><div class="qty"><b>${e.type==="pick"?"−":e.type==="stow"?"+":"="}${esc(e.qty)}</b></div></li>`).join("")}</ul>`:"";
}

/* ---------------- ITEM ---------------- */
function openItem(id,quiet){
  const i=S.items[id];if(!i)return;openItem.id=id;
  const st=stockOf(id),v=$("#v-item");
  v.innerHTML=`<div class="card">
    <div class="spread"><div style="display:flex;flex-direction:column;gap:6px;min-width:0"><div class="row-flex"><span class="badge">${i.kind==="made"?"Made in-house":"Purchased"}</span>${isLow(id)?'<span class="badge low">Reorder</span>':""}</div><h2>${esc(i.name)}</h2></div><button class="btn ghost" id="back">← Back</button></div>
    <div style="display:flex;flex-direction:column;gap:6px"><span class="prompt">${st.length?"Go to":"Not on a shelf"}</span>${st.length?plate(st[0].bin,true):`<p class="hint">This item isn't in any bin. Use Stow to put it away.</p>`}</div>
    <dl class="facts">
      <div><dt>On hand</dt><dd>${total(id)}</dd></div><div><dt>Reorder at</dt><dd>${esc(i.min||"—")}</dd></div>
      <div><dt>Unit cost</dt><dd>${money(i.cost)}</dd></div><div><dt>Stock value</dt><dd>${i.cost?money(i.cost*total(id)):"—"}</dd></div>
      <div><dt>Category</dt><dd>${esc(i.cat||"—")}</dd></div><div><dt>Supplier / maker</dt><dd>${esc(i.sup||"—")}</dd></div>
    </dl>${i.notes?`<p style="margin:0">${esc(i.notes)}</p>`:""}
  </div>
  ${st.length?`<h3>Bins holding this item</h3><ul class="list">${st.map(s=>`<li class="row"><button data-bin="${s.binId}" aria-label="Open bin ${s.binId}" style="background:none;border:0;padding:0;cursor:pointer">${plate(s.bin)}</button><div class="meta"></div><div class="stepper"><button class="btn sm" data-adj="-1" data-b="${s.binId}" aria-label="Remove one">−</button><b class="qty" style="font-size:17px;color:var(--ink);min-width:36px;text-align:center">${s.qty}</b><button class="btn sm" data-adj="1" data-b="${s.binId}" aria-label="Add one">+</button></div></li>`).join("")}</ul>`:""}
  <div class="codes" id="codes"></div>
  <div class="row-flex"><button class="btn primary" id="stowThis">Stow more</button><button class="btn" id="pickThis">Add to pick list</button><button class="btn" id="edit">Edit</button><button class="btn ghost" id="lbl">Download label</button><button class="btn danger" id="delI">Delete</button></div>
  <div id="cbox"></div>`;
  const bc=document.createElement("canvas");if(i.code&&drawBarcode(bc,i.code))$("#codes").appendChild(bc);
  const q=qrCanvas(itemLink(id),150);$("#codes").appendChild(q);
  $("#back").onclick=()=>{renderFind();show("find")};
  v.querySelectorAll("[data-bin]").forEach(b=>b.onclick=()=>openBin(b.dataset.bin));
  v.querySelectorAll("[data-adj]").forEach(b=>b.onclick=async()=>{const d=+b.dataset.adj,bi=b.dataset.b,n=Math.max(0,qtyAt(id,bi)+d);try{await setStock(id,bi,n);addLog({type:"adjust",itemId:id,binId:bi,qty:n})}catch(e){toast("Couldn't save. You may not have edit access.","bad")};if(!db)openItem(id,true)});
  $("#stowThis").onclick=()=>{stow.item=id;renderStow();show("stow")};
  $("#pickThis").onclick=()=>{addToPick(id,1);renderPick();show("pick")};
  $("#edit").onclick=()=>editItem(id);
  $("#lbl").onclick=()=>saveSheet([id],itemLabel,`item-${i.code||id}.png`);
  $("#delI").onclick=()=>{$("#cbox").innerHTML=`<div class="confirm"><span>Delete “${esc(i.name)}” and its stock records?</span><button class="btn danger" id="y">Delete</button><button class="btn ghost" id="n">Keep</button></div>`;
    $("#n").onclick=()=>$("#cbox").innerHTML="";
    $("#y").onclick=async()=>{try{for(const s of Object.values(S.stock).filter(s=>s.itemId===id))await del("stock",id+"__"+s.binId);await del("items",id);toast("Item deleted");renderFind();show("find")}catch(e){toast("Couldn't delete. You may not have edit access.","bad")}}};
  if(!quiet)show("item");
}

/* ---------------- EDIT / NEW ITEM ---------------- */
function editItem(id,preset,after){
  const i=id?S.items[id]:{kind:"bought",...preset};let kind=i.kind||"bought";
  const v=$("#v-edit");
  v.innerHTML=`<form class="card" id="ef" novalidate>
    <div class="spread"><h3>${id?"Edit item":"New item"}</h3><button type="button" class="btn ghost" id="ecancel">Cancel</button></div>
    <div class="form">
      <label>Item name<input id="e-name" required value="${esc(i.name)}" placeholder='e.g. 3/8" hex bolts, zinc'></label>
      <label>Source<div class="seg" id="e-kind"><button type="button" data-k="bought">Purchased</button><button type="button" data-k="made">Made in-house</button></div></label>
      <label>Barcode<div class="row-flex" style="flex-wrap:nowrap"><input id="e-code" value="${esc(i.code)}" placeholder="Scan the product's barcode" style="font-family:var(--f-mono)"><button type="button" class="btn ghost" id="e-cam">Scan</button><button type="button" class="btn ghost" id="e-gen">New</button></div>
        <span class="hint" style="text-transform:none;letter-spacing:0;font-weight:400">Use the barcode already on the package. For things he makes, tap New to create one.</span></label>
      <label class="s2">Reorder at<input id="e-min" type="number" inputmode="numeric" min="0" value="${esc(i.min)}" placeholder="5"></label>
      <label class="s2">Unit cost ($)<input id="e-cost" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(i.cost)}" placeholder="0.00"></label>
      <label class="s2">Category<input id="e-cat" value="${esc(i.cat)}" list="catlist" placeholder="Hardware"></label>
      <label>Supplier / maker<input id="e-sup" value="${esc(i.sup)}" placeholder="Fastenal"></label>
      <label>Notes<textarea id="e-notes">${esc(i.notes)}</textarea></label>
    </div>
    <datalist id="catlist">${[...new Set(Object.values(S.items).map(x=>x.cat).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join("")}</datalist>
    <div class="row-flex"><button class="btn primary" type="submit">${id?"Save changes":after?"Save and continue":"Save item"}</button></div>
    <p class="hint" id="emsg"></p></form>`;
  const setK=k=>{kind=k;v.querySelectorAll("#e-kind button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.k===k))};setK(kind);
  $("#e-kind").onclick=e=>{const b=e.target.closest("button");if(b)setK(b.dataset.k)};
  $("#e-gen").onclick=()=>$("#e-code").value=newCode();
  $("#e-cam").onclick=()=>openScanner(c=>{$("#e-code").value=c;toast("Scanned "+c,"good")});
  $("#e-code").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#e-min").focus()}});
  $("#ecancel").onclick=()=>{if(id)openItem(id);else if(after){renderStow();show("stow")}else{renderFind();show("find")}};
  $("#ef").addEventListener("submit",async e=>{
    e.preventDefault();
    const g=k=>$("#e-"+k).value.trim();
    const d={name:g("name"),code:g("code")||newCode(),kind,min:g("min")===""?"":+g("min"),cost:g("cost")===""?"":+g("cost"),cat:g("cat"),sup:g("sup"),notes:g("notes")};
    if(!d.name){$("#emsg").textContent="Give the item a name so it can be searched.";$("#e-name").focus();return}
    const dup=Object.entries(S.items).find(([k,x])=>sameCode(x.code,d.code)&&k!==id);
    if(dup){$("#emsg").textContent=`Barcode ${d.code} already belongs to “${dup[1].name}”.`;return}
    const nid=id||newId("i");
    try{await put("items",nid,d);if(db)S.items[nid]=d;toast(id?"Changes saved":"Item added","good");if(after)after(nid);else openItem(nid)}
    catch(x){$("#emsg").textContent="Couldn't save. You may not have edit access, or you're offline."}
  });
  show("edit");setTimeout(()=>$(id||preset&&preset.code?"#e-name":"#e-name").focus(),50);
}

/* ---------------- STOW (put-away) ---------------- */
const stow={item:null,bin:null,qty:1};
function renderStow(refresh){
  const v=$("#v-stow");const it=stow.item&&S.items[stow.item],bn=stow.bin&&S.bins[stow.bin]?{id:stow.bin,...S.bins[stow.bin]}:null;
  if(refresh&&document.activeElement&&v.contains(document.activeElement)&&document.activeElement.tagName==="INPUT")return;
  v.innerHTML=`<div class="how"><div><b>How stowing works</b>Put stock on any shelf with room. Scan the item, scan the bin, enter how many. The app remembers where it went, so nothing needs a fixed home.</div></div>
  <div class="card task">
    <div class="prompt ${it?"done":""}"><span class="n">${it?"✓":"1"}</span>Scan item</div>
    ${it?`<div class="spread"><div class="meta"><div class="name">${esc(it.name)}</div><div class="sub">${esc(it.code)} · ${total(stow.item)} on hand</div></div><button class="btn ghost sm" id="chgItem">Change</button></div>`:`<div id="sItem"></div><button class="btn ghost sm" id="noCode" style="align-self:flex-start">Item has no barcode? Create one</button>`}
  </div>
  <div class="card task" ${it?"":'style="opacity:.55"'}>
    <div class="prompt ${bn?"done":""}"><span class="n">${bn?"✓":"2"}</span>Scan bin</div>
    ${bn?`<div class="spread">${plate(bn,true)}<button class="btn ghost sm" id="chgBin">Change bin</button></div>`:`<div id="sBin"></div>${it?suggestBins(stow.item):""}`}
  </div>
  <div class="card task" ${it&&bn?"":'style="opacity:.55"'}>
    <div class="prompt"><span class="n">3</span>How many</div>
    <div class="row-flex"><div class="stepper"><button class="btn" id="qm" aria-label="Fewer">−</button><input id="sq" type="number" inputmode="numeric" min="1" value="${stow.qty}"><button class="btn" id="qp" aria-label="More">+</button></div>
    <button class="btn primary" id="doStow" ${it&&bn?"":"disabled"} style="flex:1">Stow</button></div>
    ${it&&bn&&qtyAt(stow.item,stow.bin)?`<p class="hint">This bin already holds ${qtyAt(stow.item,stow.bin)}.</p>`:""}
  </div>`;
  if(!it){const f=scanField($("#sItem"),"siscan","Scan or paste item barcode",code=>{
      const r=resolve(code);
      if(r.type==="item"){stow.item=r.id;renderStow();focusScan()}
      else if(r.type==="bin"||r.type==="newbin")toast("That's a bin. Scan the item first.","bad");
      else editItem(null,{code:r.code},nid=>{stow.item=nid;renderStow();show("stow");focusScan()});
    });
    $("#noCode").onclick=()=>editItem(null,{code:newCode(),kind:"made"},nid=>{stow.item=nid;renderStow();show("stow");focusScan()});
  }else $("#chgItem").onclick=()=>{stow.item=null;renderStow();focusScan()};
  if(it&&!bn){scanField($("#sBin"),"sbscan","Scan or paste bin code",code=>{
      const r=resolve(code);
      if(r.type==="bin"){stow.bin=r.id;renderStow();setTimeout(()=>$("#sq").select(),30)}
      else if(r.type==="newbin")createBinFromCode(r.id).then(()=>{stow.bin=r.id;renderStow()});
      else toast("That isn't a bin label. Scan the QR on the shelf.","bad");
    });
    v.querySelectorAll("[data-pickbin]").forEach(b=>b.onclick=()=>{stow.bin=b.dataset.pickbin;renderStow()});
  }
  if(bn)$("#chgBin").onclick=()=>{stow.bin=null;renderStow();focusScan()};
  $("#sq").oninput=()=>stow.qty=Math.max(1,parseInt($("#sq").value)||1);
  $("#qm").onclick=()=>{stow.qty=Math.max(1,stow.qty-1);$("#sq").value=stow.qty};
  $("#qp").onclick=()=>{stow.qty++;$("#sq").value=stow.qty};
  $("#sq").addEventListener("keydown",e=>{if(e.key==="Enter")$("#doStow").click()});
  $("#doStow").onclick=async()=>{
    const n=Math.max(1,parseInt($("#sq").value)||1),iid=stow.item,bid=stow.bin;
    try{await setStock(iid,bid,qtyAt(iid,bid)+n);addLog({type:"stow",itemId:iid,binId:bid,qty:n,itemName:S.items[iid].name});
      toast(`Stowed ${n} in ${bid}`,"good");stow.item=null;stow.qty=1;renderStow();focusScan();}
    catch(e){toast("Couldn't save. You may not have edit access.","bad")}
  };
}
function focusScan(){setTimeout(()=>{const f=$("#v-stow .scan input");if(f)f.focus()},40)}
function suggestBins(itemId){
  const has=stockOf(itemId).slice(0,3).map(s=>s.bin);
  const empty=binsSorted().filter(b=>!stockIn(b.id).length&&!has.some(h=>h.id===b.id)).slice(0,3);
  const all=[...has.map(b=>[b,"Already has this"]),...empty.map(b=>[b,"Empty"])];
  if(!all.length)return Object.keys(S.bins).length?"":`<p class="hint">No bins set up yet. Scan any code like A01-R02-S3 to create one, or add a row of bins on the Bins tab.</p>`;
  return `<p class="hint">Or tap a bin:</p><div class="row-flex">${all.map(([b,t])=>`<button class="btn ghost sm" data-pickbin="${b.id}" title="${t}">${esc(b.id)} <span class="hint">${t}</span></button>`).join("")}</div>`;
}
async function createBinFromCode(id){
  const p=id.split("-");const b={aisle:p[0]||"",rack:p[1]||"",shelf:p[2]||"",slot:p[3]||""};
  try{await put("bins",id,b);if(db)S.bins[id]=b;toast("Created bin "+id,"good")}catch(e){toast("Couldn't create the bin.","bad");throw e}
}

/* ---------------- PICK (orders) ---------------- */
let pick={list:[],tasks:null,i:0,step:0};
try{const r=JSON.parse(localStorage.getItem("stockroom-pick"));if(r&&Array.isArray(r.list))pick=r}catch(e){}
const savePick=()=>{try{localStorage.setItem("stockroom-pick",JSON.stringify(pick))}catch(e){}};
function addToPick(id,n){const e=pick.list.find(x=>x.itemId===id);if(e)e.qty+=n;else pick.list.push({itemId:id,qty:n});savePick()}
function buildTasks(){
  const tasks=[];
  pick.list.forEach(({itemId,qty})=>{let need=qty;for(const s of stockOf(itemId)){if(need<=0)break;const t=Math.min(need,s.qty);tasks.push({itemId,binId:s.binId,qty:t,state:"todo"});need-=t}
    if(need>0)tasks.push({itemId,binId:null,qty:need,state:"short"})});
  const real=tasks.filter(t=>t.binId).sort((a,b)=>byRoute({...S.bins[a.binId]},{...S.bins[b.binId]}));
  return [...real,...tasks.filter(t=>!t.binId)];
}
function renderPick(refresh){
  const v=$("#v-pick");
  if(refresh&&document.activeElement&&v.contains(document.activeElement)&&document.activeElement.tagName==="INPUT")return;
  if(pick.tasks)return renderPicking();
  v.innerHTML=`<div class="how"><div><b>How picking works</b>Add what the order needs. The app splits it across bins and sorts the stops into one walk through the aisles, up one aisle and down the next.</div></div>
  <div class="card"><div class="prompt">Add items to the pick list</div><div id="pScan"></div>
  <input id="pq" type="search" placeholder="…or search by name" autocomplete="off"><ul class="list" id="pqres"></ul></div>
  ${pick.list.length?`<div class="card"><h3>Pick list</h3><ul class="list">${pick.list.map((e,k)=>{const i=S.items[e.itemId];if(!i)return"";const have=total(e.itemId);return `<li class="row" style="grid-template-columns:1fr auto">
    <div class="meta"><div class="name">${esc(i.name)}</div><div class="sub" style="${have<e.qty?"color:var(--danger)":""}">${have} on hand${have<e.qty?" · short "+(e.qty-have):""}</div></div>
    <div class="stepper"><button class="btn sm" data-k="${k}" data-d="-1">−</button><b style="min-width:30px;text-align:center;font-family:var(--f-mono)">${e.qty}</b><button class="btn sm" data-k="${k}" data-d="1">+</button></div></li>`}).join("")}</ul>
    <div class="row-flex"><button class="btn primary" id="startPick" style="flex:1">Start picking</button><button class="btn ghost" id="clearPick">Clear</button></div></div>`
  :`<div class="empty">The pick list is empty. Scan or search for the items an order needs.</div>`}`;
  scanField($("#pScan"),"pscan","Scan or paste item barcode",code=>{const r=resolve(code);if(r.type==="item"){addToPick(r.id,1);renderPick();toast("Added "+S.items[r.id].name,"good");setTimeout(()=>{const f=$("#pscan");if(f)f.focus()},30)}else toast("No item with that code.","bad")});
  const pq=$("#pq");pq.oninput=()=>{const w=pq.value.toLowerCase().trim();$("#pqres").innerHTML=w?Object.entries(S.items).filter(([,i])=>(i.name+" "+i.code).toLowerCase().includes(w)).slice(0,6).map(([id,i])=>`<li><button class="row" style="grid-template-columns:1fr auto" data-add="${id}"><span class="name">${esc(i.name)}</span><span class="qty"><b>${total(id)}</b></span></button></li>`).join(""):"";
    $("#pqres").querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{addToPick(b.dataset.add,1);renderPick()})};
  v.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{const e=pick.list[+b.dataset.k];e.qty+= +b.dataset.d;if(e.qty<=0)pick.list.splice(+b.dataset.k,1);savePick();renderPick()});
  if(pick.list.length){$("#startPick").onclick=()=>{pick.tasks=buildTasks();pick.i=pick.tasks.findIndex(t=>t.state==="todo");pick.step=0;if(pick.i<0)pick.i=pick.tasks.length;savePick();renderPick()};
    $("#clearPick").onclick=()=>{pick.list=[];savePick();renderPick()};}
}
function renderPicking(){
  const v=$("#v-pick"),T=pick.tasks,done=T.filter(t=>t.state!=="todo").length,t=T[pick.i];
  const routeHtml=`<ul class="route">${T.map((x,k)=>`<li class="${k===pick.i?"cur":x.state==="done"?"done":x.state==="short"?"short":""}"><span style="min-width:110px">${esc(x.binId||"NO STOCK")}</span><span style="flex:1;min-width:0;overflow-wrap:anywhere">${esc((S.items[x.itemId]||{}).name)}</span><span>×${x.qty}</span></li>`).join("")}</ul>`;
  if(!t||t.state!=="todo"){
    const sh=T.filter(x=>x.state==="short");
    v.innerHTML=`<div class="card"><h2>Pick complete</h2><p class="hint">${T.filter(x=>x.state==="done").length} stops picked${sh.length?`, ${sh.length} short`:""}.</p>${routeHtml}<div class="row-flex"><button class="btn primary" id="newPick">New pick list</button></div></div>`;
    $("#newPick").onclick=()=>{pick={list:[],tasks:null,i:0,step:0};savePick();renderPick()};return;
  }
  const it=S.items[t.itemId]||{name:"Missing item"},b={id:t.binId,...S.bins[t.binId]};
  v.innerHTML=`<div class="progress"><i style="width:${Math.round(done/T.length*100)}%"></i></div>
  <div class="card task">
    <div class="spread"><span class="prompt">Stop ${pick.i+1} of ${T.length}</span><button class="btn ghost sm" id="quit">Exit</button></div>
    ${plate(b,true)}
    <div><div class="prompt" style="color:var(--ink)">Pick ${t.qty}</div><h2>${esc(it.name)}</h2><div class="sub">${esc(it.code)} · bin holds ${qtyAt(t.itemId,t.binId)}</div></div>
    <div class="prompt ${pick.step>0?"done":""}"><span class="n">${pick.step>0?"✓":"1"}</span>Scan the bin</div>
    <div class="prompt ${pick.step>1?"done":""}"><span class="n">${pick.step>1?"✓":"2"}</span>Scan the item</div>
    ${pick.step<2?`<div id="pk"></div>`:""}
    <div class="row-flex"><button class="btn primary" id="confirm" style="flex:1">${pick.step<2?"Confirm without scanning":"Confirm pick"}</button><button class="btn danger" id="short">Bin is short</button></div>
  </div>
  <h3>Route</h3>${routeHtml}`;
  if(pick.step<2)scanField($("#pk"),"pkscan",pick.step===0?"Scan bin "+t.binId:"Scan item barcode",code=>{
    const r=resolve(code);
    if(pick.step===0){if(r.type==="bin"&&r.id===t.binId){pick.step=1;savePick();renderPicking();setTimeout(()=>{const f=$("#pkscan");if(f)f.focus()},30)}else toast("Wrong bin. Go to "+t.binId,"bad")}
    else{if(r.type==="item"&&r.id===t.itemId){pick.step=2;savePick();renderPicking()}else toast("Wrong item. Check the label.","bad")}
  });
  if(pick.step<2&&matchMedia("(pointer:fine)").matches)setTimeout(()=>{const f=$("#pkscan");if(f)f.focus()},30);
  const next=()=>{pick.step=0;pick.i=T.findIndex(x=>x.state==="todo");if(pick.i<0)pick.i=T.length;savePick();renderPicking()};
  $("#confirm").onclick=async()=>{try{const left=qtyAt(t.itemId,t.binId)-t.qty;await setStock(t.itemId,t.binId,Math.max(0,left));addLog({type:"pick",itemId:t.itemId,binId:t.binId,qty:t.qty,itemName:it.name});t.state="done";toast("Picked","good");next()}catch(e){toast("Couldn't save. You may not have edit access.","bad")}};
  $("#short").onclick=()=>{t.state="short";next()};
  $("#quit").onclick=()=>{pick.tasks=null;savePick();renderPick()};
}

/* ---------------- BINS ---------------- */
function renderBins(prefill,refresh){
  const v=$("#v-bins");
  if(refresh&&document.activeElement&&v.contains(document.activeElement)&&document.activeElement.tagName==="INPUT")return;
  const bins=binsSorted();
  const p=prefill?prefill.split("-"):[];
  v.innerHTML=`<div class="how"><div><b>Bins are addresses</b>Every shelf spot gets a code like A01-R02-S3: aisle, rack, shelf. Print the QR labels and stick one on each spot.</div></div>
  <div class="card"><div class="prompt">Scan a bin to see what's in it</div><div id="bScan"></div></div>
  <details class="card" ${prefill||!bins.length?"open":""}><summary style="cursor:pointer"><h3 style="display:inline">Set up bins</h3></summary>
    <form id="bf" class="form" novalidate style="margin-top:12px">
      <label class="s2">Aisle<input id="b-a" value="${esc(p[0]||"A01")}" autocomplete="off"></label>
      <label class="s2">Racks from<input id="b-r1" type="number" min="1" value="${num(p[1])||1}"></label>
      <label class="s2">Racks to<input id="b-r2" type="number" min="1" value="${num(p[1])||4}"></label>
      <label class="s3">Shelves per rack<input id="b-s" type="number" min="1" max="12" value="${p[2]?1:4}"></label>
      <label class="s3">Starting shelf<input id="b-s0" type="number" min="1" value="${num(p[2])||1}"></label>
      <div style="grid-column:span 6" class="row-flex"><button class="btn primary" type="submit" id="bmake">Create bins</button><span class="hint" id="bprev"></span></div>
    </form></details>
  <h3>${bins.length} bin${bins.length===1?"":"s"} · walking order</h3>
  <ul class="list">${bins.length?bins.map(b=>{const c=stockIn(b.id);return `<li><button class="row" data-b="${b.id}">${plate(b)}<div class="meta"><div class="sub">${c.length?c.slice(0,2).map(s=>esc((S.items[s.itemId]||{}).name)).join(", ")+(c.length>2?` +${c.length-2}`:""):"Empty"}</div></div><div class="qty"><b>${c.reduce((n,s)=>n+s.qty,0)}</b>units</div></button></li>`}).join(""):`<li class="empty">No bins yet. Create a row of them above.</li>`}</ul>`;
  scanField($("#bScan"),"bscan","Scan or paste bin code",code=>{const r=resolve(code);if(r.type==="bin")openBin(r.id);else if(r.type==="newbin")renderBins(r.id);else if(r.type==="item")openItem(r.id);else toast("Not a bin code.","bad")});
  v.querySelectorAll("[data-b]").forEach(b=>b.onclick=()=>openBin(b.dataset.b));
  const plan=()=>{const a=$("#b-a").value,r1=+$("#b-r1").value||1,r2=Math.max(r1,+$("#b-r2").value||r1),s=Math.min(12,+$("#b-s").value||1),s0=+$("#b-s0").value||1;const out=[];
    for(let r=r1;r<=r2;r++)for(let k=0;k<s;k++){const rack="R"+String(r).padStart(2,"0"),shelf="S"+(s0+k),id=binId(a,rack,shelf);out.push([id,{aisle:a.toUpperCase().replace(/[^A-Z0-9]/g,""),rack,shelf}])}return out};
  const upd=()=>{const pl=plan(),fresh=pl.filter(([id])=>!S.bins[id]);$("#bprev").textContent=pl.length?`${fresh.length} new: ${pl[0][0]} … ${pl[pl.length-1][0]}`:"";$("#bmake").disabled=!fresh.length||pl.length>200};
  v.querySelectorAll("#bf input").forEach(i=>i.oninput=upd);upd();
  $("#bf").addEventListener("submit",async e=>{e.preventDefault();const fresh=plan().filter(([id])=>!S.bins[id]);$("#bmake").disabled=true;
    try{for(const [id,b] of fresh){await put("bins",id,b);if(db)S.bins[id]=b}toast(`Created ${fresh.length} bins`,"good");renderBins()}catch(x){toast("Couldn't create bins. You may not have edit access.","bad");$("#bmake").disabled=false}});
}
function openBin(id,quiet){
  const b={id,...S.bins[id]};if(!S.bins[id])return;openBin.id=id;
  const c=stockIn(id),v=$("#v-bin");
  v.innerHTML=`<div class="card"><div class="spread"><span class="prompt">Bin ${esc(id)}</span><button class="btn ghost" id="bback">← Bins</button></div>${plate(b,true)}
    <div class="codes" id="bqr"></div>
    <div class="row-flex"><button class="btn primary" id="stowHere">Stow into this bin</button><button class="btn ghost" id="blbl">Download bin label</button>${c.length?"":'<button class="btn danger" id="bdel">Delete bin</button>'}</div></div>
  <h3>Contents · count check</h3>
  <ul class="list">${c.length?c.map(s=>{const i=S.items[s.itemId]||{};return `<li class="row" style="grid-template-columns:1fr auto"><button class="meta" data-i="${s.itemId}" style="background:none;border:0;padding:0;text-align:left;color:inherit;font:inherit;cursor:pointer"><div class="name">${esc(i.name)}</div><div class="sub">${esc(i.code)}</div></button>
    <div class="stepper"><button class="btn sm" data-adj="-1" data-it="${s.itemId}">−</button><input type="number" inputmode="numeric" min="0" value="${s.qty}" data-set="${s.itemId}" id="cnt-${esc(s.itemId)}" aria-label="Counted quantity"><button class="btn sm" data-adj="1" data-it="${s.itemId}">+</button></div></li>`}).join(""):`<li class="empty">Empty bin.</li>`}</ul>`;
  $("#bqr").appendChild(qrCanvas(binLink(id),170));
  $("#bback").onclick=()=>{renderBins();show("bins")};
  $("#stowHere").onclick=()=>{stow.bin=id;stow.item=null;renderStow();show("stow");focusScan()};
  $("#blbl").onclick=()=>saveSheet([id],binLabel,`bin-${id}.png`);
  if($("#bdel"))$("#bdel").onclick=async()=>{try{await del("bins",id);toast("Bin deleted");renderBins();show("bins")}catch(e){toast("Couldn't delete.","bad")}};
  v.querySelectorAll("[data-i]").forEach(x=>x.onclick=()=>openItem(x.dataset.i));
  const save=async(it,n)=>{try{await setStock(it,id,n);addLog({type:"count",itemId:it,binId:id,qty:n,itemName:(S.items[it]||{}).name});if(!db)openBin(id,true)}catch(e){toast("Couldn't save. You may not have edit access.","bad")}};
  v.querySelectorAll("[data-adj]").forEach(x=>x.onclick=()=>save(x.dataset.it,Math.max(0,qtyAt(x.dataset.it,id)+ +x.dataset.adj)));
  v.querySelectorAll("[data-set]").forEach(x=>x.onchange=()=>save(x.dataset.set,Math.max(0,parseInt(x.value)||0)));
  if(!quiet)show("bin");
}

/* ---------------- LABELS ---------------- */
let lblTab="bins";
function renderLabels(){
  const v=$("#v-labels");
  const ids=lblTab==="bins"?binsSorted().map(b=>b.id):Object.keys(S.items).sort((a,b)=>S.items[a].name.localeCompare(S.items[b].name));
  v.innerHTML=`<div class="how">
    <div><b>Scan button</b>Opens the live camera right in the app. Works on product barcodes and these QR labels.</div>
    <div><b>Phone camera app</b>Point the regular camera at a QR label and tap the link. The bin or item opens here.</div>
    <div><b>Scanner app</b>Scan, copy the result, and paste it into any scan box.</div>
    <div><b>Handheld scanner</b>A Bluetooth or USB scanner types the code into the scan box for you.</div></div>
  <div class="seg" id="lt"><button data-k="bins" aria-pressed="${lblTab==="bins"}">Bin labels</button><button data-k="items" aria-pressed="${lblTab==="items"}">Item labels</button></div>
  <div class="row-flex"><button class="btn primary" id="pr">Print ${ids.length} labels</button><button class="btn ghost" id="dl">Save as image</button><span class="hint">Print on sticker paper, 3 across.</span></div>
  <div class="labels-grid" id="lg"></div>`;
  $("#lt").onclick=e=>{const b=e.target.closest("button");if(b){lblTab=b.dataset.k;renderLabels()}};
  const g=$("#lg");if(!ids.length)g.innerHTML=`<div class="empty">Nothing to label yet.</div>`;
  ids.slice(0,60).forEach(id=>{const d=document.createElement("div");d.className="mini";d.appendChild(lblTab==="bins"?binLabel(id):itemLabel(id));g.appendChild(d)});
  $("#dl").disabled=$("#pr").disabled=!ids.length;
  $("#pr").onclick=()=>printLabels(ids,lblTab==="bins"?binLabel:itemLabel);
  $("#dl").onclick=()=>saveSheet(ids.slice(0,150),lblTab==="bins"?binLabel:itemLabel,`stockroom-${lblTab}-labels.png`);
}

renderFind();renderAll();
})();
