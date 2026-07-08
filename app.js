const state = { duration: 15, stream: null, recorder: null, chunks: [], videoUrl: null, timer: null, seconds: 0 };
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function go(id){ $$('.screen').forEach(s=>s.classList.toggle('active',s.id===id)); if(id==='analysis') startAnalysis(); if(id==='generation') startGeneration(); if(id==='result') syncResult(); }
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2500); }
$$('[data-toast]').forEach(b=>b.addEventListener('click',()=>toast(b.dataset.toast)));
$('#filmChoice').addEventListener('click', async()=>{ go('capture'); await startCamera(); });
$('#importChoice').addEventListener('click',()=>$('#fileInput').click());
$('#openImport2').addEventListener('click',()=>$('#fileInput').click());
$('#goImportFromCapture').addEventListener('click',()=>$('#fileInput').click());
$('#fileInput').addEventListener('change', e=>{ const f=e.target.files?.[0]; if(!f) return; setVideo(URL.createObjectURL(f)); toast('Vidéo importée. Analyse prête.'); go('analysis'); });
async function startCamera(){
  try{ state.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:true}); $('#cameraPreview').srcObject=state.stream; $('#noCamera').classList.add('hide'); $('#recordLabel').textContent='Prêt'; }
  catch(err){ toast('Caméra non autorisée. Vous pouvez importer une vidéo.'); $('#recordLabel').textContent='Import'; }
}
$('#torchBtn').addEventListener('click', async()=>{
  try{ const track=state.stream?.getVideoTracks?.()[0]; const caps=track?.getCapabilities?.(); if(!caps?.torch){ toast('Torche non supportée par ce navigateur.'); return; } const on=!track._torch; await track.applyConstraints({advanced:[{torch:on}]}); track._torch=on; toast(on?'Flash activé':'Flash désactivé'); }
  catch{ toast('Flash indisponible ici.'); }
});
$('#recordBtn').addEventListener('click',()=>{ if(state.recorder?.state==='recording') stopRecording(); else startRecording(); });
function startRecording(){
  if(!state.stream){ toast('Autorisez la caméra ou importez une vidéo.'); return; }
  try{ state.chunks=[]; state.recorder=new MediaRecorder(state.stream); state.recorder.ondataavailable=e=>{ if(e.data.size) state.chunks.push(e.data); }; state.recorder.onstop=()=>{ setVideo(URL.createObjectURL(new Blob(state.chunks,{type:'video/webm'}))); go('analysis'); }; state.recorder.start(); state.seconds=0; $('#recordBtn').classList.add('recording'); $('#recordLabel').textContent='REC'; state.timer=setInterval(()=>{ state.seconds++; $('#captureTime').textContent=new Date(state.seconds*1000).toISOString().substring(11,19); },1000); }
  catch{ toast('Enregistrement non supporté. Importez une vidéo.'); }
}
function stopRecording(){ try{ state.recorder.stop(); }catch{} clearInterval(state.timer); $('#recordBtn').classList.remove('recording'); $('#recordLabel').textContent='Analyse'; }
function setVideo(url){ if(state.videoUrl) URL.revokeObjectURL(state.videoUrl); state.videoUrl=url; }
$$('.mode-row button').forEach(b=>b.addEventListener('click',()=>{ $$('.mode-row button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); }));
function startAnalysis(){ let p=0; $('#analysisRing').style.setProperty('--p',0); $('#analysisPct').textContent='0%'; $('#step2').classList.remove('active','done'); $('#step3').classList.remove('active','done'); const h=setInterval(()=>{ p+=5; $('#analysisRing').style.setProperty('--p',p); $('#analysisPct').textContent=p+'%'; if(p>=34) $('#step2').classList.add('active'); if(p>=66){ $('#step2').classList.remove('active'); $('#step2').classList.add('done'); $('#step3').classList.add('active'); } if(p>=100){ clearInterval(h); $('#step3').classList.remove('active'); $('#step3').classList.add('done'); setTimeout(()=>go('format'),450); } },95); }
$$('.format-list button').forEach(b=>b.addEventListener('click',()=>{ $$('.format-list button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); state.duration=Number(b.dataset.duration); }));
function startGeneration(){ setTimeout(()=>go('result'),2300); }
function syncResult(){ $('#finalDuration').textContent=state.duration+'s'; const card=$('.result-card'); const vid=$('#resultVideo'); if(state.videoUrl){ vid.src=state.videoUrl; card.classList.add('has-video'); $('#resultFallback').style.display='none'; } else { card.classList.remove('has-video'); $('#resultFallback').style.display='grid'; } }
$$('[data-share]').forEach(b=>b.addEventListener('click',async()=>{ const text='Ma Memory Kiz Memory est prête ✨'; if(b.dataset.share==='whatsapp'){ location.href='https://wa.me/?text='+encodeURIComponent(text+' '+location.href); return; } if(navigator.share){ try{ await navigator.share({title:'Kiz Memory',text,url:location.href}); }catch{} } else toast('Partage système non disponible.'); }));
$('#downloadBtn').addEventListener('click',()=>{ const data={app:'Kiz Memory',version:'V3.2.2 UX Fix',format:'9:16',duration:state.duration+'s',note:'Prototype front-end'}; const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='kiz-memory-recap.json'; a.click(); URL.revokeObjectURL(a.href); });
