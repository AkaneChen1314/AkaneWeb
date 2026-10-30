import * as THREE from './vendor/three.module.min.js';
import { createGrenadeMotion, advanceGrenadeMotion, predictGrenadePath, GRENADE_FUSE, GRENADE_BLAST_RADIUS } from './grenade-trajectory.js';
import { orientCollider, roundCollider, bodyOverlapsCollider, sweepSphereCollider } from './spatial-collision.js';
import { createTouchControls } from './touch-controls.js';

const $ = (selector) => document.querySelector(selector);
const ui = {
  lobby: $('#lobby'), hud: $('#hud'), pause: $('#pauseMenu'), result: $('#resultScreen'),helpModal:$('#helpModal'),helpButton:$('#helpButton'),helpClose:$('#helpCloseButton'),helpDone:$('#helpDoneButton'),
  deploy: $('#deployButton'), resume: $('#resumeButton'), restart: $('#restartButton'), again: $('#playAgainButton'),
  health: $('#healthValue'), healthBar: $('#healthBar'), armor: $('#armorValue'), armorBar: $('#armorBar'),
  ammo: $('#ammoCount'), reserve: $('#reserveCount'), ammoTrack: $('#ammoTrack'),
  kills: $('#killCount'), heading: $('#heading'), reload: $('#reloadPrompt'), feed: $('#eventFeed'),
  damage: $('#damageIndicator'), hitmarker: $('#hitmarker'), crosshair: $('.crosshair'), minimap: $('#minimap'),
  damageDirection: $('#damageDirection'), combatBanner: $('#combatBanner'), threatDistance: $('#threatDistance'),
  weaponSkins: $('#weaponSkins'), weaponName: $('#weaponName'), operatorSkins: $('#operatorSkins'),
  operatorName: $('#operatorName'), operatorInitials: $('#operatorInitials'), grenadeCount: $('#grenadeCount'),
  operatorRole:$('#operatorRole'),operatorDescription:$('#operatorDescription'),difficultyOptions:$('#difficultyOptions'),
  difficultyDescription:$('#difficultyDescription'),modeOptions:$('#modeOptions'),modeDescription:$('#modeDescription'),
  hudOperator:$('#hudOperator'),hudMode:$('#hudMode'),hudDifficulty:$('#hudDifficulty'),modeFooter:$('#modeFooter'),
  briefEnemyCount:$('#briefEnemyCount'),briefMissionValue:$('#briefMissionValue'),briefMissionLabel:$('#briefMissionLabel'),
  enemyCard:$('#enemyCard'),enemyRemaining:$('#enemyRemaining'),enemyTotal:$('#enemyTotal'),enemyKilled:$('#enemyKilled'),enemyProgress:$('#enemyProgress'),enemyStatus:$('#enemyStatus'),
  missionTimer:$('#missionTimer'),missionPhase:$('#missionPhase'),objectiveText:$('#objectiveText'),zoneName:$('#zoneName'),resultMeta:$('#resultMeta'),
  pickupPrompt:$('#pickupPrompt'),buffStatus:$('#buffStatus'),streak:$('#streakStatus'),ability:$('#abilityStatus'),quality:$('#qualitySelect'),volume:$('#volumeControl'),volumeValue:$('#volumeValue'),killNotice:$('#killNotice'),killFeed:$('#killFeed'),grenadeHint:$('#grenadePreviewHint'),
  statHealth:$('#statHealth'),statSpeed:$('#statSpeed'),statArmor:$('#statArmor'),statPower:$('#statPower'),
  enemyCountSelect:$('#enemyCountSelect'),enemyPowerSelect:$('#enemyPowerSelect'),eliteSelect:$('#eliteSelect'),eliteNote:$('#eliteNote'),bossSelect:$('#bossSelect'),encounterSummary:$('#encounterSummary'),
  boss:$('#bossHud'),bossName:$('#bossName'),bossPhase:$('#bossPhase'),bossHealth:$('#bossHealth'),bossFill:$('#bossHealthFill'),bossWarning:$('#bossWarning'),
  pauseVolume:$('#pauseVolumeControl'),pauseVolumeValue:$('#pauseVolumeValue'),pauseQuality:$('#pauseQualitySelect'),
  statHealthValue:$('#statHealthValue'),statSpeedValue:$('#statSpeedValue'),statArmorValue:$('#statArmorValue'),statPowerValue:$('#statPowerValue')
};

const weaponSkins = [
  { name: 'ACID // 酸蝕迷彩', colors: ['#c8ff2e', '#111611', '#627028'], metal: .55 },
  { name: 'EMBER // 熾焰紅', colors: ['#ff3e53', '#1b0a0d', '#d17a35'], metal: .7 },
  { name: 'ARCTIC // 極地白', colors: ['#e5f5f4', '#25383d', '#2ff3ff'], metal: .35 },
  { name: 'VOID // 深空紫', colors: ['#8a5cff', '#0b0814', '#ff4fd8'], metal: .75 }
];

const operatorSkins = [
  { name:'VANTA // 夜襲',shortName:'VANTA',initials:'VN',role:'均衡突擊',description:'生命、速度與火力均衡，適合第一次進入戰區。',color:'#1a2428',accent:'#c8ff2e',maxHealth:100,maxArmor:50,moveSpeed:5.1,sprintSpeed:8,jumpForce:7,reloadMs:1550,reserveAmmo:120,grenades:2,power:1 },
  { name:'RIFT // 裂隙',shortName:'RIFT',initials:'RF',role:'高速偵察',description:'高速側翼幹員，換彈迅速並攜帶額外手榴彈，但生存力較低。',color:'#4b1628',accent:'#ff3e53',maxHealth:82,maxArmor:25,moveSpeed:6.15,sprintSpeed:9.25,jumpForce:7.4,reloadMs:1250,reserveAmmo:90,grenades:3,power:1.04 },
  { name:'GHOST // 雪鬼',shortName:'GHOST',initials:'GH',role:'重裝防衛',description:'重型護甲能承受更多火力，後座控制最佳，但移動與換彈較慢。',color:'#c7d3d2',accent:'#2ff3ff',maxHealth:135,maxArmor:80,moveSpeed:4.25,sprintSpeed:6.45,jumpForce:6.8,reloadMs:1950,reserveAmmo:150,grenades:1,power:.98 }
];
const difficulties=[
  {id:'cadet',name:'CADET',label:'新兵',description:'敵人反應較慢、火力較低，適合熟悉地圖與操作。',enemyHealth:.78,enemySpeed:.88,reaction:1.45,spread:1.38,damage:.70,fireInterval:1.30,detection:28},
  {id:'tactical',name:'TACTICAL',label:'戰術',description:'標準戰鬥模擬；敵人反應、準度與傷害維持均衡。',enemyHealth:1,enemySpeed:1,reaction:1,spread:1,damage:1,fireInterval:1,detection:34},
  {id:'nightmare',name:'NIGHTMARE',label:'煉獄',description:'高壓戰場：敵人更快、更準、更致命，且能承受更多傷害。',enemyHealth:1.28,enemySpeed:1.13,reaction:.68,spread:.68,damage:1.25,fireInterval:.72,detection:40}
];
const gameModes=[
  {id:'purge',name:'PURGE',label:'全面肅清',tag:'12 HOSTILES',description:'清除戰場內的所有敵軍。沒有增援與時間限制，適合探索地圖。',enemyCount:12,objective:'消滅所有敵軍',brief:'ALL',briefLabel:'全數殲滅'},
  {id:'onslaught',name:'ONSLAUGHT',label:'波次攻堅',tag:'3 WAVES',description:'抵擋三波逐步增強的敵軍，波次之間會獲得少量彈藥與護甲補給。',waves:[7,9,11],objective:'撐過所有敵軍波次',brief:'03',briefLabel:'攻堅波次'},
  {id:'hunter',name:'HUNTER',label:'限時獵殺',tag:'180 SEC',description:'在三分鐘內完成擊殺合約。敵軍數量較少時，合約目標也會同步調整。',enemyCount:18,killTarget:12,timeLimit:180,objective:'限時完成擊殺合約',brief:'03:00',briefLabel:'限時獵殺'},
  {id:'warlord',name:'WARLORD',label:'首領討伐',tag:'BOSS FINALE',description:'先清除菁英護衛，再迎戰兩階段指揮官。紅色範圍攻擊有預警，利用移動與掩體化解。',enemyCount:8,objective:'突破護衛並擊敗指揮官',brief:'02',briefLabel:'首領階段'}
];
const botNames=['KESTREL','RIFT','MANTIS','ECHO','VIPER','NOVA','WRAITH','ROOK','SPECTER','RAZOR','CIPHER','BANSHEE'];
const enemySpawnPoints=[[-64,-61],[8,-64],[34,-61],[63,-49],[65,-32],[64,34],[54,63],[32,66],[-18,45],[-45,64],[-65,45],[-67,28],[-65,-8],[-61,-36],[-43,-50],[-25,35],[29,41],[0,-31],[42,-3],[17,24],[-31,5],[14,-9],[-30,46],[47,46]];
const pickupTypes={
  medkit:{name:'醫療包',code:'MED',color:0x54ff9a,map:'#54ff9a',respawn:32},
  armor:{name:'護甲板',code:'ARMOR',color:0x2ff3ff,map:'#2ff3ff',respawn:38},
  ammo:{name:'彈藥箱',code:'AMMO',color:0xffd34f,map:'#ffd34f',respawn:27},
  grenade:{name:'手榴彈',code:'FRAG',color:0xff7842,map:'#ff7842',respawn:42}
};
const pickupPlacements=[['medkit',0,31],['medkit',-20,-41],['medkit',46,36],['medkit',-50,27],['medkit',25,-46],['armor',-36,34],['armor',39,24],['armor',-47,-42],['ammo',10,35],['ammo',-2,-28],['ammo',28,2],['ammo',-34,-2],['ammo',42,-38],['grenade',-14,12],['grenade',33,-31],['grenade',-39,48]];
const ARENA_HALF=74;
const PLAYABLE_LIMIT=71;
const mapDefinitions=[
  {id:'harbor',name:'RUST HARBOR // 暗夜港區',description:'貨櫃、港口與多路側翼的夜間戰場。'},
  {id:'foundry',name:'EMBER FOUNDRY // 熔火工廠',description:'暖橙工業設施、中央反應爐與交錯的作戰走廊。'}
];

function savedIndex(key,fallback){try{const raw=sessionStorage.getItem(key);if(raw===null)return fallback;const value=Number(raw);return Number.isInteger(value)&&value>=0?value:fallback;}catch{return fallback;}}
let selectedWeapon = Math.min(weaponSkins.length-1,savedIndex('neonWeapon',0));
let selectedOperator = Math.min(operatorSkins.length-1,savedIndex('neonOperator',0));
let selectedDifficulty = Math.min(difficulties.length-1,savedIndex('neonDifficulty',1));
let selectedMode = Math.min(gameModes.length-1,savedIndex('neonMode',0));
let selectedMap=Math.min(mapDefinitions.length-1,savedIndex('neonMap',0)),builtMap=-1,arenaObjects=[];
let missionSettings=loadMissionSettings(),activeEncounter=null;
const touchCapable=(globalThis.navigator?.maxTouchPoints||0)>0||globalThis.matchMedia?.('(any-pointer: coarse)').matches===true;
let qualityIndex=Math.min(2,savedIndex('neonQuality',touchCapable?2:1));
let masterVolume=Math.min(100,savedIndex('neonVolume',72))/100;
let scene, camera, renderer, clock, yaw, pitch, weapon, muzzleFlash, muzzleAnchor, opticGroup;
let gameState = 'lobby';
let portalPaused = globalThis.akanePortalPaused === true;
let freeLook=false;
let touchControls=null;
let gameStart = 0;
let pauseStarted = 0;
let audioContext;
let audioMaster, audioCompressor, audioLoadPromise;
const audioBuses={};
const audioVoices=new Map();
const AUDIO_VOICE_LIMIT=24;
const mixDefaults={effects:.8,ambience:.35,feedback:.55};
const mixSettings={effects:readMixSetting('neonEffectsVolume',.8),ambience:readMixSetting('neonAmbienceVolume',.35),feedback:readMixSetting('neonFeedbackVolume',.55)};
const sampleCalibration={};
let lastEnemySoundAt=-Infinity,lastExplosionSoundAt=-Infinity;
let shots = 0;
let hits = 0;
let kills = 0;
let health = 100;
let armor = 50;
let ammo = 30;
let reserve = 120;
let reloading = false;
let reloadRemaining = 0;
let reloadDuration=0,reloadSoundStage=0;
const mechanicalBuffers={};
let reloadStarted = 0;
let lastShot = 0;
let verticalVelocity = 0;
let grounded = true;
let jumpBuffer=0,groundGrace=0;
let weaponKick = 0;
let damageAngle = 0;
let playerMoving = 0;
let aiming = false;
let adsAmount = 0;
let wallPoseAmount=0,weaponObstructed=false,grenadePoseAmount=0,weaponRetraction=0,adsWallSuppressed=false,highReadyAmount=0;
const weaponEye=new THREE.Vector3(),weaponForward=new THREE.Vector3(),weaponRight=new THREE.Vector3(),weaponUp=new THREE.Vector3(),weaponProbe=new THREE.Vector3(),weaponQuaternion=new THREE.Quaternion();
let grenadeCount = 2;
let maxHealth=100,maxArmor=50;
let matchTotalEnemies=0,defeatedEnemies=0,currentWave=0,wavePending=false,matchDeadline=0,lastMissionPaint=0;
let killStreak=0,lastKillAt=0;
let waveRemaining=0,resolvingBlast=false,abilityCooldown=0;
let bossPending=false,bossArrivalQueued=false,bossArrivalRemaining=0;
const bossAttacks=[];
const pendingBlasts=[];
const operatorAbilities=[{name:'戰地急救',description:'生命 +22 / 護甲 +12'},{name:'疾速突進',description:'8 秒移動加速'},{name:'重甲防線',description:'護甲 +30 / 8 秒減傷'}];
const enemies = [];
const enemyFlashLights=[];
const worldMeshes = [];
const collisionBoxes = [];
const tracers = [];
const particles = [];
const explosions = [];
const explosiveBarrels = [];
const grenades = [];
let grenadeAiming=false,grenadePreview=null;
const bulletDecals = [];
const pickups = [];
const keys = {};
let mouseDown = false;
const raycaster = new THREE.Raycaster();
const tempVec = new THREE.Vector3();
const playerRadius = .48;
const eyeHeight = 1.68;
let screenShake = 0;
let lastFootstep = 0;
let lastMinimapPaint=0;
let speedBoostUntil=0,damageShieldUntil=0;
let soundBuffers = {};
let ambientStarted = false;
const tempCameraWorld = new THREE.Vector3();
const tempTargetWorld = new THREE.Vector3();
const soundFiles = {
  rifle0: './assets/audio/rifle-0.wav', rifle1: './assets/audio/rifle-1.wav', tail: './assets/audio/rifle-tail.mp3',
  explosion: './assets/audio/explosion-crunch.ogg', explosionLow: './assets/audio/explosion-low.ogg',
  shell: './assets/audio/shell.ogg', step0: './assets/audio/step-0.wav', step1: './assets/audio/step-1.wav'
};

function initLoadout() {
  weaponSkins.forEach((skin, index) => {
    const button = document.createElement('button');
    button.className = `swatch ${index === selectedWeapon ? 'active' : ''}`;
    button.style.setProperty('--swatch', `linear-gradient(145deg, ${skin.colors[0]} 0 43%, ${skin.colors[1]} 44% 70%, ${skin.colors[2]} 71%)`);
    button.setAttribute('aria-label', skin.name);
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked',index===selectedWeapon?'true':'false');
    button.onclick = () => {
      selectedWeapon = index;
      saveChoice('neonWeapon',index);
      [...ui.weaponSkins.children].forEach((node, i) => {node.classList.toggle('active', i === index);node.setAttribute('aria-checked',i===index?'true':'false');});
      ui.weaponName.textContent = skin.name;
      if (weapon) applyWeaponSkin();
      playTone(420, .04, 'square', .025);
    };
    ui.weaponSkins.appendChild(button);
  });
  operatorSkins.forEach((skin, index) => {
    const button = document.createElement('button');
    button.className = `operator ${index === selectedOperator ? 'active' : ''}`;
    button.style.setProperty('--op', skin.color);
    button.textContent = skin.initials;
    button.dataset.role=skin.role;
    button.setAttribute('aria-label', skin.name);
    button.setAttribute('role','radio');
    button.setAttribute('aria-checked',index===selectedOperator?'true':'false');
    button.onclick = () => {
      selectedOperator = index;
      saveChoice('neonOperator',index);updateOperatorPreview();
      playTone(520, .04, 'square', .025);
    };
    ui.operatorSkins.appendChild(button);
  });
  gameModes.forEach((mode,index)=>{
    const button=document.createElement('button');button.className=`mode-button ${index===selectedMode?'active':''}`;button.setAttribute('role','radio');button.setAttribute('aria-checked',index===selectedMode?'true':'false');button.setAttribute('aria-label',`${mode.label} ${mode.name}`);button.innerHTML=`<b>${mode.label}</b><small>${mode.name}</small><em>${mode.tag}</em>`;
    button.onclick=()=>{selectedMode=index;saveChoice('neonMode',index);updateModePreview();playTone(310+index*85,.06,'square',.026);};ui.modeOptions.appendChild(button);
  });
  difficulties.forEach((difficulty,index)=>{
    const button=document.createElement('button');button.className=`difficulty-button ${index===selectedDifficulty?'active':''}`;button.setAttribute('role','radio');button.setAttribute('aria-checked',index===selectedDifficulty?'true':'false');button.setAttribute('aria-label',`${difficulty.name} ${difficulty.label}`);button.innerHTML=`${difficulty.label}<small>${difficulty.name}</small>`;
    button.onclick=()=>{selectedDifficulty=index;saveChoice('neonDifficulty',index);updateDifficultyPreview();playTone(380+index*90,.055,'square',.024);};ui.difficultyOptions.appendChild(button);
  });
  updateOperatorPreview();updateModePreview();updateDifficultyPreview();
}

function saveChoice(key,value){try{sessionStorage.setItem(key,String(value));}catch{}}
function currentOperator(){return operatorSkins[selectedOperator];}
function currentDifficulty(){return difficulties[selectedDifficulty];}
function reserveCapacity(){return Math.max(240,currentOperator().reserveAmmo+90);}
function grenadeCapacity(){return currentOperator().grenades+2;}
function commanderName(){return builtMap===1?'工廠指揮官':'港區指揮官';}
function normalizeMissionSettings(value={}){
  if(!value||typeof value!=='object')value={};
  return {enemyCount:[0,6,12,18,24,30].includes(value.enemyCount)?value.enemyCount:0,
    enemyPower:[.8,1,1.25,1.5].includes(value.enemyPower)?value.enemyPower:1,
    eliteRate:[0,.15,.25,.3].includes(value.eliteRate)?value.eliteRate:.15,bossFinale:value.bossFinale===true,
    bossHealth:[350,700,1200,2000].includes(value.bossHealth)?value.bossHealth:700,
    bossSpeed:[.75,1,1.75,3.2].includes(value.bossSpeed)?value.bossSpeed:1,
    bossPower:[.75,1,1.5,2].includes(value.bossPower)?value.bossPower:1};
}
function loadMissionSettings(){try{return normalizeMissionSettings(JSON.parse(sessionStorage.getItem('neonEncounter')||'{}'));}catch{return normalizeMissionSettings();}}
function encounterSettings(){return gameState!=='lobby'&&activeEncounter?activeEncounter.settings:missionSettings;}
function currentMode(index=selectedMode){
  const base=gameModes[index],settings=encounterSettings(),mode={...base};
  if(base.waves){
    const count=settings.enemyCount;
    mode.waves=count?[Math.max(4,Math.round(count*.65)),Math.max(4,Math.round(count*.82)),count]:[...base.waves];
  }else if(settings.enemyCount)mode.enemyCount=settings.enemyCount;
  if(base.killTarget){mode.killTarget=Math.min(base.killTarget,mode.enemyCount);mode.objective=`限時完成 ${mode.killTarget} 次擊殺`;}
  mode.bossEnabled=base.id==='warlord'||(!base.killTarget&&settings.bossFinale);
  return mode;
}
function encounterTotal(mode=currentMode()){return (mode.waves?mode.waves.reduce((sum,count)=>sum+count,0):mode.enemyCount)+(mode.bossEnabled?1:0);}
function getModeEliteRate(){return currentMode().id==='warlord'?Math.max(.25,encounterSettings().eliteRate):encounterSettings().eliteRate;}
function getEnemyTuning(){
  const power=encounterSettings().enemyPower,precision=1/Math.sqrt(power);
  return {health:power,damage:.6+.4*power,speed:.9+.1*power,reaction:precision,spread:precision,fireInterval:precision};
}
function spawnMissionWave(index){
  const mode=currentMode();return spawnEnemies(mode.waves?mode.waves[index]:mode.enemyCount,{eliteRate:getModeEliteRate(),wave:index});
}

function updateOperatorPreview(){
  const skin=currentOperator();[...ui.operatorSkins.children].forEach((node,i)=>{node.classList.toggle('active',i===selectedOperator);node.setAttribute('aria-checked',i===selectedOperator?'true':'false');});
  ui.operatorName.textContent=skin.name;ui.operatorRole.textContent=skin.role;ui.operatorDescription.textContent=skin.description;ui.operatorInitials.textContent=skin.initials;ui.hudOperator.textContent=skin.shortName;document.documentElement.style.setProperty('--acid',skin.accent);
  const values=[[ui.statHealth,ui.statHealthValue,skin.maxHealth,135,String(skin.maxHealth)],[ui.statSpeed,ui.statSpeedValue,skin.moveSpeed,6.15,skin.moveSpeed.toFixed(2)],[ui.statArmor,ui.statArmorValue,skin.maxArmor,80,String(skin.maxArmor)],[ui.statPower,ui.statPowerValue,skin.power,1.04,`${Math.round(skin.power*100)}%`]];
  values.forEach(([bar,label,value,max,text])=>{bar.style.width=`${Math.max(8,value/max*100)}%`;label.textContent=text;});
  if(weapon)applyWeaponSkin();
}

function updateDifficultyPreview(){
  const difficulty=currentDifficulty();[...ui.difficultyOptions.children].forEach((node,i)=>{node.classList.toggle('active',i===selectedDifficulty);node.setAttribute('aria-checked',i===selectedDifficulty?'true':'false');});ui.difficultyDescription.textContent=difficulty.description;ui.hudDifficulty.textContent=difficulty.name;
}

function updateModePreview(){
  const mode=currentMode();[...ui.modeOptions.children].forEach((node,i)=>{node.classList.toggle('active',i===selectedMode);node.setAttribute('aria-checked',i===selectedMode?'true':'false');const configured=currentMode(i);node.querySelector('em').textContent=configured.id==='purge'?`${String(encounterTotal(configured)).padStart(2,'0')} HOSTILES`:configured.tag;});
  const total=encounterTotal(mode);
  ui.modeDescription.textContent=mode.description;ui.hudMode.textContent=mode.name;ui.modeFooter.textContent=`MODE // ${mode.name}`;
  ui.briefEnemyCount.textContent=String(total).padStart(2,'0');ui.briefMissionValue.textContent=mode.brief;ui.briefMissionLabel.textContent=mode.briefLabel;ui.objectiveText.textContent=mode.objective;
  const count=mode.waves?`${mode.waves.join(' / ')} 名分波進場`:`${mode.enemyCount} 名常規敵軍`;
  const eliteRate=getModeEliteRate();ui.encounterSummary.textContent=`${count} · 強度 ${encounterSettings().enemyPower.toFixed(2)}× · 菁英約 ${Math.round(eliteRate*100)}%${mode.bossEnabled?' · 最後追加 1 名首領':''}`;
  ui.bossSelect.disabled=mode.id==='hunter'||mode.id==='warlord';
  ui.bossSelect.value=mode.id==='warlord'?'on':mode.id==='hunter'?'off':missionSettings.bossFinale?'on':'off';
  ui.eliteNote.textContent=mode.id==='warlord'?'討伐模式至少約 25%':'更強的裝備與戰術';
  ui.eliteSelect.value=String(getModeEliteRate());
}

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071016);
  scene.fog = new THREE.FogExp2(0x101c24, .0072);

  camera = new THREE.PerspectiveCamera(73, innerWidth / innerHeight, .04, 330);
  camera.rotation.order = 'YXZ';
  yaw = new THREE.Object3D();
  pitch = new THREE.Object3D();
  yaw.add(pitch);
  pitch.add(camera);
  yaw.position.set(0, eyeHeight, 65);
  scene.add(yaw);

  renderer = new THREE.WebGLRenderer({ antialias: !touchCapable, powerPreference: 'high-performance' });
  renderer.autoClear=false;
  renderer.setPixelRatio(Math.min(devicePixelRatio, (touchCapable?[1.35,1.1,1]:[1.8,1.35,1])[qualityIndex]));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = qualityIndex!==2;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  $('#game').appendChild(renderer.domElement);
  clock = new THREE.Clock();

  // Lift unlit faces without adding more lights or washing out the night sky.
  const hemi = new THREE.HemisphereLight(0xb1cbd7, 0x3a332d, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9b1, 3.05);
  sun.position.set(-24, 38, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -76;
  sun.shadow.camera.right = 76;
  sun.shadow.camera.top = 76;
  sun.shadow.camera.bottom = -76;
  sun.shadow.camera.near = .5;
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -.00015;
  sun.shadow.normalBias = .025;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x79b9df,1.05);
  rim.position.set(31,18,-35);
  scene.add(rim);
  [hemi,sun,rim].forEach(light=>light.layers.enable(1));
  for(let i=0;i<3;i++){const light=new THREE.PointLight(0xff6d2a,0,4,2);scene.add(light);enemyFlashLights.push(light);}

  createAtmosphere();
  buildSelectedArena(selectedMap);
  createWeapon();
  createGrenadePreview();
  addAmbientDetails();
  setupEvents();
  touchControls=createTouchControls({root:$('#touchControls'),canvas:renderer.domElement,onLook:onTouchLook,onAction:onTouchAction});
  if(touchControls.enabled)ui.reload.textContent='點「換彈」重新裝填';
  onResize();
  updateHUD();
  animate();
}

const mat = (color, roughness = .7, metalness = .05, emissive = 0x000000) => new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive });

function setSelectedMap(index){
  if(gameState!=='lobby'||!Number.isInteger(index)||index<0||index>=mapDefinitions.length)return false;
  selectedMap=index;saveChoice('neonMap',index);return true;
}

function prepareSelectedMap(){
  if(builtMap!==selectedMap)buildSelectedArena(selectedMap);
}

function buildSelectedArena(index){
  const materials=new Set(),geometries=new Set(),textures=new Set();
  for(const root of arenaObjects){root.removeFromParent();root.traverse(child=>{
    if(child.geometry)geometries.add(child.geometry);
    for(const material of Array.isArray(child.material)?child.material:[child.material])if(material){materials.add(material);if(material.map)textures.add(material.map);}
  });}
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();
  collisionBoxes.length=0;worldMeshes.length=0;pickups.length=0;explosiveBarrels.length=0;rainSystem=null;placeZoneSign.supportMaterial=null;
  const existing=new Set(scene.children);
  if(index===1)createFoundryArena();else createArena();
  createPickups();arenaObjects=scene.children.filter(child=>!existing.has(child));builtMap=index;
  if(yaw){yaw.position.set(0,eyeHeight,65);verticalVelocity=0;grounded=true;}
}

function createAtmosphere(){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(135,32,18),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    uniforms:{top:{value:new THREE.Color(0x06101b)},horizon:{value:new THREE.Color(0x31515a)},glow:{value:new THREE.Color(0xd07943)}},
    vertexShader:'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec3 vPos; uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; void main(){float h=normalize(vPos).y;float band=pow(max(0.0,1.0-abs(h)*3.2),4.0);vec3 col=mix(horizon,top,smoothstep(-0.08,.72,h));col+=glow*band*.28;gl_FragColor=vec4(col,1.0);}'
  }));
  scene.add(sky);
  const stars=[];for(let i=0;i<190;i++){const a=Math.random()*Math.PI*2,r=92+Math.random()*24;stars.push(Math.cos(a)*r,18+Math.random()*62,Math.sin(a)*r);}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));
  scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xaad4dd,size:.14,transparent:true,opacity:.5,depthWrite:false})));
}

function createSurfaceTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');
  // Keep the texture neutral: the material supplies each arena's colour. A
  // dark texture multiplied by a dark material erased detail in the shadows.
  ctx.fillStyle='#b2b7b6';ctx.fillRect(0,0,512,512);
  for(let i=0;i<9000;i++){const shade=100+Math.floor(Math.random()*120);ctx.fillStyle=`rgba(${shade},${shade},${shade},${.04+Math.random()*.12})`;const size=.5+Math.random()*1.8;ctx.fillRect(Math.random()*512,Math.random()*512,size,size);}
  for(let i=0;i<8;i++){
    const x=70+Math.random()*370,y=70+Math.random()*370,r=25+Math.random()*65,stain=ctx.createRadialGradient(x,y,0,x,y,r);
    stain.addColorStop(0,'rgba(50,58,60,.06)');stain.addColorStop(1,'rgba(50,58,60,0)');ctx.fillStyle=stain;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  // Fine expansion joints and short cracks replace the featureless floor;
  // restrained contrast keeps distant tiles from shimmering into a grid.
  ctx.strokeStyle='rgba(40,49,52,.16)';ctx.lineWidth=1.2;ctx.strokeRect(.6,.6,510.8,510.8);
  ctx.strokeStyle='rgba(236,240,236,.16)';ctx.lineWidth=.7;ctx.strokeRect(2,2,508,508);
  for(let i=0;i<12;i++){ctx.strokeStyle=`rgba(35,44,47,${.07+Math.random()*.08})`;ctx.lineWidth=.6+Math.random()*.7;ctx.beginPath();let x=Math.random()*512,y=Math.random()*512;ctx.moveTo(x,y);for(let s=0;s<4;s++){x+=(Math.random()-.5)*35;y+=(Math.random()-.5)*35;ctx.lineTo(x,y);}ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(20,20);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

// A shared, lightweight concrete texture gives the main structures visible seams and wear.
function createWallTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#cbd0cd';ctx.fillRect(0,0,512,512);
  for(let i=0;i<6400;i++){const shade=100+Math.random()*115;ctx.fillStyle=`rgba(${shade},${shade},${shade},${Math.random()*.14})`;ctx.fillRect(Math.random()*512,Math.random()*512,.7+Math.random()*2,.7+Math.random()*3);}
  for(let i=0;i<16;i++){
    const x=18+Math.random()*476,y=18+Math.random()*300,w=3+Math.random()*10,length=20+Math.random()*110;
    const streak=ctx.createLinearGradient(0,y,0,y+length);streak.addColorStop(0,'rgba(70,76,72,.09)');streak.addColorStop(1,'rgba(70,76,72,0)');ctx.fillStyle=streak;ctx.fillRect(x,y,w,length);
  }
  ctx.strokeStyle='rgba(35,42,43,.3)';ctx.lineWidth=3;ctx.strokeRect(1.5,1.5,509,509);
  ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=1.2;ctx.strokeRect(5,5,502,502);
  for(const x of [25,487])for(const y of [25,487]){
    ctx.fillStyle='rgba(39,44,44,.43)';ctx.beginPath();ctx.arc(x,y,3.3,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(238,240,235,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,4.5,Math.PI,Math.PI*2);ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,2);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

function addBox(x, y, z, sx, sy, sz, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color, options.roughness ?? .72, options.metalness ?? .08, options.emissive ?? 0));
  mesh.position.set(x, y, z);
  mesh.rotation.y = options.rotation || 0;
  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (options.collidable !== false) {
    registerCollisionBox(x,y,z,sx,sy,sz,mesh.rotation.y);
    worldMeshes.push(mesh);
  }
  return mesh;
}

function registerCollisionBox(x,y,z,sx,sy,sz,rotation=0){
  const cos=Math.abs(Math.cos(rotation)),sin=Math.abs(Math.sin(rotation)),halfX=(sx*cos+sz*sin)/2,halfZ=(sz*cos+sx*sin)/2;
  const box=orientCollider(new THREE.Box3(new THREE.Vector3(x-halfX,y-sy/2,z-halfZ),new THREE.Vector3(x+halfX,y+sy/2,z+halfZ)),x,y,z,sx,sy,sz,rotation);collisionBoxes.push(box);return box;
}

function createArena() {
  const groundMaterial=mat(0x69747c,.9,.04);groundMaterial.map=createSurfaceTexture();groundMaterial.bumpMap=groundMaterial.map;groundMaterial.bumpScale=.022;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);worldMeshes.push(ground);

  // Arena boundaries and skyline-like perimeter.
  addBox(0, 3, -74, 148, 6, 2, 0x151d21);
  addBox(0, 3, 74, 148, 6, 2, 0x151d21);
  addBox(-74, 3, 0, 2, 6, 148, 0x151d21);
  addBox(74, 3, 0, 2, 6, 148, 0x151d21);

  // Central warehouse ruins.
  const wallTexture=createWallTexture();
  [addBox(0, 2.7, 0, 12, 5.4, 1, 0x768488),
   addBox(-5.5, 2.7, 5.5, 1, 5.4, 12, 0x768488),
   addBox(5.5, 2.7, -5.5, 1, 5.4, 12, 0x768488)].forEach(wall=>{wall.material.map=wallTexture;wall.material.bumpMap=wallTexture;wall.material.bumpScale=.018;wall.material.needsUpdate=true;});
  addBox(-3.9, 5.65, 0, 4.2, .5, 12, 0x303b40);
  addBox(3.9, 5.65, 0, 4.2, .5, 12, 0x303b40);
  addWarningStripe(0, .55, .53, 12.05, .25, .06);

  // Containers - main sightline blockers.
  createContainer(-17, 1.6, -11, 4.8, 3.2, 11, 0x874039, Math.PI / 2);
  createContainer(17, 1.6, 12, 4.8, 3.2, 11, 0x2d6570, -Math.PI / 2);
  createContainer(-28, 1.6, 18, 4.8, 3.2, 11, 0x59693a, 0);
  createContainer(29, 1.6, -20, 4.8, 3.2, 11, 0x7b5734, 0);
  createContainer(-35, 1.6, -29, 4.8, 3.2, 11, 0x314c62, Math.PI / 2);

  // Tactical cover blocks and barricades.
  const covers = [
    [-8, .7, 21, 5, 1.4, 1.2, 0], [9, .7, -20, 5, 1.4, 1.2, .25],
    [21, .7, 30, 4, 1.4, 1.1, -.55], [-21, .7, -31, 4, 1.4, 1.1, .55],
    [34, .7, 4, 1.2, 1.4, 5, .2], [-35, .7, 4, 1.2, 1.4, 5, -.2],
    [8, .7, 8, 3.8, 1.4, 1, .7], [-9, .7, -8, 3.8, 1.4, 1, .7]
  ];
  covers.forEach(([x,y,z,sx,sy,sz,r]) => {
    const cover=addBox(x,y,z,sx,sy,sz,0x6c7472,{rotation:r,metalness:.12});
    const hardware=new THREE.InstancedMesh(new THREE.BoxGeometry(.15,.10,.045),mat(0x343e41,.5,.48),4),matrix=new THREE.Matrix4();
    for(let side=0;side<2;side++)for(let end=0;end<2;end++){
      const sign=side?1:-1,offset=end?1:-1;
      matrix.makeRotationY(sx>sz?0:Math.PI/2);
      matrix.setPosition(sx>sz?offset*sx*.36:sign*(sx/2+.022),.12,sx>sz?sign*(sz/2+.022):offset*sz*.36);
      hardware.setMatrixAt(side*2+end,matrix);
    }
    hardware.instanceMatrix.needsUpdate=true;cover.add(hardware);
    addWarningStripe(x, y + .42, z, sx > sz ? sx + .02 : .08, .18, sz > sx ? sz + .02 : .08, r);
  });

  // Crate clusters.
  [[-12,14],[13,-31],[35,25],[-38,-10],[20,-4],[-4,-22]].forEach(([x,z], groupIndex) => {
    createCrate(x,.75,z,1.5, groupIndex % 2 ? 0x70553a : 0x4b5c62);
    createCrate(x + 1.55,.75,z + .2,1.5,0x5b4937);
    if (groupIndex % 2 === 0) createCrate(x + .7,2.25,z,1.5,0x4d5b5e);
  });

  // Shootable fuel drums create chain-reaction opportunities.
  [[-7,17],[11,-15],[26,28],[-30,-7],[31,-28],[-18,-25]].forEach(([x,z],i) => createExplosiveBarrel(x,z,i));

  // Elevated light towers (non-collidable upper geometry).
  [[-66,-66],[66,-66],[-66,66],[66,66]].forEach(([x,z]) => {
    addBox(x,4,z,.45,8,.45,0x252d30);
    const lamp = addBox(x,8,z,2.2,.4,.7,0xd8e1cc,{collidable:false,emissive:0x82906b});
    const light = new THREE.PointLight(0xd5ff82, 4, 18, 2);
    light.position.copy(lamp.position);
    scene.add(light);
    const beam=new THREE.Mesh(new THREE.ConeGeometry(3.5,10,16,1,true),new THREE.MeshBasicMaterial({color:0xd5ff82,transparent:true,opacity:.025,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
    beam.position.set(x,3.2,z);scene.add(beam);
  });

  // Reflective puddles and background port silhouettes add depth without image assets.
  [[-25,8,2.8,1.3],[14,21,3.8,1.5],[32,4,2.1,.9],[-8,-34,3.2,1.2],[-54,31,4.3,1.4],[48,-43,3.6,1.2],[20,58,4.7,1.5]].forEach(([x,z,sx,sz])=>{
    const puddle=new THREE.Mesh(new THREE.CircleGeometry(1,32),new THREE.MeshStandardMaterial({color:0x213f4d,roughness:.18,metalness:.68,transparent:true,opacity:.62}));
    puddle.scale.set(sx,sz,1);puddle.rotation.x=-Math.PI/2;puddle.position.set(x,.025,z);scene.add(puddle);
  });
  createHarborDetails();
  createOuterDistricts();
  createHarborWayfinding();
  createPortSkyline();
}

function createFoundryArena(){
  // A separate open-air foundry: short corridors converge on a circular furnace,
  // with wide outer flank routes and a clear south deployment lane.
  const floor=mat(0x82766b,.92,.08);floor.map=createSurfaceTexture();floor.bumpMap=floor.map;floor.bumpScale=.022;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),floor);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);worldMeshes.push(ground);
  [[0,3,-74,148,6,2], [0,3,74,148,6,2],[-74,3,0,2,6,148],[74,3,0,2,6,148]].forEach(([x,y,z,sx,sy,sz])=>addBox(x,y,z,sx,sy,sz,0x332724));
  const walls=[
    [-25,0,13,3,2],[-25,-20,20,3,1],[25,0,13,3,2],[25,20,20,3,1],
    [-48,-28,1,3,29],[48,28,1,3,29],[-48,26,1,3,22],[48,-27,1,3,20],
    [-18,-47,22,3,1],[18,-47,22,3,1],[-18,47,22,3,1],[18,47,22,3,1],
    [-11,-19,12,2.4,1],[11,19,12,2.4,1],[-11,19,12,2.4,1],[11,-19,12,2.4,1]
  ];
  const foundryWallTexture=createWallTexture();
  walls.forEach(([x,z,sx,sy,sz],i)=>{
    const wall=addBox(x,sy/2,z,sx,sy,sz,i%2?0x675047:0x4a4140,{metalness:.24});
    wall.material.map=foundryWallTexture;wall.material.bumpMap=foundryWallTexture;wall.material.bumpScale=.018;wall.material.needsUpdate=true;
    // Vent panels sit on the wall face, so their decorative louvers add no
    // separate blocking geometry or expensive collision/raycast work.
    if(i<4){
      const panel=new THREE.Mesh(new THREE.BoxGeometry(2.6,1.1,.06),mat(0x292f30,.58,.55));
      panel.position.set(0,.12,sz/2+.03);wall.add(panel);
      const slats=new THREE.InstancedMesh(new THREE.BoxGeometry(2.35,.055,.035),mat(0x7c7365,.5,.45),6),matrix=new THREE.Matrix4();
      for(let j=0;j<6;j++){matrix.makeTranslation(0,-.4+j*.16,.04);slats.setMatrixAt(j,matrix);}slats.instanceMatrix.needsUpdate=true;panel.add(slats);
    }
    addWarningStripe(x,sy-.25,z,sx>sz?sx+.01:.09,.18,sz>sx?sz+.01:.09);
  });
  // Two portal frames give each long access lane a recognizable industrial
  // landmark; the high crosspieces are anchored to solid ground-level columns.
  for(const z of [-40,40]){
    for(const x of [-8,8]){
      const column=addBox(x,2.7,z,.42,5.4,.42,0x463c38,{metalness:.5});column.name='foundry-portal-column';
      addBox(x,.16,z,.8,.32,.8,0x383635,{metalness:.35,castShadow:false});
      const marker=new THREE.Mesh(new THREE.BoxGeometry(.25,.13,.05),new THREE.MeshBasicMaterial({color:0xffae5a}));marker.position.set(x,4.85,z+.24);scene.add(marker);
    }
    const beam=addBox(0,5.22,z,16.42,.36,.42,0x453b37,{metalness:.5});beam.name='foundry-portal-beam';
    const light=new THREE.PointLight(0xffa35b,1.5,16,2);light.position.set(0,4.95,z);scene.add(light);
  }
  // Low cross-cover breaks sightlines without sealing the walking lanes.
  [[-35,-11,5,1.25,1,.3],[-34,13,5,1.25,1,-.3],[35,-11,5,1.25,1,.3],[34,13,5,1.25,1,-.3],[-12,32,5,1.35,1,.25],[12,-32,5,1.35,1,-.25],[-57,48,5,1.25,1,0],[57,-48,5,1.25,1,0]].forEach(([x,z,sx,sy,sz,r])=>addBox(x,sy/2,z,sx,sy,sz,0x796653,{rotation:r,metalness:.2}));
  const furnace=new THREE.Mesh(new THREE.CylinderGeometry(4.4,4.4,5.5,28),mat(0x45352f,.45,.62));furnace.position.set(0,2.75,0);furnace.castShadow=true;furnace.receiveShadow=true;scene.add(furnace);worldMeshes.push(furnace);
  collisionBoxes.push(roundCollider(new THREE.Box3(new THREE.Vector3(-4.4,0,-4.4),new THREE.Vector3(4.4,5.5,4.4)),0,0,4.4));
  for(const y of [1.2,3.6,5.5]){const rim=new THREE.Mesh(new THREE.TorusGeometry(4.43,.13,7,32),mat(y===3.6?0xf45f24:0x292a2b,.45,.6,y===3.6?0x7a2309:0));rim.rotation.x=Math.PI/2;rim.position.y=y;scene.add(rim);}
  // Flush heat vents and reinforcing bands make the reactor readable from all
  // approaches. They sit against the existing cylinder, not in the lanes.
  const ventMaterial=new THREE.MeshBasicMaterial({color:0xff7835});
  const vents=new THREE.InstancedMesh(new THREE.BoxGeometry(.42,1.05,.035),ventMaterial,16),ventMatrix=new THREE.Matrix4();
  for(let i=0;i<16;i++){
    const angle=i*Math.PI*2/16;
    ventMatrix.makeRotationY(angle);ventMatrix.setPosition(Math.sin(angle)*4.405,2.35,Math.cos(angle)*4.405);vents.setMatrixAt(i,ventMatrix);
  }
  vents.instanceMatrix.needsUpdate=true;scene.add(vents);
  const furnaceGlow=new THREE.PointLight(0xff7338,2.4,13,2);furnaceGlow.position.set(0,4.9,0);scene.add(furnaceGlow);
  for(const [x,z] of [[-11,-11],[11,-11],[-11,11],[11,11]]){
    addBox(x,2.6,z,.5,5.2,.5,0x342e2d);
    const lamp=new THREE.PointLight(0xff7839,2.5,15,2);lamp.position.set(x,4.8,z);scene.add(lamp);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:0xff8a42}));cap.position.set(x,5.25,z);scene.add(cap);
  }
  // Raised pipe bridges make the reactor approaches recognizable without
  // adding obstacles to the walking lanes. Their ends meet the four columns.
  const bridgeGeometry=new THREE.CylinderGeometry(.18,.18,22,12),bridgeMaterial=mat(0x80614b,.46,.58);
  const collarGeometry=new THREE.TorusGeometry(.205,.045,6,12),collarMaterial=mat(0x393532,.58,.6);
  for(const z of [-11,11]){
    const bridge=new THREE.Mesh(bridgeGeometry,bridgeMaterial);bridge.name='foundry-pipe-bridge';
    bridge.rotation.z=Math.PI/2;bridge.position.set(0,4.65,z);bridge.castShadow=true;scene.add(bridge);worldMeshes.push(bridge);
    registerCollisionBox(0,4.65,z,22,.36,.36);
    for(const x of [-10.95,10.95]){const collar=new THREE.Mesh(collarGeometry,collarMaterial);collar.name='foundry-pipe-collar';collar.rotation.y=Math.PI/2;collar.position.set(x,4.65,z);scene.add(collar);}
  }
  [[-57,-54],[57,-54],[-57,54],[57,54],[-31,-35],[31,35],[-31,35],[31,-35]].forEach(([x,z],i)=>{
    createCrate(x,.75,z,1.5,i%2?0x725543:0x555858);createCrate(x+1.55,.75,z,1.5,0x594538);
  });
  // Grounded equipment stations distinguish the flank routes. All low solid
  // parts use the normal collision path; the face details are decorative and
  // kept flush to the existing bodies so they cannot create invisible walls.
  for(const [x,z,side] of [[-60,-14,1],[-60,15,1],[60,-14,-1],[60,15,-1]]){
    const station=addBox(x,1.3,z,3.6,2.6,3.2,0x554943,{metalness:.48});station.name='foundry-equipment';
    const stack=addBox(x,3.05,z,1.05,.9,1.05,0x393536,{metalness:.55});stack.name='foundry-equipment-stack';
    const panel=new THREE.Mesh(new THREE.BoxGeometry(.05,1.1,1.9),mat(0x202629,.62,.38));panel.position.set(side*1.825,.25,0);station.add(panel);
    const fins=new THREE.InstancedMesh(new THREE.BoxGeometry(.025,.06,1.65),mat(0x8a7c6c,.52,.55),5),matrix=new THREE.Matrix4();
    for(let i=0;i<5;i++){matrix.makeTranslation(side*.04,-.38+i*.18,0);fins.setMatrixAt(i,matrix);}fins.instanceMatrix.needsUpdate=true;panel.add(fins);
    const indicator=new THREE.Mesh(new THREE.BoxGeometry(.025,.13,.3),new THREE.MeshBasicMaterial({color:0xffae5a}));indicator.position.set(side*1.86,.88,.95);station.add(indicator);
    for(const dz of [-1.61,1.61])addWarningStripe(x,2.25,z+dz,3.62,.12,.04);
  }
  // Flush details distinguish the west loading side from the east cooling
  // side without adding invisible obstacles to the already narrow passages.
  // Every pipe is fixed to an existing perimeter wall and has no new collider.
  const pipeGeometry=new THREE.CylinderGeometry(.075,.075,19,8);
  const pipeMaterial=mat(0x9b7554,.5,.52),pipeBrackets=mat(0x3d3633,.66,.4);
  const pipeBatch=new THREE.InstancedMesh(pipeGeometry,pipeMaterial,8),bracketBatch=new THREE.InstancedMesh(new THREE.BoxGeometry(.17,.4,.25),pipeBrackets,24),pipeMatrix=new THREE.Matrix4();
  let pipeIndex=0,bracketIndex=0;
  for(const [x,z] of [[-48,-28],[-48,26],[48,-27],[48,28]]){
    const face=x<0?.54:-.54;
    for(const y of [1.65,2.05]){
      pipeMatrix.makeRotationX(Math.PI/2);pipeMatrix.setPosition(x+face,y,z);pipeBatch.setMatrixAt(pipeIndex++,pipeMatrix);
    }
    for(const dz of [-7,0,7])for(const y of [1.65,2.05]){
      pipeMatrix.makeTranslation(x+face,y,z+dz);bracketBatch.setMatrixAt(bracketIndex++,pipeMatrix);
    }
  }
  pipeBatch.name='foundry-wall-pipes';bracketBatch.name='foundry-pipe-brackets';
  pipeBatch.instanceMatrix.needsUpdate=true;bracketBatch.instanceMatrix.needsUpdate=true;scene.add(pipeBatch,bracketBatch);
  // Ground-level grates provide material variety while remaining perfectly
  // flush with the floor. A single instanced mesh avoids per-grate raycasts.
  const grates=new THREE.InstancedMesh(new THREE.BoxGeometry(2.6,.018,1.2),mat(0x272927,.72,.55),12),grateSlats=new THREE.InstancedMesh(new THREE.BoxGeometry(.09,.02,1.08),mat(0x8a7964,.55,.45),96),grateMatrix=new THREE.Matrix4();
  const gratePositions=[[-42,-34],[-42,-24],[-42,22],[-42,32],[42,-34],[42,-24],[42,22],[42,32],[-8,-37],[8,-37],[-8,37],[8,37]];
  gratePositions.forEach(([x,z],i)=>{
    grateMatrix.makeTranslation(x,.043,z);grates.setMatrixAt(i,grateMatrix);
    for(let j=0;j<8;j++){grateMatrix.makeTranslation(x-.98+j*.28,.055,z);grateSlats.setMatrixAt(i*8+j,grateMatrix);}
  });
  grates.name='foundry-floor-grates';grateSlats.name='foundry-grate-slats';grates.instanceMatrix.needsUpdate=true;grateSlats.instanceMatrix.needsUpdate=true;scene.add(grates,grateSlats);
  [[-17,27],[17,-27],[-38,-32],[38,32],[40,-38],[-40,38]].forEach(([x,z],i)=>createExplosiveBarrel(x,z,i));
  placeZoneSign('FOUNDRY','SOUTH ACCESS',0,3.6,58,Math.PI,0xffa343);
  placeZoneSign('REACTOR','CENTRAL FURNACE',0,4.5,7,0,0xffa343);
  placeZoneSign('LOADING','WEST ASSEMBLY',-55,3.6,-9,Math.PI/2,0x7ce9ff);
  placeZoneSign('QUENCH','EAST COOLING',55,3.6,9,-Math.PI/2,0x7ce9ff);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const ctx=canvas.getContext('2d');
  ctx.strokeStyle='rgba(255,166,77,.55)';ctx.lineWidth=5;ctx.setLineDash([24,16]);
  ctx.beginPath();ctx.moveTo(512,975);ctx.lineTo(512,620);ctx.moveTo(512,405);ctx.lineTo(512,48);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='rgba(237,191,113,.35)';ctx.lineWidth=4;ctx.strokeRect(380,380,264,264);ctx.strokeRect(180,180,664,664);
  ctx.fillStyle='rgba(255,189,112,.65)';ctx.textAlign='center';ctx.font='bold 35px Arial';ctx.fillText('F O U N D R Y',512,850);ctx.font='bold 24px Arial';ctx.fillText('REACTOR  //  HOT ZONE',512,670);
  // Painted route arrows and colour-coded work zones remain readable from the
  // player camera and require no additional physical geometry.
  const arrow=(x,y,angle,color)=>{
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();
    ctx.moveTo(0,-19);ctx.lineTo(15,-2);ctx.lineTo(6,-2);ctx.lineTo(6,16);ctx.lineTo(-6,16);ctx.lineTo(-6,-2);ctx.lineTo(-15,-2);ctx.closePath();ctx.fill();ctx.restore();
  };
  [270,330,694,754].forEach(y=>arrow(512,y,y<512?0:Math.PI,'rgba(255,193,112,.5)'));
  for(const [x,color,label] of [[240,'rgba(245,177,99,.5)','LOADING'],[784,'rgba(109,211,229,.52)','COOLING']]){
    ctx.strokeStyle=color;ctx.lineWidth=4;ctx.setLineDash([18,14]);ctx.beginPath();ctx.moveTo(x,290);ctx.lineTo(x,734);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=color;ctx.font='bold 22px Arial';ctx.fillText(label,x,512);
    arrow(x,400,0,color);arrow(x,624,Math.PI,color);
  }
  ctx.strokeStyle='rgba(255,153,69,.48)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(512,512,49,0,Math.PI*2);ctx.stroke();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const markings=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));markings.rotation.x=-Math.PI/2;markings.position.y=.034;scene.add(markings);
  createFoundrySkyline();
}

function createFoundrySkyline(){
  // A separate industrial horizon gives the foundry its own identity. The
  // silhouettes are beyond the playable perimeter and share three draw calls.
  const factory=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat(0x1b1c1c,.94,.12),24);
  const chimneys=new THREE.InstancedMesh(new THREE.CylinderGeometry(.7,.95,1,8),mat(0x242321,.9,.18),12);
  const beacon=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,6,4),new THREE.MeshBasicMaterial({color:0xff7950}),12);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
  factory.name='foundry-skyline';
  for(let i=0;i<24;i++){
    const angle=i*Math.PI*2/24,radius=87+(i%3)*4,height=10+(i%4)*3;
    position.set(Math.cos(angle)*radius,height/2-1,Math.sin(angle)*radius);
    quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),-angle);scale.set(10,height,7);matrix.compose(position,quaternion,scale);factory.setMatrixAt(i,matrix);
    if(i%2===0){
      const stackHeight=12+(i%6)*2,idx=i/2;
      position.set(Math.cos(angle)*radius,height+stackHeight/2-1,Math.sin(angle)*radius);quaternion.identity();scale.set(1,stackHeight,1);matrix.compose(position,quaternion,scale);chimneys.setMatrixAt(idx,matrix);
      matrix.makeTranslation(position.x,height+stackHeight-.9,position.z);beacon.setMatrixAt(idx,matrix);
    }
  }
  factory.instanceMatrix.needsUpdate=true;chimneys.instanceMatrix.needsUpdate=true;beacon.instanceMatrix.needsUpdate=true;scene.add(factory,chimneys,beacon);
}

function createPortSkyline(){
  const skylineMat=mat(0x071015,.92,.1);
  for(let i=0;i<28;i++){
    const angle=(i/28)*Math.PI*2;const radius=86+Math.random()*20;const width=3+Math.random()*8;const height=6+Math.random()*22;
    const building=new THREE.Mesh(new THREE.BoxGeometry(width,height,3+Math.random()*4),skylineMat);
    building.position.set(Math.cos(angle)*radius,height/2-1,Math.sin(angle)*radius);building.rotation.y=-angle;scene.add(building);
    if(i%4===0){const beacon=new THREE.Mesh(new THREE.SphereGeometry(.09,6,4),new THREE.MeshBasicMaterial({color:0xff364f}));beacon.position.copy(building.position);beacon.position.y=height-.7;scene.add(beacon);}
  }
  const craneMat=mat(0x10191d,.65,.45);
  [[-91,-54],[93,-43],[-88,67],[86,69]].forEach(([x,z],idx)=>{
    const tower=new THREE.Mesh(new THREE.BoxGeometry(.7,22,.7),craneMat);tower.position.set(x,10,z);scene.add(tower);
    const arm=new THREE.Mesh(new THREE.BoxGeometry(18,.6,.6),craneMat);arm.position.set(x+(idx%2?5:-5),20,z);arm.rotation.z=idx%2?.05:-.05;scene.add(arm);
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,8,5),craneMat);cable.position.set(x+(idx%2?10:-10),16,z);scene.add(cable);
  });
}

function createHarborDetails(){
  const steel=mat(0x263238,.58,.55),dark=mat(0x11191d,.7,.35),yellow=mat(0xb4cb38,.62,.22),pipeMat=mat(0x4b6269,.42,.68);
  const detailBox=(x,y,z,sx,sy,sz,material,rotation=0)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);mesh.position.set(x,y,z);mesh.rotation.y=rotation;mesh.receiveShadow=true;scene.add(mesh);registerCollisionBox(x,y,z,sx,sy,sz,rotation);worldMeshes.push(mesh);return mesh;};

  // HANGAR-03: catwalk, rail, ventilation, power boxes and practical lights.
  detailBox(0,3.28,.15,10.7,.16,1.05,steel);
  const railGeo=new THREE.BoxGeometry(.055,1,.055),railMat=dark,rail=new THREE.InstancedMesh(railGeo,railMat,22),matrix=new THREE.Matrix4();
  for(let i=0;i<11;i++){[-.48,.48].forEach((z,side)=>{matrix.makeTranslation(-5+i,3.82,z);rail.setMatrixAt(i*2+side,matrix);registerCollisionBox(-5+i,3.82,z,.055,1,.055);});}rail.instanceMatrix.needsUpdate=true;scene.add(rail);worldMeshes.push(rail);
  detailBox(0,4.2,-.48,10.5,.07,.07,steel);detailBox(0,4.2,.48,10.5,.07,.07,steel);
  [-3.8,0,3.8].forEach((x,index)=>{const duct=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,4.3,10),pipeMat);duct.rotation.z=Math.PI/2;duct.position.set(x,4.82,-5.25);scene.add(duct);const lamp=new THREE.PointLight(index===1?0xffc26f:0x65d9ff,2.3,10,2);lamp.position.set(x,4.55,index===1?1.5:-1.6);scene.add(lamp);});
  addBox(-4.75,.8,1.5,1.15,1.6,.55,0x47545a);addBox(4.75,.8,-1.5,1.15,1.6,.55,0x47545a);
  placeZoneSign('HANGAR—03','CENTRAL PROCESSING',0,4.5,5.54,0,0xc8ff2e,{mount:'suspended',anchorY:5.4});

  // CONTAINER ROW: stacked silhouettes and an economical low-poly forklift.
  createContainer(-35,4.8,-29,4.8,3.2,11,0x3d5967,Math.PI/2,true);
  createContainer(27,1.6,-35,4.8,3.2,11,0x39515a,Math.PI/2);
  createContainer(27,4.8,-35,4.8,3.2,11,0x6e4534,Math.PI/2,true);
  // An anchored cargo handling frame makes the north yard recognizable.
  for(const x of [20.8,33.2]){
    const post=addBox(x,3.65,-38.4,.4,7.3,.4,0x26363c,{metalness:.55});post.name='harbor-cargo-column';
    addBox(x,.12,-38.4,.75,.24,.75,0x4a4b46,{castShadow:false});
  }
  const cargoBeam=addBox(27,7.15,-38.4,12.8,.38,.45,0x293b40,{metalness:.55});cargoBeam.name='harbor-cargo-beam';
  const cargoLamp=new THREE.PointLight(0x7bd9f5,1.8,18,2);cargoLamp.position.set(27,6.9,-38.4);scene.add(cargoLamp);
  const fork=new THREE.Group();fork.position.set(20,0,-31);scene.add(fork);worldMeshes.push(fork);
  const forkBody=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.25,2.7),yellow);forkBody.position.y=.82;forkBody.castShadow=true;fork.add(forkBody);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.65,1.35,1.35),dark);cabin.position.set(0,1.9,.35);fork.add(cabin);
  [-.88,.88].forEach(x=>[-.78,.78].forEach(z=>{const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.37,.37,.26,12),mat(0x090b0c,.9,.1));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.42,z);fork.add(wheel);}));
  [-.48,.48].forEach(x=>{const tine=new THREE.Mesh(new THREE.BoxGeometry(.12,.11,2.7),steel);tine.position.set(x,.21,-2.25);fork.add(tine);});
  collisionBoxes.push(new THREE.Box3(new THREE.Vector3(18.8,0,-32.5),new THREE.Vector3(21.2,2.65,-29.4)));
  placeZoneSign('CONTAINER ROW','NORTH YARD',-31,2.4,-46.2,0,0x5de3ff);

  // FUEL DEPOT: two horizontal tanks, pipes and hazard markings.
  [[38,15],[39,6]].forEach(([x,z],index)=>{
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(1.55,1.55,5.6,22),mat(index?0x48575b:0x596467,.38,.62));tank.rotation.z=Math.PI/2;tank.position.set(x,2.15,z);tank.castShadow=true;tank.receiveShadow=true;scene.add(tank);worldMeshes.push(tank);collisionBoxes.push(new THREE.Box3(new THREE.Vector3(x-2.9,.45,z-1.6),new THREE.Vector3(x+2.9,3.75,z+1.6)));
    [-2.1,2.1].forEach(offset=>{const leg=detailBox(x+offset,.55,z,.38,1.1,1.5,steel);leg.castShadow=true;});
  });
  [32.5,35.3,42].forEach((x,i)=>{const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,17,8),pipeMat);pipe.rotation.x=Math.PI/2;pipe.position.set(x,.72,12);scene.add(pipe);worldMeshes.push(pipe);registerCollisionBox(x,.72,12,.22,.22,17);for(let z=4;z<21;z+=4)detailBox(x,.38,z,.55,.7,.18,dark);});
  placeZoneSign('FUEL DEPOT','FLAMMABLE / NO SPARK',36,4.5,23.8,Math.PI,0xff485c);

  // GATE A: guard booth, barrier and lane furniture.
  addBox(7,1.55,40,4.1,3.1,4.2,0x35464c);detailBox(7,2.05,37.88,2.7,1.1,.06,new THREE.MeshBasicMaterial({color:0x6bd5e3,transparent:true,opacity:.32}));
  detailBox(-2.8,1.05,39,.24,2.1,.24,steel);
  const gateArm=detailBox(1.4,1.1,39,8.2,.15,.18,mat(0xe5e4d0,.52,.3));gateArm.name='vaultable-gate-arm';
  for(let i=0;i<6;i++)detailBox(-2+i*1.55,1.1,38.9,.65,.15,.025,mat(i%2?0xff3e53:0xf1eee2,.55,.15));
  placeZoneSign('GATE—A','SECURITY CHECKPOINT',7,3.63,37.86,0,0xc8ff2e,{mount:'roof',anchorY:3.1});

  // SERVICE BAY: work wall, shutters, fans and tire stacks.
  addBox(-43.8,2.5,7,.7,5,20,0x28363b,{roughness:.8,metalness:.14});
  for(let z=-.5;z<15;z+=.65)detailBox(-43.38,2.5,z,.06,.045,.52,steel);
  [1,11].forEach(z=>{
    const fan=new THREE.Group();fan.name='service-fan';fan.position.set(-43.32,3.6,z);fan.rotation.y=Math.PI/2;scene.add(fan);
    const backing=new THREE.Mesh(new THREE.CylinderGeometry(.75,.75,.14,16),dark);backing.rotation.x=Math.PI/2;backing.position.z=-.08;fan.add(backing);
    const housing=new THREE.Mesh(new THREE.TorusGeometry(.72,.09,8,20),steel);fan.add(housing);
    const blades=new THREE.InstancedMesh(new THREE.BoxGeometry(.15,1.1,.04),steel,2),matrix=new THREE.Matrix4();
    for(let i=0;i<2;i++){matrix.makeRotationZ(i*Math.PI/2);matrix.setPosition(0,0,.025);blades.setMatrixAt(i,matrix);}blades.instanceMatrix.needsUpdate=true;fan.add(blades);
  });
  for(let stack=0;stack<3;stack++){for(let level=0;level<3;level++){const tire=new THREE.Mesh(new THREE.TorusGeometry(.38,.14,8,14),mat(0x090b0c,.96,.02));tire.rotation.x=Math.PI/2;tire.position.set(-38+stack*.82,.18+level*.24,10.5+stack*.4);scene.add(tire);}registerCollisionBox(-38+stack*.82,.38,10.5+stack*.4,.76,.76,.76);}
  placeZoneSign('SERVICE BAY','AUTHORIZED CREW ONLY',-43.25,3,7,Math.PI/2,0xffb34d,{mount:'wall',depth:.28});

  createInstancedProps();createFenceLines();createRoadDecals();createRain();
}

function createOuterDistricts(){
  const steel=mat(0x27343a,.55,.55),dark=mat(0x11191d,.78,.28),rust=mat(0x6f4436,.8,.18),cool=mat(0x3c5961,.55,.5);
  const visualBox=(x,y,z,sx,sy,sz,material,rotation=0)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);mesh.position.set(x,y,z);mesh.rotation.y=rotation;mesh.receiveShadow=true;scene.add(mesh);registerCollisionBox(x,y,z,sx,sy,sz,rotation);worldMeshes.push(mesh);return mesh;};
  const tank=(x,z,color=0x53636a)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(2.15,2.15,5.3,20),mat(color,.38,.58));mesh.position.set(x,2.65,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);worldMeshes.push(mesh);
    collisionBoxes.push(roundCollider(new THREE.Box3(new THREE.Vector3(x-2.15,0,z-2.15),new THREE.Vector3(x+2.15,5.3,z+2.15)),x,z,2.15));
    const ring=new THREE.Mesh(new THREE.TorusGeometry(2.17,.08,7,24),steel);ring.rotation.x=Math.PI/2;ring.position.set(x,4.25,z);scene.add(ring);
    const beacon=new THREE.Mesh(new THREE.SphereGeometry(.11,7,5),new THREE.MeshBasicMaterial({color:0xff4358}));beacon.position.set(x,5.52,z);scene.add(beacon);
  };

  // NORTH DRY DOCK — a dense close-range pocket with a stranded hull and gantry.
  addBox(-21,1.1,-59,22,2.2,5.2,0x35444a,{metalness:.28});
  addBox(-33,1.55,-58,1,3.1,19,0x242f34);addBox(-9,1.55,-58,1,3.1,19,0x242f34);
  [-31,-21,-11].forEach(x=>{addBox(x,2.6,-50.5,.42,5.2,.42,0x202a2f);visualBox(x,5.12,-55, .5,.42,9.5,steel);});
  visualBox(-21,5.35,-55,24,.42,.5,steel);visualBox(-21,4.95,-55,22,.08,.08,cool);
  [-28,-21,-14].forEach((x,i)=>{const plate=visualBox(x,2.28,-57.8,5.2,.16,2.8,i%2?rust:steel,(i-1)*.12);plate.castShadow=false;});
  addWarningStripe(-21,2.19,-56.38,20,.16,.06);placeZoneSign('DRY DOCK—07','HULL SERVICE / NORTH',-21,4.4,-50.25,0,0x5de3ff,{mount:'wall',depth:.22,bracketSpacing:0});

  // EAST REFINERY — large silos, pipe bridges and explosive approach lanes.
  [[58,-22,0x58666a],[58,0,0x4f6267],[58,22,0x675b4d]].forEach(([x,z,color])=>tank(x,z,color));
  [50.5,54,61.5,65].forEach((x,index)=>{const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,49,8),index%2?cool:steel);pipe.rotation.x=Math.PI/2;pipe.position.set(x,.72,0);scene.add(pipe);worldMeshes.push(pipe);registerCollisionBox(x,.72,0,.24,.24,49);});
  [-31,-11,11,31].forEach(z=>{addBox(54,.48,z,8,.96,.75,0x313d42,{castShadow:false});visualBox(58,1.18,z,17,.16,.55,steel);});
  [49.5,66.5].forEach(x=>{addBox(x,2.6,0,.45,5.2,.45,0x202a2f);visualBox(x,5.1,0,.45,.45,46,steel);});
  visualBox(58,5.1,0,17,.45,.55,steel);placeZoneSign('REFINERY—E','PRESSURIZED PROCESSING',49.3,4.1,30,Math.PI/2,0xffb34d);

  // SOUTH RAIL YARD — long sightlines split by train cars and loading platforms.
  const railCars=[createContainer(-24,1.7,59,4.9,3.4,17,0x315568,0),createContainer(20,1.7,59,4.9,3.4,17,0x744338,0)];
  // Mark both faces separately: lettering stays legible from either side and
  // sits above the corrugated ribs instead of competing for the same depth.
  railCars.forEach((car,index)=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#17252b';ctx.fillRect(0,0,512,128);ctx.fillStyle=index?'#ffc088':'#9ce8f5';ctx.fillRect(0,0,512,7);
    ctx.fillStyle='#f0f4ed';ctx.font='bold 56px Arial';ctx.fillText(index?'CARGO 02':'CARGO 01',22,67);
    ctx.fillStyle='#b6c9ca';ctx.font='bold 23px Arial';ctx.fillText('RAIL TRANSFER // PORT',22,104);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture}),geometry=new THREE.PlaneGeometry(3.4,.85);
    for(const side of [-1,1]){const label=new THREE.Mesh(geometry,material);label.name='harbor-rail-label';label.position.set(side*2.515,.35,0);label.rotation.y=side*Math.PI/2;car.add(label);}
  });
  [-27,-21,17,23].forEach(x=>{visualBox(x,.06,58,.1,.08,27,steel);});
  [-8,8].forEach(x=>{
    const barrier=addBox(x,.62,57,8,1.24,1.15,0x4e595d);barrier.name='rail-yard-barrier';
    // The stripe's top used to be exactly level with the barrier top (1.24),
    // causing competing depth samples and flashing as the view moved.
    const stripe=addWarningStripe(x,1.192,57,8.05,.12,.06);stripe.name='rail-yard-barrier-stripe';
  });
  for(let z=47;z<=69;z+=2.6){visualBox(-24,.11,z,7,.09,.2,dark);visualBox(20,.11,z,7,.09,.2,dark);}
  addBox(35,1.3,62,6.5,2.6,5.2,0x2d3d43);visualBox(35,2.65,59.35,4.6,.9,.06,new THREE.MeshBasicMaterial({color:0x6bd5e3,transparent:true,opacity:.28}));
  placeZoneSign('RAIL YARD—S','CARGO TRANSFER',0,3.6,69.3,Math.PI,0xc8ff2e);

  // WEST BREAKERS — irregular steel plates and machinery form short flank routes.
  [[-59,-31,7,2.4,.35,.18],[-61,-17,6,2.6,-.28,-.22],[-58,2,8,2.2,.42,.24],[-62,20,6,2.8,-.35,-.2],[-57,36,8,2.4,.24,.17]].forEach(([x,z,w,h,r,tilt],i)=>{
    addBox(x,h/2,z,w,h,.6,i%2?0x604136:0x354b54,{rotation:r,metalness:.32});
    visualBox(x,h+.06,z,w,.12,.64,steel,r);
  });
  [-52,-64].forEach(x=>[-42,-2,39].forEach(z=>{visualBox(x,2.45,z,.28,4.9,.28,steel);const lamp=visualBox(x,4.75,z,1.25,.24,.52,new THREE.MeshBasicMaterial({color:0xffb657}));lamp.rotation.z=.08;}));
  placeZoneSign('BREAKERS—W','SALVAGE / HOT WORK',-68.9,3.9,4,Math.PI/2,0xff6848);

  // Outer-ring cover guarantees that the larger lanes still have safe traversal choices.
  const outerCover=[[-46,-61,5,1.3,1,0],[-2,-54,5,1.3,1,.15],[22,-49,1,1.3,6,0],[43,-58,5,1.3,1,-.2],[66,-45,1,1.3,5,0],[64,45,1,1.3,5,0],[44,55,5,1.3,1,.2],[4,51,5,1.3,1,-.18],[-43,53,5,1.3,1,.15],[-54,47,1,1.3,5,0]];
  outerCover.forEach(([x,z,sx,sy,sz,r])=>{addBox(x,sy/2,z,sx,sy,sz,0x5a6669,{rotation:r,metalness:.18});addWarningStripe(x,sy-.2,z,sx>sz?sx+.02:.07,.16,sz>sx?sz+.02:.07,r);});

  // Repeated navigation lights are instanced to keep the richer perimeter inexpensive.
  const postGeo=new THREE.CylinderGeometry(.055,.07,1.15,7),postMat=dark,posts=new THREE.InstancedMesh(postGeo,postMat,28),lampGeo=new THREE.SphereGeometry(.08,6,4),lampMat=new THREE.MeshBasicMaterial({color:0x74e7ff}),lamps=new THREE.InstancedMesh(lampGeo,lampMat,28),matrix=new THREE.Matrix4();
  for(let i=0;i<14;i++){const t=-62+i*(124/13);[[-68,t],[68,t]].forEach(([x,z],side)=>{const index=i*2+side;matrix.makeTranslation(x,.58,z);posts.setMatrixAt(index,matrix);matrix.makeTranslation(x,1.2,z);lamps.setMatrixAt(index,matrix);});}
  posts.instanceMatrix.needsUpdate=true;lamps.instanceMatrix.needsUpdate=true;scene.add(posts,lamps);
}

function createHarborWayfinding(){
  // One ground decal replaces the full-map debug grid and scattered lane lines.
  // Industrial routes, loading bays and region codes share a single draw call.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;
  const ctx=canvas.getContext('2d'),scale=canvas.width/150,toX=x=>(x+75)*scale,toZ=z=>(z+75)*scale;
  const line=(points,color,width,dash=[])=>{ctx.strokeStyle=color;ctx.lineWidth=width*scale;ctx.setLineDash(dash.map(value=>value*scale));ctx.beginPath();points.forEach(([x,z],i)=>i?ctx.lineTo(toX(x),toZ(z)):ctx.moveTo(toX(x),toZ(z)));ctx.stroke();ctx.setLineDash([]);};
  const lane=(points,width=5.8)=>{
    line(points,'rgba(10,18,23,.24)',width);
    line(points,'rgba(228,198,107,.42)',.10,[1.5,1.2]);
  };
  lane([[0,68],[0,17]],6.5);lane([[0,-17],[0,-66]],6.5);
  lane([[-46,45],[-46,-42],[46,-42],[46,45]],4);
  lane([[-46,32],[-15,32]],4);lane([[14,32],[46,32]],4);
  line([[-3.4,47],[-3.4,65]],'rgba(229,236,210,.38)',.12);
  line([[3.4,47],[3.4,65]],'rgba(229,236,210,.38)',.12);
  const bay=(x,z,width,depth,code,label,color)=>{
    ctx.save();ctx.translate(toX(x),toZ(z));ctx.strokeStyle=color;ctx.lineWidth=.09*scale;
    ctx.strokeRect(-width*scale/2,-depth*scale/2,width*scale,depth*scale);
    ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${Math.round(1.05*scale)}px Arial`;ctx.fillText(code,0,-.35*scale);
    ctx.font=`700 ${Math.round(.37*scale)}px Arial`;ctx.fillText(label,0,.52*scale);ctx.restore();
  };
  bay(0,49,12,5,'A1','GATE / CHECKPOINT','rgba(203,230,151,.54)');
  bay(-33,-39,15,4.5,'C2','CONTAINER ROW','rgba(112,200,219,.5)');
  bay(27,-41,16,4.5,'C3','CARGO LOADING','rgba(112,200,219,.5)');
  bay(-21,-46,15,4,'D7','DRY DOCK','rgba(112,200,219,.5)');
  bay(37,26.5,12,4,'F1','FUEL / NO SPARK','rgba(239,165,104,.55)');
  bay(58,36,15,5,'E2','REFINERY ACCESS','rgba(239,165,104,.5)');
  bay(-38,20,11,4,'S4','SERVICE BAY','rgba(229,193,114,.5)');
  bay(-59,44,14,4,'W5','SALVAGE WORKS','rgba(229,193,114,.5)');
  bay(0,15,9,3,'H03','CENTRAL HANGAR','rgba(203,230,151,.5)');
  // Painted hazards give the low pipe crossings and gate readable edges.
  for(const z of [-31,-11,11,31])for(let x=50;x<66;x+=1.6)line([[x,z-.5],[x+.7,z+.5]],'rgba(238,182,83,.38)',.16);
  for(let x=-3;x<3;x+=.8)line([[x,43],[x,44.3]],'rgba(229,236,210,.42)',.28);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
  plane.name='harbor-wayfinding';plane.rotation.x=-Math.PI/2;plane.position.y=.034;scene.add(plane);
}

function createPickups(){
  pickupPlacements.forEach(([type,x,z],index)=>createPickup(type,x,z,index));
}

function openPickupSpot(x,z){
  const offsets=[[0,0],[2.4,0],[-2.4,0],[0,2.4],[0,-2.4],[2.4,2.4],[-2.4,-2.4]];
  for(const [ox,oz] of offsets){
    const px=x+ox,pz=z+oz,blocked=collisionBoxes.some(box=>bodyOverlapsCollider(box,px,pz,.7,.15,1.75));
    if(!blocked)return[px,pz];
  }
  return[x,z];
}

function createPickup(type,x,z,index){
  const def=pickupTypes[type],[px,pz]=openPickupSpot(x,z),root=new THREE.Group();root.position.set(px,0,pz);scene.add(root);
  const glow=new THREE.MeshBasicMaterial({color:def.color,transparent:true,opacity:.82,depthWrite:false}),dark=mat(0x11181b,.52,.5),steel=mat(0x89969a,.32,.8);
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(.56,.65,.1,8),dark);pad.position.y=.05;root.add(pad);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.57,.035,6,22),glow);ring.rotation.x=Math.PI/2;ring.position.y=.11;root.add(ring);
  const model=new THREE.Group();model.position.y=.57;root.add(model);
  const part=(geometry,material,pos,rotation)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...pos);if(rotation)mesh.rotation.set(...rotation);model.add(mesh);return mesh;};
  const box=(sx,sy,sz,material,x=0,y=0,z=0)=>part(new THREE.BoxGeometry(sx,sy,sz),material,[x,y,z]);
  if(type==='medkit'){
    const shell=mat(0xe5ece8,.62,.08),red=new THREE.MeshBasicMaterial({color:0xf1404e}),rubber=mat(0x344448,.85,.02);
    box(.76,.48,.43,shell);box(.78,.025,.45,rubber,0,.07,0);
    // A white hard case, red medical crosses and carrying handle read from every side.
    [-1,1].forEach(side=>{box(.13,.29,.012,red,0,-.025,side*.222);box(.34,.12,.015,red,0,-.025,side*.224);box(.075,.105,.018,steel,-.26,.07,side*.23);box(.075,.105,.018,steel,.26,.07,side*.23);});
    box(.095,.025,.27,red,0,.25,0);box(.29,.025,.095,red,0,.25,0);
    box(.36,.055,.11,rubber,0,.37,0);box(.055,.12,.11,rubber,-.15,.29,0);box(.055,.12,.11,rubber,.15,.29,0);
    for(const side of [-1,1])for(const end of [-1,1])box(.095,.13,.47,rubber,side*.34,end*.19,0);
  }else if(type==='armor'){
    const plate=mat(0x426771,.6,.4),trim=mat(0x1e343d,.8,.12),mark=new THREE.MeshBasicMaterial({color:0x76eaff});
    box(.55,.66,.14,plate);box(.46,.12,.18,trim,0,-.3,0);box(.6,.08,.18,trim,0,.08,0);
    [-.23,.23].forEach(x=>{const shoulder=box(.15,.22,.13,trim,x,.37,0);shoulder.rotation.z=x<0?-.18:.18;});
    [-1,1].forEach(side=>{box(.34,.28,.018,trim,0,.01,side*.085);box(.21,.035,.02,mark,0,.01,side*.1);box(.035,.17,.02,mark,0,.01,side*.102);});
  }else if(type==='ammo'){
    const olive=mat(0x59674a,.72,.22),brass=mat(0xd2a64b,.3,.8),tip=mat(0x9b6e34,.42,.6),mark=new THREE.MeshBasicMaterial({color:0xffdb69});
    box(.72,.4,.46,olive);box(.77,.065,.5,dark,0,.21,0);box(.36,.045,.08,steel,0,.32,0);
    box(.045,.09,.08,steel,-.16,.27,0);box(.045,.09,.08,steel,.16,.27,0);
    [-1,1].forEach(side=>{box(.065,.12,.025,steel,-.25,.12,side*.25);box(.065,.12,.025,steel,.25,.12,side*.25);box(.43,.045,.012,mark,0,-.11,side*.238);});
    for(let i=-1;i<=1;i++){
      part(new THREE.CylinderGeometry(.037,.037,.23,8),brass,[i*.145,.035,.29]);
      part(new THREE.ConeGeometry(.037,.1,8),tip,[i*.145,.2,.29]);
    }
  }else if(type==='grenade'){
    const olive=mat(0x5e7043,.75,.28),safety=new THREE.MeshBasicMaterial({color:0xffb347});
    part(new THREE.CapsuleGeometry(.22,.19,4,12),olive,[0,-.025,0]);
    // Segmented shell, safety band, fuse and pin make this a grenade rather than a glowing orb.
    [-.13,0,.13].forEach(y=>part(new THREE.TorusGeometry(y===0?.222:.207,.018,5,12),dark,[0,y-.025,0],[Math.PI/2,0,0]));
    part(new THREE.TorusGeometry(.22,.022,6,16),safety,[0,.08,0],[Math.PI/2,0,0]);
    part(new THREE.CylinderGeometry(.085,.11,.12,10),steel,[0,.3,0]);
    const lever=box(.09,.43,.055,steel,.18,.13,.025);lever.rotation.z=.23;
    box(.24,.045,.07,steel,.08,.38,.025);
    part(new THREE.TorusGeometry(.087,.015,6,16),steel,[-.14,.32,.025],[0,Math.PI/2,0]);
    box(.055,.055,.025,safety,0,-.11,.224);
  }
  model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
  model.position.y=0;const modelBounds=new THREE.Box3().setFromObject(model);model.position.y=.1-modelBounds.min.y;
  const label=createPickupLabel(def);label.position.set(0,1.24,0);root.add(label);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.025,.12,1.45,8,1,true),new THREE.MeshBasicMaterial({color:def.color,transparent:true,opacity:.07,depthWrite:false,side:THREE.DoubleSide}));beam.position.y=.78;root.add(beam);
  pickups.push({type,def,root,model,label,ring,active:true,respawnAt:0,baseY:0,phase:index*.83});
}

function createPickupLabel(def){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=88;const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(4,9,12,.91)';ctx.fillRect(0,5,256,76);ctx.fillStyle=`#${def.color.toString(16).padStart(6,'0')}`;ctx.fillRect(0,5,5,76);ctx.textAlign='center';ctx.font='700 18px Arial';ctx.fillText(def.code,132,31);ctx.fillStyle='#f3f7f4';ctx.font='700 24px "Noto Sans TC",sans-serif';ctx.fillText(def.name,132,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false}));sprite.scale.set(1.45,.5,1);return sprite;
}

function canUsePickup(type,time){
  const reserveCap=reserveCapacity(),grenadeCap=grenadeCapacity();
  if(type==='medkit')return health<maxHealth;
  if(type==='armor')return armor<maxArmor;
  if(type==='ammo')return reserve<reserveCap;
  if(type==='grenade')return grenadeCount<grenadeCap;
  return false;
}

function collectPickup(item,time){
  if(!item.active||!canUsePickup(item.type,time))return false;
  const beforeHealth=health,reserveCap=reserveCapacity(),grenadeCap=grenadeCapacity();
  if(item.type==='medkit')health=Math.min(maxHealth,health+45);
  else if(item.type==='armor')armor=Math.min(maxArmor,armor+38);
  else if(item.type==='ammo')reserve=Math.min(reserveCap,reserve+60);
  else if(item.type==='grenade')grenadeCount=Math.min(grenadeCap,grenadeCount+1);
  item.active=false;item.root.visible=false;item.respawnAt=time+item.def.respawn*1000*(.88+Math.random()*.24);
  if(health>beforeHealth){ui.hud.classList.add('healing');clearTimeout(collectPickup.healTimer);collectPickup.healTimer=setTimeout(()=>ui.hud.classList.remove('healing'),520);}
  updateHUD();feed(`${item.def.name}已取得 // 補給完成`);playTone(item.type==='medkit'?620:480,.12,'triangle',.045);
  if(item.type==='ammo'&&ammo===0&&reserve>0)reload(true);return true;
}

function canReachPickup(item){
  const feet=yaw.position.y-eyeHeight;
  if(Math.abs(feet-item.baseY)>1.25)return false;
  // A pickup on the other side of a fence or wall is not reachable merely
  // because its horizontal distance is small.
  const origin={x:yaw.position.x,y:feet+.4,z:yaw.position.z};
  const delta={x:item.root.position.x-origin.x,y:item.baseY+.4-origin.y,z:item.root.position.z-origin.z};
  return !collisionBoxes.some(box=>sweepSphereCollider(origin,delta,box,0));
}

function updatePickups(dt,time){
  let nearest=null,nearestDistance=Infinity,nearestReachable=true;
  for(const item of pickups){
    if(!item.active){if(time>=item.respawnAt){item.active=true;item.root.visible=true;}else continue;}
    item.root.position.y=item.baseY;item.ring.material.opacity=.65+Math.sin(time*.0022+item.phase)*.12;item.ring.rotation.z+=dt*.45;
    const distance=Math.hypot(yaw.position.x-item.root.position.x,yaw.position.z-item.root.position.z);item.label.visible=distance<13;
    const reachable=distance>=1.28||canReachPickup(item);
    if(distance<1.28&&reachable&&collectPickup(item,time))continue;
    if(distance<nearestDistance){nearest=item;nearestDistance=distance;nearestReachable=reachable;}
  }
  if(nearest&&nearestDistance<8){const usable=canUsePickup(nearest.type,time),available=usable&&nearestReachable;ui.pickupPrompt.classList.add('visible');ui.pickupPrompt.classList.toggle('blocked',!available);ui.pickupPrompt.querySelector('span').textContent=available?'⬡':'◇';ui.pickupPrompt.querySelector('b').textContent=`${nearest.def.name} // ${!nearestReachable?'前往補給所在位置':usable?'接近自動拾取':'目前補給已滿'}`;ui.pickupPrompt.querySelector('small').textContent=`${Math.ceil(nearestDistance)} M`;}else ui.pickupPrompt.classList.remove('visible','blocked');
  const buffUntil=Math.max(speedBoostUntil,damageShieldUntil);
  if(time<buffUntil){ui.buffStatus.classList.remove('hidden');ui.buffStatus.querySelector('b').textContent=time<speedBoostUntil&&time<damageShieldUntil?'戰術強化':time<speedBoostUntil?'疾速移動':'防禦強化';ui.buffStatus.querySelector('small').textContent=`${Math.ceil((buffUntil-time)/1000)}s`;}else ui.buffStatus.classList.add('hidden');
}

function createContainer(x,y,z,sx,sy,sz,color,rotation,visualOnly=false) {
  const body = addBox(x,y,z,sx,sy,sz,color,{rotation,metalness:.32,roughness:.62,castShadow:!visualOnly});
  body.userData.container=true;
  const edgeMat = mat(0x20282b,.55,.5);
  const localX = rotation ? sz : sx;
  const localZ = rotation ? sx : sz;
  [-1,1].forEach(dx => [-1,1].forEach(dz => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.13, sy + .1, .13), edgeMat);
    post.position.set(x + dx * (localX/2-.08), y, z + dz * (localZ/2-.08));
    post.castShadow = !visualOnly;
    scene.add(post);
  }));
  const ribCount=Math.ceil(sz/.48),ribs=new THREE.InstancedMesh(new THREE.BoxGeometry(.065,sy-.22,.045),body.material,ribCount*2),matrix=new THREE.Matrix4();
  for(let i=0;i<ribCount;i++)for(let side=0;side<2;side++){matrix.makeTranslation((side?1:-1)*(sx/2+.015),0,-sz/2+.2+i*(sz-.4)/Math.max(1,ribCount-1));ribs.setMatrixAt(i*2+side,matrix);}
  ribs.instanceMatrix.needsUpdate=true;ribs.castShadow=false;ribs.receiveShadow=true;body.add(ribs);
  const doorBars=new THREE.InstancedMesh(new THREE.BoxGeometry(.065,sy-.3,.07),edgeMat,4);
  for(let side=0;side<2;side++)for(let bar=0;bar<2;bar++){matrix.makeTranslation((bar?1:-1)*sx*.25,0,(side?1:-1)*(sz/2+.04));doorBars.setMatrixAt(side*2+bar,matrix);}
  doorBars.instanceMatrix.needsUpdate=true;body.add(doorBars);
  // Hinges and end catches remain attached to the actual cargo doors.
  const hinges=new THREE.InstancedMesh(new THREE.BoxGeometry(.19,.11,.055),edgeMat,8);
  for(let side=0;side<2;side++)for(let hinge=0;hinge<4;hinge++){
    matrix.makeTranslation((hinge%2?1:-1)*sx*.42,(hinge<2?-.32:.32)*sy,(side?1:-1)*(sz/2+.035));hinges.setMatrixAt(side*4+hinge,matrix);
  }
  hinges.instanceMatrix.needsUpdate=true;body.add(hinges);
  return body;
}

function placeZoneSign(title,subtitle,x,y,z,rotation=0,accent=0xc8ff2e,options={}){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#04090c';ctx.fillRect(0,0,512,128);ctx.fillStyle=`#${accent.toString(16).padStart(6,'0')}`;ctx.fillRect(0,0,512,7);ctx.strokeStyle='rgba(255,255,255,.25)';ctx.strokeRect(1,1,510,126);ctx.fillStyle='#f4f7f3';ctx.font='800 38px Arial';ctx.fillText(title,24,61);ctx.fillStyle='#809095';ctx.font='600 16px Arial';ctx.fillText(subtitle,25,94);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide}),geometry=new THREE.PlaneGeometry(4.2,1.05);
  const sign=new THREE.Group();sign.name=`zone-sign-${title}`;sign.userData.zoneSign=true;sign.position.set(x,y,z);sign.rotation.y=rotation;
  // Two outward-facing prints: the rear has its own orientation, never a mirrored back face.
  for(const side of [1,-1]){const face=new THREE.Mesh(geometry,material);face.position.z=side*.018;face.rotation.y=side===1?0:Math.PI;sign.add(face);}
  const frame=new THREE.Mesh(new THREE.BoxGeometry(4.24,1.09,.06),mat(0x18262c,.65,.4));
  // Keep the prints ahead of the physical frame on both sides.
  sign.children[0].position.z=.032;sign.children[1].position.z=-.032;sign.add(frame);
  const mount=new THREE.Group();mount.name='sign-mount';sign.add(mount);
  const mountType=options.mount||'posts',anchorY=options.anchorY??0;sign.userData.mountType=mountType;sign.userData.anchorY=anchorY;
  const supportMaterial=placeZoneSign.supportMaterial||(placeZoneSign.supportMaterial=mat(0x34474e,.58,.55));
  const support=(lx,cy,lz,sx,sy,sz)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),supportMaterial);mesh.position.set(lx,cy-y,lz);mesh.receiveShadow=true;mesh.userData.signSupport=true;mount.add(mesh);
    const px=x+Math.cos(rotation)*lx+Math.sin(rotation)*lz,pz=z-Math.sin(rotation)*lx+Math.cos(rotation)*lz;
    registerCollisionBox(px,cy,pz,sx,sy,sz,rotation);worldMeshes.push(mesh);return mesh;
  };
  if(mountType==='posts'){
    const top=y-.52;
    for(const side of [-1,1]){support(side*1.8,top/2,0,.14,top,.16);support(side*1.8,.06,0,.5,.12,.52);}
  }else if(mountType==='suspended'){
    const bottom=y+.51;
    for(const side of [-1,1])support(side*1.98,(bottom+anchorY)/2,0,.075,anchorY-bottom+.02,.075);
  }else if(mountType==='roof'){
    const top=y-.51;
    for(const side of [-1,1]){support(side*1.75,(top+anchorY)/2,.08,.12,Math.max(.08,top-anchorY+.02),.24);support(side*1.75,anchorY+.025,.1,.4,.05,.42);}
  }else{
    const depth=options.depth??.28;
    const spacing=options.bracketSpacing??1.6;
    for(const lx of spacing===0?[0]:[-spacing,spacing])support(lx,y,-depth/2,.22,.12,depth+.06);
  }
  scene.add(sign);return sign;
}

function createInstancedProps(){
  const coneGeo=new THREE.ConeGeometry(.18,.6,9),coneMat=mat(0xff6838,.72,.08),cones=new THREE.InstancedMesh(coneGeo,coneMat,18),m=new THREE.Matrix4();const positions=[];
  for(let i=0;i<9;i++){positions.push([-5.5+i*1.35,.3,44],[-5.5+i*1.35,.3,35.5]);}positions.forEach((p,i)=>{m.makeTranslation(...p);cones.setMatrixAt(i,m);});cones.instanceMatrix.needsUpdate=true;cones.receiveShadow=true;scene.add(cones);
  const bollardGeo=new THREE.CylinderGeometry(.1,.12,.75,8),bollardMat=mat(0x738188,.48,.54),bollards=new THREE.InstancedMesh(bollardGeo,bollardMat,20);for(let i=0;i<10;i++){[-1,1].forEach((side,j)=>{const x=side*48,z=-36+i*8;m.makeTranslation(x,.38,z);bollards.setMatrixAt(i*2+j,m);registerCollisionBox(x,.38,z,.24,.76,.24);});}bollards.instanceMatrix.needsUpdate=true;scene.add(bollards);
  const palletGeo=new THREE.BoxGeometry(1.7,.16,1.15),palletMat=mat(0x6f5236,.88,.02),pallets=new THREE.InstancedMesh(palletGeo,palletMat,9);
  pallets.name='harbor-pallets';
  [[-39,0,-15],[-36,0,-17],[-31,0,12],[-28,0,14],[25,0,23],[27,0,25],[15,0,-41],[-10,0,38],[-13,0,40]].forEach((p,i)=>{
    const rotation=(i%3)*.35;
    m.compose(new THREE.Vector3(p[0],.1,p[2]),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rotation),new THREE.Vector3(1,1,1));pallets.setMatrixAt(i,m);
    // The low collision surface supports feet and grenades while staying below
    // the bot's step clearance; it is intentionally not a bullet ray target.
    const box=registerCollisionBox(p[0],.1,p[2],1.7,.16,1.15,rotation);box.userData={pallet:true};
  });pallets.instanceMatrix.needsUpdate=true;scene.add(pallets);
}

function createFenceLines(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,128,64);ctx.strokeStyle='rgba(155,180,188,.48)';ctx.lineWidth=2;for(let x=-64;x<192;x+=12){ctx.beginPath();ctx.moveTo(x,64);ctx.lineTo(x+64,0);ctx.stroke();ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+64,64);ctx.stroke();}const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(6,2);const fenceMat=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false});
  const segments=[[-22,1.5,-45,26,3,0],[26,1.5,-45,22,3,0],[-45,1.5,26,22,3,Math.PI/2]],steel=mat(0x5e6d72,.48,.62),concrete=mat(0x4f5758,.94,.02),postPositions=[];
  segments.forEach(([x,y,z,w,h,r])=>{
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),fenceMat);mesh.position.set(x,y,z);mesh.rotation.y=r;scene.add(mesh);registerCollisionBox(x,y,z,w,h,.2,r);
    [0,h].forEach(offset=>{const rail=new THREE.Mesh(new THREE.BoxGeometry(w+.12,.07,.08),steel);rail.position.set(x,y-h/2+offset,z);rail.rotation.y=r;rail.castShadow=true;scene.add(rail);});
    const count=Math.ceil(w/3)+1;for(let i=0;i<count;i++){const along=-w/2+i*(w/(count-1)),px=x+Math.cos(r)*along,pz=z-Math.sin(r)*along;postPositions.push([px,pz]);}
  });
  const postGeo=new THREE.CylinderGeometry(.065,.08,3.35,7),posts=new THREE.InstancedMesh(postGeo,steel,postPositions.length),footGeo=new THREE.BoxGeometry(.34,.18,.34),feet=new THREE.InstancedMesh(footGeo,concrete,postPositions.length),markerGeo=new THREE.SphereGeometry(.055,6,4),markers=new THREE.InstancedMesh(markerGeo,new THREE.MeshBasicMaterial({color:0xffa23d}),postPositions.length),matrix=new THREE.Matrix4();
  postPositions.forEach(([x,z],i)=>{matrix.makeTranslation(x,1.58,z);posts.setMatrixAt(i,matrix);matrix.makeTranslation(x,.09,z);feet.setMatrixAt(i,matrix);matrix.makeTranslation(x,3.05,z);markers.setMatrixAt(i,matrix);});
  posts.instanceMatrix.needsUpdate=true;feet.instanceMatrix.needsUpdate=true;markers.instanceMatrix.needsUpdate=true;posts.castShadow=true;feet.receiveShadow=true;scene.add(posts,feet,markers);
}

function createRoadDecals(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,256,512);ctx.fillStyle='rgba(225,235,210,.62)';ctx.beginPath();ctx.moveTo(128,20);ctx.lineTo(230,170);ctx.lineTo(166,170);ctx.lineTo(166,430);ctx.lineTo(90,430);ctx.lineTo(90,170);ctx.lineTo(26,170);ctx.closePath();ctx.fill();const texture=new THREE.CanvasTexture(canvas);const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});[[0,33,0],[18,33,0],[-18,-35,Math.PI]].forEach(([x,z,r])=>{const arrow=new THREE.Mesh(new THREE.PlaneGeometry(2.1,4.2),material);arrow.rotation.x=-Math.PI/2;arrow.rotation.z=r;arrow.position.set(x,.031,z);scene.add(arrow);});
}

let rainSystem=null;
function createRain(){const count=900,positions=new Float32Array(count*3);for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*150;positions[i*3+1]=3+Math.random()*30;positions[i*3+2]=(Math.random()-.5)*150;}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));rainSystem=new THREE.Points(geo,new THREE.PointsMaterial({color:0x9ed3dd,size:.035,transparent:true,opacity:.4,depthWrite:false}));scene.add(rainSystem);}

function updateRain(dt){if(!rainSystem)return;const positions=rainSystem.geometry.attributes.position.array;for(let i=0;i<positions.length;i+=3){positions[i+1]-=dt*15;positions[i]+=dt*.7;if(positions[i+1]<.1){positions[i+1]=22+Math.random()*11;positions[i]=(Math.random()-.5)*150;positions[i+2]=(Math.random()-.5)*150;}}rainSystem.geometry.attributes.position.needsUpdate=true;}

function createExplosiveBarrel(x,z,index) {
  const root=new THREE.Group();root.position.set(x,0,z);root.userData.explosive=true;root.userData.exploded=false;root.userData.id=index;
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,1.28,16),mat(0x8b242b,.46,.48));
  body.position.y=.64;body.castShadow=true;body.receiveShadow=true;body.userData.barrelRef=root;root.add(body);
  [-.48,0,.48].forEach(y=>{const band=new THREE.Mesh(new THREE.TorusGeometry(.435,.035,6,18),mat(0x1c2225,.35,.7));band.rotation.x=Math.PI/2;band.position.y=.64+y;band.userData.barrelRef=root;root.add(band);});
  // Match the barrel's 16-sided curvature; the slight radial offset keeps
  // the marking attached without either embedding it or causing z-fighting.
  const warning=new THREE.Mesh(new THREE.CylinderGeometry(.44,.44,.22,4,1,true,-Math.PI/4,Math.PI/2),new THREE.MeshBasicMaterial({color:0xc8ff2e}));
  warning.name='barrel-warning';warning.position.y=.97;warning.userData.barrelRef=root;root.add(warning);
  scene.add(root);worldMeshes.push(root);explosiveBarrels.push(root);
  const box=roundCollider(new THREE.Box3(new THREE.Vector3(x-.47,0,z-.47),new THREE.Vector3(x+.47,1.27,z+.47)),x,z,.47);collisionBoxes.push(box);root.userData.collisionBox=box;
}

function createCrate(x,y,z,size,color) {
  const crate = addBox(x,y,z,size,size,size,color,{metalness:.1});
  const bandMat = mat(0x242b2d,.7,.25);
  // One square band already wraps all four faces. A second copy rotated 90°
  // occupies the same surfaces and makes the metal edges shimmer.
  const band = new THREE.Mesh(new THREE.BoxGeometry(size+.03,.13,size+.03),bandMat);
  band.name='crate-band';band.position.set(x,y,z);scene.add(band);
  return crate;
}

function addWarningStripe(x,y,z,sx,sy,sz,rotation=0) {
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), new THREE.MeshBasicMaterial({color:0xc8ff2e}));
  stripe.position.set(x,y,z);
  stripe.rotation.y = rotation;
  scene.add(stripe);
  return stripe;
}

function addAmbientDetails() {
  const dustGeo = new THREE.BufferGeometry();
  const points = [];
  for (let i=0;i<620;i++) points.push((Math.random()-.5)*146, Math.random()*14, (Math.random()-.5)*146);
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(points,3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({color:0xd5d0ae,size:.035,transparent:true,opacity:.45}));
  scene.add(dust);

  const beaconMat = new THREE.MeshBasicMaterial({color:0xff3e53});
  [[0,-71],[-71,0],[71,0],[0,71]].forEach(([x,z],i) => {
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),beaconMat);
    beacon.position.set(x,4.7+i*.15,z);
    scene.add(beacon);
  });
}

function bevelBoxGeometry(width,height,depth){
  const x=width/2,y=height/2,c=Math.min(width,height)*.12,shape=new THREE.Shape();
  shape.moveTo(-x+c,-y);shape.lineTo(x-c,-y);shape.lineTo(x,-y+c);shape.lineTo(x,y-c);shape.lineTo(x-c,y);shape.lineTo(-x+c,y);shape.lineTo(-x,y-c);shape.lineTo(-x,-y+c);shape.closePath();
  const bevel=Math.min(.006,depth*.12);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.002,depth-bevel*2),bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1,curveSegments:1});
  geometry.translate(0,0,-(depth-bevel*2)/2);return geometry;
}

function createGrenadeModel(){
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.095,.075,5,14),mat(0x35463a,.68,.38));
  const pulse=new THREE.Mesh(new THREE.TorusGeometry(.098,.012,6,18),new THREE.MeshBasicMaterial({color:0xffc45b}));pulse.rotation.x=Math.PI/2;body.add(pulse);
  const dark=mat(0x17231d,.5,.55),metal=mat(0x8a9997,.3,.8);
  for(const y of [-.055,.055]){const rib=new THREE.Mesh(new THREE.TorusGeometry(.089,.009,5,14),dark);rib.rotation.x=Math.PI/2;rib.position.y=y;body.add(rib);}
  const fuse=new THREE.Mesh(new THREE.CylinderGeometry(.041,.047,.055,10),metal);fuse.position.y=.135;body.add(fuse);
  const lever=new THREE.Mesh(bevelBoxGeometry(.034,.16,.022),metal);lever.position.set(.065,.092,0);lever.rotation.z=.24;body.add(lever);
  const pin=new THREE.Mesh(new THREE.TorusGeometry(.033,.006,5,14),metal);pin.position.set(-.052,.14,0);body.add(pin);
  return body;
}

function createWeapon() {
  weapon = new THREE.Group();
  weapon.position.set(.33,-.29,-.6);
  weapon.rotation.set(-.03,-.04,0);
  camera.add(weapon);

  const parts = [
    ['body', bevelBoxGeometry(.145,.145,.57), [0,.005,.035], [0,0,0], 0,.3],
    ['handguard', bevelBoxGeometry(.125,.13,.32), [0,.01,-.37], [0,0,0], 0,.58],
    ['accent', bevelBoxGeometry(.15,.025,.3), [0,.095,-.31], [0,0,0], 0,.95],
    ['barrel', new THREE.CylinderGeometry(.036,.042,.5,16), [0,.015,-.6], [Math.PI/2,0,0], 2,.15],
    ['stock', bevelBoxGeometry(.13,.155,.28), [0,-.015,.43], [-.12,0,0], 0,.38],
    ['grip', bevelBoxGeometry(.105,.26,.12), [0,-.2,.15], [-.25,0,0], 1,.12],
    ['mag', bevelBoxGeometry(.11,.29,.175), [0,-.21,-.11], [-.15,0,0], 0,.28],
    ['rail', bevelBoxGeometry(.09,.035,.56), [0,.13,-.03], [0,0,0], 2,.12]
  ];
  parts.forEach(([name,geo,pos,rot,index,blend]) => {
    const mesh = new THREE.Mesh(geo,mat(0xffffff,.45,.55));
    mesh.name = name;
    mesh.userData.skinIndex = index;
    mesh.userData.skinBlend=blend;
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.castShadow = true;
    weapon.add(mesh);
  });

  muzzleFlash = new THREE.PointLight(0xffc35a,0,4,2);
  muzzleFlash.position.set(0,.015,-.92);
  weapon.add(muzzleFlash);
  const flashCone = new THREE.Mesh(new THREE.ConeGeometry(.12,.34,7), new THREE.MeshBasicMaterial({color:0xffcf6c,transparent:true,opacity:.9,side:THREE.DoubleSide}));
  flashCone.rotation.x = -Math.PI/2;
  flashCone.position.set(0,.015,-.86);
  flashCone.visible = false;
  flashCone.name = 'flash';
  weapon.add(flashCone);

  muzzleAnchor=new THREE.Object3D();muzzleAnchor.position.set(0,.015,-.93);weapon.add(muzzleAnchor);
  const brake= new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.15,10),mat(0x151a1c,.28,.85));
  brake.rotation.x=Math.PI/2;brake.position.set(0,.015,-.89);brake.userData.skinIndex=2;brake.userData.skinBlend=.2;weapon.add(brake);
  opticGroup=new THREE.Group();opticGroup.name='optic';opticGroup.position.set(0,.225,-.18);weapon.add(opticGroup);
  const opticFrame=new THREE.Mesh(new THREE.TorusGeometry(.052,.007,8,24),mat(0x101518,.28,.78));opticGroup.add(opticFrame);
  const opticGlass=new THREE.Mesh(new THREE.CircleGeometry(.046,40),new THREE.MeshPhysicalMaterial({color:0x9edbe8,transparent:true,opacity:.1,roughness:.055,metalness:.1,clearcoat:1,clearcoatRoughness:.035,ior:1.48,side:THREE.DoubleSide,depthWrite:false}));opticGlass.position.z=.001;opticGroup.add(opticGlass);
  const glintCanvas=document.createElement('canvas');glintCanvas.width=glintCanvas.height=256;const glint=glintCanvas.getContext('2d');
  glint.beginPath();glint.arc(128,128,125,0,Math.PI*2);glint.clip();const edge=glint.createRadialGradient(128,128,45,128,128,126);edge.addColorStop(0,'rgba(120,215,235,0)');edge.addColorStop(.75,'rgba(112,214,244,.025)');edge.addColorStop(1,'rgba(171,233,255,.4)');glint.fillStyle=edge;glint.fillRect(0,0,256,256);glint.strokeStyle='rgba(235,253,255,.24)';glint.lineWidth=9;glint.beginPath();glint.moveTo(2,95);glint.lineTo(88,7);glint.stroke();glint.strokeStyle='rgba(120,224,255,.12)';glint.lineWidth=4;glint.beginPath();glint.moveTo(170,255);glint.lineTo(255,166);glint.stroke();
  const glintTexture=new THREE.CanvasTexture(glintCanvas);glintTexture.colorSpace=THREE.SRGBColorSpace;const lensGlint=new THREE.Mesh(new THREE.CircleGeometry(.046,40),new THREE.MeshBasicMaterial({map:glintTexture,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}));lensGlint.position.z=.003;opticGroup.add(lensGlint);
  const opticDot=new THREE.Mesh(new THREE.CircleGeometry(.0023,16),new THREE.MeshBasicMaterial({color:0xff4358,transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false}));opticDot.position.z=.008;opticGroup.add(opticDot);
  const mountBase=new THREE.Mesh(bevelBoxGeometry(.095,.025,.1),mat(0x172126,.4,.7));mountBase.name='optic-mount';mountBase.position.set(0,-.075,.015);opticGroup.add(mountBase);
  [-.034,.034].forEach(x=>{const mount=new THREE.Mesh(new THREE.BoxGeometry(.012,.065,.025),mat(0x111719,.32,.75));mount.position.set(x,-.061,.015);opticGroup.add(mount);});
  const triggerGuard=new THREE.Mesh(new THREE.TorusGeometry(.07,.012,6,14,Math.PI),mat(0x171d20,.4,.65));triggerGuard.rotation.set(0,Math.PI/2,Math.PI/2);triggerGuard.position.set(0,-.105,.08);weapon.add(triggerGuard);
  for(let i=0;i<4;i++){const vent=new THREE.Mesh(new THREE.BoxGeometry(.13,.012,.027),mat(0x080a0b,.55,.25));vent.position.set(0,.077,-.28-i*.06);weapon.add(vent);}

  // Recesses, fasteners, rail teeth and magazine ribs stay below the optic sightline.
  const detailDark=mat(0x101719,.45,.65),detailMetal=mat(0x78858a,.32,.8);
  const detail=(geometry,material,x,y,z)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);weapon.add(mesh);return mesh;};
  [-1,1].forEach(side=>{
    detail(new THREE.BoxGeometry(.006,.045,.23),detailDark,side*.067,.012,-.36);
    for(let i=0;i<4;i++)detail(new THREE.BoxGeometry(.007,.018,.025),detailMetal,side*.072,.012,-.44+i*.055);
    for(let i=0;i<3;i++)detail(new THREE.BoxGeometry(.009,.012,.13),detailDark,side*.06,-.17-i*.06,-.1);
    for(const z of [-.13,.2]){const bolt=detail(new THREE.CylinderGeometry(.009,.009,.009,10),detailMetal,side*.078,.035,z);bolt.rotation.z=Math.PI/2;}
  });
  for(let i=0;i<9;i++)detail(new THREE.BoxGeometry(.105,.01,.015),detailDark,0,.151,-.28+i*.055);
  detail(bevelBoxGeometry(.115,.025,.17),detailDark,0,-.36,-.085);
  detail(bevelBoxGeometry(.015,.044,.13),detailDark,.08,.023,.015);
  detail(new THREE.BoxGeometry(.018,.016,.095),detailMetal,.089,.026,.01);
  detail(new THREE.BoxGeometry(.055,.025,.035),detailMetal,.098,.048,.09);
  detail(bevelBoxGeometry(.14,.045,.12),detailDark,0,.08,.43);
  detail(bevelBoxGeometry(.145,.16,.035),detailDark,0,-.02,.59);
  for(let i=0;i<4;i++)detail(new THREE.BoxGeometry(.11,.012,.008),detailDark,0,-.135-i*.04,.215+i*.01);
  // Small machined controls and muzzle ports make the silhouette readable up close.
  for(const side of [-1,1]){
    const selector=detail(new THREE.CylinderGeometry(.014,.014,.006,12),detailMetal,side*.078,-.02,.13);selector.rotation.z=Math.PI/2;
    detail(new THREE.BoxGeometry(.006,.024,.055),detailDark,side*.079,-.025,.22);
    for(let i=0;i<3;i++)detail(new THREE.BoxGeometry(.009,.025,.035),detailDark,side*.069,.025,-.52+i*.055);
  }
  for(const z of [-.93,-.88,-.83])detail(new THREE.TorusGeometry(.075,.004,6,16),detailDark,0,.015,z);
  const serial=document.createElement('canvas');serial.width=256;serial.height=64;const text=serial.getContext('2d');text.fillStyle='#c6d1cf';text.font='700 28px monospace';text.fillText('AR—9  /  09',10,29);text.fillStyle='#657c85';text.font='14px monospace';text.fillText('NEON  //  5.56 AUTO',12,51);const serialTex=new THREE.CanvasTexture(serial);serialTex.colorSpace=THREE.SRGBColorSpace;
  const serialPlate=new THREE.Mesh(new THREE.PlaneGeometry(.16,.04),new THREE.MeshBasicMaterial({map:serialTex,transparent:true,depthWrite:false}));serialPlate.rotation.y=Math.PI/2;serialPlate.position.set(.079,-.024,.16);weapon.add(serialPlate);

  createArms();
  weapon.userData.arms=weapon.children.filter(object=>object.userData.arm);
  applyWeaponSkin();
  weapon.traverse(object=>{object.layers.set(1);if(object.isMesh){object.castShadow=false;object.receiveShadow=false;}});
  cacheWeaponClearancePoints();
}

function cacheWeaponClearancePoints(){
  weapon.updateWorldMatrix(true,true);
  const inverse=weapon.matrixWorld.clone().invert(),transform=new THREE.Matrix4(),point=new THREE.Vector3(),points=[];
  weapon.traverse(object=>{
    if(!object.isMesh||object.name==='flash'||object.userData.arm)return;
    object.geometry.computeBoundingBox();const bounds=object.geometry.boundingBox;
    transform.multiplyMatrices(inverse,object.matrixWorld);
    for(let i=0;i<8;i++){
      point.set(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).applyMatrix4(transform);
      points.push(point.x,point.y,point.z);
    }
  });
  weapon.userData.clearancePoints=new Float32Array(points);
}

function retractWeaponFromCover(clearance,dt){
  const points=weapon.userData.clearancePoints;if(!points?.length)return;
  weapon.updateMatrix();const matrix=weapon.matrix.elements;let front=0;
  for(let i=0;i<points.length;i+=3)front=Math.min(front,matrix[2]*points[i]+matrix[6]*points[i+1]+matrix[10]*points[i+2]+matrix[14]);
  const target=Math.max(0,-Math.max(.08,clearance-.045)-front);
  // Enter cover immediately; ease the rifle back out when the space opens.
  weaponRetraction=target>weaponRetraction?target:THREE.MathUtils.lerp(weaponRetraction,target,1-Math.exp(-dt*16));
  weapon.position.z+=weaponRetraction;
}

function createArms() {
  ['leftArm','rightArm'].forEach((name,i) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.075,.09,.58,10),mat(operatorSkins[selectedOperator].color,.85,.03));
    arm.name = name;
    arm.userData.arm = true;
    arm.position.set(i ? .2 : -.22,-.31,i ? .02 : -.16);
    arm.rotation.set(i ? -.65 : -.9,0,i ? -.25 : .35);
    weapon.add(arm);
  });
}

function applyWeaponSkin() {
  const skin = weaponSkins[selectedWeapon];
  weapon.traverse(child => {
    if (child.isMesh && Number.isInteger(child.userData.skinIndex)) {
      child.material.dispose();
      const color=new THREE.Color(skin.colors[child.userData.skinIndex]).lerp(new THREE.Color(0x17242b),1-(child.userData.skinBlend??.6));
      child.material = mat(color,.36,skin.metal);
    }
    if (child.userData.arm) {child.material.dispose();child.material = mat(operatorSkins[selectedOperator].color,.8,.02);}
  });
}

function spawnEnemies(count,options={}) {
  const colors = [0xb64a4f,0xc17d3d,0x4d79a8,0x7853a6,0x426d52,0xa33f75,0x81733c,0x496a70,0x9a593f];
  const offset=(currentWave*7+selectedMode*3+Math.floor(Math.random()*enemySpawnPoints.length))%enemySpawnPoints.length;
  const eliteCount=Math.min(count-(options.boss?1:0),Math.round(Math.max(0,Math.min(1,options.eliteRate??0))*count));
  let spawned=0;
  for(let i=0;i<count;i++){
    const variant=options.boss&&i===count-1?'boss':i<eliteCount?'elite':'standard';
    const spawnProbe={userData:{state:{radius:variant==='boss'?.55:.34}}};
    let pos=null;
    // Boss arrivals favor a reachable nearby lane instead of a distant corner.
    for(let pass=0;pass<(variant==='boss'?2:1)&&!pos;pass++)for(let j=0;j<enemySpawnPoints.length;j++){
      const candidate=enemySpawnPoints[(i+offset+j)%enemySpawnPoints.length],distance=Math.hypot(candidate[0]-yaw.position.x,candidate[1]-yaw.position.z);
      if(distance>14&&(variant!=='boss'||pass>0||distance<43)&&!isBotBlocked(candidate[0],candidate[1],spawnProbe)){pos=candidate;break;}
    }
    for(let attempt=0;!pos&&attempt<100;attempt++){const x=-67+Math.random()*134,z=-67+Math.random()*134;if(Math.hypot(x-yaw.position.x,z-yaw.position.z)>14&&!isBotBlocked(x,z,spawnProbe))pos=[x,z];}
    if(!pos)continue;
    createEnemy(pos[0],pos[1],colors[(i+currentWave*2)%colors.length],enemies.length,variant);
    spawned++;
  }
  matchTotalEnemies=Math.max(0,matchTotalEnemies-count+spawned);
  return spawned;
}

function createEnemy(x,z,color,index,variant='standard') {
  const rank=variant==='boss'?'boss':variant==='elite'?'elite':'standard';
  const difficulty=currentDifficulty(),tuning=getEnemyTuning(),boss=rank==='boss',elite=rank==='elite';
  const role=boss?'commander':index%3===1?'flanker':index%3===2?'marksman':'assault';
  const rankLabel=boss?commanderName():elite?'菁英幹員':'一般敵軍';
  const bossSettings=encounterSettings();
  const bossHealth=[350,700,1200,2000].includes(bossSettings.bossHealth)?bossSettings.bossHealth:700;
  const bossSpeed=[.75,1,1.75,3.2].includes(bossSettings.bossSpeed)?bossSettings.bossSpeed:1;
  const bossPower=[.75,1,1.5,2].includes(bossSettings.bossPower)?bossSettings.bossPower:1;
  const enemyMaxHealth=Math.round((boss?bossHealth:elite?155:100)*difficulty.enemyHealth*tuning.health);
  const baseSpeed=(2.25+Math.random()*.55)*(boss?.82*bossSpeed:elite?1.06:1)*(role==='flanker'?1.1:role==='marksman'?.94:1);
  const baseReaction=(Math.random()*.4+.25)*(boss?.9:elite?.82:1);
  const enemyName=boss?`WARLORD // ${commanderName()}`:`${elite?'ELITE ':''}${botNames[index%botNames.length]}-${String((index*7+currentWave*13)%100).padStart(2,'0')}`;
  const root = new THREE.Group();
  root.position.set(x,0,z);
  if(boss)root.scale.setScalar(1.25);
  root.userData.enemy = true;
  root.userData.id = index;
  scene.add(root);

  const suit = mat(boss?0x4c2831:elite?0x414c61:color,.8,.04);
  const armorMat = mat(boss?0x332923:elite?0x303e4b:0x20282c,.46,boss?.48:.22);
  const skinMat = mat(0xa87d63,.9,.01);
  const addPart = (geometry,material,pos,name) => {
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.userData.enemyRef = root;
    mesh.userData.part = name;
    root.add(mesh);
    return mesh;
  };
  const torso=addPart(new THREE.CapsuleGeometry(.35,.58,4,8),suit,[0,1.18,0],'body');torso.scale.z=.7;
  addPart(new THREE.BoxGeometry(.72,.58,.34),armorMat,[0,1.28,.12],'body');
  addPart(new THREE.SphereGeometry(.24,12,8),skinMat,[0,1.92,0],'head');
  addPart(new THREE.BoxGeometry(.34,.14,.3),armorMat,[0,2.05,.03],'head');
  const leftLeg = addPart(new THREE.CapsuleGeometry(.13,.52,3,7),suit,[-.19,.48,0],'limb');
  const rightLeg = addPart(new THREE.CapsuleGeometry(.13,.52,3,7),suit,[.19,.48,0],'limb');
  addPart(new THREE.BoxGeometry(.22,.13,.28),armorMat,[-.2,.73,.03],'limb');
  addPart(new THREE.BoxGeometry(.22,.13,.28),armorMat,[.2,.73,.03],'limb');
  const leftArm=addPart(new THREE.CapsuleGeometry(.09,.42,3,7),suit,[-.43,1.3,.2],'limb');leftArm.rotation.x=-.78;leftArm.rotation.z=-.28;
  const rightArm=addPart(new THREE.CapsuleGeometry(.09,.42,3,7),suit,[.43,1.3,.2],'limb');rightArm.rotation.x=-.78;rightArm.rotation.z=.28;
  addPart(new THREE.BoxGeometry(.88,.18,.38),armorMat,[0,1.58,.09],'body');
  addPart(new THREE.BoxGeometry(.47,.66,.22),armorMat,[0,1.28,-.22],'body');
  const antenna=addPart(new THREE.CylinderGeometry(.018,.018,.48,6),armorMat,[-.18,1.85,-.22],'body');antenna.rotation.z=-.08;
  const gun = addPart(new THREE.BoxGeometry(.12,.13,.66),mat(0x15191b,.38,.68),[.18,1.32,.5],'gun');
  gun.rotation.x = -.06;
  const muzzle=new THREE.Object3D();muzzle.position.set(.18,1.32,.86);root.add(muzzle);
  const enemyFlash=new THREE.Mesh(new THREE.ConeGeometry(.09,.27,6),new THREE.MeshBasicMaterial({color:0xff9f45,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
  enemyFlash.rotation.x=Math.PI/2;enemyFlash.position.copy(muzzle.position);enemyFlash.visible=false;root.add(enemyFlash);

  let rankMaterial=null;
  if(elite||boss){
    const badgeMat=new THREE.MeshStandardMaterial({color:boss?0xff9e42:0x78d8ff,emissive:boss?0x6b2604:0x10456b,emissiveIntensity:.55,roughness:.35,metalness:.6});
    rankMaterial=badgeMat;
    const visor=addPart(new THREE.BoxGeometry(.36,.075,.035),badgeMat,[0,1.97,.245],'head');visor.name='rank-visor';
    [-1,1].forEach(side=>{
      const shoulder=addPart(bevelBoxGeometry(boss?.3:.22,.28,.4),armorMat,[side*(boss?.48:.43),1.55,.03],'body');shoulder.rotation.z=side*-.12;
      addPart(new THREE.BoxGeometry(.045,.17,.025),badgeMat,[side*.28,1.35,.315],'body');
    });
    addPart(new THREE.BoxGeometry(.28,.065,.035),badgeMat,[0,1.55,.315],'body');
    if(boss){
      addPart(bevelBoxGeometry(.48,.52,.13),armorMat,[0,1.2,.29],'body');
      addPart(new THREE.BoxGeometry(.13,.13,.025),badgeMat,[0,1.22,.375],'body');
      [-1,1].forEach(side=>addPart(bevelBoxGeometry(.28,.3,.17),armorMat,[side*.21,.69,.12],'limb'));
      addPart(new THREE.CylinderGeometry(.04,.04,.2,8),armorMat,[.29,1.98,-.22],'body');
    }
  }

  // Floating world-space health bar.
  const barGroup = new THREE.Group();
  barGroup.position.set(0,2.35,0);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(.82,.07),new THREE.MeshBasicMaterial({color:0x190d0f,transparent:true,opacity:.85,depthTest:true}));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(.8,.045),new THREE.MeshBasicMaterial({color:boss?0xff9e42:elite?0x78d8ff:0xc8ff2e,depthTest:true}));
  fill.position.z=.002;
  barGroup.add(back,fill);
  root.add(barGroup);
  const nameplate=createNameplate(enemyName,enemyMaxHealth);nameplate.position.set(0,2.52,0);root.add(nameplate);

  root.userData.state = {
    name:enemyName,rank,rankLabel,role,bossPhase:1,radius:boss?.55:.34,bossAttackCooldown:boss?2.6:8.5,specialWindup:0,
    bossCastIndex:0,bossRecovery:0,bossPatternName:'',bossPower:boss?bossPower:1,
    damageMultiplier:boss?1.24*bossPower:elite?1.13:1,spreadMultiplier:(elite?.82:1)*(role==='marksman'?.8:1),
    health:enemyMaxHealth,maxHealth:enemyMaxHealth,alive:true,baseSpeed,speed:baseSpeed*difficulty.enemySpeed*tuning.speed,shotCooldown:(.8+Math.random())*difficulty.fireInterval*tuning.fireInterval,
    decisionTimer: 0, strafe: Math.random()>.5?1:-1, target: new THREE.Vector3(x,0,z),lastKnown:new THREE.Vector3(x,0,z),
    state:'PATROL',baseReaction,reaction:baseReaction*difficulty.reaction*tuning.reaction,patrolTimer:0,patrolWaiting:false,searchTime:0,hitTime:0,recoil:0,losTimer:Math.random()*.16,cachedCanSee:false,
    avoidSide:Math.random()<.5?-1:1,avoidTime:0,avoidX:0,avoidZ:0,progressTime:0,progressX:x,progressZ:z,
    burstShots:0,coverTarget:new THREE.Vector3(),coverTime:0,coverCooldown:0,
    barGroup,nameplate,fill,leftLeg,rightLeg,leftArm,rightArm,gun,muzzle,enemyFlash,rankMaterial,hitMaterials:[],stridePhase:Math.random()*Math.PI*2
  };
  const hitMaterials=new Set();root.traverse(obj=>{if(obj.isMesh&&obj.material?.emissive)hitMaterials.add(obj.material);});root.userData.state.hitMaterials=[...hitMaterials];
  root.userData.state.hitMaterials.forEach(material=>material.userData.restEmissive=material.emissive.getHex());
  enemies.push(root);
  return root;
}

function createNameplate(name,maxHealth){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=64;const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false}));sprite.scale.set(1.8,.3,1);
  let lastHealth=-1,lastMax=-1;
  sprite.userData.setHealth=(health,maximum)=>{
    const value=Math.max(0,Math.ceil(health)),max=Math.max(1,Math.ceil(maximum));if(value===lastHealth&&max===lastMax)return;
    lastHealth=value;lastMax=max;ctx.clearRect(0,0,384,64);ctx.fillStyle='rgba(7,10,12,.88)';ctx.fillRect(0,4,384,54);
    ctx.fillStyle='#ff4056';ctx.fillRect(0,4,5,54);ctx.textAlign='left';ctx.font='700 19px Arial';ctx.fillStyle='#f3f7f4';ctx.fillText(name,14,36,260);
    ctx.textAlign='right';ctx.font='700 18px Arial';ctx.fillStyle='#c8ff2e';ctx.fillText(`${value}/${max}`,376,36);texture.needsUpdate=true;
  };
  sprite.userData.setHealth(maxHealth,maxHealth);return sprite;
}

function openHelp(){ui.helpModal.classList.remove('hidden');ui.helpButton.setAttribute('aria-expanded','true');}
function closeHelp(){ui.helpModal.classList.add('hidden');ui.helpButton.setAttribute('aria-expanded','false');}

function setGameVolume(percent){
  const value=Number(percent);masterVolume=(Number.isFinite(value)?Math.max(0,Math.min(100,value)):72)/100;
  const label=String(Math.round(masterVolume*100));ui.volume.value=label;ui.pauseVolume.value=label;ui.volumeValue.textContent=`${label}%`;ui.pauseVolumeValue.textContent=`${label}%`;
  saveChoice('neonVolume',label);applyAudioMix();
}

function setGraphicsQuality(value){
  const index=Number(value);qualityIndex=Number.isInteger(index)&&index>=0&&index<=2?index:1;
  ui.quality.value=String(qualityIndex);ui.pauseQuality.value=String(qualityIndex);saveChoice('neonQuality',qualityIndex);
  renderer.setPixelRatio(Math.min(devicePixelRatio,(touchCapable?[1.35,1.1,1]:[1.8,1.35,1])[qualityIndex]));renderer.shadowMap.enabled=qualityIndex!==2;renderer.shadowMap.needsUpdate=true;onResize();
}

function setupEvents() {
  ui.deploy.addEventListener('click', startGame);
  const mapControl=$('#mapSelect');mapControl.value=String(selectedMap);
  if(typeof window!=='undefined')window.refreshLobbyMapPreview?.();
  mapControl.addEventListener('change',()=>{if(setSelectedMap(Number(mapControl.value))&&typeof window!=='undefined')window.refreshLobbyMapPreview?.();});
  ui.resume.addEventListener('click', requestLock);
  $('#touchReturnButton').addEventListener('click',()=>{
    if(window.parent!==window)window.parent.postMessage({type:'akane-return'},location.protocol==='file:'?'*':location.origin);
    else location.href='../../index.html#games';
  });
  $('#fallbackButton').addEventListener('click',()=>{freeLook=true;resumeGame();feed('相容操作 // 按住右鍵拖曳轉向，左鍵射擊；Esc 暫停');});
  ui.restart.addEventListener('click', () => location.reload());
  ui.again.addEventListener('click', () => location.reload());
  ui.helpButton.addEventListener('click',openHelp);ui.helpClose.addEventListener('click',closeHelp);ui.helpDone.addEventListener('click',closeHelp);document.querySelectorAll('[data-open-help]').forEach(button=>button.addEventListener('click',openHelp));ui.helpModal.addEventListener('click',event=>{if(event.target===ui.helpModal)closeHelp();});
  ui.quality.value=String(qualityIndex);
  ui.pauseQuality.value=String(qualityIndex);
  ui.quality.addEventListener('change',()=>setGraphicsQuality(ui.quality.value));ui.pauseQuality.addEventListener('change',()=>setGraphicsQuality(ui.pauseQuality.value));
  setGameVolume(Math.round(masterVolume*100));
  ui.volume.addEventListener('input',()=>setGameVolume(ui.volume.value));ui.pauseVolume.addEventListener('input',()=>setGameVolume(ui.pauseVolume.value));
  for(const [channel,id,key] of [['effects','effectsVolume','neonEffectsVolume'],['ambience','ambienceVolume','neonAmbienceVolume'],['feedback','feedbackVolume','neonFeedbackVolume']]){
    const control=$(`#${id}`),output=$(`#${id}Value`);control.value=String(Math.round(mixSettings[channel]*100));output.textContent=`${control.value}%`;
    control.addEventListener('input',()=>{mixSettings[channel]=Math.max(0,Math.min(1,Number(control.value)/100||0));output.textContent=`${Math.round(mixSettings[channel]*100)}%`;saveChoice(key,Math.round(mixSettings[channel]*100));applyAudioMix();});
  }
  for(const [control,field] of [[ui.enemyCountSelect,'enemyCount'],[ui.enemyPowerSelect,'enemyPower'],[ui.eliteSelect,'eliteRate'],[ui.bossSelect,'bossFinale'],[$('#bossHealthSelect'),'bossHealth'],[$('#bossSpeedSelect'),'bossSpeed'],[$('#bossPowerSelect'),'bossPower']]){
    control.value=field==='bossFinale'?(missionSettings[field]?'on':'off'):String(missionSettings[field]);
    control.addEventListener('change',()=>{
      if(gameState!=='lobby')return;
      missionSettings=normalizeMissionSettings({...missionSettings,[field]:field==='bossFinale'?control.value==='on':Number(control.value)});
      saveChoice('neonEncounter',JSON.stringify(missionSettings));updateModePreview();
    });
  }
  updateModePreview();
  addEventListener('resize', onResize);
  addEventListener('keydown', event => {
    if(event.code==='Escape'&&!ui.helpModal.classList.contains('hidden')){closeHelp();return;}
    if(event.code==='Escape'){pauseGame();document.exitPointerLock?.();return;}
    keys[event.code] = true;
    if(gameState==='playing'&&['Space','KeyQ','KeyG'].includes(event.code))event.preventDefault();
    if (event.code === 'KeyR') reload();
    if (event.code === 'KeyG' && !event.repeat && gameState==='playing') {
      if(grenadeCount>0){grenadeAiming=true;mouseDown=false;updateGrenadePreview(performance.now(),true);}
      else feed('手榴彈已用盡 // 尋找手榴彈補給');
    }
    if (event.code === 'KeyQ' && !event.repeat) useAbility();
    if (event.code === 'Space'&&!event.repeat) jump();
  });
  addEventListener('keyup', event => {
    keys[event.code] = false;
    if(event.code==='KeyG'&&grenadeAiming){grenadeAiming=false;updateGrenadePreview(performance.now(),true);throwGrenade();}
  });
  addEventListener('contextmenu',event=>event.preventDefault());
  addEventListener('mousedown', event => {
    if(event.sourceCapabilities?.firesTouchEvents || (event.target && event.target!==renderer.domElement))return;
    if(event.button===2&&gameState==='playing'){aiming=true;return;}
    if(event.button===0&&gameState==='playing'){
      if(grenadeAiming){
        grenadeAiming=false;mouseDown=false;updateGrenadePreview(performance.now(),true);
        feed('已取消投擲 // 手榴彈已保留');return;
      }
      mouseDown=true;
      const now=performance.now();
      if(now-lastShot>92)shoot(now);
    }
  });
  addEventListener('mouseup', event => { if (event.button === 0) mouseDown = false;if(event.button===2)aiming=false; });
  addEventListener('blur',()=>{clearInputs();pauseGame();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();pauseGame();document.exitPointerLock?.();}});
  addEventListener('akane-portal-pause', event => {
    portalPaused = event.detail?.paused === true;
    if (!portalPaused) return;
    pauseGame('已返回遊戲館。準備好後，按「繼續任務」回到戰場。');
    clearInputs();
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
    audioContext?.suspend?.().catch(() => {});
  });
  document.addEventListener('pointerlockerror',pauseGame);
  addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
      freeLook=false;resumeGame();
      ui.pause.classList.add('hidden');
    } else if (gameState === 'playing'&&!freeLook) {
      pauseGame();
    }
  });
}

function clearInputs(){touchControls?.setPlaying(false);touchControls?.reset();mouseDown=false;aiming=false;grenadeAiming=false;jumpBuffer=0;groundGrace=0;updateGrenadePreview(performance.now(),true);Object.keys(keys).forEach(key=>keys[key]=false);}

function pauseGame(message){
  if(gameState!=='playing')return;
  gameState='paused';pauseStarted=performance.now();clearInputs();ui.pause.querySelector('p').textContent=typeof message==='string'?message:'點擊下方按鈕返回戰場。';ui.pause.classList.remove('hidden');
}

function resumeGame(){
  if(portalPaused || document.hidden)return;
  resumeAudio();
  if(gameState==='paused'){
    clock?.getDelta?.();
    const pausedFor=Math.max(0,performance.now()-pauseStarted);gameStart+=pausedFor;
    if(matchDeadline)matchDeadline+=pausedFor;if(lastKillAt)lastKillAt+=pausedFor;
    if(speedBoostUntil)speedBoostUntil+=pausedFor;if(damageShieldUntil)damageShieldUntil+=pausedFor;
    if(reloading)reloadStarted+=pausedFor;
    pickups.forEach(item=>{if(!item.active)item.respawnAt+=pausedFor;});
    gameState='playing';
  }
  ui.pause.classList.add('hidden');
  touchControls?.setPlaying(gameState==='playing');
}

function startGame() {
  if(gameState!=='lobby')return;
  prepareSelectedMap();
  activeEncounter={settings:{...missionSettings}};
  const operator=currentOperator(),mode=currentMode();maxHealth=operator.maxHealth;maxArmor=operator.maxArmor;health=maxHealth;armor=maxArmor;ammo=30;reserve=operator.reserveAmmo;grenadeCount=operator.grenades;speedBoostUntil=0;damageShieldUntil=0;
  matchTotalEnemies=encounterTotal(mode);defeatedEnemies=0;currentWave=0;wavePending=false;waveRemaining=0;abilityCooldown=0;killStreak=0;lastKillAt=0;matchDeadline=mode.timeLimit?performance.now()+mode.timeLimit*1000:0;
  bossPending=mode.bossEnabled;bossArrivalQueued=false;bossArrivalRemaining=0;clearBossAttacks();
  if(enemies.length===0)spawnMissionWave(0);
  ui.deploy.disabled=true;
  initAudio();
  loadAudioAssets();
  ui.lobby.classList.remove('visible');
  ui.helpButton.classList.add('hidden');closeHelp();
  setTimeout(() => ui.lobby.classList.add('hidden'), 420);
  ui.hud.classList.remove('hidden');
  ui.hud.setAttribute('aria-hidden','false');
  gameState = 'playing';
  gameStart = performance.now();
  if(mode.timeLimit)matchDeadline=gameStart+mode.timeLimit*1000;
  updateHUD();
  updateMissionStatus(performance.now(),true);
  requestLock();
  feed(`任務開始 // ${mode.label} // 敵軍 ${matchTotalEnemies}`);
  playTone(110,.18,'sawtooth',.035);
}

function requestLock() {
  if(touchControls?.enabled){freeLook=true;resumeGame();return;}
  try{
    if(document.pointerLockElement===renderer.domElement){freeLook=false;resumeGame();return;}
    if(!renderer.domElement.requestPointerLock){pauseGame();return;}
    const result=renderer.domElement.requestPointerLock();
    if(result?.catch)result.catch(()=>pauseGame());
  }catch{pauseGame();}
}

function useAbility(){
  if(gameState!=='playing'||abilityCooldown>0)return;
  const now=performance.now();
  if(selectedOperator===0){health=Math.min(maxHealth,health+22);armor=Math.min(maxArmor,armor+12);}
  else if(selectedOperator===1)speedBoostUntil=Math.max(speedBoostUntil,now+8000);
  else{armor=Math.min(maxArmor,armor+30);damageShieldUntil=Math.max(damageShieldUntil,now+8000);}
  abilityCooldown=28;ui.hud.classList.add('ability-flash');setTimeout(()=>ui.hud.classList.remove('ability-flash'),500);
  feed(`${operatorAbilities[selectedOperator].name} // ${operatorAbilities[selectedOperator].description}`);playTone(580,.18,'triangle',.045);updateHUD();
}

function throwGrenade(){
  if(gameState!=='playing'||grenadeCount<=0)return;
  grenadeAiming=false;updateGrenadePreview(performance.now(),true);
  grenadeCount--;ui.grenadeCount.textContent=grenadeCount;
  const mesh=createGrenadeModel();
  const {origin,direction:dir}=getGrenadeAim(new THREE.Vector3(),new THREE.Vector3());
  const motion=createGrenadeMotion(origin,dir,collisionBoxes);mesh.position.copy(motion.position);scene.add(mesh);
  grenades.push({mesh,motion});
  playSample('shell',.12,.72);playTone(180,.05,'square',.025);feed(`破片手榴彈已投擲 // 剩餘 ${grenadeCount}`);
}

function getGrenadeAim(origin,direction){
  // Camera shake is visual. Holding G and releasing G use the same stable eye point.
  if(camera.parent?.isGroup)camera.parent.getWorldPosition(origin);else camera.getWorldPosition(origin);
  camera.getWorldDirection(direction);return {origin,direction};
}

function createGrenadePreview(){
  if(grenadePreview)return grenadePreview.group;
  const geometry=new THREE.BufferGeometry();
  const positions=new Float32Array(64*3),distances=new Float32Array(64);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('lineDistance',new THREE.BufferAttribute(distances,1));
  geometry.setDrawRange(0,0);
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x7effdb,transparent:true,opacity:.9,depthWrite:false}));line.frustumCulled=false;
  const marker=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.RingGeometry(.37,.48,40),new THREE.MeshBasicMaterial({color:0x7effdb,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;marker.add(ring);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.095,10,7),new THREE.MeshBasicMaterial({color:0xe4fff4,transparent:true,opacity:.95,depthWrite:false}));marker.add(dot);
  const blastMarker=new THREE.Group();
  const blastRing=new THREE.Mesh(new THREE.RingGeometry(.23,.32,32),new THREE.MeshBasicMaterial({color:0xffb05b,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));
  blastRing.rotation.x=-Math.PI/2;blastMarker.add(blastRing);
  const blastDot=new THREE.Mesh(new THREE.OctahedronGeometry(.12),new THREE.MeshBasicMaterial({color:0xffb05b,depthWrite:false}));blastDot.position.y=.19;blastMarker.add(blastDot);
  const group=new THREE.Group();group.name='grenade-preview';group.add(line,marker,blastMarker);group.visible=false;scene.add(group);
  grenadePreview={group,line,marker,ring,dot,positions,distances,blastMarker,blastRing,blastDot,
    origin:new THREE.Vector3(),direction:new THREE.Vector3(),probeOrigin:new THREE.Vector3(),probeDirection:new THREE.Vector3(),
    normal:new THREE.Vector3(),markerAxis:new THREE.Vector3(0,0,1),prediction:null,boxCount:-1};
  return group;
}

function updateGrenadePreview(time,force=false){
  const active=gameState==='playing'&&grenadeAiming&&grenadeCount>0;
  touchControls?.setGrenadePreview(active);
  ui.hud.classList.toggle('grenade-aiming',active);
  const hint=ui.grenadeHint;
  if(hint)hint.classList.toggle('hidden',!active);
  if(!grenadePreview)return;
  grenadePreview.group.visible=active;
  if(!active){grenadePreview.line.geometry.setDrawRange(0,0);grenadePreview.marker.visible=false;grenadePreview.blastMarker.visible=false;grenadePreview.prediction=null;hint?.classList.remove('danger');return;}
  const {origin,direction}=getGrenadeAim(grenadePreview.probeOrigin,grenadePreview.probeDirection);
  // Keep the last GPU buffers while the aim is still; recompute immediately on
  // movement, rotation or a destroyed obstacle, and always on a fresh G press.
  if(!force&&grenadePreview.prediction&&grenadePreview.boxCount===collisionBoxes.length&&
    origin.distanceToSquared(grenadePreview.origin)<1e-6&&direction.distanceToSquared(grenadePreview.direction)<1e-8)return;
  const prediction=predictGrenadePath(origin,direction,collisionBoxes);
  grenadePreview.prediction=prediction;grenadePreview.origin.copy(origin);grenadePreview.direction.copy(direction);grenadePreview.boxCount=collisionBoxes.length;
  const previewPoints=prediction.previewPoints,landing=prediction.firstImpact||prediction.end;
  let distance=0;
  previewPoints.forEach((point,index)=>{
    const offset=index*3;grenadePreview.positions[offset]=point.x;grenadePreview.positions[offset+1]=point.y;grenadePreview.positions[offset+2]=point.z;
    if(index){const previous=previewPoints[index-1];distance+=Math.hypot(point.x-previous.x,point.y-previous.y,point.z-previous.z);}
    grenadePreview.distances[index]=distance;
  });
  grenadePreview.line.geometry.attributes.position.needsUpdate=true;grenadePreview.line.geometry.attributes.lineDistance.needsUpdate=true;grenadePreview.line.geometry.setDrawRange(0,previewPoints.length);
  // Keep a single line and merge nearby contact/blast markers instead of stacking circles.
  grenadePreview.marker.visible=!!prediction.firstImpact&&Math.hypot(landing.x-prediction.end.x,landing.y-prediction.end.y,landing.z-prediction.end.z)>1.4;
  grenadePreview.blastMarker.visible=true;
  const normal=grenadePreview.normal.set(0,1,0);if(prediction.firstImpactNormal)normal.copy(prediction.firstImpactNormal);
  grenadePreview.marker.position.copy(landing).addScaledVector(normal,prediction.firstImpact?-.105:0);
  grenadePreview.ring.quaternion.setFromUnitVectors(grenadePreview.markerAxis,normal);
  grenadePreview.dot.position.copy(normal).multiplyScalar(.045);
  grenadePreview.blastMarker.position.copy(prediction.end);grenadePreview.blastMarker.position.y-=prediction.grounded?.105:0;
  grenadePreview.blastRing.visible=prediction.grounded;
  const danger=Math.hypot(origin.x-prediction.end.x,origin.y-.5-prediction.end.y,origin.z-prediction.end.z)<GRENADE_BLAST_RADIUS;
  const blastColor=danger?0xff596b:0xffb05b;
  for(const mesh of [grenadePreview.blastRing,grenadePreview.blastDot])mesh.material.color.setHex(blastColor);
  if(hint){
    const contact=prediction.firstImpact?(normal.y>.5?'首次落地':normal.y<-.5?'碰到頂部':'首次撞牆'):'空中起爆';
    hint.classList.toggle('danger',danger);
    hint.querySelector('b').textContent='手榴彈投擲預覽';hint.querySelector('span').textContent=touchControls?.enabled?'放開手榴彈鍵投擲 · 按取消保留':'放開 G 投擲 · 左鍵取消';
    hint.querySelector('small').textContent=`${contact} ${Math.round(Math.hypot(landing.x-origin.x,landing.z-origin.z))} M · ${(prediction.firstImpactTime??GRENADE_FUSE).toFixed(1)} 秒`;
    hint.querySelector('em').textContent=danger?'注意：預測爆點在自身爆炸範圍內':prediction.firstImpactTime!==null&&prediction.firstImpactTime<.12?'前方緊貼障礙，投出後會立即反彈':`橙色菱形：預測爆點 · 投出 ${GRENADE_FUSE} 秒後起爆`;
  }
}

function onTouchLook(dx,dy){
  if(gameState!=='playing'||portalPaused)return;
  const sensitivity=1-adsAmount*.32;
  yaw.rotation.y-=dx*.004*sensitivity;
  pitch.rotation.x=Math.max(-1.38,Math.min(1.38,pitch.rotation.x-dy*.0035*sensitivity));
}

function onTouchAction(action,pressed){
  if(action==='fire'&&!pressed){mouseDown=false;return;}
  if(action==='aim'&&!pressed){aiming=false;return;}
  if(action==='grenade-cancel'){grenadeAiming=false;updateGrenadePreview(performance.now(),true);return;}
  if(gameState!=='playing'||portalPaused)return;
  if(action==='fire'){
    if(grenadeAiming){grenadeAiming=false;updateGrenadePreview(performance.now(),true);return;}
    mouseDown=true;const now=performance.now();if(now-lastShot>92)shoot(now);
  }else if(action==='aim')aiming=pressed;
  else if(action==='jump')jump();
  else if(action==='reload')reload();
  else if(action==='ability')useAbility();
  else if(action==='pause')pauseGame();
  else if(action==='grenade-start'){
    if(grenadeCount>0){grenadeAiming=true;mouseDown=false;updateGrenadePreview(performance.now(),true);}
    else feed('手榴彈已用盡 // 尋找手榴彈補給');
  }else if(action==='grenade-throw'&&grenadeAiming)throwGrenade();
}

function onMouseMove(event) {
  if (gameState !== 'playing' || (document.pointerLockElement !== renderer.domElement&&!(freeLook&&(event.buttons&2)))) return;
  const sensitivity=1-adsAmount*.32;
  yaw.rotation.y -= event.movementX * .00185*sensitivity;
  pitch.rotation.x -= event.movementY * .00165*sensitivity;
  pitch.rotation.x = Math.max(-1.38,Math.min(1.38,pitch.rotation.x));
}

function jump() {
  if(gameState!=='playing')return;
  jumpBuffer=.13;
  if (grounded||groundGrace>0) {
    verticalVelocity = currentOperator().jumpForce;
    grounded = false;groundGrace=0;jumpBuffer=0;
    playTone(150,.06,'sine',.018);
  }
}

function isPositionBlocked(x,z) {
  if (x < -PLAYABLE_LIMIT || x > PLAYABLE_LIMIT || z < -PLAYABLE_LIMIT || z > PLAYABLE_LIMIT) return true;
  const feet=yaw.position.y-eyeHeight,head=yaw.position.y+.06;
  for (const box of collisionBoxes) {
    if(bodyOverlapsCollider(box,x,z,playerRadius,feet+.025,head))return true;
  }
  for(const enemy of enemies){const state=enemy.userData.state;if(state?.alive&&Math.hypot(enemy.position.x-x,enemy.position.z-z)<playerRadius+(state.radius??.34))return true;}
  return false;
}

function findWeaponClearance(origin,direction,boxes=collisionBoxes,maxDistance=1.85){
  let nearest=maxDistance;const delta={x:direction.x*maxDistance,y:direction.y*maxDistance,z:direction.z*maxDistance};
  for(const box of boxes){
    const hit=sweepSphereCollider(origin,delta,box,.055);if(hit)nearest=Math.min(nearest,hit.time*maxDistance);
  }
  return nearest;
}

function updateWeaponPose(dt,time,bob=0,reloadPose=0){
  camera.getWorldPosition(weaponEye);camera.getWorldDirection(weaponForward);camera.getWorldQuaternion(weaponQuaternion);
  weaponRight.set(1,0,0).applyQuaternion(weaponQuaternion);weaponUp.set(0,1,0).applyQuaternion(weaponQuaternion);
  const centerClearance=findWeaponClearance(weaponEye,weaponForward);let clearance=centerClearance;
  for(const side of [.14,.32]){weaponProbe.copy(weaponEye).addScaledVector(weaponRight,side).addScaledVector(weaponUp,-.23);clearance=Math.min(clearance,findWeaponClearance(weaponProbe,weaponForward));}
  const wallTarget=THREE.MathUtils.clamp((1.45-clearance)/.9,0,1);
  wallPoseAmount+=(wallTarget-wallPoseAmount)*(1-Math.exp(-dt*14));
  weaponObstructed=centerClearance<.64;
  ui.hud.classList.toggle('weapon-blocked',weaponObstructed);
  if(centerClearance<1.15)adsWallSuppressed=true;else if(centerClearance>1.32)adsWallSuppressed=false;
  const adsTarget=aiming&&!reloading&&!grenadeAiming&&!adsWallSuppressed?1:0;
  if(centerClearance<.8)adsAmount=Math.min(adsAmount,.4);
  adsAmount+=(adsTarget-adsAmount)*(1-Math.exp(-dt*12));
  grenadePoseAmount+=((grenadeAiming?1:0)-grenadePoseAmount)*(1-Math.exp(-dt*12));
  const highReadyTarget=clearance<.85&&!grenadeAiming?1-adsAmount:0;
  highReadyAmount+=(highReadyTarget-highReadyAmount)*(1-Math.exp(-dt*18));
  for(const arm of weapon.userData.arms||[])arm.visible=highReadyAmount<.45;
  weapon.scale.setScalar(1-highReadyAmount*.45);
  const targetFov=THREE.MathUtils.lerp(73,54,adsAmount);
  if(Math.abs(camera.fov-targetFov)>.01){camera.fov=targetFov;camera.updateProjectionMatrix();}
  ui.hud.classList.toggle('aiming',adsAmount>.55);
  ui.hud.classList.toggle('ads-ready',adsAmount>.995);
  const hipWall=wallPoseAmount*(1-adsAmount);
  weapon.position.x=THREE.MathUtils.lerp(.33,0,adsAmount)+Math.cos(time*.006)*.008*playerMoving*(1-adsAmount)+hipWall*.1-highReadyAmount*.29;
  weapon.position.y=THREE.MathUtils.lerp(-.29,-.225,adsAmount)+Math.abs(bob)*.018*(1-adsAmount)-weaponKick*.07-reloadPose*.19-hipWall*.25+highReadyAmount*.06-grenadePoseAmount*.22;
  weapon.position.z=THREE.MathUtils.lerp(-.6,-.83,adsAmount)+hipWall*.4+grenadePoseAmount*.1;
  weapon.rotation.x=THREE.MathUtils.lerp(-.03,0,adsAmount)+weaponKick*.15-hipWall*.95+highReadyAmount*2.2-grenadePoseAmount*.2;
  weapon.rotation.y=THREE.MathUtils.lerp(-.04,0,adsAmount)+hipWall*.08;
  weapon.rotation.z=bob*.012*(1-adsAmount)-reloadPose*.42;
  retractWeaponFromCover(adsAmount>.5?centerClearance:clearance,dt);
}

function updatePlayer(dt,time) {
  jumpBuffer=Math.max(0,jumpBuffer-dt);groundGrace=grounded?.1:Math.max(0,groundGrace-dt);
  if(jumpBuffer>0&&(grounded||groundGrace>0))jump();
  let mx = touchControls?.moveX||0, mz = touchControls?.moveY||0;
  if (keys.KeyW) mz -= 1;
  if (keys.KeyS) mz += 1;
  if (keys.KeyA) mx -= 1;
  if (keys.KeyD) mx += 1;
  const magnitude = Math.max(1,Math.hypot(mx,mz));
  mx /= magnitude; mz /= magnitude;
  const sprinting = (keys.ShiftLeft || keys.ShiftRight || touchControls?.sprint) && mz < 0 && !aiming&&!grenadeAiming;
  const operator=currentOperator();
  const boost=time<speedBoostUntil?1.22:1;
  const speed = (sprinting ? operator.sprintSpeed : operator.moveSpeed)*boost;
  const sin = Math.sin(yaw.rotation.y), cos = Math.cos(yaw.rotation.y);
  const dx = (mx*cos + mz*sin) * speed * dt;
  const dz = (-mx*sin + mz*cos) * speed * dt;
  const previousX=yaw.position.x,previousZ=yaw.position.z;
  // Short displacement steps keep boosted sprints from skipping thin fences.
  const moveSteps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/(playerRadius*.4)));
  const moveAxis=(x,z)=>{
    if(!isPositionBlocked(x,z)){yaw.position.x=x;yaw.position.z=z;return;}
    if(!grounded||verticalVelocity>0)return;
    const feet=yaw.position.y-eyeHeight;let stepHeight=feet;
    for(const box of collisionBoxes)if(box.max.y>feet+.025&&box.max.y<=feet+.22&&bodyOverlapsCollider(box,x,z,playerRadius,feet+.025,yaw.position.y+.06))stepHeight=Math.max(stepHeight,box.max.y);
    if(stepHeight===feet)return;
    const oldY=yaw.position.y;yaw.position.y=stepHeight+eyeHeight;
    if(!isPositionBlocked(x,z)){yaw.position.x=x;yaw.position.z=z;}else yaw.position.y=oldY;
  };
  for(let step=0;step<moveSteps;step++){
    moveAxis(yaw.position.x+dx/moveSteps,yaw.position.z);
    moveAxis(yaw.position.x,yaw.position.z+dz/moveSteps);
  }
  playerMoving = Math.min(1,Math.hypot(yaw.position.x-previousX,yaw.position.z-previousZ)/(speed*dt || 1));

  verticalVelocity -= 13.8 * dt;
  const previousY=yaw.position.y,nextY=previousY+verticalVelocity*dt;
  let support=eyeHeight,ceiling=Infinity;
  for(const box of collisionBoxes){
    if(!bodyOverlapsCollider(box,yaw.position.x,yaw.position.z,playerRadius))continue;
    if(verticalVelocity<=0&&box.max.y>0&&box.max.y<=previousY-eyeHeight+.015&&box.max.y>=nextY-eyeHeight) support=Math.max(support,box.max.y+eyeHeight);
    if(verticalVelocity>0&&box.min.y>=previousY+.055&&box.min.y<=nextY+.06) ceiling=Math.min(ceiling,box.min.y-.06);
  }
  yaw.position.y=Math.min(nextY,ceiling);grounded=false;
  if(ceiling<Infinity)verticalVelocity=0;
  if(yaw.position.y<=support){yaw.position.y=support;verticalVelocity=0;grounded=true;}

  const bob = grounded ? Math.sin(time*.012*(sprinting?1.6:1))*playerMoving : 0;
  weaponKick *= Math.pow(.00005,dt);
  let reloadPose=0;
  if(reloading){const progress=THREE.MathUtils.clamp(1-reloadRemaining/reloadDuration,0,1);reloadPose=Math.sin(progress*Math.PI);}
  updateWeaponPose(dt,time,bob,reloadPose);

  if(playerMoving>.15&&grounded&&time-lastFootstep>(sprinting?285:410)){
    playSample(Math.random()>.5?'step0':'step1',sprinting?.12:.08,.96+Math.random()*.08);
    lastFootstep=time;
  }

  if (mouseDown && time - lastShot > 92) shoot(time);
}

function worldRayTargets(){
  // Registered meshes are already the solid structure. Recursing into their
  // decorative ribs/fasteners makes every AI ray test entire instance batches.
  // Groups (fuel drums, forklift) still expose their actual component meshes.
  const cache=worldRayTargets.cache||(worldRayTargets.cache={roots:[],sizes:[],targets:[]});
  let dirty=cache.roots.length!==worldMeshes.length;
  for(let i=0;!dirty&&i<worldMeshes.length;i++)dirty=cache.roots[i]!==worldMeshes[i]||cache.sizes[i]!==worldMeshes[i].children.length;
  if(dirty){
    cache.roots=worldMeshes.slice();cache.sizes=worldMeshes.map(root=>root.children.length);cache.targets=[];
    const seen=new Set();
    for(const root of worldMeshes){
      const add=object=>{if(object.isMesh&&!seen.has(object)){seen.add(object);cache.targets.push(object);}};
      if(root.isMesh)add(root);else root.traverse(add);
    }
  }
  return cache.targets;
}

function resolveShotPath(aimNdc=new THREE.Vector2()){
  scene.updateMatrixWorld(true);
  const targets=worldRayTargets().slice();
  for(const enemy of enemies)if(enemy.userData.state.alive)enemy.traverse(object=>{if(object.isMesh&&object.userData.part)targets.push(object);});
  const sides=new Map(),previousNear=raycaster.near;
  for(const target of targets){
    const materials=Array.isArray(target.material)?target.material:[target.material];
    for(const material of materials)if(material&&!sides.has(material)){sides.set(material,material.side);material.side=THREE.DoubleSide;}
  }
  const firstHit=(origin,direction,distance)=>{
    raycaster.set(origin,direction);raycaster.near=.00001;raycaster.far=distance;
    return raycaster.intersectObjects(targets,false)[0]||null;
  };
  try{
    raycaster.setFromCamera(aimNdc,camera);const eye=raycaster.ray.origin.clone(),aimDirection=raycaster.ray.direction.clone();
    const aimHit=firstHit(eye,aimDirection,140),aimPoint=aimHit?aimHit.point.clone():eye.clone().addScaledVector(aimDirection,130);
    const origin=muzzleAnchor.getWorldPosition(new THREE.Vector3()),muzzleDirection=origin.clone().sub(eye),muzzleDistance=muzzleDirection.length();let muzzleBlocked=false;
    if(muzzleDistance>.00001){
      muzzleDirection.divideScalar(muzzleDistance);const cover=firstHit(eye,muzzleDirection,muzzleDistance);
      if(cover){origin.copy(eye).addScaledVector(muzzleDirection,Math.max(0,cover.distance-.025));muzzleBlocked=true;}
    }
    const direction=aimPoint.clone().sub(origin),distance=direction.length();
    const hit=distance>.00001?firstHit(origin,direction.divideScalar(distance),Math.min(140,distance+.02)):aimHit;
    return {origin,end:hit?hit.point.clone():aimPoint,hit,aimHit,muzzleBlocked};
  }finally{for(const [material,side] of sides)material.side=side;raycaster.near=previousNear;}
}

function shoot(time) {
  if(gameState!=='playing'||grenadeAiming)return;
  if(reloading)return;
  if (ammo <= 0) {
    lastShot=time;
    if(reserve>0)reload(true);
    else {ui.reload.classList.add('visible');playTone(90,.035,'square',.02);}
    return;
  }
  const spread=THREE.MathUtils.lerp(.007,.002,adsAmount)+playerMoving*.0025*(1-adsAmount*.65);
  const shot=resolveShotPath(new THREE.Vector2((Math.random()-.5)*spread,(Math.random()-.5)*spread));
  ammo--;
  shots++;
  lastShot = time;
  weaponKick = Math.min(.65,weaponKick+.28);
  pitch.rotation.x = Math.min(1.38,pitch.rotation.x + .008 + Math.random()*.006);
  ui.crosshair.classList.add('firing');
  setTimeout(() => ui.crosshair.classList.remove('firing'),65);
  const flash = weapon.getObjectByName('flash');
  flash.visible = true;
  flash.rotation.z = Math.random()*Math.PI;
  muzzleFlash.intensity = 7;
  setTimeout(() => { flash.visible=false; muzzleFlash.intensity=0; },35);
  playGunshot();
  updateHUD();

  if (shot.hit) {
    const hit=shot.hit;
    const barrelRoot=findBarrelRoot(hit.object);
    const enemyRoot = findEnemyRoot(hit.object);
    if(barrelRoot&&!barrelRoot.userData.exploded){
      explodeBarrel(barrelRoot);
    } else if (enemyRoot?.userData.state.alive) {
      const power=currentOperator().power;const damage = Math.round((hit.object.userData.part === 'head' ? 72 : hit.object.userData.part === 'limb' ? 24 : 35)*power);
      damageEnemy(enemyRoot,damage,hit.point,hit.object.userData.part === 'head',true);
    } else createImpact(hit.point,hit.face?.normal?.clone().transformDirection(hit.object.matrixWorld));
  }
  createTracer(shot.origin,shot.end,0xc8ff2e);
  ejectShell();
  if(gameState==='playing'&&ammo===0&&reserve>0)reload(true);
}

const effectGeometries=new Map();
function sharedEffectGeometry(name,create){
  if(!effectGeometries.has(name))effectGeometries.set(name,create());
  return effectGeometries.get(name);
}

function trimTransientList(list,limit){
  const overflow=list.length-limit;
  if(overflow>0)for(const item of list.splice(0,overflow))disposeMesh(item.mesh);
}

function ejectShell(){
  const shell=new THREE.Mesh(sharedEffectGeometry('shell',()=>new THREE.CylinderGeometry(.014,.014,.055,6)),new THREE.MeshStandardMaterial({color:0xc99b43,metalness:.85,roughness:.3,transparent:true}));
  shell.userData.sharedGeometry=true;
  shell.rotation.z=Math.PI/2;const start=weapon.localToWorld(new THREE.Vector3(.12,.04,-.08));shell.position.copy(start);scene.add(shell);
  const right=new THREE.Vector3(1,.5,.15).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).normalize();
  particles.push({mesh:shell,velocity:right.multiplyScalar(1.5+Math.random()*.7),life:.7,debris:true});
  trimTransientList(particles,[320,220,128][qualityIndex]);
}

function findBarrelRoot(object){let current=object;while(current){if(current.userData?.barrelRef)return current.userData.barrelRef;if(current.userData?.explosive)return current;current=current.parent;}return null;}

function explodeBarrel(barrel,source='barrel') {
  if(barrel.userData.exploded||gameState!=='playing')return;
  barrel.userData.exploded=true;
  const center=barrel.position.clone();if(source!=='grenade')center.y+=.7;
  barrel.visible=false;
  const colliderIndex=collisionBoxes.indexOf(barrel.userData.collisionBox);if(colliderIndex>=0)collisionBoxes.splice(colliderIndex,1);
  const worldIndex=worldMeshes.indexOf(barrel);if(worldIndex>=0)worldMeshes.splice(worldIndex,1);
  const blastDistance=center.distanceTo(yaw.position);screenShake=Math.max(screenShake,Math.max(.2,1-blastDistance/50));
  playExplosionSound(blastDistance,center);

  const fireball=new THREE.Mesh(new THREE.SphereGeometry(.6,16,12),new THREE.MeshBasicMaterial({color:0xff8a24,transparent:true,opacity:1,depthWrite:false}));
  fireball.position.copy(center);scene.add(fireball);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.45,.58,32),new THREE.MeshBasicMaterial({color:0xffd268,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));
  ring.position.copy(center);ring.lookAt(camera.getWorldPosition(new THREE.Vector3()));scene.add(ring);
  const light=new THREE.PointLight(0xff671f,18,15,2);light.position.copy(center);scene.add(light);
  explosions.push({fireball,ring,light,life:.72,max:.72});
  if(source!=='grenade'||Number.isFinite(barrel.userData.surfaceY)){
    const scorch=new THREE.Mesh(new THREE.CircleGeometry(1.55,24),new THREE.MeshBasicMaterial({color:0x080605,transparent:true,opacity:.72,depthWrite:false}));
    scorch.rotation.x=-Math.PI/2;scorch.position.set(center.x,Math.max(.032,(barrel.userData.surfaceY??0)+.015),center.z);scene.add(scorch);bulletDecals.push(scorch);
  }
  for(let i=0;i<34;i++){
    const isSmoke=i>17;
    const mesh=new THREE.Mesh(isSmoke?new THREE.SphereGeometry(.09+Math.random()*.12,6,5):new THREE.TetrahedronGeometry(.045+Math.random()*.055),new THREE.MeshBasicMaterial({color:isSmoke?0x30363a:(Math.random()>.5?0xffb12e:0xff4b20),transparent:true,opacity:1,depthWrite:false}));
    mesh.position.copy(center);scene.add(mesh);
    const direction=new THREE.Vector3(Math.random()-.5,Math.random()*.75+.2,Math.random()-.5).normalize();
    particles.push({mesh,velocity:direction.multiplyScalar(3+Math.random()*7),life:isSmoke?1.4:.55,smoke:isSmoke});
  }
  for(let i=0;i<9;i++){
    const debris=new THREE.Mesh(new THREE.BoxGeometry(.06+Math.random()*.09,.05+Math.random()*.12,.05),mat(0x421719,.7,.35));
    debris.position.copy(center);scene.add(debris);particles.push({mesh:debris,velocity:new THREE.Vector3((Math.random()-.5)*7,3+Math.random()*6,(Math.random()-.5)*7),life:1.5,debris:true});
  }

  feed(source==='grenade'?'手榴彈爆炸 // 範圍傷害':'燃料桶爆炸 // 範圍傷害');
  const radius=GRENADE_BLAST_RADIUS;
  resolvingBlast=true;
  enemies.forEach(enemy=>{if(enemy.userData.state.alive){const target=enemy.position.clone();target.y+=1;const d=target.distanceTo(center);if(d<radius&&blastReaches(center,enemy.position,enemy))damageEnemy(enemy,Math.round(135*(1-d/radius)+20),center,false,false,true);}});
  const playerDistance=center.distanceTo(new THREE.Vector3(yaw.position.x,yaw.position.y-.5,yaw.position.z));
  if(playerDistance<radius&&blastReaches(center,yaw.position))takeDamage(Math.round(70*(1-playerDistance/radius)+8),barrel.position);
  resolvingBlast=false;
  if(gameState==='playing')handleEnemyDefeated();
  pendingBlasts.push({position:barrel.position.clone(),origin:center,remaining:.13});
}

function blastReaches(origin,position,target=null){
  const end=new THREE.Vector3(position.x,position.y>1?position.y:1.2,position.z),direction=end.clone().sub(origin),distance=direction.length();
  if(distance<.05)return true;
  raycaster.set(origin,direction.normalize());raycaster.far=Math.max(0,distance-.1);
  return !raycaster.intersectObjects(worldRayTargets(),false).some(hit=>!target||(hit.object!==target&&findBarrelRoot(hit.object)!==target));
}

function findEnemyRoot(object) {
  let current = object;
  while (current) {
    if (current.userData?.enemy) return current;
    if (current.userData?.enemyRef) return current.userData.enemyRef;
    current = current.parent;
  }
  return null;
}

function damageEnemy(enemy,damage,point,headshot,countAccuracy=false,byPlayer=countAccuracy) {
  if(gameState!=='playing'||!enemy.userData.state.alive)return;
  const state = enemy.userData.state;
  const exposed=state.rank==='boss'&&state.bossRecovery>0;
  const received=state.rank==='boss'?damage*(headshot?(exposed?1.9:1.35):exposed?1.4:state.bossPhase===1?.88:1):damage;
  state.health = Math.max(0,state.health-Math.max(0,Math.round(received)));
  if(state.health>0&&state.rank==='boss'&&state.bossPhase===1&&state.health<=state.maxHealth*.5){
    state.bossPhase=2;state.speed*=1.13;state.damageMultiplier*=1.08;state.bossAttackCooldown=Math.min(state.bossAttackCooldown,3.5);
    if(state.rankMaterial){state.rankMaterial.color.setHex(0xff5366);state.rankMaterial.emissive.setHex(0x74101e);state.rankMaterial.userData.restEmissive=0x74101e;}
    state.fill.material.color.setHex(0xff5366);feed('指揮官進入狂怒階段 // 注意紅色範圍警示');playTone(150,.25,'sawtooth',.035);
  }
  if(state.health>0&&state.rank!=='boss'&&state.health/state.maxHealth<.58&&state.coverCooldown<=0)seekBotCover(enemy);
  if(byPlayer&&state.health>0){
    state.lastKnown.set(yaw.position.x,0,yaw.position.z);
    // Hits from outside line of sight are new information, just like losing
    // sight of a player: allow time to investigate before returning to patrol.
    if(state.state!=='ENGAGE'){state.state='SEARCH';state.searchTime=12;}
  }
  if(countAccuracy)hits++;
  state.hitTime=.11;
  state.fill.scale.x = Math.max(0,state.health/state.maxHealth);
  state.fill.position.x = -(1-state.fill.scale.x)*.4;
  showHitmarker(state.health <= 0);
  createImpact(point,null,headshot?0xffd36a:0xff3e53);
  if(state.rank==='boss')updateBossHUD();
  if (state.health <= 0) killEnemy(enemy,headshot,byPlayer);
}

function killEnemy(enemy,headshot,byPlayer=true) {
  const state = enemy.userData.state;
  if (!state.alive) return;
  state.alive = false;
  let reward='';
  if(byPlayer){
    kills++;
    const now=performance.now();killStreak=lastKillAt&&now-lastKillAt<=15000?killStreak+1:1;lastKillAt=now;
    if(killStreak%3===0){health=Math.min(maxHealth,health+12);armor=Math.min(maxArmor,armor+10);reserve=Math.min(reserveCapacity(),reserve+15);reward=' // 連殺補給：生命 +12、護甲 +10、備彈 +15';}
  }
  defeatedEnemies++;
  if(state.rank==='boss')updateBossHUD();
  if(byPlayer)showKillFeedback(state.name,headshot);
  enemy.traverse(obj => { if (obj.isMesh) obj.material.transparent=true; });
  feed(byPlayer?`${headshot?'爆頭擊殺':'敵人已淘汰'} // ${state.name}${reward}`:`${state.name} 已被淘汰`);
  playTone(headshot?880:660,.12,'triangle',.05);
  updateHUD();
  const start = performance.now();
  const fall = () => {
    const p = Math.min(1,(performance.now()-start)/650);
    enemy.rotation.z = p*1.38;
    enemy.position.y = -p*.7;
    enemy.traverse(obj => { if (obj.isMesh && obj.material.transparent) obj.material.opacity=1-p*.72; });
    if (p<1) requestAnimationFrame(fall); else enemy.visible=false;
  };
  fall();
  if(!resolvingBlast)handleEnemyDefeated();
}

function showKillFeedback(name,headshot){
  const notice=ui.killNotice;
  notice.querySelector('strong').textContent=headshot?'爆頭擊殺':killStreak>=2?`${killStreak} 連殺`:'擊殺確認';
  notice.querySelector('small').textContent=headshot?'HEADSHOT // PRECISION ELIMINATION':'HOSTILE DOWN // TARGET ELIMINATED';
  notice.querySelector('p').textContent=`${name}  ·  已擊殺 ${kills}  /  剩餘 ${Math.max(0,matchTotalEnemies-defeatedEnemies)}`;
  notice.classList.remove('visible','headshot');void notice.offsetWidth;
  if(headshot)notice.classList.add('headshot');notice.classList.add('visible');
  ui.hud.classList.add('kill-confirmed');
  clearTimeout(showKillFeedback.timer);showKillFeedback.timer=setTimeout(()=>{notice.classList.remove('visible');ui.hud.classList.remove('kill-confirmed');},2200);
  const entry=document.createElement('div'),label=document.createElement('b'),target=document.createElement('span');
  label.textContent=headshot?'◎ 爆頭':'✕ 擊殺';target.textContent=name;entry.appendChild(label);entry.appendChild(target);
  entry.classList.toggle('headshot',headshot);ui.killFeed.appendChild(entry);
  while(ui.killFeed.children.length>3)ui.killFeed.children[0].remove();
  setTimeout(()=>entry.remove(),5200);
  screenShake=Math.max(screenShake,.1);
}

function clearBossAttacks(){
  for(const attack of bossAttacks)disposeMesh(attack.group);
  bossAttacks.length=0;ui.bossWarning.classList.add('hidden');ui.hud.classList.remove('strike-warning');
}

function bossGroundY(point){
  let surface=0;
  const ceiling=Math.max(.05,(point.y??eyeHeight)-eyeHeight+.15);
  for(const box of collisionBoxes){
    if(bodyOverlapsCollider(box,point.x,point.z,.001)&&box.max.y<=ceiling)surface=Math.max(surface,box.max.y);
  }
  return surface+.045;
}

function createBossZone(position,radius,duration,color,mode='strike',safeAngle=0){
  const group=new THREE.Group();group.position.copy(position);
  const safeHalf=.65,thetaStart=mode==='shockwave'?-safeAngle+safeHalf:0,thetaLength=mode==='shockwave'?Math.PI*2-safeHalf*2:Math.PI*2;
  const fill=new THREE.Mesh(new THREE.CircleGeometry(radius,64,thetaStart,thetaLength),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));fill.rotation.x=-Math.PI/2;group.add(fill);
  const ring=new THREE.Mesh(new THREE.RingGeometry(radius-.065,radius,64,1,thetaStart,thetaLength),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.005;group.add(ring);
  const sweep=new THREE.Mesh(new THREE.RingGeometry(radius-.14,radius-.075,64,1,thetaStart,thetaLength),new THREE.MeshBasicMaterial({color:0xffe9bc,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));sweep.rotation.x=-Math.PI/2;sweep.position.y=.012;sweep.scale.setScalar(.08);group.add(sweep);
  const beacon=new THREE.Mesh(new THREE.OctahedronGeometry(.12),new THREE.MeshBasicMaterial({color}));beacon.position.y=.3;group.add(beacon);
  if(mode==='shockwave'){
    const safe=new THREE.Mesh(new THREE.CircleGeometry(radius,20,-safeAngle-safeHalf,safeHalf*2),new THREE.MeshBasicMaterial({color:0x62f6ee,transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));safe.rotation.x=-Math.PI/2;safe.position.y=.008;group.add(safe);
    const safeEdge=new THREE.Mesh(new THREE.RingGeometry(radius-.10,radius,20,1,-safeAngle-safeHalf,safeHalf*2),new THREE.MeshBasicMaterial({color:0x62f6ee,transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false}));safeEdge.rotation.x=-Math.PI/2;safeEdge.position.y=.012;group.add(safeEdge);
  }
  return {position,radius,duration,remaining:duration,mode,safeAngle,safeHalf,group,fill,ring,sweep,beacon,detonated:false,complete:false,after:0,waveTime:0,hitPlayer:false};
}

function queueBossAttack(enemy,target,patternOverride){
  const state=enemy?.userData.state;
  if(gameState!=='playing'||!state?.alive||state.rank!=='boss'||state.bossRecovery>0||!target||!Number.isFinite(target.x)||!Number.isFinite(target.z)||bossAttacks.some(attack=>attack.owner===enemy&&!attack.detonated))return false;
  const phase=state.bossPhase||1,castIndex=state.bossCastIndex||0,distance=Math.hypot(target.x-enemy.position.x,target.z-enemy.position.z);
  const requested=['precision','barrage','shockwave'].includes(patternOverride)?patternOverride:['precision','barrage','shockwave'][castIndex%3];
  const pattern=requested==='shockwave'&&distance>16?'barrage':requested;
  const duration=pattern==='precision'?(phase===2?1.15:1.4):pattern==='barrage'?(phase===2?1.35:1.55):(phase===2?1.4:1.55);
  const radius=pattern==='precision'?(phase===2?3.4:2.8):pattern==='barrage'?(phase===2?2.6:2.4):Math.min(14,Math.max(8,distance+2));
  const position=new THREE.Vector3(target.x,bossGroundY(target),target.z),group=new THREE.Group(),markers=[];
  const color=phase===2?0xff435d:0xff974d;
  if(pattern==='shockwave'){
    position.copy(enemy.position);position.y=bossGroundY({x:position.x,y:eyeHeight,z:position.z});
    const targetAngle=Math.atan2(target.z-position.z,target.x-position.x),safeAngle=targetAngle+Math.PI/2;
    markers.push(createBossZone(position.clone(),radius,duration,color,'shockwave',safeAngle));
  }else{
    const count=pattern==='barrage'?(phase===2?3:2):1;
    const length=distance||1,sideX=(target.z-enemy.position.z)/length,sideZ=-(target.x-enemy.position.x)/length;
    for(let index=0;index<count;index++){
      const side=index===0?0:index===1?1:-1,point=position.clone().add(new THREE.Vector3(sideX,0,sideZ).multiplyScalar(side*(radius*2+.45)));
      point.y=bossGroundY({x:point.x,y:target.y,z:point.z});markers.push(createBossZone(point,radius,duration+index*.5,color));
    }
  }
  group.name='boss-attack';for(const marker of markers)group.add(marker.group);
  const name=pattern==='precision'?'精準轟擊':pattern==='barrage'?'連段轟擊':'扇形震波',first=markers[0];
  const totalDuration=markers.at(-1).duration+(pattern==='shockwave'?.65:0);
  scene.add(group);bossAttacks.push({owner:enemy,position,radius,duration,remaining:duration,phase,pattern,name,group,markers,fill:first.fill,ring:first.ring,sweep:first.sweep,beacon:first.beacon,detonated:false,recoveryStarted:false});
  state.bossCastIndex=castIndex+1;state.bossPatternName=name;state.specialWindup=Math.max(state.specialWindup,totalDuration+.05);state.shotCooldown=Math.max(state.shotCooldown,totalDuration+.2);state.burstShots=0;
  ui.bossWarning.textContent=pattern==='shockwave'?'扇形震波 · 跳躍越過或移向青色缺口':`${name} · 離開標記區域`;
  ui.bossWarning.classList.remove('hidden');ui.hud.classList.add('strike-warning');
  playTone(180,.14,'triangle',.045);return true;
}

function applyBossZoneDamage(attack,zone,origin,amount){
  if(zone.hitPlayer)return;
  const body=new THREE.Vector3(yaw.position.x,yaw.position.y-.5,yaw.position.z);
  if(body.distanceTo(origin)>=zone.radius||!blastReaches(origin,yaw.position))return;
  zone.hitPlayer=true;takeDamage(Math.round(amount*currentDifficulty().damage*getEnemyTuning().damage*(attack.owner.userData.state.bossPower??1)),origin);
}

function createBossBurst(origin,phase){
  const count=[12,8,5][qualityIndex],geometry=sharedEffectGeometry('boss-spark',()=>new THREE.OctahedronGeometry(.055));
  for(let i=0;i<count;i++){
    const angle=i*Math.PI*2/count,speed=2.2+(i%3)*.5;
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:phase===2?0xff637b:0xffc071,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    mesh.position.copy(origin);mesh.userData.sharedGeometry=true;scene.add(mesh);
    particles.push({mesh,velocity:new THREE.Vector3(Math.cos(angle)*speed,1.1+(i%3)*.35,Math.sin(angle)*speed),life:.38});
  }
  trimTransientList(particles,[320,220,128][qualityIndex]);
}

function updateBossAttacks(dt,time){
  if(gameState!=='playing')return;
  for(let i=bossAttacks.length-1;i>=0;i--){
    const attack=bossAttacks[i];
    if(!attack.owner.userData.state.alive){disposeMesh(attack.group);bossAttacks.splice(i,1);continue;}
    for(const zone of attack.markers){
      if(zone.complete){
        zone.after-=dt;zone.group.scale.addScalar(dt*1.3);zone.fill.material.opacity=Math.max(0,zone.after);zone.ring.material.opacity=Math.max(0,zone.after*2);zone.sweep.visible=false;zone.beacon.visible=false;
        if(zone.after<=0)zone.group.visible=false;continue;
      }
      const before=zone.remaining;zone.remaining=Math.max(0,zone.remaining-dt);
      zone.beacon.rotation.y+=dt*3;
      if(!zone.detonated){
        zone.sweep.scale.setScalar(Math.max(.08,1-zone.remaining/zone.duration));zone.fill.material.opacity=.09+(1+Math.sin(time*.025))*.045;
        if(zone.remaining>0)continue;
        zone.detonated=true;zone.fill.material.opacity=.28;
        const origin=zone.position.clone();origin.y+=.405;createImpact(origin,null,0xffab67);createBossBurst(origin,attack.phase);playSample('explosion',attack.pattern==='barrage'?.14:.20,.95,0,spatialPan(origin));
        if(zone.mode!=='shockwave'){
          applyBossZoneDamage(attack,zone,origin,attack.pattern==='barrage'?(attack.phase===2?29:23):(attack.phase===2?42:32));
          zone.complete=true;zone.after=.28;
        }
        if(gameState!=='playing')return;
        const distance=origin.distanceTo(yaw.position);if(distance<12)screenShake=Math.max(screenShake,.18*(1-distance/12));
      }
      if(zone.mode==='shockwave'&&!zone.complete){
        const activeDt=Math.max(0,dt-Math.max(0,before)),previousRadius=.65+(zone.radius-.65)*Math.min(1,zone.waveTime/.65);
        zone.waveTime+=zone.waveTime>0?dt:activeDt;
        const waveRadius=.65+(zone.radius-.65)*Math.min(1,zone.waveTime/.65);
        zone.sweep.scale.setScalar(waveRadius/zone.radius);zone.fill.material.opacity=.035;zone.ring.material.opacity=.3;zone.beacon.visible=false;
        const dx=yaw.position.x-zone.position.x,dz=yaw.position.z-zone.position.z,distance=Math.hypot(dx,dz),angle=Math.atan2(dz,dx);
        const safe=Math.abs(Math.atan2(Math.sin(angle-zone.safeAngle),Math.cos(angle-zone.safeAngle)))<=zone.safeHalf;
        const jumping=yaw.position.y-eyeHeight>zone.position.y+.65;
        if(!safe&&!jumping&&distance>=previousRadius-.6&&distance<=waveRadius+.6){
          const origin=zone.position.clone();origin.y+=.405;applyBossZoneDamage(attack,zone,origin,attack.phase===2?38:30);
          if(gameState!=='playing')return;
        }
        if(zone.waveTime>=.65){zone.complete=true;zone.after=.18;}
      }
    }
    attack.remaining=attack.markers[0].remaining;
    attack.detonated=attack.markers.every(zone=>zone.complete);
    if(attack.detonated&&!attack.recoveryStarted){
      attack.recoveryStarted=true;const state=attack.owner.userData.state;state.bossRecovery=attack.phase===2?1.7:1.9;state.specialWindup=0;state.shotCooldown=Math.max(state.shotCooldown,state.bossRecovery+.2);state.burstShots=0;playTone(720,.12,'triangle',.035);updateBossHUD();
    }
    if(attack.markers.every(zone=>zone.complete&&zone.after<=0)){disposeMesh(attack.group);bossAttacks.splice(i,1);}
  }
  const imminent=bossAttacks.find(attack=>!attack.detonated);
  ui.bossWarning.classList.toggle('hidden',!imminent);ui.hud.classList.toggle('strike-warning',!!imminent);
  if(imminent){
    const zone=imminent.markers.find(marker=>!marker.complete),index=imminent.markers.indexOf(zone)+1;
    ui.bossWarning.textContent=zone.mode==='shockwave'?`${zone.detonated?'震波擴散中':'扇形震波將至'} · 跳躍越過或移向青色缺口`:`${imminent.name}${imminent.markers.length>1?` ${index}/${imminent.markers.length}`:''} · ${zone.remaining.toFixed(1)} 秒 · 離開標記區域`;
  }
}

function updateBossHUD(){
  const boss=enemies.find(enemy=>enemy.userData.state.alive&&enemy.userData.state.rank==='boss');
  const visible=gameState!=='lobby'&&gameState!=='ended'&&(!!boss||bossPending);
  ui.boss.classList.toggle('hidden',!visible);ui.hud.classList.toggle('boss-active',visible);
  if(!visible)return;
  ui.boss.classList.toggle('waiting',!boss);ui.boss.classList.toggle('exposed',!!boss&&boss.userData.state.bossRecovery>0);
  if(boss){
    const state=boss.userData.state;ui.bossName.textContent=state.name;
    ui.bossPhase.textContent=state.bossRecovery>0?`CORE EXPOSED // 弱點開放 ${state.bossRecovery.toFixed(1)} 秒`:state.specialWindup>0&&state.bossPatternName?`${state.bossPhase===2?'PHASE 02':'PHASE 01'} // ${state.bossPatternName}`:state.bossPhase===2?'PHASE 02 // 狂暴壓制':'PHASE 01 // 裝甲指揮官';
    ui.bossHealth.textContent=`${Math.max(0,Math.ceil(state.health))} / ${state.maxHealth}`;ui.bossFill.style.width=`${Math.max(0,state.health/state.maxHealth)*100}%`;ui.boss.classList.toggle('enraged',state.bossPhase===2);
  }else{
    ui.bossName.textContent=commanderName();ui.bossPhase.textContent=bossArrivalQueued?`INBOUND // ${Math.ceil(bossArrivalRemaining)} 秒後進場`:'LOCKED // 先突破護衛';
    ui.bossHealth.textContent=bossArrivalQueued?'補給整備中':`護衛 ${enemies.filter(enemy=>enemy.userData.state.alive).length}`;ui.bossFill.style.width='100%';ui.boss.classList.remove('enraged');
  }
}

function handleEnemyDefeated(){
  if(gameState!=='playing')return;
  const mode=currentMode();
  if(mode.killTarget&&kills>=mode.killTarget){endGame(true);return;}
  if(enemies.some(target=>target.userData.state.alive)||wavePending)return;
  if(mode.waves&&currentWave<mode.waves.length-1){
    wavePending=true;
    const nextWave=currentWave+2;updateHUD();feed(`區域暫時安全 // 第 ${nextWave} 波即將抵達`);ui.missionPhase.textContent=`INCOMING // WAVE ${String(nextWave).padStart(2,'0')}`;
    waveRemaining=2.4;
  }else if(bossPending){
    if(!bossArrivalQueued){bossArrivalQueued=true;bossArrivalRemaining=3.2;updateHUD();updateBossHUD();feed('護衛已清除 // 指揮官即將進場 · 戰術補給準備中');}
  }else endGame(true);
}

function reload(automatic=false) {
  if (reloading || ammo === 30 || reserve <= 0 || gameState !== 'playing') return;
  reloading = true;
  reloadStarted=performance.now();
  if(!automatic)mouseDown = false;
  feed(automatic?'彈匣打空 // 自動重新裝填':'更換彈匣...');
  reloadDuration=currentOperator().reloadMs/1000;reloadRemaining=reloadDuration;reloadSoundStage=1;
  playReloadSound('release');
  updateHUD();
}

function updateCombatTimers(dt,time){
  abilityCooldown=Math.max(0,abilityCooldown-dt);
  if(reloading){
    reloadRemaining=Math.max(0,reloadRemaining-dt);
    const progress=1-reloadRemaining/reloadDuration;
    if(reloadSoundStage<2&&progress>=.55){playReloadSound('insert');reloadSoundStage=2;}
    if(reloadSoundStage<3&&progress>=.82){playReloadSound('bolt');reloadSoundStage=3;}
    if(reloadRemaining<=0){
      const loaded=Math.min(30-ammo,reserve);ammo+=loaded;reserve-=loaded;reloading=false;updateHUD();
    }
  }
  if(wavePending&&(waveRemaining-=dt)<=0){
    currentWave++;wavePending=false;reserve=Math.min(reserveCapacity(),reserve+45);armor=Math.min(maxArmor,armor+Math.max(12,Math.round(maxArmor*.25)));grenadeCount=Math.min(grenadeCapacity(),grenadeCount+1);
    spawnMissionWave(currentWave);updateHUD();updateMissionStatus(time,true);feed(`第 ${currentWave+1} 波接敵 // 補給已送達`);playTone(180,.22,'sawtooth',.045);if(ammo===0)reload(true);
  }
  if(bossArrivalQueued&&(bossArrivalRemaining=Math.max(0,bossArrivalRemaining-dt))<=0){
    bossArrivalQueued=false;bossPending=false;
    health=Math.min(maxHealth,health+Math.ceil(maxHealth*.35));armor=Math.min(maxArmor,armor+25);reserve=Math.min(reserveCapacity(),reserve+75);grenadeCount=Math.min(grenadeCapacity(),grenadeCount+1);
    spawnEnemies(1,{boss:true,eliteRate:0,wave:currentWave});updateHUD();updateBossHUD();feed('指揮官進場 // 生命、護甲與彈藥補給已送達');playTone(95,.28,'sawtooth',.035);if(ammo===0)reload(true);
  }
  for(let i=pendingBlasts.length-1;i>=0;i--){const blast=pendingBlasts[i];blast.remaining-=dt;if(blast.remaining<=0){pendingBlasts.splice(i,1);explosiveBarrels.forEach(other=>{if(!other.userData.exploded&&other.position.distanceTo(blast.position)<5.8&&blastReaches(blast.origin,other.position,other))explodeBarrel(other);});}}
}

function updateEnemies(dt,time) {
  const difficulty=currentDifficulty(),tuning=getEnemyTuning();
  camera.getWorldPosition(tempCameraWorld);
  let nearestThreat=Infinity,patrolPicks=0;
  let flashLightIndex=0;enemyFlashLights.forEach(light=>light.intensity=0);
  for (const enemy of enemies) {
    if(gameState!=='playing')break;
    const s = enemy.userData.state;
    if (!s.alive) continue;
    const boss=s.rank==='boss',elite=s.rank==='elite';
    const toPlayer = tempVec.set(yaw.position.x-enemy.position.x,0,yaw.position.z-enemy.position.z);
    const distance = toPlayer.length();
    toPlayer.normalize();
    s.barGroup.lookAt(tempCameraWorld);s.nameplate.lookAt(tempCameraWorld);
    s.nameplate.userData.setHealth(s.health,s.maxHealth);
    s.shotCooldown -= dt;
    s.bossAttackCooldown=Math.max(0,s.bossAttackCooldown-dt);s.specialWindup=Math.max(0,s.specialWindup-dt);s.bossRecovery=Math.max(0,(s.bossRecovery||0)-dt);
    s.decisionTimer -= dt;
    s.coverCooldown=Math.max(0,s.coverCooldown-dt);s.coverTime=Math.max(0,s.coverTime-dt);
    s.hitTime=Math.max(0,s.hitTime-dt);s.recoil=Math.max(0,s.recoil-dt*2.8);
    s.enemyFlash.visible=s.recoil>.09;s.gun.position.z=.5-s.recoil*.28;
    if(s.enemyFlash.visible&&distance<40&&flashLightIndex<enemyFlashLights.length){const light=enemyFlashLights[flashLightIndex++];s.muzzle.getWorldPosition(light.position);light.intensity=5;}
    s.hitMaterials.forEach(material=>material.emissive.setHex(s.hitTime>0?0x571419:(material.userData.restEmissive??0)));
    if(boss&&s.rankMaterial){s.rankMaterial.color.setHex(s.bossRecovery>0?0x75f5ee:s.bossPhase===2?0xff5366:0xff9e42);if(s.bossRecovery>0&&s.hitTime<=0)s.rankMaterial.emissive.setHex(0x1b8e94);}
    if (s.decisionTimer <= 0) {
      s.decisionTimer = .85+Math.random()*1.35;
      s.strafe *= Math.random()>.35?1:-1;
    }
    const detection=difficulty.detection+(boss?8:elite?3:0);
    s.losTimer-=dt;
    if(s.losTimer<=0){s.cachedCanSee=distance<detection&&hasLineOfSight(enemy.position,yaw.position);s.losTimer=.12+Math.random()*.1;}
    const canSee = distance < detection && s.cachedCanSee;
    s.barGroup.visible=s.nameplate.visible=(canSee&&distance<(boss?38:23))||s.hitTime>0;
    let moveX=0, moveZ=0;
    if (canSee) {
      nearestThreat=Math.min(nearestThreat,distance);s.lastKnown.set(yaw.position.x,0,yaw.position.z);
      if(s.state!=='ENGAGE'){s.reaction-=dt;if(s.reaction<=0)s.state='ENGAGE';}
      if(boss&&s.state==='ENGAGE'&&s.bossRecovery<=0&&s.bossAttackCooldown<=0&&distance<32&&hasLineOfSight(enemy.position,yaw.position)){
        if(queueBossAttack(enemy,yaw.position.clone())!==false){s.specialWindup=Math.max(s.specialWindup,s.bossPhase===2?1.2:1.45);s.shotCooldown=Math.max(s.shotCooldown,s.specialWindup+.2);s.bossAttackCooldown=s.bossPhase===2?7.2:8.5;}
        else s.bossAttackCooldown=1;
      }
      if(s.coverTime>0){const dx=s.coverTarget.x-enemy.position.x,dz=s.coverTarget.z-enemy.position.z,dist=Math.hypot(dx,dz);if(dist>.6){moveX=dx/dist;moveZ=dz/dist;}else{s.coverTime=0;s.shotCooldown=Math.max(s.shotCooldown,.5);}}
      else{
        const idealRange=boss?12:s.role==='marksman'?20:s.role==='flanker'?10:13;
        if(distance>idealRange){moveX+=toPlayer.x*.9;moveZ+=toPlayer.z*.9;}
        if(distance<(boss?7:s.role==='marksman'?13:7)||(!boss&&s.health/s.maxHealth<.28)){moveX-=toPlayer.x*1.2;moveZ-=toPlayer.z*1.2;}
        const strafe=(boss?.35:s.role==='flanker'?1.15:.85)*(distance<18?1:.5);
        moveX+=toPlayer.z*s.strafe*strafe;moveZ-=toPlayer.x*s.strafe*strafe;
      }
      if(s.state==='ENGAGE'&&s.specialWindup<=0&&(!boss||s.bossRecovery<=0)&&s.shotCooldown<=0&&distance<(s.role==='marksman'?34:29)){
        enemyShoot(enemy,distance);
        if(!s.burstShots)s.burstShots=boss?4:elite?3:s.role==='marksman'?2:2+Math.floor(Math.random()*3);
        s.burstShots--;
        const interval=s.burstShots>0?.24+Math.random()*.12:1.15+Math.random()*.8;
        s.shotCooldown=interval*difficulty.fireInterval*tuning.fireInterval*(boss&&s.bossPhase===2?.88:1);
      }
    } else {
      s.reaction=Math.min(s.baseReaction*difficulty.reaction*tuning.reaction,s.reaction+dt*.35);
      if(s.state==='ENGAGE'){s.state='SEARCH';s.searchTime=12;s.burstShots=0;}
      if(s.state==='SEARCH'&&(s.searchTime-=dt)<=0){s.state='PATROL';s.patrolTimer=0;s.coverTime=0;}
      if(s.coverTime>0){
        const dx=s.coverTarget.x-enemy.position.x,dz=s.coverTarget.z-enemy.position.z,dist=Math.hypot(dx,dz);
        if(dist>.6){moveX=dx/dist;moveZ=dz/dist;}else{moveX=0;moveZ=0;}
      }else if(s.state==='SEARCH'){
        const dx=s.lastKnown.x-enemy.position.x,dz=s.lastKnown.z-enemy.position.z,dist=Math.hypot(dx,dz);
        if(dist>.8){moveX=dx/dist;moveZ=dz/dist;}else{s.state='PATROL';s.patrolTimer=0;}
      }else{
        s.patrolTimer-=dt;
        const dx=s.target.x-enemy.position.x,dz=s.target.z-enemy.position.z,dist=Math.hypot(dx,dz);
        // Spread waypoint searches across frames instead of making every bot
        // sample the map on the same frame after spawning.
        if(s.patrolTimer<=0||(dist<1&&!s.patrolWaiting)){if(patrolPicks<1){pickPatrolPoint(enemy);patrolPicks++;}}
        else if(dist>=1){moveX=dx/dist;moveZ=dz/dist;}
      }
    }
    if(s.specialWindup>0||(boss&&s.bossRecovery>0)){moveX=0;moveZ=0;}
    const len=Math.hypot(moveX,moveZ);
    const facing=canSee?Math.atan2(toPlayer.x,toPlayer.z):len>.02?Math.atan2(moveX,moveZ):enemy.rotation.y;
    enemy.rotation.y=lerpAngle(enemy.rotation.y,facing,Math.min(1,dt*5.5));
    if(len>.02)moveBot(enemy,moveX/len,moveZ/len,dt);
    const stride=Math.sin(time*.009*s.speed+s.stridePhase)*.24*Math.min(1,len);
    s.leftLeg.rotation.x=stride; s.rightLeg.rotation.x=-stride;
    s.leftArm.rotation.x=-.78-stride*.18-s.recoil*.4;s.rightArm.rotation.x=-.78+stride*.18-s.recoil*.4;
  }
  ui.combatBanner.classList.toggle('active',nearestThreat<30);
  if(nearestThreat<30)ui.threatDistance.textContent=`${Math.round(nearestThreat)} M`;
}

function seekBotCover(enemy){
  const s=enemy.userData.state;s.coverCooldown=8+Math.random()*4;
  let best=null,bestDistance=Infinity;
  for(const box of collisionBoxes){
    if(box.max.y<1.25||box.min.y>1.5)continue;
    const cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
    if(Math.hypot(cx-enemy.position.x,cz-enemy.position.z)>11)continue;
    const vx=cx-yaw.position.x,vz=cz-yaw.position.z,length=Math.hypot(vx,vz)||1;
    const x=cx+vx/length*((box.max.x-box.min.x)/2+.85),z=cz+vz/length*((box.max.z-box.min.z)/2+.85);
    const distance=Math.hypot(x-enemy.position.x,z-enemy.position.z);
    if(distance<bestDistance&&!isBotBlocked(x,z,enemy)&&!hasLineOfSight({x,z},yaw.position)){best={x,z};bestDistance=distance;}
  }
  if(best){s.coverTarget.set(best.x,0,best.z);s.coverTime=3.5;s.strafe*=-1;}
}

function lerpAngle(from,to,t){let delta=(to-from+Math.PI)%(Math.PI*2)-Math.PI;if(delta<-Math.PI)delta+=Math.PI*2;return from+delta*t;}

function pickPatrolPoint(enemy){
  const s=enemy.userData.state;
  // Nearby reachable destinations avoid sending idle patrols through whole buildings.
  for(let attempt=0;attempt<3;attempt++){
    const angle=Math.random()*Math.PI*2,distance=4+Math.random()*12;
    const x=enemy.position.x+Math.cos(angle)*distance,z=enemy.position.z+Math.sin(angle)*distance;
    let clear=true;const steps=Math.ceil(distance/.6);
    for(let i=1;i<=steps;i++){const t=i/steps;if(isBotBlocked(enemy.position.x+(x-enemy.position.x)*t,enemy.position.z+(z-enemy.position.z)*t,enemy)){clear=false;break;}}
    if(clear){s.target.set(x,0,z);s.patrolTimer=3+Math.random()*5;s.patrolWaiting=false;return;}
  }
  s.target.copy(enemy.position);s.patrolTimer=.7+Math.random()*.5;s.patrolWaiting=true;
}

function moveBot(enemy,dx,dz,dt){
  const s=enemy.userData.state,distance=s.speed*dt,steps=Math.max(1,Math.ceil(distance/((s.radius??.34)*.45))),step=distance/steps;
  s.avoidTime=Math.max(0,(s.avoidTime||0)-dt);
  s.progressTime=(s.progressTime||0)+dt;
  if(s.progressTime>=1.8){
    // A series of tiny moves into a corner can still be a deadlock; alternate
    // the preferred side rather than repeating the same back-and-forth route.
    if(Math.hypot(enemy.position.x-s.progressX,enemy.position.z-s.progressZ)<.55){s.avoidSide=-(s.avoidSide||1);s.avoidX=-dz*s.avoidSide;s.avoidZ=dx*s.avoidSide;s.avoidTime=1.5;s.coverTime=0;}
    s.progressX=enemy.position.x;s.progressZ=enemy.position.z;s.progressTime=0;
  }
  for(let index=0;index<steps;index++){
    let moved=false;const side=s.avoidSide||1,avoiding=s.avoidTime>0;
    // Keep a world-space tangent while rounding a wall. Recomputing it from
    // the target every frame pulls the bot back into the same corner.
    const bx=avoiding?s.avoidX:dx,bz=avoiding?s.avoidZ:dz;
    const options=[0,side*.62,-side*.62,side*1.2,-side*1.2,side*Math.PI/2,-side*Math.PI/2,Math.PI];
    for(const angle of options){const cos=Math.cos(angle),sin=Math.sin(angle),mx=bx*cos-bz*sin,mz=bx*sin+bz*cos;const nx=enemy.position.x+mx*step,nz=enemy.position.z+mz*step;if(!isBotBlocked(nx,nz,enemy)){if(angle!==0&&!avoiding){const worldObstacle=isBotWorldBlocked(enemy.position.x+dx*step,enemy.position.z+dz*step,enemy);s.avoidSide=worldObstacle?(angle===Math.PI?-side:Math.sign(angle)):1;s.avoidX=-dz*s.avoidSide;s.avoidZ=dx*s.avoidSide;s.avoidTime=worldObstacle?5:.45;}enemy.position.x=nx;enemy.position.z=nz;moved=true;break;}}
    if(!moved){s.avoidSide=-side;s.avoidX=-dz*s.avoidSide;s.avoidZ=dx*s.avoidSide;s.avoidTime=1.5;s.strafe*=-1;s.patrolTimer=0;break;}
  }
}

function isBotWorldBlocked(x,z,self) {
  const radius=self?.userData?.state?.radius??.34;
  if (x<-PLAYABLE_LIMIT||x>PLAYABLE_LIMIT||z<-PLAYABLE_LIMIT||z>PLAYABLE_LIMIT) return true;
  for(const box of collisionBoxes)if(bodyOverlapsCollider(box,x,z,radius,.22,1.85))return true;
  return false;
}

function isBotBlocked(x,z,self) {
  const radius=self?.userData?.state?.radius??.34;
  if(isBotWorldBlocked(x,z,self))return true;
  for(const e of enemies) if(e!==self&&e.userData.state.alive&&Math.hypot(e.position.x-x,e.position.z-z)<radius+(e.userData.state.radius??.34)+.04)return true;
  if(yaw&&Math.hypot(yaw.position.x-x,yaw.position.z-z)<radius+playerRadius)return true;
  return false;
}

function hasLineOfSight(from,to) {
  const origin=new THREE.Vector3(from.x,1.5,from.z);
  const target=new THREE.Vector3(to.x,to.y,to.z);
  const direction=target.clone().sub(origin);
  const distance=direction.length();
  raycaster.set(origin,direction.normalize()); raycaster.far=distance;
  return raycaster.intersectObjects(worldRayTargets(),false).length===0;
}

function enemyShoot(enemy,distance) {
  const difficulty=currentDifficulty(),tuning=getEnemyTuning();
  const s=enemy.userData.state;const origin=s.muzzle.getWorldPosition(new THREE.Vector3());
  const playerCenter=new THREE.Vector3(yaw.position.x,yaw.position.y-.62,yaw.position.z);
  const target=playerCenter.clone();const spread=(.028+distance*.0016)*difficulty.spread*tuning.spread*s.spreadMultiplier;
  target.x+=(Math.random()-.5)*distance*spread;target.y+=(Math.random()-.5)*distance*spread*.62;target.z+=(Math.random()-.5)*distance*spread;
  const targets=worldRayTargets(),sides=new Map(),previousNear=raycaster.near,previousFar=raycaster.far;
  for(const mesh of targets)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material&&!sides.has(material)){sides.set(material,material.side);material.side=THREE.DoubleSide;}
  let obstacle,direction,along,miss;
  try{
    // Cached perception can remain clear for a few frames while the actor moves
    // behind cover. A protruding muzzle must not start its shot beyond the wall.
    const eye=enemy.localToWorld(new THREE.Vector3(0,1.5,0)),toMuzzle=origin.clone().sub(eye),length=toMuzzle.length();
    raycaster.near=.00001;
    if(length>.00001){
      raycaster.set(eye,toMuzzle.divideScalar(length));raycaster.far=length;
      const cover=raycaster.intersectObjects(targets,false)[0];
      if(cover)origin.copy(eye).addScaledVector(toMuzzle,Math.max(0,cover.distance-.025));
    }
    direction=target.clone().sub(origin).normalize();raycaster.set(origin,direction);raycaster.far=45;
    obstacle=raycaster.intersectObjects(targets,false)[0];
    const closest=raycaster.ray.closestPointToPoint(playerCenter,new THREE.Vector3());along=closest.distanceTo(origin);miss=closest.distanceTo(playerCenter);
  }finally{for(const [material,side] of sides)material.side=side;raycaster.near=previousNear;raycaster.far=previousFar;}
  const blockedDistance=obstacle?.distance??Infinity;const end=origin.clone().addScaledVector(direction,Math.min(45,blockedDistance));
  if(obstacle)createImpact(obstacle.point,obstacle.face?.normal?.clone().transformDirection(obstacle.object.matrixWorld),0xff7f50);
  if(miss<.5&&along<blockedDistance&&along<distance+2)takeDamage(Math.round((8+Math.floor(Math.random()*8))*difficulty.damage*tuning.damage*s.damageMultiplier),enemy.position);
  createTracer(origin,end,0xff5d43);s.recoil=.16;s.enemyFlash.rotation.z=Math.random()*Math.PI;
  playDistantShot(distance,enemy.position);
}

function takeDamage(amount,source) {
  if(gameState!=='playing')return;
  if(performance.now()<damageShieldUntil)amount=Math.max(1,Math.round(amount*.72));
  let remaining=amount;
  if(armor>0){const absorbed=Math.min(armor,Math.ceil(amount*.65));armor-=absorbed;remaining-=absorbed;}
  health=Math.max(0,health-remaining);
  damageAngle=Math.atan2(source.x-yaw.position.x,source.z-yaw.position.z)-yaw.rotation.y;
  ui.damageDirection.style.setProperty('--damage-rotation',`${-damageAngle}rad`);ui.damageDirection.classList.remove('show');void ui.damageDirection.offsetWidth;ui.damageDirection.classList.add('show');
  screenShake=Math.max(screenShake,.22);
  ui.damage.classList.remove('flash'); void ui.damage.offsetWidth; ui.damage.classList.add('flash');
  setTimeout(()=>ui.damage.classList.remove('flash'),180);
  playTone(70,.09,'sawtooth',.04);
  updateHUD();
  if(health<=0)endGame(false);
}

function createTracer(start,end,color) {
  const direction=end.clone().sub(start);
  const length=direction.length();
  if(!Number.isFinite(length)||length<.001)return;
  const geometry=sharedEffectGeometry('tracer',()=>{const shape=new THREE.CylinderGeometry(.009,.018,1,4);shape.rotateX(Math.PI/2);return shape;});
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85}));
  mesh.userData.sharedGeometry=true;mesh.scale.z=length;
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.lookAt(end);
  scene.add(mesh);
  tracers.push({mesh,life:.075});
  trimTransientList(tracers,[64,48,32][qualityIndex]);
}

function createImpact(point,normal,color=0xffd067) {
  if(!point)return;
  if(normal){
    const mark=new THREE.Mesh(sharedEffectGeometry('impact-mark',()=>new THREE.CircleGeometry(.016,10)),new THREE.MeshBasicMaterial({color:0x17100d,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-1,depthWrite:false,side:THREE.DoubleSide}));
    const surfaceNormal=normal.clone().normalize();mark.userData.sharedGeometry=true;mark.position.copy(point).addScaledVector(surfaceNormal,.0015);mark.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),surfaceNormal);scene.add(mark);bulletDecals.push(mark);
  }
  for(let i=0;i<5;i++){
    const mesh=new THREE.Mesh(sharedEffectGeometry('spark',()=>new THREE.SphereGeometry(.018,4,3)),new THREE.MeshBasicMaterial({color,transparent:true}));mesh.userData.sharedGeometry=true;
    mesh.position.copy(point);
    scene.add(mesh);
    particles.push({mesh,velocity:new THREE.Vector3((Math.random()-.5)*2,Math.random()*1.7,(Math.random()-.5)*2),life:.3});
  }
  trimTransientList(particles,[320,220,128][qualityIndex]);
}

function updateGrenades(dt){
  for(let i=grenades.length-1;i>=0;i--){
    const grenade=grenades[i],previousBounces=grenade.motion.bounces;
    advanceGrenadeMotion(grenade.motion,dt,collisionBoxes);grenade.mesh.position.copy(grenade.motion.position);
    if(!grenade.motion.grounded){grenade.mesh.rotation.x+=dt*9;grenade.mesh.rotation.z+=dt*6;}
    else{const roll=Math.hypot(grenade.motion.velocity.x,grenade.motion.velocity.z);grenade.mesh.rotation.x+=dt*roll*3;grenade.mesh.rotation.z+=dt*roll*2;}
    if(grenade.motion.bounces>previousBounces&&previousBounces<2){
      const distance=grenade.mesh.position.distanceTo(yaw.position);
      if(distance<30)playSample('shell',.08*(1-distance/30),.62+previousBounces*.12,0,spatialPan(grenade.mesh.position));
    }
    if(grenade.mesh.children[0])grenade.mesh.children[0].visible=Math.sin(grenade.motion.life*22)>0;
    if(grenade.motion.life<=1e-9){
      const proxy=new THREE.Group();proxy.position.copy(grenade.mesh.position);proxy.userData.exploded=false;
      proxy.userData.surfaceY=grenade.motion.grounded?grenade.motion.supportHeight-.12:null;
      disposeMesh(grenade.mesh);grenades.splice(i,1);explodeBarrel(proxy,'grenade');
    }
  }
}

function updateEffects(dt) {
  trimTransientList(tracers,[64,48,32][qualityIndex]);
  trimTransientList(particles,[320,220,128][qualityIndex]);
  while(explosions.length>10){const effect=explosions.shift();disposeMesh(effect.fireball);disposeMesh(effect.ring);scene.remove(effect.light);}
  for(let i=tracers.length-1;i>=0;i--){tracers[i].life-=dt;tracers[i].mesh.material.opacity=Math.max(0,tracers[i].life/.075);if(tracers[i].life<=0){disposeMesh(tracers[i].mesh);tracers.splice(i,1);}}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.velocity.y-=(p.smoke?-.25:6)*dt;p.velocity.multiplyScalar(Math.pow(p.smoke?.985:.99,dt*60));p.mesh.position.addScaledVector(p.velocity,dt);if(p.smoke)p.mesh.scale.multiplyScalar(Math.exp(dt*1.25));else p.mesh.rotation.x+=dt*9;p.mesh.material.opacity=Math.max(0,Math.min(1,p.life/(p.smoke?1.4:.3)));p.mesh.material.transparent=true;if(p.life<=0){disposeMesh(p.mesh);particles.splice(i,1);}}
  for(let i=explosions.length-1;i>=0;i--){const e=explosions[i];e.life-=dt;const progress=1-e.life/e.max;e.fireball.scale.setScalar(1+progress*6);e.fireball.material.opacity=Math.max(0,1-progress*1.3);e.ring.scale.setScalar(1+progress*10);e.ring.material.opacity=Math.max(0,.85-progress);e.ring.lookAt(tempCameraWorld);e.light.intensity=Math.max(0,18*(1-progress));if(e.life<=0){disposeMesh(e.fireball);disposeMesh(e.ring);scene.remove(e.light);explosions.splice(i,1);}}
  while(bulletDecals.length>24){disposeMesh(bulletDecals.shift());}
}

function disposeMesh(mesh){if(!mesh)return;mesh.removeFromParent();const geometries=new Set(),materials=new Set();mesh.traverse(child=>{if(child.geometry&&!child.userData.sharedGeometry)geometries.add(child.geometry);if(Array.isArray(child.material))child.material.forEach(material=>materials.add(material));else if(child.material)materials.add(child.material);});geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());}

function showHitmarker(kill) {
  ui.hitmarker.classList.remove('show','kill');void ui.hitmarker.offsetWidth;
  if(kill)ui.hitmarker.classList.add('kill');
  ui.hitmarker.classList.add('show');
}

function updateHUD() {
  const healthRatio=Math.max(0,health/maxHealth),armorRatio=maxArmor?Math.max(0,armor/maxArmor):0;
  ui.health.textContent=Math.ceil(health);ui.healthBar.style.width=`${healthRatio*100}%`;
  ui.armor.textContent=Math.ceil(armor);ui.armorBar.style.width=`${armorRatio*100}%`;
  ui.ammo.textContent=String(ammo).padStart(2,'0');ui.reserve.textContent=String(reserve).padStart(3,'0');
  const mode=currentMode(),configuredTotal=encounterTotal(mode),total=matchTotalEnemies||configuredTotal,remaining=gameState==='lobby'?total:Math.max(0,total-defeatedEnemies),active=enemies.filter(e=>e.userData.state.alive).length;
  ui.enemyRemaining.textContent=String(remaining).padStart(2,'0');ui.enemyTotal.textContent=String(total).padStart(2,'0');ui.enemyKilled.textContent=String(kills).padStart(2,'0');ui.enemyProgress.style.width=`${total?remaining/total*100:0}%`;
  ui.enemyCard.classList.toggle('warning',gameState==='playing'&&remaining<=Math.max(3,Math.ceil(total*.25))&&remaining>1);ui.enemyCard.classList.toggle('critical',gameState==='playing'&&remaining<=1);
  ui.enemyStatus.textContent=bossArrivalQueued?'COMMANDER INBOUND':wavePending?'REINFORCEMENTS INBOUND':remaining===0?'SECTOR CLEAR':mode.waves?`WAVE ${String(currentWave+1).padStart(2,'0')} • ${String(active).padStart(2,'0')} ACTIVE`:mode.killTarget?`CONTRACT ${String(Math.min(kills,mode.killTarget)).padStart(2,'0')} / ${mode.killTarget}`:'ACTIVE CONTACTS';
  ui.kills.textContent=kills;
  ui.grenadeCount.textContent=grenadeCount;
  ui.hud.classList.toggle('reloading',reloading);
  ui.reload.classList.toggle('visible',reloading||(ammo===0&&reserve===0));
  ui.reload.textContent=reloading?'重新裝填中…':ammo===0&&reserve===0?'備彈用盡 · 尋找彈藥箱':'按 R 重新裝填';
  if(!ui.ammoTrack.children.length)ui.ammoTrack.replaceChildren(...Array.from({length:30},()=>document.createElement('i')));
  [...ui.ammoTrack.children].forEach((tick,i)=>tick.classList.toggle('empty',i>=ammo));
  ui.health.style.color=healthRatio<.3?'var(--red)':'';
  updateBossHUD();
}

function formatClock(seconds){const safe=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`;}

function getZoneName(x,z){
  if(builtMap===1){
    if(Math.abs(x)<15&&Math.abs(z)<15)return'REACTOR // 中央反應爐';
    if(z>40)return'SOUTH ACCESS // 南側入口';
    if(z<-40)return'NORTH WORKS // 北側工區';
    if(x<-30)return'ASSEMBLY // 西側組裝區';
    if(x>30)return'QUENCH // 東側冷卻區';
    return'FOUNDRY // 工廠走廊';
  }
  if(z<-48&&x<-6)return'DRY DOCK—07 // 北側乾船塢';
  if(z<-48)return'CONTAINER ROW // 北側貨櫃區';
  if(x>48)return'REFINERY—E // 東側精煉區';
  if(z>48)return'RAIL YARD—S // 南側鐵路場';
  if(x<-48)return'BREAKERS—W // 西側拆船區';
  if(Math.abs(x)<9&&Math.abs(z)<9)return'HANGAR—03 // 中央機庫';
  if(x>24&&z>-4&&z<28)return'FUEL DEPOT // 燃料處理區';
  if(z>27)return'GATE—A // 南側檢查站';
  if(x<-27)return'SERVICE BAY // 西側維修區';
  return'TRANSIT GRID // 港區外環';
}

function updateMissionStatus(time,force=false){
  if(!force&&time-lastMissionPaint<160)return;lastMissionPaint=time;
  updateBossHUD();
  ui.ability.querySelector('b').textContent=operatorAbilities[selectedOperator].name;
  ui.ability.querySelector('small').textContent=abilityCooldown>0?`冷卻 ${Math.ceil(abilityCooldown)} 秒`:operatorAbilities[selectedOperator].description;
  ui.ability.classList.toggle('ready',abilityCooldown<=0);
  ui.ability.style.setProperty('--ready',`${(1-abilityCooldown/28)*100}%`);
  const streakLeft=lastKillAt?Math.max(0,15-(time-lastKillAt)/1000):0;
  ui.streak.classList.toggle('visible',killStreak>0&&streakLeft>0);
  if(streakLeft>0){ui.streak.querySelector('b').textContent=`${killStreak} 連殺`;ui.streak.querySelector('small').textContent=`${Math.ceil(streakLeft)} 秒內擊殺 • 每 3 連殺獲得補給`;}
  const mode=currentMode();ui.zoneName.textContent=getZoneName(yaw.position.x,yaw.position.z);
  if(mode.timeLimit){
    const seconds=(matchDeadline-time)/1000;ui.missionTimer.textContent=formatClock(seconds);ui.missionPhase.textContent=`CONTRACT // ${String(Math.min(kills,mode.killTarget)).padStart(2,'0')} / ${mode.killTarget}`;ui.objectiveText.textContent=`限時完成 ${mode.killTarget} 次擊殺`;
    if(gameState==='playing'&&seconds<=0){endGame(false);return;}
  }else{
    ui.missionTimer.textContent=formatClock((time-gameStart)/1000);
    if(mode.waves){ui.missionPhase.textContent=wavePending?'REINFORCEMENTS INBOUND':`WAVE ${String(currentWave+1).padStart(2,'0')} / ${String(mode.waves.length).padStart(2,'0')}`;ui.objectiveText.textContent=`撐過所有波次 • 任務剩餘 ${Math.max(0,matchTotalEnemies-defeatedEnemies)}`;}
    else{ui.missionPhase.textContent='PRIMARY OBJECTIVE';ui.objectiveText.textContent=`肅清${builtMap===1?'工廠':'港區'} • 剩餘 ${Math.max(0,matchTotalEnemies-defeatedEnemies)} 名敵軍`;}
    if(mode.bossEnabled){
      if(bossArrivalQueued){ui.missionPhase.textContent='COMMANDER INBOUND';ui.objectiveText.textContent=`首領 ${Math.ceil(bossArrivalRemaining)} 秒後進場 · 準備迎戰`;}
      else if(!bossPending){ui.missionPhase.textContent='FINAL OBJECTIVE';ui.objectiveText.textContent='擊敗指揮官 · 躲避範圍攻擊';}
      else if(mode.id==='warlord')ui.objectiveText.textContent=`突破菁英護衛 • 尚餘 ${Math.max(0,matchTotalEnemies-defeatedEnemies-1)} 名`;
    }
  }
}

function updateCompass() {
  const degrees=(THREE.MathUtils.radToDeg(-yaw.rotation.y)%360+360)%360;
  const dirs=['N','NE','E','SE','S','SW','W','NW'];
  ui.heading.textContent=`${dirs[Math.round(degrees/45)%8]} ${Math.round(degrees).toString().padStart(3,'0')}°`;
}

// Draw the footprint the player can actually collide with, not the broad-phase
// bounding rectangle (which fills empty corners around angled and round cover).
function drawMinimapCollider(ctx,box,scale,ox,oy){
  if(box.max.y<=.22||box.min.y>=1.85)return;
  const w=(box.max.x-box.min.x)*scale,h=(box.max.z-box.min.z)*scale;
  if(w>=70||h>=70)return;
  const shape=box.shape;
  if(shape?.kind==='cylinder'){
    ctx.beginPath();ctx.arc(ox+shape.x*scale,oy+shape.z*scale,shape.radius*scale,0,Math.PI*2);ctx.fill();
  }else if(shape?.kind==='box'){
    ctx.beginPath();
    for(const [i,[x,z]] of [[-shape.hx,-shape.hz],[shape.hx,-shape.hz],[shape.hx,shape.hz],[-shape.hx,shape.hz]].entries()){
      const px=ox+(shape.x+x*shape.cos+z*shape.sin)*scale,py=oy+(shape.z-x*shape.sin+z*shape.cos)*scale;
      if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.closePath();ctx.fill();
  }else ctx.fillRect(ox+box.min.x*scale,oy+box.min.z*scale,w,h);
}

function drawMinimap(time=0) {
  if(time-lastMinimapPaint<80)return;lastMinimapPaint=time;
  const c=ui.minimap,ctx=c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='rgba(7,11,14,.88)';ctx.fillRect(0,0,c.width,c.height);
  const scale=(c.width-16)/(ARENA_HALF*2),ox=c.width/2,oy=c.height/2;
  ctx.strokeStyle='rgba(200,255,46,.14)';ctx.lineWidth=1;
  for(let i=15;i<c.width;i+=30){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,c.height);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(c.width,i);ctx.stroke();}
  ctx.strokeStyle='rgba(93,227,255,.17)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(ox,4);ctx.lineTo(ox,c.height-4);ctx.moveTo(4,oy);ctx.lineTo(c.width-4,oy);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='rgba(150,165,170,.35)';
  for(const box of collisionBoxes)drawMinimapCollider(ctx,box,scale,ox,oy);
  for(const enemy of enemies){
    const state=enemy.userData.state;if(!state.alive)continue;const x=ox+enemy.position.x*scale,y=oy+enemy.position.z*scale;
    ctx.fillStyle=state.rank==='boss'?'#ffb44f':state.rank==='elite'?'#88dbff':'#ff3e53';ctx.beginPath();
    if(state.rank==='boss'){ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();}else ctx.arc(x,y,state.rank==='elite'?3.5:2.6,0,Math.PI*2);ctx.fill();
  }
  for(const grenade of grenades){ctx.strokeStyle='#ffb44f';ctx.beginPath();ctx.arc(ox+grenade.mesh.position.x*scale,oy+grenade.mesh.position.z*scale,3,0,Math.PI*2);ctx.stroke();}
  for(const attack of bossAttacks){
    if(attack.detonated)continue;
    for(const marker of attack.markers||[attack]){
      if(marker.complete)continue;const x=ox+marker.position.x*scale,y=oy+marker.position.z*scale;
      ctx.strokeStyle='#ff596b';ctx.beginPath();
      if(marker.mode==='shockwave'){
        ctx.arc(x,y,marker.radius*scale,marker.safeAngle+marker.safeHalf,marker.safeAngle+Math.PI*2-marker.safeHalf);ctx.stroke();
        ctx.strokeStyle='#62f6ee';ctx.beginPath();ctx.arc(x,y,marker.radius*scale,marker.safeAngle-marker.safeHalf,marker.safeAngle+marker.safeHalf);
      }else ctx.arc(x,y,marker.radius*scale,0,Math.PI*2);
      ctx.stroke();
    }
  }
  for(const pickup of pickups){if(!pickup.active)continue;ctx.fillStyle=pickup.def.map;const x=ox+pickup.root.position.x*scale,y=oy+pickup.root.position.z*scale;ctx.fillRect(x-1.5,y-1.5,3,3);}
  ctx.save();ctx.translate(ox+yaw.position.x*scale,oy+yaw.position.z*scale);ctx.rotate(-yaw.rotation.y);ctx.fillStyle='#c8ff2e';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,6);ctx.lineTo(0,3);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,.25)';ctx.strokeRect(.5,.5,c.width-1,c.height-1);
}

function feed(message) {
  const span=document.createElement('span');span.textContent=message;ui.feed.replaceChildren(span);
  clearTimeout(feed.timer);feed.timer=setTimeout(()=>{span.style.opacity='.25';},2500);
}

function endGame(win) {
  if(gameState==='ended')return;
  gameState='ended';clearInputs();clearBossAttacks();bossArrivalQueued=false;reloading=false;reloadRemaining=0;document.exitPointerLock?.();updateBossHUD();
  ui.pause.classList.add('hidden');ui.result.classList.remove('hidden');
  const mode=currentMode();
  $('#resultEyebrow').textContent=win?'MISSION COMPLETE':'MISSION FAILED';
  $('#resultTitle').textContent=win?(mode.bossEnabled?'指揮官已擊敗':mode.id==='onslaught'?'三波攻堅完成':mode.id==='hunter'?'獵殺合約達成':`${builtMap===1?'工廠':'港區'}已肅清`):(health<=0?'幹員已陣亡':'任務時間耗盡');
  ui.resultMeta.textContent=`${mode.name} // ${currentDifficulty().name} // 強度 ${encounterSettings().enemyPower.toFixed(2)}× // ${kills} / ${matchTotalEnemies} HOSTILES`;
  $('#resultKills').textContent=kills;
  $('#resultAccuracy').textContent=`${shots?Math.round(hits/shots*100):0}%`;
  const elapsed=Math.floor((performance.now()-gameStart)/1000);$('#resultTime').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
  playTone(win?440:75,.5,win?'triangle':'sawtooth',.06);
}

function initAudio(){
  if(audioContext?.state==='closed')return false;
  if(!audioContext){
    const AudioCtor=window.AudioContext||window.webkitAudioContext;if(!AudioCtor)return false;
    try{
      audioContext=new AudioCtor();audioMaster=audioContext.createGain();
      audioCompressor=audioContext.createDynamicsCompressor();
      audioCompressor.threshold.value=-9;audioCompressor.knee.value=12;audioCompressor.ratio.value=8;
      audioCompressor.attack.value=.003;audioCompressor.release.value=.18;
      audioMaster.connect(audioCompressor).connect(audioContext.destination);
      for(const channel of Object.keys(mixDefaults)){audioBuses[channel]=audioContext.createGain();audioBuses[channel].connect(audioMaster);}
      applyAudioMix();startAmbientSound();
    }catch(error){
      try{audioContext?.close?.()?.catch?.(()=>{});}catch{}
      for(const channel of Object.keys(audioBuses)){try{audioBuses[channel].disconnect();}catch{}delete audioBuses[channel];}
      audioContext=undefined;audioMaster=undefined;ambientStarted=false;console.warn('Audio initialization unavailable',error);return false;
    }
  }
  resumeAudio();return true;
}

function readMixSetting(key,fallback){
  try{const raw=sessionStorage.getItem(key);if(raw===null)return fallback;const value=Number(raw);return Number.isFinite(value)?Math.max(0,Math.min(100,value))/100:fallback;}catch{return fallback;}
}

function safeAudioNumber(value,fallback,min,max){return Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;}

function applyAudioMix(){
  masterVolume=safeAudioNumber(masterVolume,.72,0,1);
  const now=audioContext?.currentTime||0;
  const setGain=(parameter,value)=>{if(!parameter)return;if(parameter.setTargetAtTime)parameter.setTargetAtTime(value,now,.035);else parameter.value=value;};
  setGain(audioMaster?.gain,masterVolume);
  for(const channel of Object.keys(mixDefaults)){
    mixSettings[channel]=safeAudioNumber(mixSettings[channel],mixDefaults[channel],0,1);
    setGain(audioBuses[channel]?.gain,mixSettings[channel]);
  }
}

function resumeAudio(){
  if(!audioContext||audioContext.state==='closed')return false;
  try{audioContext.resume?.()?.catch?.(()=>{});return true;}catch{return false;}
}

function audioDestination(channel){return audioBuses[channel]||audioMaster;}

function trackAudioVoice(source,nodes,priority=1){
  if(audioVoices.size>=AUDIO_VOICE_LIMIT){
    let victim=null;
    for(const [voice,state] of audioVoices)if(state.priority<=priority&&(!victim||state.priority<victim[1].priority))victim=[voice,state];
    if(!victim){nodes.forEach(node=>node.disconnect());return false;}
    victim[1].release(true);
  }
  let released=false;
  const release=(stop=false)=>{
    if(released)return;released=true;audioVoices.delete(source);source.onended=null;
    if(stop){try{source.stop();}catch{}}
    nodes.forEach(node=>{try{node.disconnect();}catch{}});
  };
  audioVoices.set(source,{priority,release});source.onended=()=>release();return true;
}

async function loadAudioAssets(){
  if(!audioContext||audioContext.state==='closed')return;
  if(audioLoadPromise)return audioLoadPromise;
  const missing=Object.entries(soundFiles).filter(([name])=>!soundBuffers[name]);if(!missing.length)return;
  audioLoadPromise=Promise.allSettled(missing.map(async([name,url])=>{
    try{
      const response=await fetch(globalThis.neonAudioAssets?.[name] || url);if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const buffer=await audioContext.decodeAudioData(await response.arrayBuffer());soundBuffers[name]=buffer;
      // Gentle level matching avoids a single unusually loud source dominating
      // the mix. Never boost a quiet sample by more than 25 percent.
      const samples=buffer.getChannelData(0);let sum=0,peak=0,count=0;
      for(let i=0;i<samples.length;i+=4){const value=Math.abs(samples[i]);if(value>.002){sum+=value*value;count++;}peak=Math.max(peak,value);}
      const rms=Math.sqrt(sum/Math.max(1,count));
      sampleCalibration[name]=Math.min(.9/Math.max(.01,peak),safeAudioNumber(.2/Math.max(.01,rms),1,.45,1.25));
    }catch(error){console.warn(`Audio unavailable: ${name}`,error);}
  }));
  try{return await audioLoadPromise;}finally{audioLoadPromise=null;}
}

function playReloadSound(stage){
  if(!audioContext||audioContext.state==='closed'||mixSettings.effects===0)return false;
  const settings={release:{duration:.075,body:180,filter:1450,gain:.13,rate:.7,pan:-.12},insert:{duration:.115,body:125,filter:900,gain:.18,rate:.9,pan:.08},bolt:{duration:.13,body:260,filter:2400,gain:.14,rate:1.3,pan:.15}}[stage];
  if(!settings)return false;
  if(!mechanicalBuffers[stage]){
    const count=Math.ceil(audioContext.sampleRate*settings.duration),buffer=audioContext.createBuffer(1,count,audioContext.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<count;i++){const t=i/audioContext.sampleRate,envelope=Math.exp(-t/(settings.duration*.22));data[i]=((Math.random()*2-1)*.58+Math.sin(t*Math.PI*2*settings.body)*.42)*envelope;}
    mechanicalBuffers[stage]=buffer;
  }
  const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();source.buffer=mechanicalBuffers[stage];filter.type='bandpass';filter.frequency.value=settings.filter;filter.Q.value=.65;gain.gain.value=settings.gain;source.connect(filter).connect(gain).connect(audioDestination('effects'));
  if(!trackAudioVoice(source,[source,filter,gain],3))return false;source.start();
  playSample('shell',stage==='insert'?.075:.05,settings.rate,0,settings.pan,'effects',2);
  return true;
}

function playSample(name,volume=.1,rate=1,delay=0,pan=0,channel='effects',priority=1){
  if(!audioContext||audioContext.state==='closed'||!soundBuffers[name]||mixSettings[channel]===0)return false;
  volume=safeAudioNumber(volume,0,0,1)*(sampleCalibration[name]||1);if(volume<=0)return false;
  const source=audioContext.createBufferSource(),gain=audioContext.createGain();let panner;
  source.buffer=soundBuffers[name];source.playbackRate.value=safeAudioNumber(rate,1,.4,2);gain.gain.value=volume;source.connect(gain);
  if(audioContext.createStereoPanner){panner=audioContext.createStereoPanner();panner.pan.value=safeAudioNumber(pan,0,-1,1);gain.connect(panner).connect(audioDestination(channel));}else gain.connect(audioDestination(channel));
  if(!trackAudioVoice(source,[source,gain,...(panner?[panner]:[])],priority))return false;
  source.start(audioContext.currentTime+safeAudioNumber(delay,0,0,.5));return true;
}
function spatialPan(position){
  if(!position||!yaw)return 0;
  // Camera forward is -Z. A source on the listener's world-right must pan right.
  const dx=position.x-yaw.position.x,dz=position.z-yaw.position.z,distance=Math.hypot(dx,dz);
  return distance>.001?THREE.MathUtils.clamp((dx*Math.cos(yaw.rotation.y)-dz*Math.sin(yaw.rotation.y))/distance,-1,1):0;
}
function playTone(freq,duration,type='sine',volume=.03,pan=0,channel='feedback'){
  if(!audioContext||audioContext.state==='closed'||mixSettings[channel]===0)return false;
  volume=safeAudioNumber(volume,0,0,.2);if(volume<=0)return false;
  duration=safeAudioNumber(duration,.06,.015,1.5);freq=safeAudioNumber(freq,220,20,12000);
  const osc=audioContext.createOscillator(),gain=audioContext.createGain();let panner;
  osc.type=['sine','square','sawtooth','triangle'].includes(type)?type:'sine';osc.frequency.value=freq;
  gain.gain.setValueAtTime(.0001,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),audioContext.currentTime+.004);gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);osc.connect(gain);
  if(audioContext.createStereoPanner){panner=audioContext.createStereoPanner();panner.pan.value=safeAudioNumber(pan,0,-1,1);gain.connect(panner).connect(audioDestination(channel));}else gain.connect(audioDestination(channel));
  if(!trackAudioVoice(osc,[osc,gain,...(panner?[panner]:[])],channel==='effects'?2:1))return false;
  osc.start();osc.stop(audioContext.currentTime+duration);return true;
}

function playGunshot(){
  if(!audioContext||audioContext.state==='closed'||mixSettings.effects===0)return;
  const sampled=playSample(Math.random()>.5?'rifle0':'rifle1',.27,.96+Math.random()*.08,0,0,'effects',4);
  if(shots%4===0)playSample('tail',.055,.97+Math.random()*.05,.045,0,'effects',0);
  playSample('shell',.052,1.25+Math.random()*.2,.12,.55,'effects',1);
  if(!mechanicalBuffers.fire){
    const length=Math.floor(audioContext.sampleRate*.055),buffer=audioContext.createBuffer(1,length,audioContext.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,3);mechanicalBuffers.fire=buffer;
  }
  const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();source.buffer=mechanicalBuffers.fire;filter.type='bandpass';filter.frequency.value=sampled?950:1800;gain.gain.value=sampled?.025:.1;source.connect(filter).connect(gain).connect(audioDestination('effects'));
  if(trackAudioVoice(source,[source,filter,gain],3))source.start();playTone(78,.065,'sawtooth',sampled?.022:.035,0,'effects');
}
function playExplosionSound(distance,position){
  if(!audioContext)return;
  distance=safeAudioNumber(distance,75,0,300);const attenuation=1/(1+Math.pow(distance/20,1.5)),pan=spatialPan(position),now=audioContext.currentTime;
  const crowded=now-lastExplosionSoundAt<.1;lastExplosionSoundAt=now;
  playSample('explosion',(crowded?.17:.34)*attenuation,.92+Math.random()*.08,0,pan,'effects',3);
  if(!crowded){playSample('explosionLow',.26*attenuation,.82+Math.random()*.08,.015,pan,'effects',2);playTone(42,.4,'sawtooth',.035*attenuation,pan,'effects');}
}
function playDistantShot(distance,position){
  if(!audioContext)return;
  const now=audioContext.currentTime;if(now-lastEnemySoundAt<.055)return;lastEnemySoundAt=now;
  distance=safeAudioNumber(distance,70,0,200);if(distance>90)return;
  const pan=spatialPan(position),attenuation=1/(1+Math.pow(distance/15,1.7));
  const sampled=playSample(Math.random()>.5?'rifle0':'rifle1',.105*attenuation,.84+Math.random()*.06,0,pan,'effects',0);
  if(!sampled)playTone(135+Math.random()*25,.04,'triangle',.018*attenuation,pan,'effects');
}
function startAmbientSound(){
  if(ambientStarted||!audioContext)return;ambientStarted=true;
  const length=audioContext.sampleRate*3,buffer=audioContext.createBuffer(1,length,audioContext.sampleRate),data=buffer.getChannelData(0);let smooth=0;
  for(let i=0;i<length;i++){smooth=smooth*.985+(Math.random()*2-1)*.015;data[i]=smooth;}
  // Match both ends at zero over a short fade, avoiding a click at the loop seam.
  const fade=Math.min(1024,Math.floor(length/10));for(let i=0;i<fade;i++){const t=i/fade;data[i]*=t;data[length-1-i]*=t;}
  const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();source.buffer=buffer;source.loop=true;filter.type='bandpass';filter.frequency.value=260;filter.Q.value=.55;gain.gain.value=.04;
  source.connect(filter).connect(gain).connect(audioDestination('ambience'));source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();ambientStarted=false;};source.start();
}

function onResize(){const view=$('#game'),width=view.clientWidth||innerWidth,height=view.clientHeight||innerHeight;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);}

function renderFrame(){
  const background=scene.background,shadowUpdate=renderer.shadowMap.autoUpdate;
  try{
    const now=performance.now(),shadowInterval=qualityIndex===0?1000/30:1000/15;
    renderer.shadowMap.autoUpdate=shadowUpdate&&(renderFrame.lastShadowPaint===undefined||now-renderFrame.lastShadowPaint>=shadowInterval||renderer.shadowMap.needsUpdate);
    if(renderer.shadowMap.autoUpdate)renderFrame.lastShadowPaint=now;
    camera.layers.set(0);renderer.clear();renderer.render(scene,camera);
    // A depth-isolated view model prevents the foreground rifle from intersecting world surfaces.
    // Wall clearance retracts the rifle; actual scenery receives obstructed shots.
    scene.background=null;renderer.clearDepth();camera.layers.set(1);renderer.shadowMap.autoUpdate=false;renderer.render(scene,camera);
  }finally{scene.background=background;camera.layers.set(0);renderer.shadowMap.autoUpdate=shadowUpdate;}
}

function animate(time=0) {
  requestAnimationFrame(animate);
  const elapsed=Math.max(0,clock.getDelta());
  touchControls?.setPlaying(gameState==='playing'&&!portalPaused&&!document.hidden);
  if(portalPaused || document.hidden)return;
  // A long suspended frame must not teleport the player or consume a contract.
  // The clock is still sampled on paused frames, so resuming has no catch-up loop.
  if(gameState==='playing'&&elapsed>.5){pauseGame('偵測到短暫卡頓，已安全暫停。可調低畫質後繼續任務。');pauseStarted-=elapsed*1000;}
  const dt=Math.min(elapsed,.5);
  updateRain(dt);
  if(gameState==='playing'){
    const steps=Math.max(1,Math.ceil(dt/.05)),step=dt/steps;
    for(let index=0;index<steps&&gameState==='playing';index++){
      const stepTime=time-(steps-index-1)*step*1000;
      updateCombatTimers(step,stepTime);
      if(gameState==='playing')updatePlayer(step,stepTime);
      if(gameState==='playing')updateEnemies(step,stepTime);
      if(gameState==='playing')updateGrenades(step);
      if(gameState==='playing')updateBossAttacks(step,stepTime);
    }
    if(gameState==='playing'){updatePickups(dt,time);updateCompass();updateMissionStatus(time);drawMinimap(time);}
    updateEffects(dt);
  } else updateEffects(dt);
  if(screenShake>0){camera.position.x=(Math.random()-.5)*screenShake*.08;camera.position.y=(Math.random()-.5)*screenShake*.07;camera.rotation.z=(Math.random()-.5)*screenShake*.025;screenShake=Math.max(0,screenShake-dt*2.3);}else{const settle=Math.pow(.72,dt*60);camera.position.x*=settle;camera.position.y*=settle;camera.rotation.z*=settle;}
  updateGrenadePreview(time);
  renderFrame();
}

initLoadout();
init3D();
ui.deploy.disabled=false;
ui.deploy.setAttribute('aria-busy','false');
