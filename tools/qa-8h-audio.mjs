// Native Web Audio offline signal checks. No speaker playback or audio files.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const port = Number(process.env.SKYWIND_QA_CDP_PORT || 9230);
const output = resolve('.work/8h-build/evidence');
const run = process.argv[2] || 'audio';
if (!/^[a-z0-9-]+$/i.test(run)) throw new Error('Invalid run name');
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find(item => item.type === 'page' && item.url.startsWith('http://127.0.0.1:5173/'));
if (!target) throw new Error('Owned local QA page unavailable');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', bad, { once: true }); });
let next = 0; const pending = new Map();
socket.addEventListener('message', event => { const message = JSON.parse(event.data), item = pending.get(message.id); if (!item) return; pending.delete(message.id); if (message.error) item.bad(new Error(JSON.stringify(message.error))); else item.ok(message.result); });
function cdp(method, params = {}) { return new Promise((ok, bad) => { const id = ++next; pending.set(id, { ok, bad }); socket.send(JSON.stringify({ id, method, params })); }); }
const report = { at: new Date().toISOString(), type: 'native-offline-audio-signal-check', limitations: ['Synthetic event stress sequence; not a listening or musical quality judgment', 'Background music uses the existing fixed 0.28 gain without transient ducking, providing a conservative signal headroom check', 'OfflineAudioContext renders only to memory and never to speakers'] };
try {
  const result = await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async()=>{
    const main=await import(new URL('src/main.js',location.href));main.audio.setMuted(true);main.setPaused(true);
    const {AudioDirector}=await import(new URL('src/audio.js',location.href));
    const NativeAudio=window.Audio,NativeContext=window.AudioContext,NativeWebkit=window.webkitAudioContext;
    class SilentDeck {constructor(){this.src='';this.volume=0;this.muted=true;this.paused=true;}addEventListener(){}pause(){this.paused=true;}load(){}async play(){this.paused=false;}}
    const scenarios=[];let expectedBuffers=0;
    for(const bossKind of ['warden','carrier','lancer','bastion','apex']){
      const context=new OfflineAudioContext(2,48000*6,48000);
      // Existing AudioDirector builds its own native graph. The facade avoids
      // unlock calling OfflineAudioContext.resume before rendering has started.
      const facade=new Proxy(context,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      let director,unlock;
      try{window.Audio=SilentDeck;window.AudioContext=function(){return facade;};window.webkitAudioContext=window.AudioContext;director=new AudioDirector();unlock=director.unlock();}
      finally{window.Audio=NativeAudio;window.AudioContext=NativeContext;window.webkitAudioContext=NativeWebkit;}
      await unlock;cancelAnimationFrame(director._fadeFrame);director._fadeFrame=0;
      if(director.error||!director.effectsReady)throw new Error('Native sample decode failed: '+director.error);
      expectedBuffers=director._buffers.size;
      const musicData=await (await fetch(director.tracks.boss)).arrayBuffer();
      const music=context.createBufferSource(),musicGain=context.createGain();music.buffer=await context.decodeAudioData(musicData);music.loop=true;musicGain.gain.value=.28;music.connect(musicGain);musicGain.connect(context.destination);music.start(0);
      let maxVoices=0,maxRetiring=0,maxTones=0,eventCount=0;
      const emit=event=>{director.playEvent(event);eventCount++;maxVoices=Math.max(maxVoices,director._voices.size);maxRetiring=Math.max(maxRetiring,director._retiringVoices.size);maxTones=Math.max(maxTones,director._uiTones.size);};
      emit({type:'boss',bossKind});
      const schedule=[];
      for(let tick=1;tick<50;tick++)schedule.push({tick,time:tick*.1,suspended:context.suspend(tick*.1)});
      const rendering=context.startRendering();
      for(const item of schedule){await item.suspended;const tick=item.tick,weaponMode=['normal','spread','lance','helix'][tick%4];
        emit({type:'shot',weaponMode,powered:weaponMode!=='normal',tension:true,x:240});
        emit({type:'shot',weaponMode:'drone',drone:true,tension:true,x:240});
        emit({type:'enemyShot',boss:true,bossKind,x:1000});
        emit({type:'hit',enemyType:'boss',bossKind,weaponMode,tension:true,armorOpen:tick%10===0,coreHit:tick%10===0,x:1000});
        if(tick%3===0)emit({type:'explosion',enemyType:'beetle',chain:tick,tension:true,x:800});
        if(tick%9===0)emit({type:'charge',boss:true,bossKind});
        if(tick%10===0)emit({type:'coreOpen',bossKind});
        if(tick===12)emit({type:'pickup',effect:'levelUp'});
        if(tick===24)emit({type:'hit',player:true});
        if(tick===30)emit({type:'tension',refresh:true});
        if(tick===43){emit({type:'explosion',boss:true,bossKind});emit({type:'bossDefeated',bossKind});}
        await context.resume();
      }
      const rendered=await rendering;cancelAnimationFrame(director._fadeFrame);cancelAnimationFrame(director._musicDuckFrame);
      let peak=0,sum=0,nonFinite=0,clipped=0;
      for(let channel=0;channel<rendered.numberOfChannels;channel++){const values=rendered.getChannelData(channel);for(const value of values){if(!Number.isFinite(value)){nonFinite++;continue;}peak=Math.max(peak,Math.abs(value));sum+=value*value;if(Math.abs(value)>=1)clipped++;}}
      const rms=Math.sqrt(sum/(rendered.length*rendered.numberOfChannels));
      scenarios.push({bossKind,seconds:rendered.duration,sampleRate:rendered.sampleRate,decodedSamples:director._buffers.size,eventCount,maxVoices,maxRetiring,maxTones,peak,rms,nonFinite,clipped,passed:nonFinite===0&&clipped===0&&peak<.98&&rms>0&&maxVoices<=20&&maxRetiring<=4&&maxTones<=12});
    }
    return{scenarios,expectedBuffers,gameSessionMuted:main.audio.muted,hardwareOutputUsed:false};
  })()` });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  report.result = result.result.value;
  report.success = report.result.gameSessionMuted && report.result.scenarios.every(item => item.passed);
} catch (error) { report.success = false; report.error = String(error.stack || error); }
await mkdir(output, { recursive: true });
await writeFile(resolve(output, `${run}-offline-audio.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));socket.close();if(!report.success)process.exitCode=1;
