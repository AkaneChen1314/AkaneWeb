// Keep mission setup readable by showing one group of choices at a time.
(() => {
  const tabs = [...document.querySelectorAll('[data-step-tab]')];
  const pages = [...document.querySelectorAll('[data-lobby-step]')];
  const mission = document.querySelector('.mission');
  const previous = document.getElementById('setupPrevious');
  const next = document.getElementById('setupNext');
  const deploy = document.getElementById('deployButton');
  const progress = document.getElementById('setupProgress');
  const content = document.querySelector('.setup-content');
  const map = document.getElementById('mapSelect');
  const mapCards = [...document.querySelectorAll('input[name="arena"]')];
  let step = 0;
  function showStep(value) {
    step = Math.max(0, Math.min(tabs.length - 1, value));
    pages.forEach(page => { page.hidden = Number(page.dataset.lobbyStep) !== step; });
    mission.hidden = step < 2;
    tabs.forEach((tab, index) => {
      tab.classList.toggle('active', index === step);
      if (index === step) tab.setAttribute('aria-current', 'step');
      else tab.removeAttribute('aria-current');
    });
    previous.disabled = step === 0;
    next.hidden = step === tabs.length - 1;
    deploy.hidden = step !== tabs.length - 1;
    progress.textContent = `${String(step + 1).padStart(2, '0')} / ${String(tabs.length).padStart(2, '0')}`;
    if(step===2)refreshBossHint();
    if(step===3)refreshSummary();
    content.scrollTop = 0;
  }
  tabs.forEach((tab, index) => tab.addEventListener('click', () => showStep(index)));
  previous.addEventListener('click', () => showStep(step - 1));
  next.addEventListener('click', () => showStep(step + 1));
  document.getElementById('encounterJump').addEventListener('click',()=>{
    const drawer=document.querySelector('.encounter-drawer');drawer.open=true;drawer.scrollIntoView({block:'start',behavior:'smooth'});
  });
  function refreshMapPreview() {
    const foundry = map.value === '1';
    mapCards.forEach(card => { card.checked = card.value === map.value; });
    document.getElementById('briefSectorCount').textContent = foundry ? '05' : '09';
    document.getElementById('mapFeature').textContent = foundry ? '熔火工廠' : '大型港區';
    document.getElementById('brandMapName').textContent = foundry ? 'EMBER FOUNDRY' : 'RUST HARBOR';
    document.getElementById('brandMapLabel').textContent = foundry ? '熔火工廠' : '暗夜港區';
  }
  mapCards.forEach(card => card.addEventListener('change', () => {
    if (!card.checked) return;
    map.value = card.value;
    map.dispatchEvent(new Event('change', { bubbles: true }));
  }));
  function refreshSummary(){
    const operator=document.getElementById('operatorName').textContent;
    const mode=document.querySelector('#modeOptions [aria-checked="true"]')?.getAttribute('aria-label')||'';
    const difficulty=document.querySelector('#difficultyOptions [aria-checked="true"]')?.getAttribute('aria-label')||'';
    const boss=mode.includes('WARLORD')||document.getElementById('bossSelect').value==='on';
    document.getElementById('summaryOperator').textContent=operator;
    document.getElementById('summaryMap').textContent=map.value==='1'?'熔火工廠':'暗夜港區';
    document.getElementById('summaryMode').textContent=mode;
    document.getElementById('summaryDifficulty').textContent=difficulty;
    const card=document.getElementById('summaryBossCard');card.hidden=!boss;
    if(boss){
      const base=Number(document.getElementById('bossHealthSelect').value),strength=Number(document.getElementById('enemyPowerSelect').value);
      const multiplier=difficulty.includes('CADET')?.78:difficulty.includes('NIGHTMARE')?1.28:1;
      const actual=Math.round(base*strength*multiplier);
      document.getElementById('summaryBoss').textContent=`生命 ${actual}（基礎 ${base}） · 基礎移速 ${document.getElementById('bossSpeedSelect').value}× · 攻擊 ${document.getElementById('bossPowerSelect').value}×`;
    }
  }
  function refreshBossHint(){
    const mode=document.querySelector('#modeOptions [aria-checked="true"]')?.getAttribute('aria-label')||'';
    const boss=mode.includes('WARLORD')||document.getElementById('bossSelect').value==='on';
    document.getElementById('bossConfigurationHint').textContent=boss?'本次首領戰將使用以下設定':'本次沒有首領；可先設定供之後使用';
  }
  map.addEventListener('change', refreshMapPreview);
  document.addEventListener('change',()=>queueMicrotask(()=>{refreshBossHint();if(step===3)refreshSummary();}));
  document.getElementById('modeOptions').addEventListener('click',()=>queueMicrotask(refreshBossHint));
  window.refreshLobbyMapPreview = refreshMapPreview;
  refreshMapPreview();
  showStep(0);
})();
