import { createPilotState, updatePilotState, resetPilotState, PILOT_UI_CONFIG as config } from './pilot-state.js';

export const PILOT_IMAGES = Object.freeze({
  normal:'assets/art/pilot/normal.png', blink:'assets/art/pilot/blink.png',
  powerup:'assets/art/pilot/powerup.png', low:'assets/art/pilot/low-hp.png', hit:'assets/art/pilot/hit.png',
});
const labels = {normal:'파일럿: 정상',powerup:'파일럿: 파워업',low:'파일럿: 낮은 체력',hit:'파일럿: 피격'};

export class PilotUI {
  constructor(root) {
    this.root=root;this.state=createPilotState();
    this.imageLayer=root.querySelector('.pilot-images');
    this.images=new Map();
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    this.shownImage=null;
    for(const [key,path] of Object.entries(PILOT_IMAGES)) {
      const image=new Image();image.alt='';image.draggable=false;image.dataset.portrait=key;
      image.hidden=true;image.src=path;this.images.set(key,image);this.imageLayer.append(image);
    }
  }

  async load() {
    await Promise.all([...this.images.values()].map(image=>image.decode().catch(()=>{
      throw new Error('파일럿 초상 이미지를 불러오지 못했습니다. 새로고침해 주세요.');
    })));
  }

  reset() { resetPilotState(this.state);this.shownImage=null; }

  update(game,dt,events=[]) {
    const active=game.mode==='playing'||game.mode==='entering'||game.mode==='gameover';
    this.root.hidden=!active;
    if(!active)return;
    const state=updatePilotState(this.state,dt,game.player,events);
    if(this.shownImage!==state.image) {
      for(const [key,image] of this.images)image.hidden=key!==state.image;
      this.shownImage=state.image;
    }
    if(this.root.dataset.mode!==state.mode) {
      this.root.dataset.mode=state.mode;this.root.setAttribute('aria-label',labels[state.mode]);
    }
    const reduced=this.reducedMotion.matches;
    this.root.dataset.blink=String(state.blink);
    // Only this inner layer moves. The mask, frame and FX keep fixed geometry.
    this.imageLayer.style.transform=`translate(${reduced?0:state.shakeX}px,${reduced?0:state.shakeY}px)`;
    const opacity=reduced?(state.mode==='hit'?config.REDUCED_HIT_OPACITY:state.mode==='low'?config.REDUCED_LOW_HP_OPACITY:state.mode==='powerup'?config.REDUCED_POWERUP_OPACITY:0):state.overlayOpacity;
    const tint=reduced?(state.mode==='hit'?config.REDUCED_HIT_TINT_OPACITY:state.mode==='low'?config.REDUCED_LOW_HP_TINT_OPACITY:state.mode==='powerup'?config.REDUCED_POWERUP_TINT_OPACITY:0):state.tintOpacity;
    this.root.style.setProperty('--pilot-fx-opacity',String(opacity));
    this.root.style.setProperty('--pilot-tint-opacity',String(tint));
    this.root.style.setProperty('--pilot-impact',String(reduced?0:state.impact));
    this.root.style.setProperty('--pilot-scan-y',`${reduced?50:((state.time/config.SCAN_PERIOD)%1)*100}%`);
  }
}
