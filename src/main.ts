import './style.css';
import { store, uid } from './state';
import { Plan2D, type Tool } from './plan2d';
import { Scene3D } from './scene3d';
import { CATALOG, getEntry, type CatalogEntry } from './catalog';
import {
  adjustCanvas, adjustHex, allMaterials, CATEGORY_LABELS, hasAdjust, isTextured, LIBRARY, MATCH_FRONT, materialAspect, readImageFile, SLOT_LABELS, slotMaterialDef, swatchStyle,
} from './materials';
import type { ColorAdjust, FrontStyle, Item, MaterialDef, MaterialSlot, Project, UVSettings, Wall } from './types';
import { countertopRuns, dist, snapItem, wallDir, wallLength } from './geom';
import { Account } from './account';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const ICON = {
  select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3l14 8-6 2-2 6z"/></svg>',
  wall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20V5h8v8h10"/><circle cx="3" cy="20" r="1.5" fill="currentColor"/><circle cx="21" cy="13" r="1.5" fill="currentColor"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M6 21V5M6 5a14 14 0 0 1 14 14"/></svg>',
  window: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h6l2 2h10v10H3z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>',
  walk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="13" cy="4" r="2"/><path d="M9 21l3-7 3 3v4M7 12l3-4 4 1 2 4"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-6-6-9 9"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M3 12h18M12 3l-3 3m3-3l3 3M12 21l-3-3m3 3l3-3M3 12l3-3m-3 3l3 3M21 12l-3-3m3 3l-3 3"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.2-1.7-.5-1.1.2-2.3 1.4-2.3H17a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  logo: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h18v11H3z"/><path d="M3 14h18M9 10v11M6 6h12M8 3h8"/></svg>',
};

// ---------------------------------------------------------------------------
// Grundgerüst

const app = $('#app');
app.innerHTML = `
<header>
  <div class="brand">${ICON.logo}<span>Küchenplaner</span></div>
  <input id="projectName" type="text" aria-label="Projektname" />
  <button class="btn icon" id="undo" title="Rückgängig (Strg+Z)">${ICON.undo}</button>
  <button class="btn icon" id="redo" title="Wiederholen (Strg+Y)">${ICON.redo}</button>
  <div class="spacer"></div>
  <button class="btn" id="showroomBtn" title="Vollflächige 3D-Präsentation ohne Bedienleisten">${ICON.sparkle}Showroom</button>
  <div class="seg" id="viewMode">
    <button data-v="2d">2D</button><button data-v="split" class="on">Geteilt</button><button data-v="3d">3D</button>
  </div>
  <div class="spacer"></div>
  <div class="file-menu">
    <button class="btn" id="fileBtn">Datei ▾</button>
    <div class="dropdown" id="fileMenu" hidden>
      <button id="newBtn">Neue Planung …</button>
      <hr />
      <button id="openBtn">${ICON.open}Aus Datei importieren (.json) …</button>
      <button id="saveBtn">${ICON.save}Als Datei exportieren (.json)</button>
    </div>
  </div>
  <div id="account" class="account"></div>
  <input type="file" id="openFile" accept=".json,application/json" hidden />
</header>

<aside class="left">
  <div class="tabs">
    <button data-tab="room" class="on">Raum</button>
    <button data-tab="catalog">Katalog</button>
    <button data-tab="materials">Materialien</button>
  </div>

  <section class="tab on" id="tab-room">
    <h3>Werkzeuge</h3>
    <div class="tools">
      <button class="tool on" data-tool="select">${ICON.select}Auswählen</button>
      <button class="tool" data-tool="wall">${ICON.wall}Wand zeichnen</button>
      <button class="tool" data-tool="door">${ICON.door}Tür</button>
      <button class="tool" data-tool="window">${ICON.window}Fenster</button>
    </div>
    <p class="hint" id="toolHint"></p>

    <h3>Raum aus Maßen</h3>
    <div class="grid2">
      <label class="field"><span>Breite</span><span class="unit" data-unit="cm"><input type="number" id="roomW" value="460" min="100" /></span></label>
      <label class="field"><span>Tiefe</span><span class="unit" data-unit="cm"><input type="number" id="roomD" value="400" min="100" /></span></label>
      <label class="field"><span>Raumhöhe</span><span class="unit" data-unit="cm"><input type="number" id="roomH" value="260" min="200" /></span></label>
      <label class="field"><span>Form</span><select id="roomShape"><option value="rect">Rechteck</option><option value="l">L-Form</option></select></label>
    </div>
    <button class="btn" id="makeRoom" style="width:100%;justify-content:center">Wände erzeugen (ersetzt Wände)</button>

    <h3>Grundriss-Vorlage (2D-Plan)</h3>
    <p class="hint">Lade einen Grundriss als Bild (Scan, Foto, PNG/JPG) hoch, kalibriere den Maßstab über eine bekannte Strecke und zeichne die Wände nach.</p>
    <div class="drop" id="underlayDrop">${ICON.image}<div>Bild hierher ziehen oder klicken</div></div>
    <input type="file" id="underlayFile" accept="image/*" hidden />
    <div id="underlayControls" hidden>
      <div class="row"><label>Deckkraft</label><input type="range" id="underlayOpacity" min="0.1" max="1" step="0.05" style="width:120px" /></div>
      <div class="row"><label>Sichtbar</label><input type="checkbox" id="underlayVisible" /></div>
      <div class="tools" style="margin-top:6px">
        <button class="tool" id="calibrate">${ICON.ruler}Maßstab</button>
        <button class="tool" id="moveUnderlay">${ICON.move}Verschieben</button>
      </div>
      <button class="btn danger" id="removeUnderlay" style="margin-top:6px">${ICON.trash}Vorlage entfernen</button>
    </div>

    <h3>Einstellungen</h3>
    <div class="row"><label for="setCeiling">Decke mit Deckenleuchten</label><input type="checkbox" id="setCeiling" /></div>
    <div class="row"><label for="setBacksplash">Nischenrückwand automatisch</label><input type="checkbox" id="setBacksplash" /></div>
    <div class="row"><label>Höhe Nischenrückwand</label><span class="unit" data-unit="cm"><input type="number" id="setBsHeight" min="10" max="150" step="0.1" /></span></div>
    <div class="row"><label for="setHandleless" title="Fronten ohne Griffe: Unterschränke mit Griffmulde oben, Hängeschränke von unten greifbar">Grifflos (Griffmulden)</label><input type="checkbox" id="setHandleless" /></div>
    <div class="row"><label>Sockelhöhe</label><span class="unit" data-unit="cm"><input type="number" id="setPlinth" min="0" max="20" /></span></div>
    <div class="row"><label>Arbeitsplattenstärke</label><span class="unit" data-unit="cm"><input type="number" id="setTop" min="1" max="12" step="0.5" /></span></div>
  </section>

  <section class="tab" id="tab-catalog">
    <p class="hint">Element anklicken und im Grundriss platzieren. Schränke docken automatisch an Wände und Nachbarn an. <kbd>R</kbd> dreht, <kbd>Shift</kbd>+Klick platziert mehrfach, <kbd>Alt</kbd> deaktiviert das Andocken.</p>
    <div id="catalog"></div>
  </section>

  <section class="tab" id="tab-materials">
    <p class="hint">Standardmaterial je Bereich. Einzelne Elemente können im Eigenschaftenfeld abweichende Materialien erhalten.</p>
    <div id="slots"></div>
    <h3>Eigene Oberflächen</h3>
    <p class="hint">Mische eine eigene Lackfarbe (matt, normal oder Hochglanz) oder lade ein Foto bzw. eine Textur deiner Wunschoberfläche hoch (z. B. Musterfoto einer Arbeitsplatte, Fliese, Holzdekor).</p>
    <div class="btn-col">
      <button class="btn primary" id="libraryMaterial" style="justify-content:center">${ICON.globe}Online-Bibliothek</button>
      <button class="btn" id="colorMaterial" style="justify-content:center">${ICON.palette}Eigene Farbe</button>
      <button class="btn" id="uploadMaterial" style="justify-content:center">${ICON.image}Textur hochladen</button>
    </div>
    <div class="mat-grid" id="customMats" style="margin-top:10px"></div>
  </section>
</aside>

<main class="v-split" id="main">
  <div class="pane" id="plan">
    <div class="overlay tr"><div class="chip"><button class="btn" id="fitPlan" title="Ansicht einpassen">Einpassen</button></div></div>
  </div>
  <div class="pane" id="view">
    <div class="shared-badge"><b id="sharedTitle">Lade Küche …</b><span>Nur ansehen</span></div>
    <div class="overlay tr showroom-only">
      <div class="chip">
        <button class="btn" id="tourBtn" title="Kamera kreist langsam durch den Raum">${ICON.rotate}Rundgang</button>
        <button class="btn" id="fsBtn" title="Browser-Vollbild">${ICON.expand}Vollbild</button>
        <button class="btn" id="exitShowroom" title="Showroom beenden (Esc)">✕ Beenden</button>
      </div>
    </div>
    <div class="overlay tl">
      <div class="chip">
        <button class="btn" data-cam="perspective">Übersicht</button>
        <button class="btn" data-cam="corner">Raumecke</button>
        <button class="btn" data-cam="front">Frontal</button>
        <button class="btn" data-cam="top">Draufsicht</button>
        <button class="btn" id="walkBtn" title="Mit Maus umsehen, WASD laufen">${ICON.walk}Begehen</button>
      </div>
    </div>
    <div class="overlay bl">
      <div class="chip"><span title="Tageszeit (Sonnenstand)">☀</span><input type="range" id="timeOfDay" min="6" max="20" step="0.25" /><span id="timeLabel"></span></div>
      <div class="chip"><span>Belichtung</span><input type="range" id="exposure" min="0.3" max="2.5" step="0.05" value="1" /></div>
      <div class="chip light-chip">
        <button class="btn" id="lightBtn" title="Licht einstellen: Sonne, Himmel, Lampen, Weichheit">${ICON.bulb}Licht</button>
        <div class="light-pop" id="lightPop" hidden>
          <label class="field"><span>Sonne <b data-v="sunIntensity"></b></span><input type="range" data-light="sunIntensity" min="0" max="2" step="0.05" /></label>
          <label class="field"><span>Himmel / Tageslicht <b data-v="skyIntensity"></b></span><input type="range" data-light="skyIntensity" min="0" max="2.5" step="0.05" /></label>
          <label class="field"><span>Lampen <b data-v="lampIntensity"></b></span><input type="range" data-light="lampIntensity" min="0" max="3" step="0.05" /></label>
          <label class="field"><span>Weichheit Schatten &amp; Lichtkegel <b data-v="softness"></b></span><input type="range" data-light="softness" min="0" max="1" step="0.05" /></label>
          <div class="chips"><button data-preset="sun">Sonnig</button><button data-preset="soft">Weich / bewölkt</button><button data-preset="evening">Abend</button><button data-preset="reset">Standard</button></div>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="chip">
        <button class="btn" id="ptBtn" title="Physikalisch korrektes Pathtracing – Bild wird fortlaufend verfeinert">${ICON.sparkle}Fotorealistisch</button>
        <span id="ptSamples" hidden></span>
        <span id="gpuBadge" class="gpu-badge" hidden></span>
        <button class="btn" id="shotBtn" title="Aktuelle Ansicht als PNG speichern">${ICON.camera}Bild</button>
      </div>
    </div>
    <div class="walk-hint" id="walkHint">WASD / Pfeiltasten laufen · Maus umsehen · Shift schneller · Esc beenden</div>
  </div>
</main>

<aside class="right props" id="props"></aside>
`;

// ---------------------------------------------------------------------------
// Ansichten

const plan = new Plan2D($('#plan'));
const view = new Scene3D($('#view'));

const toolHints: Record<Tool, string> = {
  select: 'Elemente, Wände, Türen und Fenster anklicken und ziehen. Breite eines Elements über die seitlichen Ziehpunkte frei ändern. Wandendpunkte verschieben. <kbd>Entf</kbd> löscht, <kbd>R</kbd> dreht. Rechte Maustaste / Leertaste + Ziehen verschiebt die Ansicht, Mausrad zoomt.',
  wall: 'Klicken setzt Wandpunkte. Länge eintippen + <kbd>Enter</kbd> für exakte Maße. Doppelklick, Rechtsklick oder <kbd>Esc</kbd> beendet. <kbd>Alt</kbd> hebt den Winkelfang auf.',
  door: 'Auf eine Wand klicken, um eine Tür einzusetzen.',
  window: 'Auf eine Wand klicken, um ein Fenster einzusetzen.',
  calibrate: 'Zwei Punkte einer bekannten Strecke auf der Vorlage anklicken.',
  place: 'Klicken zum Platzieren. <kbd>R</kbd> dreht, <kbd>Esc</kbd> bricht ab.',
};

plan.onToolChange = (t) => {
  document.querySelectorAll<HTMLElement>('.tool[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  $('#calibrate').classList.toggle('on', t === 'calibrate');
  if (t !== 'place') document.querySelectorAll('.cat-item').forEach((b) => b.classList.remove('on'));
  $('#toolHint').innerHTML = toolHints[t];
};
plan.onToolChange('select');

document.querySelectorAll<HTMLElement>('.tool[data-tool]').forEach((b) =>
  b.addEventListener('click', () => {
    plan.moveUnderlay = false;
    $('#moveUnderlay').classList.remove('on');
    plan.setTool(b.dataset.tool as Tool);
  }),
);

// Ansichtsmodus
document.querySelectorAll<HTMLElement>('#viewMode button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('#viewMode button').forEach((x) => x.classList.toggle('on', x === b));
    $('#main').className = 'v-' + b.dataset.v;
  }),
);

// Tabs
document.querySelectorAll<HTMLElement>('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'materials') renderMaterialsTab();
  }),
);

$('#fitPlan').addEventListener('click', () => plan.fit());
document.querySelectorAll<HTMLElement>('[data-cam]').forEach((b) => b.addEventListener('click', () => view.setView(b.dataset.cam as any)));
$('#walkBtn').addEventListener('click', () => view.startWalk());
view.onWalkChange = (on) => $('#walkHint').classList.toggle('on', on);

$('#exposure').addEventListener('input', (e) => view.setExposure(+(e.target as HTMLInputElement).value));

$('#ptBtn').addEventListener('click', async () => {
  const on = !view.pathTracing;
  await view.setPathTracing(on);
  $('#ptBtn').classList.toggle('pt-on', on);
  $('#ptSamples').hidden = !on;
  if (on) {
    const gpu = view.gpuInfo();
    if (gpu.integrated) showGpuHint(gpu.name);
    else toast('Fotorealistischer Modus: Das Bild wird mit jeder Probe rauschfreier. Kamera ruhig halten.');
  }
});
// GPU-Anzeige: warnt, wenn nur die integrierte Grafik genutzt wird
{
  const gpu = view.gpuInfo();
  const badge = $('#gpuBadge');
  const short = gpu.name.replace(/^ANGLE \(|\)$/g, '').replace(/Direct3D.*$|vs_\d.*$/i, '').split(',').slice(-2, -1)[0]?.trim() || gpu.name;
  badge.hidden = false;
  badge.textContent = gpu.integrated ? '⚠ integrierte GPU' : 'GPU ✓';
  badge.title = `Genutzte Grafikkarte: ${short}`;
  badge.classList.toggle('warn', gpu.integrated);
  if (gpu.integrated) badge.addEventListener('click', () => showGpuHint(gpu.name));
}

function showGpuHint(name: string) {
  modal(
    'Leistungsstarke Grafikkarte nutzen',
    `<p>Der Browser rendert gerade mit <b>${esc(name)}</b>. Der fotorealistische Modus läuft auf der dedizierten Grafikkarte (z. B. NVIDIA) um ein Vielfaches schneller.</p>
    <h3>Windows-Einstellung (empfohlen)</h3>
    <ol class="steps">
      <li><b>Einstellungen → System → Bildschirm → Grafik</b> öffnen.</li>
      <li>Den Browser in der Liste suchen (oder über <i>Durchsuchen</i> hinzufügen, z. B. <code>C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe</code> bzw. <code>msedge.exe</code>).</li>
      <li><b>Optionen → Hohe Leistung</b> (NVIDIA) wählen und speichern.</li>
      <li>Den Browser <b>vollständig schließen</b> (alle Fenster, ggf. Hintergrundprozesse) und neu starten.</li>
    </ol>
    <h3>Alternativ: NVIDIA-Systemsteuerung</h3>
    <p class="hint">3D-Einstellungen verwalten → Programmeinstellungen → Browser auswählen → „Hochleistungs-NVIDIA-Prozessor“.</p>
    <h3>Prüfen</h3>
    <p class="hint">Nach dem Neustart zeigt die Anzeige neben „Fotorealistisch“ <b>GPU ✓</b>. Details unter <code>chrome://gpu</code> bzw. <code>edge://gpu</code> (Eintrag „GL_RENDERER“).
    Notebook dabei möglichst am Netzteil betreiben – im Akkubetrieb drosseln viele Geräte die NVIDIA-GPU.</p>`,
  );
}

view.onSamples = (n) => ($('#ptSamples').textContent = `${n} Proben`);

$('#shotBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = view.screenshot();
  a.download = `${store.project.name || 'kueche'}.png`;
  a.click();
});

// ---------------------------------------------------------------------------
// Showroom: 3D im Vollformat, alle Bedienleisten ausgeblendet

let showroomPrevView = 'split';
function setShowroom(on: boolean) {
  const main = $('#main');
  if (on) {
    showroomPrevView = main.className.replace('v-', '') || 'split';
    main.className = 'v-3d';
    store.select(null);
    plan.setTool('select');
  } else {
    main.className = 'v-' + showroomPrevView;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  document.body.classList.toggle('showroom', on);
  view.setShowroom(on);
  $('#tourBtn').classList.toggle('on', false);
  try {
    if (store.readonly) throw 0;
    if (on) sessionStorage.setItem('kp.showroom', '1');
    else sessionStorage.removeItem('kp.showroom');
  } catch {
    /* ignorieren */
  }
  if (on) toast('Showroom: Maus ziehen zum Drehen, Mausrad zum Zoomen, Doppelklick zum Fokussieren · Esc beendet');
}
$('#showroomBtn').addEventListener('click', () => setShowroom(true));
$('#exitShowroom').addEventListener('click', () => setShowroom(false));
$('#tourBtn').addEventListener('click', () => {
  const on = !view.autoRotate;
  view.setAutoRotate(on);
  $('#tourBtn').classList.toggle('on', on);
});
$('#fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => toast('Vollbild wird von diesem Browser nicht unterstützt.'));
});
document.addEventListener('fullscreenchange', () => $('#fsBtn').classList.toggle('on', !!document.fullscreenElement));
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !document.body.classList.contains('showroom') || store.readonly) return;
  // Esc beendet erst Begehen/Dialoge, dann den Showroom
  if (document.pointerLockElement || document.querySelector('.modal-back')) return;
  if (document.fullscreenElement) return; // Browser verlässt bei Esc zuerst das Vollbild
  setShowroom(false);
});

// Licht-Regler
const LIGHT_DEFAULTS = { sunIntensity: 1, skyIntensity: 1, lampIntensity: 1, softness: 0.6 } as const;
type LightKey = keyof typeof LIGHT_DEFAULTS;
const lightPop = $('#lightPop');
$('#lightBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  lightPop.hidden = !lightPop.hidden;
  syncLight();
});
lightPop.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => (lightPop.hidden = true));
function syncLight() {
  const st = store.project.settings;
  lightPop.querySelectorAll<HTMLInputElement>('[data-light]').forEach((inp) => {
    const k = inp.dataset.light as LightKey;
    const v = st[k] ?? LIGHT_DEFAULTS[k];
    if (document.activeElement !== inp) inp.value = String(v);
    lightPop.querySelector(`[data-v="${k}"]`)!.textContent = k === 'softness' ? `${Math.round(v * 100)} %` : `${Math.round(v * 100)} %`;
  });
}
let lightTimer = 0;
lightPop.querySelectorAll<HTMLInputElement>('[data-light]').forEach((inp) => {
  inp.addEventListener('input', () => {
    (store.project.settings as Record<string, unknown>)[inp.dataset.light!] = +inp.value;
    syncLight();
    clearTimeout(lightTimer);
    lightTimer = window.setTimeout(() => store.emit(), 60);
  });
  inp.addEventListener('change', () => store.commit());
});
const LIGHT_PRESETS: Record<string, Partial<Record<LightKey, number>>> = {
  sun: { sunIntensity: 1.3, skyIntensity: 1, lampIntensity: 0.6, softness: 0.3 },
  soft: { sunIntensity: 0.25, skyIntensity: 1.6, lampIntensity: 1, softness: 1 },
  evening: { sunIntensity: 0.2, skyIntensity: 0.35, lampIntensity: 1.8, softness: 0.8 },
  reset: { ...LIGHT_DEFAULTS },
};
lightPop.querySelectorAll<HTMLElement>('[data-preset]').forEach((b) =>
  b.addEventListener('click', () => {
    Object.assign(store.project.settings, LIGHT_PRESETS[b.dataset.preset!]);
    syncLight();
    store.commit();
  }),
);
store.subscribe(() => {
  if (!lightPop.hidden) syncLight();
});

// Undo / Redo
$('#undo').addEventListener('click', () => store.undo());
$('#redo').addEventListener('click', () => store.redo());
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    store.redo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelection();
  }
});

// Projekt
const nameInput = $<HTMLInputElement>('#projectName');
nameInput.addEventListener('change', () => {
  store.project.name = nameInput.value;
  store.commit();
});
// Datei-Menü
const fileMenu = $('#fileMenu');
$('#fileBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  fileMenu.hidden = !fileMenu.hidden;
});
document.addEventListener('click', () => (fileMenu.hidden = true));

$('#newBtn').addEventListener('click', () => openNewPlan());

async function openNewPlan() {
  if (!(await account.confirmReplace('eine neue Planung beginnt'))) return;
  const m = modal(
    'Neue Planung',
    `<div class="choice-grid">
      <button class="choice" data-kind="empty"><b>Leerer Raum</b><span>Ohne Wände und Möbel – Raum aus Maßen erzeugen oder Grundriss hochladen.</span></button>
      <button class="choice" data-kind="example"><b>Beispielküche</b><span>Fertige Küche mit Insel als Ausgangspunkt.</span></button>
    </div>`,
  );
  m.el.querySelectorAll<HTMLElement>('.choice').forEach((b) =>
    b.addEventListener('click', () => {
      m.close();
      store.reset(b.dataset.kind === 'empty');
      account.detach();
      plan.fit();
      view.setView('perspective');
      if (b.dataset.kind === 'empty') ($('.tabs button[data-tab="room"]') as HTMLElement).click();
    }),
  );
}
$('#saveBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store.project)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${store.project.name || 'kueche'}.kueche.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#openBtn').addEventListener('click', async () => {
  if (await account.confirmReplace('eine Datei importiert wird')) $('#openFile').click();
});
$<HTMLInputElement>('#openFile').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const p = JSON.parse(await f.text()) as Project;
    if (!Array.isArray(p.walls)) throw new Error('Keine Küchenplaner-Datei');
    store.replace(p);
    account.detach();
    plan.fit();
    view.setView('perspective');
  } catch (err) {
    toast('Datei konnte nicht geladen werden: ' + (err as Error).message);
  }
  (e.target as HTMLInputElement).value = '';
});

// Raum aus Maßen
$('#makeRoom').addEventListener('click', () => {
  const W = +$<HTMLInputElement>('#roomW').value;
  const D = +$<HTMLInputElement>('#roomD').value;
  const H = +$<HTMLInputElement>('#roomH').value;
  const shape = $<HTMLSelectElement>('#roomShape').value;
  if (store.project.walls.length && !confirm('Vorhandene Wände, Türen und Fenster werden ersetzt. Fortfahren?')) return;
  const pts =
    shape === 'l'
      ? [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D * 0.55 }, { x: W * 0.55, y: D * 0.55 }, { x: W * 0.55, y: D }, { x: 0, y: D }]
      : [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }];
  const p = store.project;
  p.walls = pts.map((a, i) => ({ id: uid(), a: { ...a }, b: { ...pts[(i + 1) % pts.length] }, thickness: 12, height: H }));
  p.openings = [];
  p.items.forEach((i) => delete i.wallId);
  store.commit();
  plan.fit();
  view.setView('perspective');
});

// Grundriss-Vorlage
const underlayFile = $<HTMLInputElement>('#underlayFile');
const drop = $('#underlayDrop');
drop.addEventListener('click', () => underlayFile.click());
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer?.files[0];
  if (f) loadUnderlay(f);
});
underlayFile.addEventListener('change', () => {
  const f = underlayFile.files?.[0];
  if (f) loadUnderlay(f);
  underlayFile.value = '';
});

async function loadUnderlay(f: File) {
  if (!f.type.startsWith('image/')) {
    toast('Bitte ein Bild (PNG, JPG, WebP) hochladen. PDFs vorher als Bild exportieren.');
    return;
  }
  const url = await readImageFile(f, 3000);
  const img = new Image();
  img.onload = () => {
    // Startmaßstab: Bild ungefähr auf 8 m Breite
    const scale = 800 / img.width;
    store.project.underlay = { image: url, scale, x: 0, y: 0, opacity: 0.6, visible: true };
    store.commit();
    plan.fit();
    toast('Vorlage geladen. Jetzt den Maßstab kalibrieren: zwei Punkte einer bekannten Strecke anklicken.');
    plan.setTool('calibrate');
  };
  img.src = url;
}

$('#calibrate').addEventListener('click', () => plan.setTool('calibrate'));
plan.onCalibrated = (d) => {
  const real = prompt(`Gemessene Strecke: ${Math.round(d)} cm im aktuellen Maßstab.\nWie lang ist die Strecke in Wirklichkeit (cm)?`, String(Math.round(d)));
  const v = parseFloat((real ?? '').replace(',', '.'));
  const u = store.project.underlay;
  if (!u || !(v > 0)) return;
  const f = v / d;
  u.scale *= f;
  u.x *= f;
  u.y *= f;
  store.commit();
  plan.fit();
  toast('Maßstab gesetzt. Jetzt mit „Wand zeichnen“ die Wände nachzeichnen.');
};
$('#moveUnderlay').addEventListener('click', () => {
  plan.moveUnderlay = !plan.moveUnderlay;
  $('#moveUnderlay').classList.toggle('on', plan.moveUnderlay);
  plan.setTool('select');
});
$('#removeUnderlay').addEventListener('click', () => {
  delete store.project.underlay;
  store.commit();
});
$<HTMLInputElement>('#underlayOpacity').addEventListener('input', (e) => {
  if (!store.project.underlay) return;
  store.project.underlay.opacity = +(e.target as HTMLInputElement).value;
  plan.draw();
});
$<HTMLInputElement>('#underlayOpacity').addEventListener('change', () => store.commit());
$<HTMLInputElement>('#underlayVisible').addEventListener('change', (e) => {
  if (!store.project.underlay) return;
  store.project.underlay.visible = (e.target as HTMLInputElement).checked;
  store.commit();
});

// Einstellungen
const bindSetting = (id: string, key: keyof Project['settings'], type: 'bool' | 'num') => {
  const el = $<HTMLInputElement>(id);
  el.addEventListener('change', () => {
    (store.project.settings as any)[key] = type === 'bool' ? el.checked : +el.value;
    store.commit();
  });
};
bindSetting('#setCeiling', 'ceiling', 'bool');
bindSetting('#setBacksplash', 'backsplash', 'bool');
bindSetting('#setBsHeight', 'backsplashHeight', 'num');
bindSetting('#setHandleless', 'handleless', 'bool');
bindSetting('#setPlinth', 'plinth', 'num');

bindSetting('#setTop', 'countertopThickness', 'num');
const timeInput = $<HTMLInputElement>('#timeOfDay');
timeInput.addEventListener('input', () => {
  store.project.settings.timeOfDay = +timeInput.value;
  updateTimeLabel();
});
timeInput.addEventListener('change', () => store.commit());
function updateTimeLabel() {
  const t = store.project.settings.timeOfDay;
  $('#timeLabel').textContent = `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`;
}

function syncSettings() {
  const p = store.project;
  if (document.activeElement !== nameInput) nameInput.value = p.name;
  $<HTMLInputElement>('#setCeiling').checked = p.settings.ceiling;
  $<HTMLInputElement>('#setBacksplash').checked = p.settings.backsplash;
  $<HTMLInputElement>('#setBsHeight').value = String(p.settings.backsplashHeight ?? 60);
  $<HTMLInputElement>('#setHandleless').checked = !!p.settings.handleless;
  $<HTMLInputElement>('#setPlinth').value = String(p.settings.plinth);
  $<HTMLInputElement>('#setTop').value = String(p.settings.countertopThickness);
  timeInput.value = String(p.settings.timeOfDay);
  updateTimeLabel();
  const u = p.underlay;
  $('#underlayControls').hidden = !u;
  if (u) {
    $<HTMLInputElement>('#underlayOpacity').value = String(u.opacity);
    $<HTMLInputElement>('#underlayVisible').checked = u.visible;
  }
}

// ---------------------------------------------------------------------------
// Katalog

function catalogIcon(e: CatalogEntry) {
  const k = e.kind;
  const s = 'stroke="currentColor" fill="none" stroke-width="1.4"';
  if (k === 'wall' || k === 'shelf' || k === 'hood') {
    if (k === 'hood') return `<svg viewBox="0 0 60 40"><path d="M26 2h8v18h14l4 8H8l4-8h14z" ${s}/></svg>`;
    if (k === 'shelf') return `<svg viewBox="0 0 60 40"><path d="M6 20h48v4H6z" ${s}/></svg>`;
    return `<svg viewBox="0 0 60 40"><rect x="14" y="4" width="32" height="22" ${s}/><path d="M30 4v22" ${s}/></svg>`;
  }
  if (k === 'tall' || k === 'tallFridge' || k === 'tallOven' || k === 'fridgeFree')
    return `<svg viewBox="0 0 60 40"><rect x="20" y="2" width="20" height="36" ${s}/><path d="M20 ${k === 'tallOven' ? 16 : 22}h20M${k === 'tallOven' ? '23 18h14v9H23z' : '36 26v6'}" ${s}/></svg>`;
  if (k === 'table') return `<svg viewBox="0 0 60 40"><path d="M6 16h48M10 16v20M50 16v20" ${s}/></svg>`;
  if (k === 'stool') return `<svg viewBox="0 0 60 40"><path d="M22 10h16M24 10l-4 26M36 10l4 26M22 26h16" ${s}/></svg>`;
  if (k === 'pendant') return `<svg viewBox="0 0 60 40"><path d="M30 0v14M18 28a12 12 0 0 1 24 0z" ${s}/><circle cx="30" cy="31" r="2" ${s}/></svg>`;
  if (k === 'panel') return `<svg viewBox="0 0 60 40"><rect x="27" y="6" width="6" height="32" ${s}/></svg>`;
  const top = '<path d="M8 12h44" stroke="currentColor" stroke-width="3"/>';
  let inner = '<path d="M30 14v22" ' + s + '/>';
  if (e.front === 'drawers' || k === 'hob' || k === 'island') inner = `<path d="M10 21h40M10 28h40" ${s}/>`;
  if (e.front === 'mixed') inner = `<path d="M10 19h40" ${s}/>`;
  if (k === 'oven') inner = `<rect x="14" y="16" width="32" height="12" ${s}/>`;
  if (k === 'dishwasher') inner = `<path d="M12 17h36" ${s}/>`;
  if (k === 'sink') inner += `<path d="M20 9q10 6 20 0" ${s}/>`;
  return `<svg viewBox="0 0 60 40">${top}<rect x="10" y="13" width="40" height="23" ${s}/>${inner}</svg>`;
}

function renderCatalog() {
  const groups = [...new Set(CATALOG.map((c) => c.group))];
  $('#catalog').innerHTML = groups
    .map(
      (g) => `<div class="cat-group"><h3>${g}</h3><div class="catalog">${CATALOG.filter((c) => c.group === g)
        .map((c) => `<button class="cat-item" data-type="${c.id}">${catalogIcon(c)}<span>${c.name}</span><small>${c.width} × ${c.depth} × ${c.height} cm</small></button>`)
        .join('')}</div></div>`,
    )
    .join('');
  document.querySelectorAll<HTMLElement>('.cat-item').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.cat-item').forEach((x) => x.classList.toggle('on', x === b));
      if ($('#main').classList.contains('v-3d')) ($('#viewMode button[data-v="split"]') as HTMLElement).click();
      plan.setTool('place', b.dataset.type!);
    }),
  );
}
renderCatalog();

// ---------------------------------------------------------------------------
// Materialien

const SLOT_ORDER: MaterialSlot[] = ['front', 'carcass', 'countertop', 'handle', 'channel', 'sink', 'backsplash', 'floor', 'wall', 'ceiling'];

/** Anzeigename eines Bereichsmaterials (berücksichtigt „wie Fronten“) */
function slotLabel(p: Project, slot: MaterialSlot, override?: string, frontOverride?: string) {
  const m = slotMaterialDef(p, slot, override, frontOverride);
  const id = override ?? p.slots[slot];
  return { m, name: id === MATCH_FRONT ? `Wie Fronten (${m.name})` : m.name };
}

function renderMaterialsTab() {
  const p = store.project;
  $('#slots').innerHTML = SLOT_ORDER.map((slot) => {
    const { m, name } = slotLabel(p, slot);
    const hint = slot === 'channel' && !p.settings.handleless ? ' · nur bei grifflos' : slot === 'handle' && p.settings.handleless ? ' · grifflos aktiv' : '';
    const uvOn = p.uv?.[slot] && Object.keys(p.uv[slot]!).length;
    return `<div class="slot" data-slot="${slot}"><span class="sw" style="${swatchStyle(m)}"></span><div><b>${SLOT_LABELS[slot]}</b><small>${esc(name)}${hint}</small></div><span class="slot-btns"><button class="btn mini ${hasAdjust(m.adjust) ? 'on' : ''}" data-slot-adj="${slot}" title="Farbe anpassen: Farbton, Sättigung, Helligkeit, Tönung, Glanz">${ICON.palette}</button>${isTextured(m) ? `<button class="btn mini ${uvOn ? 'on' : ''}" data-slot-uv="${slot}" title="Textur ausrichten: Drehung in Grad, Größe, Verschiebung, Strecken">${ICON.rotate}</button>` : ''}</span></div>`;
  }).join('');
  document.querySelectorAll<HTMLElement>('[data-slot-adj]').forEach((b) =>
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openAdjustDialog(b.dataset.slotAdj as MaterialSlot);
    }),
  );
  document.querySelectorAll<HTMLElement>('[data-slot-uv]').forEach((b) =>
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openUVDialog(projectUVTarget(b.dataset.slotUv as MaterialSlot));
    }),
  );
  document.querySelectorAll<HTMLElement>('.slot').forEach((el) =>
    el.addEventListener('click', () => {
      const slot = el.dataset.slot as MaterialSlot;
      openMaterialPicker(`${SLOT_LABELS[slot]} – Material wählen`, p.slots[slot], false, async (id) => {
        if (!id) return;
        const proj = store.project;
        proj.slots[slot] = id;
        // Elemente mit eigener Abweichung in diesem Bereich: mit umstellen?
        const deviating = proj.items.filter((i) => i.materials?.[slot]);
        if (deviating.length) {
          const choice = await askChoice(
            `${SLOT_LABELS[slot]} ändern`,
            `<p>${deviating.length} Element${deviating.length > 1 ? 'e haben' : ' hat'} ein eigenes Material für „${SLOT_LABELS[slot]}“.</p><p class="hint">Sollen diese ebenfalls auf „${esc(slotLabel(proj, slot).name)}“ umgestellt werden?</p>`,
            [
              { id: 'keep', label: 'Abweichungen behalten' },
              { id: 'all', label: `Alle ${SLOT_LABELS[slot]} umstellen`, primary: true },
            ],
          );
          if (choice === 'all') deviating.forEach((i) => delete i.materials![slot]);
        }
        store.commit();
      }, slot);
    }),
  );
  $('#customMats').innerHTML = p.customMaterials
    .map((m) => `<div class="mat-card" data-id="${m.id}"><span class="sw" style="${swatchStyle(m)}"></span><span>${esc(m.name)}</span><button class="del" title="Löschen">✕</button></div>`)
    .join('');
  document.querySelectorAll<HTMLElement>('#customMats .mat-card').forEach((el) => {
    el.addEventListener('click', () => {
      const m = store.project.customMaterials.find((x) => x.id === el.dataset.id);
      if (m) (m.image ? openUploadDialog(m) : openColorDialog(m));
    });
    el.querySelector('.del')!.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCustomMaterial(el.dataset.id!);
    });
  });
}

function deleteCustomMaterial(id: string) {
  const p = store.project;
  if (!confirm('Eigenes Material löschen? Verwendungen werden auf Standard zurückgesetzt.')) return;
  p.customMaterials = p.customMaterials.filter((m) => m.id !== id);
  for (const s of SLOT_ORDER) if (p.slots[s] === id) p.slots[s] = LIBRARY[0].id;
  for (const it of p.items) if (it.materials) for (const k of Object.keys(it.materials) as MaterialSlot[]) if (it.materials[k] === id) delete it.materials[k];
  store.commit();
  renderMaterialsTab();
}

$('#uploadMaterial').addEventListener('click', () => openUploadDialog());
$('#colorMaterial').addEventListener('click', () => openColorDialog());
$('#libraryMaterial').addEventListener('click', () => openLibraryDialog());

function modal(title: string, body: string, footer = '') {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="btn icon" data-close>✕</button></header><div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  back.querySelector('[data-close]')!.addEventListener('click', close);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
  return { el: back, close };
}

/** Materialauswahl; bei allowDefault kann "Standard" (= null) gewählt werden */
function openMaterialPicker(title: string, current: string | undefined, allowDefault: boolean, onPick: (id: string | null) => void, slotHint?: MaterialSlot) {
  const p = store.project;
  const preferred: Partial<Record<MaterialSlot, MaterialDef['category'][]>> = {
    front: ['lack', 'holz', 'stein', 'metall'],
    carcass: ['lack', 'holz'],
    countertop: ['stein', 'holz', 'metall', 'lack'],
    handle: ['metall'],
    sink: ['stein', 'metall'],
    channel: ['metall', 'lack'],
    backsplash: ['fliese', 'stein', 'lack', 'metall'],
    floor: ['boden', 'stein', 'holz'],
    wall: ['wand', 'fliese', 'lack'],
    ceiling: ['wand'],
  };
  const order = (slotHint && preferred[slotHint]) || [];
  const cats = [...new Set([...(p.customMaterials.length ? ['eigene' as const] : []), ...order, ...(Object.keys(CATEGORY_LABELS) as MaterialDef['category'][])])].filter(
    (c) => c !== 'eigene' || p.customMaterials.length,
  );
  const all = allMaterials(p);
  const body =
    `<div class="mat-grid" style="margin-bottom:8px"><button class="mat-card upload color-card" data-library>${ICON.globe}<span>Online-Bibliothek…</span></button><button class="mat-card upload color-card" data-color>${ICON.palette}<span>Eigene Farbe mischen…</span></button></div>` +
    (slotHint === 'channel'
      ? `<div class="mat-grid" style="margin-bottom:8px"><button class="mat-card ${current === MATCH_FRONT ? 'on' : ''}" data-id="${MATCH_FRONT}"><span class="sw" style="${swatchStyle(slotMaterialDef(p, 'front'))}"></span><span>Wie Fronten</span></button></div>`
      : '') +
    (allowDefault ? `<div class="mat-grid" style="margin-bottom:8px"><button class="mat-card ${!current ? 'on' : ''}" data-id=""><span class="sw" style="background:repeating-linear-gradient(45deg,var(--panel-2) 0 6px,var(--line) 6px 12px)"></span><span>Standard (Projekt)</span></button></div>` : '') +
    cats
      .map((c) => {
        const mats = all.filter((m) => m.category === c);
        if (!mats.length) return '';
        return `<h3>${CATEGORY_LABELS[c]}</h3><div class="mat-grid">${mats
          .map((m) => `<button class="mat-card ${m.id === current ? 'on' : ''}" data-id="${m.id}"><span class="sw" style="${swatchStyle(m)}"></span><span>${esc(m.name)}</span></button>`)
          .join('')}</div>`;
      })
      .join('') +
    `<h3>Eigene Textur</h3><div class="mat-grid"><button class="mat-card upload" data-upload>${ICON.image}<span>Textur hochladen…</span></button></div>`;
  const m = modal(title, body);
  m.el.querySelectorAll<HTMLElement>('.mat-card[data-id]').forEach((b) =>
    b.addEventListener('click', () => {
      onPick(b.dataset.id || null);
      m.close();
    }),
  );
  m.el.querySelector('[data-upload]')!.addEventListener('click', () => {
    m.close();
    openUploadDialog(undefined, (id) => onPick(id));
  });
  m.el.querySelector('[data-color]')!.addEventListener('click', () => {
    m.close();
    openColorDialog(undefined, (id) => onPick(id));
  });
  m.el.querySelector('[data-library]')!.addEventListener('click', () => {
    m.close();
    openLibraryDialog((id) => onPick(id), slotHint);
  });
}

function findMaterialName(id: string) {
  return allMaterials(store.project).find((m) => m.id === id)?.name ?? id;
}

/** Auswahldialog mit mehreren Schaltflächen; liefert die ID oder null bei Abbruch */
function askChoice(title: string, body: string, options: { id: string; label: string; primary?: boolean }[]): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const m = modal(
      title,
      body,
      `<button class="btn" data-choice="">Abbrechen</button>${options.map((o) => `<button class="btn ${o.primary ? 'primary' : ''}" data-choice="${o.id}">${esc(o.label)}</button>`).join('')}`,
    );
    m.el.querySelector('.modal')!.classList.add('narrow');
    m.el.querySelectorAll<HTMLElement>('[data-choice]').forEach((b) =>
      b.addEventListener('click', () => {
        m.close();
        finish(b.dataset.choice || null);
      }),
    );
    new MutationObserver((_, obs) => {
      if (!m.el.isConnected) {
        obs.disconnect();
        finish(null);
      }
    }).observe(document.body, { childList: true });
  });
}

// ---------------------------------------------------------------------------
// Textur ausrichten (je Element)

/** Ziel eines Ausrichten-Dialogs: ein Element (bzw. Arbeitsplattenzeile) oder ein Projektbereich */
interface UVTarget {
  def: MaterialDef;
  scope: string;
  /** geerbte Einstellungen (Projekt) – nur zur Anzeige */
  base?: UVSettings;
  get(): UVSettings | undefined;
  set(s: UVSettings | undefined): void;
}

function itemUVTarget(it: Item, slot: MaterialSlot): UVTarget {
  const p = store.project;
  const def = slotMaterialDef(p, slot, it.materials?.[slot], it.materials?.front);
  // Arbeitsplatte/Rückwand: Einstellung gilt für die ganze zusammenhängende Zeile
  const run = slot === 'countertop' || slot === 'backsplash' ? countertopRuns(p).get(it.id) : undefined;
  const ids = run?.ids ?? [it.id];
  return {
    def,
    base: p.uv?.[slot],
    scope:
      run && run.ids.length > 1
        ? `Gilt für die gesamte Arbeitsplatte dieser Zeile (${run.ids.length} Schränke, ${Math.round((run.u1 - run.u0) * 100)} × ${Math.round((run.v1 - run.v0) * 100)} cm).`
        : `Gilt nur für ${esc(getEntry(it.type).name)}.`,
    get: () => store.item(it.id)?.uv?.[slot],
    set: (v) => {
      for (const id of ids) {
        const t = store.item(id);
        if (!t) continue;
        t.uv = { ...(t.uv ?? {}) };
        if (v) t.uv[slot] = { ...v };
        else delete t.uv[slot];
      }
    },
  };
}

function projectUVTarget(slot: MaterialSlot): UVTarget {
  const p = store.project;
  const area = slot === 'floor' ? 'den ganzen Boden' : slot === 'wall' ? 'alle Wände' : slot === 'ceiling' ? 'die Decke' : `alle Elemente (${SLOT_LABELS[slot]})`;
  return {
    def: slotMaterialDef(p, slot),
    scope: `Gilt für ${area}${['floor', 'wall', 'ceiling'].includes(slot) ? '' : ' – einzelne Elemente können abweichen'}.`,
    get: () => store.project.uv?.[slot],
    set: (v) => {
      const proj = store.project;
      proj.uv = { ...(proj.uv ?? {}) };
      if (v) proj.uv[slot] = { ...v };
      else delete proj.uv[slot];
    },
  };
}

function openUVDialog(target: UVTarget) {
  const def = target.def;
  const original = target.get();
  const s: UVSettings = { ...(original ?? {}) };
  const eff = () => ({ ...(target.base ?? {}), ...s });
  const mode = () => eff().mode ?? def.mapping ?? 'tile';
  const baseRot = def.rotation ?? (def.rotate ? 90 : 0);
  const body = `
    <p class="hint">${esc(def.name)} · ${target.scope}</p>
    <div class="field"><span>Darstellung</span>
      <div class="seg mode-seg"><button type="button" data-m="stretch">Einmal auf ganze Fläche strecken</button><button type="button" data-m="tile">Wiederholen (Kacheln)</button></div>
    </div>
    <label class="field"><span>Größe <b id="uvScaleV"></b></span><input type="range" id="uvScale" min="-2" max="2" step="0.01" /></label>
    <div class="field"><span>Drehung${baseRot ? ` <small>(zusätzlich zur Materialdrehung ${baseRot}°)</small>` : ''}</span>
      <div class="rot-row">
        <input type="range" id="uvRot" min="-180" max="180" step="1" />
        <span class="unit" data-unit="°"><input type="number" id="uvRotN" min="-360" max="360" step="0.5" /></span>
      </div>
      <div class="chips">${[-90, -45, 0, 45, 90, 180].map((r) => `<button type="button" data-r="${r}">${r}°</button>`).join('')}</div>
    </div>
    <div class="grid2">
      <label class="field"><span>Verschieben ↔ <b id="uvXV"></b></span><input type="range" id="uvX" min="-50" max="50" step="0.5" /></label>
      <label class="field"><span>Verschieben ↕ <b id="uvYV"></b></span><input type="range" id="uvY" min="-50" max="50" step="0.5" /></label>
    </div>
    <p class="hint">Änderungen sind sofort sichtbar – die Ansicht bleibt bedienbar. „Wiederholen“ nutzt die reale Bildgröße des Materials; „Strecken“ passt das Bild genau einmal auf die Fläche ein.</p>`;
  const m = modal('Textur ausrichten', body, `<button class="btn" data-reset>Zurücksetzen</button><span class="spacer"></span><button class="btn" data-cancel>Abbrechen</button><button class="btn primary" data-ok>Fertig</button>`);
  m.el.querySelector('.modal')!.classList.add('narrow');
  // Dialog blockiert die Ansicht nicht: 3D/2D bleiben bedienbar (Kamera drehen, rendern …)
  m.el.classList.add('see-through');
  const el = m.el;
  const scale = $<HTMLInputElement>('#uvScale', el);
  const rot = $<HTMLInputElement>('#uvRot', el);
  const rotN = $<HTMLInputElement>('#uvRotN', el);
  const ox = $<HTMLInputElement>('#uvX', el);
  const oy = $<HTMLInputElement>('#uvY', el);

  const apply = () => {
    const clean: UVSettings = {};
    if (s.mode) clean.mode = s.mode;
    if (s.scale !== undefined && Math.abs(s.scale - 1) > 0.001) clean.scale = s.scale;
    if (s.rotation) clean.rotation = s.rotation;
    if (s.offsetX) clean.offsetX = s.offsetX;
    if (s.offsetY) clean.offsetY = s.offsetY;
    target.set(Object.keys(clean).length ? clean : undefined);
    store.emit();
  };
  const sync = () => {
    const e = eff();
    el.querySelectorAll<HTMLElement>('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === mode()));
    const r = e.rotation ?? 0;
    el.querySelectorAll<HTMLElement>('[data-r]').forEach((b) => b.classList.toggle('on', +b.dataset.r! === r));
    rot.value = String(((((r + 180) % 360) + 360) % 360) - 180);
    if (document.activeElement !== rotN) rotN.value = String(r);
    scale.value = String(Math.log2(e.scale ?? 1));
    $('#uvScaleV', el).textContent = `${Math.round((e.scale ?? 1) * 100)} %`;
    ox.value = String(e.offsetX ?? 0);
    oy.value = String(e.offsetY ?? 0);
    $('#uvXV', el).textContent = `${e.offsetX ?? 0} %`;
    $('#uvYV', el).textContent = `${e.offsetY ?? 0} %`;
  };
  const change = (fn: () => void) => () => {
    fn();
    sync();
    apply();
  };
  el.querySelectorAll<HTMLElement>('[data-m]').forEach((b) => b.addEventListener('click', change(() => (s.mode = b.dataset.m as UVSettings['mode']))));
  el.querySelectorAll<HTMLElement>('[data-r]').forEach((b) => b.addEventListener('click', change(() => (s.rotation = +b.dataset.r!))));
  rot.addEventListener('input', change(() => (s.rotation = +rot.value)));
  rotN.addEventListener('input', change(() => (s.rotation = Math.max(-360, Math.min(360, +rotN.value || 0)))));
  scale.addEventListener('input', change(() => (s.scale = Math.round(2 ** +scale.value * 100) / 100)));
  ox.addEventListener('input', change(() => (s.offsetX = +ox.value)));
  oy.addEventListener('input', change(() => (s.offsetY = +oy.value)));
  el.querySelector('[data-reset]')!.addEventListener(
    'click',
    change(() => {
      for (const k of Object.keys(s) as (keyof UVSettings)[]) delete s[k];
    }),
  );
  let cancelled = false;
  el.querySelector('[data-ok]')!.addEventListener('click', () => m.close());
  el.querySelector('[data-cancel]')!.addEventListener('click', () => {
    cancelled = true;
    m.close();
  });
  // Schließen über „Fertig“, ✕ oder Esc übernimmt die Einstellungen – nur „Abbrechen“ verwirft
  new MutationObserver((_, obs) => {
    if (!el.isConnected) {
      obs.disconnect();
      if (cancelled) {
        target.set(original);
        store.emit();
      } else store.commit();
    }
  }).observe(document.body, { childList: true });
  sync();
}

// ---------------------------------------------------------------------------
// Online-Bibliothek (Poly Haven, ambientCG)

interface LibraryHit {
  source: 'polyhaven' | 'ambientcg';
  id: string;
  name: string;
  thumb: string;
  categories: string[];
  sizeCm?: number;
}

const LIB_CHIPS: [string, string][] = [
  ['Holz', 'wood'], ['Boden', 'floor'], ['Parkett', 'parquet'], ['Fliesen', 'tiles'], ['Marmor', 'marble'], ['Stein', 'stone'],
  ['Granit', 'granite'], ['Beton', 'concrete'], ['Terrazzo', 'terrazzo'], ['Putz', 'plaster'], ['Ziegel', 'brick'], ['Metall', 'metal'],
  ['Stoff', 'fabric'], ['Leder', 'leather'],
];
const SLOT_QUERY: Partial<Record<MaterialSlot, string>> = { floor: 'floor', countertop: 'marble', backsplash: 'tiles', wall: 'plaster', front: 'wood' };
let libState = { source: 'polyhaven' as LibraryHit['source'], q: '', res: '2k' };

async function libApi<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch('/api' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `Fehler ${r.status}`);
  return d as T;
}

function openLibraryDialog(onPicked?: (id: string) => void, slotHint?: MaterialSlot) {
  if (!account.user) {
    toast('Für die Online-Bibliothek bitte anmelden – importierte Texturen werden auf dem Server gespeichert.');
    account.openLogin();
    return;
  }
  if (!libState.q && slotHint && SLOT_QUERY[slotHint]) libState.q = SLOT_QUERY[slotHint]!;
  const body = `
    <div class="lib-bar">
      <div class="seg lib-src"><button data-src="polyhaven">Poly Haven</button><button data-src="ambientcg">ambientCG</button></div>
      <form class="lib-search"><input type="text" id="libQ" placeholder="Suchen (englisch, z. B. oak, marble, tiles)" /><button class="btn primary" type="submit">Suchen</button></form>
      <select id="libRes" title="Auflösung der Texturen"><option value="1k">1K (schnell)</option><option value="2k">2K (detailreich)</option></select>
    </div>
    <div class="chips lib-chips">${LIB_CHIPS.map(([l, q]) => `<button data-q="${q}">${l}</button>`).join('')}</div>
    <div id="libResults" class="lib-grid"></div>
    <div class="lib-more"><button class="btn" id="libMore" hidden>Weitere laden</button></div>
    <p class="hint">Alle Materialien sind CC0 (gemeinfrei). Beim Import werden Farbe, Relief (Normal Map) und Rauheit einmalig auf den Server geladen; die reale Größe wird übernommen.</p>`;
  const m = modal('Online-Bibliothek', body);
  m.el.querySelector('.modal')!.classList.add('wide');
  const el = m.el;
  const qIn = $<HTMLInputElement>('#libQ', el);
  const resSel = $<HTMLSelectElement>('#libRes', el);
  const results = $('#libResults', el);
  const more = $<HTMLButtonElement>('#libMore', el);
  qIn.value = libState.q;
  resSel.value = libState.res;
  let offset = 0;
  let total = 0;
  let seq = 0;

  const card = (h: LibraryHit) =>
    `<button class="lib-card" data-id="${esc(h.id)}" data-src="${h.source}" title="${esc(h.name)}">
      <img src="${esc(h.thumb)}" loading="lazy" alt="" />
      <span>${esc(h.name)}</span><small>${h.sizeCm ? `${h.sizeCm} cm` : '&nbsp;'}</small>
    </button>`;

  const load = async (append = false) => {
    const my = ++seq;
    if (!append) {
      offset = 0;
      results.innerHTML = '<p class="hint">Suche …</p>';
    }
    more.hidden = true;
    try {
      const r = await libApi<{ total: number; hits: LibraryHit[] }>(`/library/search?source=${libState.source}&q=${encodeURIComponent(libState.q)}&limit=48&offset=${offset}`);
      if (my !== seq) return;
      total = r.total;
      if (!append) results.innerHTML = '';
      if (!r.hits.length && !append) results.innerHTML = '<p class="hint">Keine Treffer. Tipp: englische Begriffe verwenden (wood, oak, marble, tiles, concrete …).</p>';
      results.insertAdjacentHTML('beforeend', r.hits.map(card).join(''));
      offset += r.hits.length;
      more.hidden = offset >= total;
    } catch (e) {
      if (my === seq) results.innerHTML = `<p class="form-error">${esc((e as Error).message)}</p>`;
    }
  };

  const syncSrc = () => el.querySelectorAll<HTMLElement>('[data-src]').forEach((b) => b.classList.toggle('on', b.dataset.src === libState.source && b.tagName === 'BUTTON' && !b.classList.contains('lib-card')));
  el.querySelectorAll<HTMLElement>('.lib-src [data-src]').forEach((b) =>
    b.addEventListener('click', () => {
      libState.source = b.dataset.src as LibraryHit['source'];
      syncSrc();
      load();
    }),
  );
  el.querySelector('.lib-search')!.addEventListener('submit', (e) => {
    e.preventDefault();
    libState.q = qIn.value.trim();
    load();
  });
  el.querySelectorAll<HTMLElement>('[data-q]').forEach((b) =>
    b.addEventListener('click', () => {
      libState.q = qIn.value = b.dataset.q!;
      load();
    }),
  );
  resSel.addEventListener('change', () => (libState.res = resSel.value));
  more.addEventListener('click', () => load(true));

  results.addEventListener('click', async (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.lib-card');
    if (!c || c.classList.contains('busy')) return;
    c.classList.add('busy');
    try {
      const t = await libApi<{
        source: string; id: string; res: string; name: string; image: string; normalImage?: string; roughnessImage?: string; thumb: string; sizeCm: number; categories: string[]; metal: boolean;
      }>('/library/import', { source: c.dataset.src, id: c.dataset.id, res: libState.res });
      const p = store.project;
      const id = `lib-${t.source}-${t.id}-${t.res}`;
      let def = p.customMaterials.find((x) => x.id === id);
      if (!def) {
        def = {
          id,
          name: t.name,
          category: 'eigene',
          color: '#ffffff',
          roughness: t.roughnessImage ? 1 : 0.5,
          metalness: t.metal ? 1 : 0,
          image: t.image,
          normalImage: t.normalImage,
          roughnessImage: t.roughnessImage,
          thumb: t.thumb,
          aspect: 1,
          tileSize: Math.max(5, t.sizeCm || 100),
          mapping: 'tile',
          bump: 1,
          source: t.source === 'polyhaven' ? 'Poly Haven' : 'ambientCG',
        };
        p.customMaterials.push(def);
        store.commit();
      }
      m.close();
      renderMaterialsTab();
      toast(`„${def.name}“ importiert (${def.source}, ${def.tileSize} cm).`);
      if (onPicked) onPicked(def.id);
      else {
        const slot = await askChoice(
          `„${def.name}“ verwenden für …`,
          '<p class="hint">Das Material ist unter „Eigene Oberflächen“ gespeichert. Wo soll es verwendet werden?</p>',
          SLOT_ORDER.map((sl) => ({ id: sl, label: SLOT_LABELS[sl] })),
        );
        if (slot) {
          store.project.slots[slot as MaterialSlot] = def.id;
          store.commit();
        }
      }
    } catch (err) {
      toast('Import fehlgeschlagen: ' + (err as Error).message);
    } finally {
      c.classList.remove('busy');
    }
  });

  syncSrc();
  load();
}

// ---------------------------------------------------------------------------
// Material farblich anpassen

/**
 * Passt das Material eines Bereichs an (Projekt oder ein Element).
 * Eingebaute Materialien werden dabei als „… (angepasst)“ kopiert, eigene direkt geändert.
 */
function openAdjustDialog(slot: MaterialSlot, item?: Item) {
  const p = store.project;
  const rawId = item?.materials?.[slot] ?? p.slots[slot];
  const base = slotMaterialDef(p, slot, item?.materials?.[slot], item?.materials?.front);
  const isCustom = p.customMaterials.some((m) => m.id === base.id);
  // Arbeitskopie bzw. Original sichern
  const backup = JSON.parse(JSON.stringify({ def: isCustom ? base : null, slots: p.slots, itemMats: item?.materials ?? null }));
  let def: MaterialDef;
  if (isCustom) def = base;
  else {
    def = { ...JSON.parse(JSON.stringify(base)), id: 'adj-' + uid(), name: `${base.name} (angepasst)`, category: 'eigene' };
    p.customMaterials.push(def);
    if (item) item.materials = { ...(item.materials ?? {}), [slot]: def.id };
    else p.slots[slot] = def.id;
    // „wie Fronten“ (Griffmulden) folgt automatisch, wenn die Front angepasst wird
    void rawId;
  }
  const a: ColorAdjust = { ...(def.adjust ?? {}) };
  const textured = isTextured(def);
  const body = `
    <p class="hint">${esc(base.name)} · ${item ? `nur ${esc(getEntry(item.type).name)}` : `Bereich „${SLOT_LABELS[slot]}“ im ganzen Projekt`}${isCustom ? '' : ' – es wird eine angepasste Kopie angelegt, das Original bleibt erhalten'}.</p>
    <div class="adj-layout">
      <canvas class="adj-preview" width="200" height="200"></canvas>
      <div>
        <label class="field"><span>Farbton <b data-v="hue"></b></span><input type="range" data-a="hue" min="-180" max="180" step="1" class="hue-range" /></label>
        <label class="field"><span>Sättigung <b data-v="saturation"></b></span><input type="range" data-a="saturation" min="-100" max="100" step="1" /></label>
        <label class="field"><span>Helligkeit <b data-v="brightness"></b></span><input type="range" data-a="brightness" min="-100" max="100" step="1" /></label>
        <label class="field"><span>Kontrast <b data-v="contrast"></b></span><input type="range" data-a="contrast" min="-100" max="100" step="1" /></label>
        <div class="field"><span>Einfärben (Farbe wählen) <b data-v="tintAmount"></b></span>
          <div class="rot-row"><input type="color" id="adjTint" style="width:44px;flex:none" /><input type="range" data-a="tintAmount" min="0" max="100" step="1" /></div>
        </div>
        <label class="field"><span>Oberfläche: matt ↔ glänzend <b id="adjGlossV"></b></span><input type="range" id="adjGloss" min="0" max="1" step="0.01" /></label>
      </div>
    </div>
    <p class="hint">Die Vorschau links reagiert sofort, die 3D-Ansicht beim Loslassen des Reglers.</p>`;
  const m = modal('Material anpassen', body, `<button class="btn" data-reset>Zurücksetzen</button><span class="spacer"></span><button class="btn" data-cancel>Abbrechen</button><button class="btn primary" data-ok>Übernehmen</button>`);
  m.el.classList.add('see-through');
  const el = m.el;
  const canvas = el.querySelector<HTMLCanvasElement>('.adj-preview')!;
  const ctx = canvas.getContext('2d')!;
  const tintIn = $<HTMLInputElement>('#adjTint', el);
  const gloss = $<HTMLInputElement>('#adjGloss', el);
  const origRough = def.roughness;

  // Vorschau-Quelle: Bild, prozedurale Textur oder Farbfläche
  let src: (CanvasImageSource & { width: number; height: number }) | null = null;
  if (def.image) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const side = Math.min(img.width, img.height);
      c.width = c.height = 200;
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 200, 200);
      src = c;
      draw();
    };
    img.src = def.thumb && !def.image.startsWith('data:') ? def.image : def.image;
  } else if (def.procedural) {
    const sw = document.createElement('div');
    sw.setAttribute('style', swatchStyle({ ...def, adjust: undefined }));
    const url = /url\((.*)\)/.exec(sw.style.backgroundImage)?.[1]?.replace(/"/g, '');
    if (url) {
      const img = new Image();
      img.onload = () => {
        src = img;
        draw();
      };
      img.src = url;
    }
  }
  function draw() {
    if (textured && src) ctx.drawImage(adjustCanvas(src, a, 200), 0, 0, 200, 200);
    else {
      ctx.fillStyle = adjustHex(def.color, a);
      ctx.fillRect(0, 0, 200, 200);
    }
    // Glanzeindruck
    const r = def.roughness;
    const grad = ctx.createLinearGradient(0, 0, 200, 200);
    grad.addColorStop(0, `rgba(255,255,255,${(1 - r) * 0.45})`);
    grad.addColorStop(0.45, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 200, 200);
  }
  const sync = () => {
    el.querySelectorAll<HTMLInputElement>('[data-a]').forEach((inp) => {
      const k = inp.dataset.a as keyof ColorAdjust;
      inp.value = String((a[k] as number) ?? 0);
      const v = (a[k] as number) ?? 0;
      el.querySelector(`[data-v="${k}"]`)!.textContent = k === 'hue' ? `${v}°` : `${v > 0 && k !== 'tintAmount' ? '+' : ''}${v} %`;
    });
    tintIn.value = a.tint ?? '#c8a46e';
    gloss.value = String(1 - def.roughness);
    $('#adjGlossV', el).textContent = def.roughness >= 0.55 ? 'matt' : def.roughness >= 0.2 ? 'seidenmatt' : 'glänzend';
    draw();
  };
  const apply3D = () => {
    def.adjust = hasAdjust(a) ? { ...a } : undefined;
    store.emit();
  };
  el.querySelectorAll<HTMLInputElement>('[data-a]').forEach((inp) => {
    inp.addEventListener('input', () => {
      (a as Record<string, number>)[inp.dataset.a!] = +inp.value;
      if (inp.dataset.a === 'tintAmount' && !a.tint) a.tint = tintIn.value;
      sync();
    });
    inp.addEventListener('change', apply3D);
  });
  tintIn.addEventListener('input', () => {
    a.tint = tintIn.value;
    if (!a.tintAmount) a.tintAmount = 100;
    sync();
  });
  tintIn.addEventListener('change', apply3D);
  gloss.addEventListener('input', () => {
    def.roughness = Math.round((1 - +gloss.value) * 100) / 100;
    if (def.roughnessImage) def.roughness = Math.max(0.05, def.roughness);
    sync();
  });
  gloss.addEventListener('change', apply3D);
  el.querySelector('[data-reset]')!.addEventListener('click', () => {
    for (const k of Object.keys(a) as (keyof ColorAdjust)[]) delete a[k];
    def.roughness = origRough;
    sync();
    apply3D();
  });
  let cancelled = false;
  el.querySelector('[data-cancel]')!.addEventListener('click', () => {
    cancelled = true;
    m.close();
  });
  el.querySelector('[data-ok]')!.addEventListener('click', () => m.close());
  new MutationObserver((_, obs) => {
    if (el.isConnected) return;
    obs.disconnect();
    const proj = store.project;
    if (cancelled) {
      if (isCustom) Object.assign(def, backup.def);
      else {
        proj.customMaterials = proj.customMaterials.filter((x) => x.id !== def.id);
        proj.slots = backup.slots;
        if (item) item.materials = backup.itemMats ?? undefined;
      }
      store.emit();
    } else {
      def.adjust = hasAdjust(a) ? { ...a } : undefined;
      store.commit();
      renderMaterialsTab();
    }
  }).observe(document.body, { childList: true });
  sync();
}

// ---------------------------------------------------------------------------
// Eigene Farbe (Farbrad)

const FINISHES = {
  matt: { label: 'Matt', roughness: 0.7, clearcoat: 0 },
  normal: { label: 'Normal (seidenmatt)', roughness: 0.4, clearcoat: 0 },
  gloss: { label: 'Hochglanz', roughness: 0.08, clearcoat: 1 },
} as const;
type Finish = keyof typeof FINISHES;

function finishOf(def: MaterialDef): Finish {
  if ((def.clearcoat ?? 0) > 0.5 || def.roughness < 0.2) return 'gloss';
  return def.roughness >= 0.55 ? 'matt' : 'normal';
}

function hsvToHex(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function hexToHsv(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function openColorDialog(existing?: MaterialDef, onCreated?: (id: string) => void) {
  const def: MaterialDef = existing
    ? { ...existing }
    : { id: 'color-' + uid(), name: '', category: 'eigene', color: '#e9e2d2', roughness: 0.4, metalness: 0, clearcoat: 0, tileSize: 100 };
  let finish: Finish = finishOf(def);
  let hsv = hexToHsv(def.color);
  const SIZE = 220;
  const body = `
  <div class="color-layout">
    <div class="wheel-wrap">
      <canvas class="wheel" width="${SIZE * 2}" height="${SIZE * 2}" style="width:${SIZE}px;height:${SIZE}px"></canvas>
      <span class="wheel-dot"></span>
    </div>
    <div class="color-side">
      <label class="field"><span>Helligkeit</span><input type="range" id="cBright" min="0" max="1" step="0.005" /></label>
      <div class="grid2">
        <label class="field"><span>Hex-Code</span><input type="text" id="cHex" maxlength="7" spellcheck="false" /></label>
        <label class="field"><span>Farbwähler</span><input type="color" id="cNative" /></label>
      </div>
      <div class="field"><span>Oberfläche</span>
        <div class="seg finish-seg">${(Object.keys(FINISHES) as Finish[]).map((k) => `<button data-finish="${k}">${FINISHES[k].label}</button>`).join('')}</div>
      </div>
      <label class="field"><span>Name (optional, z. B. RAL 9001 Cremeweiß)</span><input type="text" id="cName" maxlength="80" value="${esc(existing?.name ?? '')}" /></label>
      <div class="color-preview"><span class="cp-swatch"></span><div><b id="cpTitle"></b><small id="cpSub"></small></div></div>
      ${existing ? '' : `<label class="field"><span>Direkt verwenden für</span><select id="cSlot"><option value="">– nur speichern –</option>${SLOT_ORDER.map((s) => `<option value="${s}" ${s === 'front' && !onCreated ? 'selected' : ''}>${SLOT_LABELS[s]}</option>`).join('')}</select></label>`}
    </div>
  </div>`;
  const m = modal(existing ? 'Eigene Farbe bearbeiten' : 'Eigene Farbe mischen', body, `<button class="btn" data-cancel>Abbrechen</button><button class="btn primary" data-ok>${existing ? 'Übernehmen' : 'Speichern'}</button>`);
  const el = m.el;
  const canvas = el.querySelector<HTMLCanvasElement>('.wheel')!;
  const dot = el.querySelector<HTMLElement>('.wheel-dot')!;
  const bright = $<HTMLInputElement>('#cBright', el);
  const hexIn = $<HTMLInputElement>('#cHex', el);
  const native = $<HTMLInputElement>('#cNative', el);
  const ctx = canvas.getContext('2d')!;

  const drawWheel = () => {
    const n = canvas.width;
    const img = ctx.createImageData(n, n);
    const r = n / 2;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = x - r + 0.5, dy = y - r + 0.5;
        const d = Math.hypot(dx, dy) / r;
        const i = (y * n + x) * 4;
        if (d > 1) continue;
        const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        const c = parseInt(hsvToHex(h, d, hsv.v).slice(1), 16);
        img.data[i] = (c >> 16) & 255;
        img.data[i + 1] = (c >> 8) & 255;
        img.data[i + 2] = c & 255;
        img.data[i + 3] = d > 0.99 ? Math.round((1 - d) * 100 * 255) : 255;
      }
    ctx.putImageData(img, 0, 0);
  };

  const update = (fromHex = false) => {
    def.color = hsvToHex(hsv.h, hsv.s, hsv.v);
    if (!fromHex) hexIn.value = def.color;
    native.value = def.color;
    bright.value = String(hsv.v);
    bright.style.background = `linear-gradient(90deg, #000, ${hsvToHex(hsv.h, hsv.s, 1)})`;
    const a = (hsv.h * Math.PI) / 180;
    dot.style.left = `${SIZE / 2 + Math.cos(a) * hsv.s * (SIZE / 2)}px`;
    dot.style.top = `${SIZE / 2 + Math.sin(a) * hsv.s * (SIZE / 2)}px`;
    dot.style.background = def.color;
    const f = FINISHES[finish];
    const gloss = finish === 'gloss' ? 'linear-gradient(160deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,0) 38%), ' : finish === 'normal' ? 'linear-gradient(160deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,0) 45%), ' : '';
    el.querySelector<HTMLElement>('.cp-swatch')!.style.background = `${gloss}${def.color}`;
    $('#cpTitle', el).textContent = $<HTMLInputElement>('#cName', el).value.trim() || `Eigene Farbe ${def.color.toUpperCase()}`;
    $('#cpSub', el).textContent = `${f.label} · ${def.color.toUpperCase()}`;
    el.querySelectorAll<HTMLElement>('[data-finish]').forEach((b) => b.classList.toggle('on', b.dataset.finish === finish));
  };

  // Farbrad bedienen
  const pick = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const dx = e.clientX - r.left - r.width / 2;
    const dy = e.clientY - r.top - r.height / 2;
    hsv.h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    hsv.s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    if (hsv.v < 0.05) hsv.v = 0.6;
    update();
  };
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    pick(e);
  });
  canvas.addEventListener('pointermove', (e) => dragging && pick(e));
  canvas.addEventListener('pointerup', () => (dragging = false));
  bright.addEventListener('input', () => {
    hsv.v = +bright.value;
    drawWheel();
    update();
  });
  hexIn.addEventListener('input', () => {
    const v = hexIn.value.trim();
    const hex = /^#?[0-9a-f]{6}$/i.test(v) ? (v.startsWith('#') ? v : '#' + v).toLowerCase() : null;
    if (!hex) return;
    hsv = hexToHsv(hex);
    drawWheel();
    update(true);
  });
  native.addEventListener('input', () => {
    hsv = hexToHsv(native.value);
    drawWheel();
    update();
  });
  el.querySelectorAll<HTMLElement>('[data-finish]').forEach((b) =>
    b.addEventListener('click', () => {
      finish = b.dataset.finish as Finish;
      update();
    }),
  );
  $<HTMLInputElement>('#cName', el).addEventListener('input', () => update());
  drawWheel();
  update();

  el.querySelector('[data-cancel]')!.addEventListener('click', m.close);
  el.querySelector('[data-ok]')!.addEventListener('click', () => {
    const f = FINISHES[finish];
    def.roughness = f.roughness;
    def.clearcoat = f.clearcoat;
    def.metalness = 0;
    def.name = $<HTMLInputElement>('#cName', el).value.trim() || `Eigene Farbe ${def.color.toUpperCase()} ${f.label.split(' ')[0].toLowerCase()}`;
    delete def.image;
    delete def.procedural;
    const p = store.project;
    const idx = p.customMaterials.findIndex((x) => x.id === def.id);
    if (idx >= 0) p.customMaterials[idx] = def;
    else p.customMaterials.push(def);
    const slot = (el.querySelector('#cSlot') as HTMLSelectElement | null)?.value as MaterialSlot | '';
    if (slot) p.slots[slot] = def.id;
    store.commit();
    m.close();
    renderMaterialsTab();
    onCreated?.(def.id);
    toast(`„${def.name}“ gespeichert.`);
  });
}

function openUploadDialog(existing?: MaterialDef, onCreated?: (id: string) => void) {
  const def: MaterialDef = existing
    ? { ...existing }
    : { id: 'custom-' + uid(), name: 'Meine Oberfläche', category: 'eigene', color: '#ffffff', roughness: 0.5, metalness: 0, clearcoat: 0, tileSize: 60, bump: 1 };
  const fileRow = (key: string, label: string) =>
    `<div class="field"><span>${label}</span><div class="file-row"><button class="btn" data-pick="${key}">Datei wählen</button><span class="name" data-name="${key}">–</span><button class="btn icon" data-clear="${key}" title="Entfernen">✕</button></div></div>`;
  const body = `
  <div class="upload-layout">
    <div>
      <div class="upload-preview" id="upPreview">Foto / Textur hierher ziehen<br>oder „Datei wählen“</div>
      <p class="hint">Tipp: Frontal fotografierte, gleichmäßig ausgeleuchtete Muster wirken am besten. Gib unten die reale Kantenlänge des Bildausschnitts an, damit Maserung und Fugen maßstabsgetreu erscheinen.</p>
    </div>
    <div>
      <label class="field"><span>Name</span><input type="text" id="upName" value="${esc(def.name)}" /></label>
      ${fileRow('image', 'Farbtextur (Albedo) *')}
      ${fileRow('normalImage', 'Normal Map (optional, Relief)')}
      ${fileRow('roughnessImage', 'Roughness Map (optional)')}
      <div class="field"><span>Darstellung auf den Flächen</span>
        <div class="seg mode-seg">
          <button type="button" data-mapping="stretch">Einmal auf ganze Fläche strecken</button>
          <button type="button" data-mapping="tile">Wiederholen (Kacheln)</button>
        </div>
        <small class="hint" id="upMapHint"></small>
      </div>
      <div class="grid2" id="upSizeRow">
        <label class="field"><span>Bildbreite real</span><span class="unit" data-unit="cm"><input type="number" id="upTile" min="1" max="2000" step="0.5" value="${def.tileSize}" /></span></label>
        <label class="field"><span>Bildhöhe real <small id="upAspect"></small></span><span class="unit" data-unit="cm"><input type="number" id="upTileH" min="1" max="2000" step="0.5" /></span></label>
      </div>
      <label class="field"><span>Drehung (Grad, Standard für alle Flächen)</span><span class="unit" data-unit="°"><input type="number" id="upRotate" min="-360" max="360" step="1" value="${def.rotation ?? (def.rotate ? 90 : 0)}" /></span></label>
      <label class="field"><span>Rauheit (matt ↔ glänzend): <b id="upRoughV">${def.roughness}</b></span><input type="range" id="upRough" min="0" max="1" step="0.01" value="${def.roughness}" /></label>
      <label class="field"><span>Metallisch: <b id="upMetalV">${def.metalness}</b></span><input type="range" id="upMetal" min="0" max="1" step="0.01" value="${def.metalness}" /></label>
      <label class="field"><span>Klarlack (Hochglanz-Schicht): <b id="upCoatV">${def.clearcoat ?? 0}</b></span><input type="range" id="upCoat" min="0" max="1" step="0.01" value="${def.clearcoat ?? 0}" /></label>
      <label class="field"><span>Reliefstärke: <b id="upBumpV">${def.bump ?? 1}</b></span><input type="range" id="upBump" min="0" max="3" step="0.05" value="${def.bump ?? 1}" /></label>
      ${existing ? '' : `<label class="field"><span>Direkt verwenden für</span><select id="upSlot"><option value="">– nur speichern –</option>${SLOT_ORDER.map((s) => `<option value="${s}">${SLOT_LABELS[s]}</option>`).join('')}</select></label>`}
    </div>
  </div>
  <input type="file" accept="image/*" id="upFile" hidden />`;
  const m = modal(existing ? 'Eigene Oberfläche bearbeiten' : 'Eigene Oberfläche hochladen', body, `<button class="btn" data-cancel>Abbrechen</button><button class="btn primary" data-ok>${existing ? 'Übernehmen' : 'Speichern'}</button>`);
  const el = m.el;
  const fileInput = $<HTMLInputElement>('#upFile', el);
  let pickKey: 'image' | 'normalImage' | 'roughnessImage' = 'image';

  // Seitenverhältnis & Darstellungsmodus
  let mapping = def.mapping ?? (existing ? 'tile' : 'stretch');
  const tileW = $<HTMLInputElement>('#upTile', el);
  const tileH = $<HTMLInputElement>('#upTileH', el);
  const aspect = () => def.aspect ?? materialAspect(def);
  const syncH = () => (tileH.value = String(Math.round((+tileW.value / aspect()) * 10) / 10));
  tileW.addEventListener('input', syncH);
  tileH.addEventListener('input', () => (tileW.value = String(Math.round(+tileH.value * aspect() * 10) / 10)));
  const syncMapping = () => {
    el.querySelectorAll<HTMLElement>('[data-mapping]').forEach((b) => b.classList.toggle('on', b.dataset.mapping === mapping));
    $('#upSizeRow', el).style.opacity = mapping === 'tile' ? '1' : '0.5';
    $('#upMapHint', el).textContent =
      mapping === 'stretch'
        ? 'Das Bild wird ohne Wiederholung auf die ganze Fläche gezogen – bei der Arbeitsplatte über die gesamte zusammenhängende Platte. Ideal für ein Foto der kompletten Platte.'
        : 'Das Bild wird in der angegebenen realen Größe wiederholt – ideal für Muster, Fliesen und Dekore.';
  };
  el.querySelectorAll<HTMLElement>('[data-mapping]').forEach((b) =>
    b.addEventListener('click', () => {
      mapping = b.dataset.mapping as typeof mapping;
      syncMapping();
    }),
  );
  syncMapping();

  const refresh = () => {
    const pv = $('#upPreview', el);
    if (def.image) {
      pv.style.backgroundImage = `url(${def.image})`;
      pv.style.backgroundSize = 'contain';
      pv.style.backgroundRepeat = 'no-repeat';
      pv.textContent = '';
    }
    const a = aspect();
    $('#upAspect', el).textContent = def.image ? `(Verhältnis ${a >= 1 ? `${Math.round(a * 100) / 100} : 1` : `1 : ${Math.round((1 / a) * 100) / 100}`})` : '';
    syncH();
    for (const k of ['image', 'normalImage', 'roughnessImage'] as const) $(`[data-name="${k}"]`, el).textContent = def[k] ? 'geladen ✓' : '–';
  };
  refresh();
  const load = async (f: File, key: typeof pickKey) => {
    if (!f.type.startsWith('image/')) return toast('Bitte eine Bilddatei wählen.');
    def[key] = await readImageFile(f, 4096, key !== 'image');
    if (key === 'image') {
      // Seitenverhältnis des Bildes ermitteln
      await new Promise<void>((res) => {
        const img = new Image();
        img.onload = () => {
          def.aspect = img.width / img.height;
          res();
        };
        img.onerror = () => res();
        img.src = def.image!;
      });
    }
    if (key === 'image' && def.name === 'Meine Oberfläche') {
      def.name = f.name.replace(/\.[^.]+$/, '');
      $<HTMLInputElement>('#upName', el).value = def.name;
    }
    refresh();
  };
  el.querySelectorAll<HTMLElement>('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      pickKey = b.dataset.pick as typeof pickKey;
      fileInput.click();
    }),
  );
  el.querySelectorAll<HTMLElement>('[data-clear]').forEach((b) =>
    b.addEventListener('click', () => {
      delete def[b.dataset.clear as typeof pickKey];
      refresh();
    }),
  );
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) load(f, pickKey);
    fileInput.value = '';
  });
  const pv = $('#upPreview', el);
  pv.addEventListener('click', () => {
    pickKey = 'image';
    fileInput.click();
  });
  pv.addEventListener('dragover', (e) => e.preventDefault());
  pv.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f) load(f, 'image');
  });
  for (const [id, label] of [['upRough', 'upRoughV'], ['upMetal', 'upMetalV'], ['upCoat', 'upCoatV'], ['upBump', 'upBumpV']]) {
    const r = $<HTMLInputElement>('#' + id, el);
    r.addEventListener('input', () => ($('#' + label, el).textContent = r.value));
  }
  el.querySelector('[data-cancel]')!.addEventListener('click', m.close);
  el.querySelector('[data-ok]')!.addEventListener('click', () => {
    if (!def.image) return toast('Bitte zuerst eine Farbtextur hochladen.');
    def.name = $<HTMLInputElement>('#upName', el).value || 'Eigene Oberfläche';
    def.tileSize = Math.max(1, +$<HTMLInputElement>('#upTile', el).value || 60);
    def.mapping = mapping;
    if (!def.aspect) def.aspect = aspect();
    def.rotation = +$<HTMLInputElement>('#upRotate', el).value || 0;
    delete def.rotate;
    def.roughness = +$<HTMLInputElement>('#upRough', el).value;
    def.metalness = +$<HTMLInputElement>('#upMetal', el).value;
    def.clearcoat = +$<HTMLInputElement>('#upCoat', el).value;
    def.bump = +$<HTMLInputElement>('#upBump', el).value;
    const p = store.project;
    const idx = p.customMaterials.findIndex((x) => x.id === def.id);
    if (idx >= 0) p.customMaterials[idx] = def;
    else p.customMaterials.push(def);
    const slot = (el.querySelector('#upSlot') as HTMLSelectElement | null)?.value as MaterialSlot | '';
    if (slot) p.slots[slot] = def.id;
    store.commit();
    m.close();
    renderMaterialsTab();
    onCreated?.(def.id);
    toast(`„${def.name}“ gespeichert.`);
  });
}

// ---------------------------------------------------------------------------
// Eigenschaften

function num(label: string, key: string, value: number, unit = 'cm', step = 1) {
  return `<div class="row"><label>${label}</label><span class="unit" data-unit="${unit}"><input type="number" data-key="${key}" value="${Math.round(value * 10) / 10}" step="${step}" /></span></div>`;
}

function renderProps() {
  const s = store.selection;
  const el = $('#props');
  const p = store.project;
  if (!s) {
    const fronts = p.items.filter((i) => ['base', 'sink', 'hob', 'oven', 'dishwasher', 'island'].includes(getEntry(i.type).kind));
    const lfm = fronts.reduce((a, i) => a + i.width, 0) / 100;
    el.innerHTML = `<h2>Projekt</h2><div class="sub">Nichts ausgewählt</div>
      <div class="stats">
        <span>Wände</span><span>${p.walls.length}</span>
        <span>Elemente</span><span>${p.items.length}</span>
        <span>Arbeitsplatte</span><span>${lfm.toFixed(2)} lfm</span>
      </div>
      <h3>So geht's</h3>
      <p class="hint">1. Raum anlegen: Maße eingeben oder Grundriss-Bild hochladen und Wände nachzeichnen.<br>2. Im Katalog Schränke wählen und an die Wände setzen.<br>3. Unter „Materialien“ Oberflächen wählen oder eigene Texturen hochladen.<br>4. In 3D „Fotorealistisch“ aktivieren und ein Bild speichern.</p>
      <h3>Tastenkürzel</h3>
      <p class="hint"><kbd>Entf</kbd> löschen · <kbd>R</kbd> drehen · <kbd>Strg</kbd>+<kbd>D</kbd> duplizieren · <kbd>Strg</kbd>+<kbd>Z</kbd> rückgängig · <kbd>Esc</kbd> Werkzeug beenden · <kbd>Alt</kbd> beim Ziehen: frei platzieren</p>`;
    return;
  }

  if (s.kind === 'item') {
    const it = store.item(s.id);
    if (!it) return;
    const e = getEntry(it.type);
    const tallKind = ['tall', 'tallFridge', 'tallOven'].includes(e.kind);
    const hasFront = (['base', 'wall', 'island'].includes(e.kind) && it.front) || tallKind;
    const frontOptions: [string, string][] =
      e.kind === 'wall'
        ? [['doors', 'Türen'], ['single', 'Eine Klappe / Tür'], ['open', 'Offen']]
        : e.kind === 'tallOven'
          ? [['drawers', 'Auszüge + Mikrowelle'], ['doors', 'Türen + Lifttür']]
          : tallKind
            ? [['doors', 'Zwei Türen'], ['single', 'Eine durchgehende Tür']]
            : [['doors', 'Türen'], ['single', 'Eine Tür'], ['drawers', 'Auszüge'], ['mixed', 'Schublade + Tür']];
    const curFront = it.front ?? (e.kind === 'tallOven' ? 'drawers' : 'doors');
    const matRow = (slot: MaterialSlot) => {
      const ov = it.materials?.[slot];
      const { m, name } = slotLabel(p, slot, ov, it.materials?.front);
      const uvSet = it.uv?.[slot] && Object.keys(it.uv[slot]!).length;
      return `<div class="mat-row" data-slot="${slot}"><span class="sw" style="${swatchStyle(m)}"></span><div><span>${SLOT_LABELS[slot]}</span><small>${esc(name)}${ov ? '' : ' (Standard)'}</small></div><button class="btn mini ${hasAdjust(m.adjust) ? 'on' : ''}" data-adj="${slot}" title="Farbe anpassen">${ICON.palette}</button>${isTextured(m) ? `<button class="btn mini ${uvSet ? 'on' : ''}" data-uv="${slot}" title="Textur ausrichten: strecken, skalieren, drehen, verschieben">${ICON.move}</button>` : ''}</div>`;
    };
    const grip: MaterialSlot = p.settings.handleless ? 'channel' : 'handle';
    const slots: MaterialSlot[] = ['table', 'stool', 'shelf'].includes(e.kind) ? ['countertop'] : e.kind === 'pendant' || e.kind === 'fridgeFree' || e.kind === 'hood' ? [] : e.kind === 'sink' ? ['front', 'countertop', 'sink', grip, 'carcass'] : e.countertop ? ['front', 'countertop', grip, 'carcass'] : ['front', grip, 'carcass'];
    el.innerHTML = `<h2>${e.name}</h2><div class="sub">${e.group}</div>
      ${num('Breite', 'width', it.width)}
      ${e.widths ? `<div class="chips">${e.widths.map((w) => `<button data-w="${w}" class="${w === it.width ? 'on' : ''}">${w}</button>`).join('')}</div>` : ''}
      ${num('Tiefe', 'depth', it.depth)}
      ${num('Höhe', 'height', it.height)}
      ${num('Abstand Boden', 'elevation', it.elevation)}
      ${num('Drehung', 'rotation', ((((it.rotation * 180) / Math.PI) % 360) + 360) % 360, '°', 15)}
      ${hasFront ? `<div class="row"><label>Front</label><select data-key="front" style="width:160px">${frontOptions.map(([v, l]) => `<option value="${v}" ${curFront === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
      ${e.kind === 'base' && it.front === 'drawers' ? `<div class="row"><label>Anzahl Auszüge</label><select data-key="drawers" style="width:160px">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${(it.drawers ?? 3) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
      ${e.kind === 'sink' ? `<div class="row"><label>Becken-Modell</label><select data-key="sinkModel" style="width:160px"><option value="standard" ${it.sinkModel !== 'subline500u' ? 'selected' : ''}>Standard</option><option value="subline500u" ${it.sinkModel === 'subline500u' ? 'selected' : ''}>BLANCO SUBLINE 500-U</option></select></div>
        <div class="row"><label>Armatur</label><select data-key="faucet" style="width:160px"><option value="standard" ${it.faucet !== 'kano-s' ? 'selected' : ''}>Bogen (Standard)</option><option value="kano-s" ${it.faucet === 'kano-s' ? 'selected' : ''}>BLANCO KANO-S Vario</option></select></div>` : ''}
      ${tallKind && p.settings.handleless ? `<div class="row"><label>Griffmulde</label><select data-key="grip" style="width:160px"><option value="horizontal" ${it.grip !== 'vertical' ? 'selected' : ''}>Waagerecht (in der Front)</option><option value="vertical" ${it.grip === 'vertical' ? 'selected' : ''}>Senkrechte Griffleiste daneben</option></select></div>` : ''}
      ${e.kind === 'island' ? `
        <div class="row"><label>Rückseite</label><select data-key="islandBack" style="width:150px"><option value="seating" ${it.islandBack !== 'doors' ? 'selected' : ''}>Theke (Sitzplatz)</option><option value="doors" ${it.islandBack === 'doors' ? 'selected' : ''}>Schranktüren</option></select></div>
        <div class="row"><label>Spaltenbreiten</label><input type="text" data-key="columnWidths" style="width:150px" placeholder="z. B. 90/100/90" value="${it.columnWidths?.join('/') ?? ''}" title="Breiten in cm, mit / getrennt – leer = gleich breite Spalten" /></div>
        <div class="row"><label>Spalten</label><select data-key="columns" style="width:150px" ${it.columnWidths?.length ? 'disabled title="durch Spaltenbreiten festgelegt"' : ''}><option value="">Automatisch (${Math.max(1, Math.round(it.width / 80))})</option>${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${it.columns === n ? 'selected' : ''}>${n} × ${Math.round((it.width / n) * 10) / 10} cm</option>`).join('')}</select></div>
        <div class="row"><label>Auszüge je Spalte</label><select data-key="drawers" style="width:150px">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${(it.drawers ?? 3) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        ${it.islandBack === 'doors' ? `<div class="row"><label>Türen je Spalte (Rückseite)</label><select data-key="doorsPerColumn" style="width:150px"><option value="">Automatisch</option><option value="1" ${it.doorsPerColumn === 1 ? 'selected' : ''}>1 Tür</option><option value="2" ${it.doorsPerColumn === 2 ? 'selected' : ''}>2 Türen</option></select></div>` : ''}
        <div class="row"><label for="wf">Arbeitsplatte seitlich herunter</label><input type="checkbox" id="wf" data-key="waterfall" ${(it.waterfall ?? it.islandBack !== 'doors') ? 'checked' : ''} /></div>` : ''}
      ${slots.length ? `<h3>Material dieses Elements</h3>${slots.map(matRow).join('')}` : ''}
      <div class="actions">
        <button class="btn" data-act="rotate">${ICON.rotate}Drehen</button>
        <button class="btn" data-act="dup">${ICON.copy}Duplizieren</button>
        <button class="btn danger" data-act="del">${ICON.trash}Löschen</button>
      </div>`;
    el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const k = inp.dataset.key!;
        if (k === 'front') it.front = inp.value as FrontStyle;
        else if (k === 'islandBack') it.islandBack = inp.value as 'seating' | 'doors';
        else if (k === 'columns') {
          if (inp.value) it.columns = +inp.value;
          else delete it.columns;
        } else if (k === 'drawers') it.drawers = +inp.value;
        else if (k === 'grip') it.grip = inp.value as 'horizontal' | 'vertical';
        else if (k === 'sinkFinish') it.sinkFinish = inp.value as 'steel' | 'anthracite';
        else if (k === 'sinkModel') it.sinkModel = inp.value as 'standard' | 'subline500u';
        else if (k === 'faucet') it.faucet = inp.value as 'standard' | 'kano-s';
        else if (k === 'columnWidths') {
          const ws = inp.value.split(/[\/;, ]+/).map((v) => parseFloat(v.replace(',', '.'))).filter((v) => v > 0);
          if (ws.length) it.columnWidths = ws;
          else delete it.columnWidths;
        }
        else if (k === 'doorsPerColumn') {
          if (inp.value) it.doorsPerColumn = +inp.value;
          else delete it.doorsPerColumn;
        }
        else if (k === 'waterfall') it.waterfall = (inp as HTMLInputElement).checked;
        else if (k === 'rotation') {
          it.rotation = (+inp.value * Math.PI) / 180;
          delete it.wallId;
        } else (it as any)[k] = Math.max(1, +inp.value || 0) * (k === 'elevation' ? 1 : 1);
        if (k === 'elevation') it.elevation = Math.max(0, +inp.value || 0);
        if (k === 'width' || k === 'depth') resnap(it);
        store.commit();
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-w]').forEach((b) =>
      b.addEventListener('click', () => {
        it.width = +b.dataset.w!;
        resnap(it);
        store.commit();
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-adj]').forEach((b) =>
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openAdjustDialog(b.dataset.adj as MaterialSlot, it);
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-uv]').forEach((b) =>
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openUVDialog(itemUVTarget(it, b.dataset.uv as MaterialSlot));
      }),
    );
    el.querySelectorAll<HTMLElement>('.mat-row').forEach((row) =>
      row.addEventListener('click', () => {
        const slot = row.dataset.slot as MaterialSlot;
        openMaterialPicker(`${SLOT_LABELS[slot]} – ${e.name}`, it.materials?.[slot], true, async (id) => {
          // Bei Fronten immer nachfragen: nur dieses Element oder alle Fronten?
          if (slot === 'front' && id) {
            const name = esc(findMaterialName(id));
            const choice = await askChoice(
              'Front ändern',
              `<p>Soll „${name}“ nur für <b>${esc(e.name)}</b> oder für <b>alle Fronten</b> der Küche verwendet werden?</p>`,
              [
                { id: 'one', label: 'Nur dieses Element' },
                { id: 'all', label: 'Alle Fronten', primary: true },
              ],
            );
            if (!choice) return;
            if (choice === 'all') {
              const proj = store.project;
              proj.slots.front = id;
              proj.items.forEach((i) => i.materials && delete i.materials.front);
              store.commit();
              return;
            }
          }
          it.materials = { ...(it.materials ?? {}) };
          if (id) it.materials[slot] = id;
          else delete it.materials[slot];
          store.commit();
        }, slot);
      }),
    );
    bindActions(el, it);
    return;
  }

  if (s.kind === 'wall') {
    const w = store.wall(s.id);
    if (!w) return;
    el.innerHTML = `<h2>Wand</h2><div class="sub">Endpunkte im Grundriss ziehen</div>
      ${num('Länge', 'length', wallLength(w))}
      ${num('Stärke', 'thickness', w.thickness)}
      ${num('Höhe', 'height', w.height)}
      <div class="actions"><button class="btn" data-act="allHeight">Höhe für alle Wände</button><button class="btn danger" data-act="del">${ICON.trash}Löschen</button></div>`;
    el.querySelectorAll<HTMLInputElement>('[data-key]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const v = Math.max(1, +inp.value || 1);
        if (inp.dataset.key === 'length') setWallLength(w, v);
        else (w as any)[inp.dataset.key!] = v;
        store.commit();
      }),
    );
    el.querySelector('[data-act="allHeight"]')!.addEventListener('click', () => {
      store.project.walls.forEach((x) => (x.height = w.height));
      store.commit();
    });
    bindActions(el);
    return;
  }

  if (s.kind === 'opening') {
    const o = store.opening(s.id);
    if (!o) return;
    el.innerHTML = `<h2>${o.type === 'door' ? 'Tür' : 'Fenster'}</h2><div class="sub">Entlang der Wand ziehen</div>
      <div class="row"><label>Typ</label><select data-key="type" style="width:120px"><option value="window" ${o.type === 'window' ? 'selected' : ''}>Fenster</option><option value="door" ${o.type === 'door' ? 'selected' : ''}>Tür</option></select></div>
      ${num('Breite', 'width', o.width)}
      ${num('Höhe', 'height', o.height)}
      ${num('Brüstung', 'sill', o.sill)}
      ${num('Abstand Mitte', 'offset', o.offset)}
      <div class="actions"><button class="btn danger" data-act="del">${ICON.trash}Löschen</button></div>`;
    el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const k = inp.dataset.key!;
        if (k === 'type') {
          o.type = inp.value as 'door' | 'window';
          if (o.type === 'door') {
            o.sill = 0;
            o.height = 210;
          }
        } else (o as any)[k] = Math.max(0, +inp.value || 0);
        store.commit();
      }),
    );
    bindActions(el);
  }
}

function resnap(it: Item) {
  if (it.wallId) snapItem(store.project, it, { x: it.x, y: it.y });
}

function setWallLength(w: Wall, L: number) {
  const d = wallDir(w);
  const oldB = { ...w.b };
  w.b = { x: w.a.x + d.x * L, y: w.a.y + d.y * L };
  const delta = { x: w.b.x - oldB.x, y: w.b.y - oldB.y };
  for (const o of store.project.walls) {
    if (o === w) continue;
    for (const end of ['a', 'b'] as const) if (dist(o[end], oldB) < 0.5) o[end] = { x: o[end].x + delta.x, y: o[end].y + delta.y };
  }
}

function bindActions(el: HTMLElement, it?: Item) {
  el.querySelector('[data-act="del"]')?.addEventListener('click', () => store.deleteSelection());
  el.querySelector('[data-act="dup"]')?.addEventListener('click', () => duplicateSelection());
  el.querySelector('[data-act="rotate"]')?.addEventListener('click', () => {
    if (!it) return;
    it.rotation += Math.PI / 2;
    delete it.wallId;
    store.commit();
  });
}

function duplicateSelection() {
  const s = store.selection;
  if (s?.kind !== 'item') return;
  const it = store.item(s.id);
  if (!it) return;
  const c = Math.cos(it.rotation);
  const sn = Math.sin(it.rotation);
  const copy: Item = JSON.parse(JSON.stringify(it));
  copy.id = uid();
  copy.x += c * it.width;
  copy.y += sn * it.width;
  store.project.items.push(copy);
  store.select({ kind: 'item', id: copy.id });
  store.commit();
}

// ---------------------------------------------------------------------------

let toastTimer = 0;
function toast(msg: string) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), 4200);
}
document.addEventListener('kp-toast', (e) => toast((e as CustomEvent).detail));

let propsKey = '';
store.subscribe(() => {
  syncSettings();
  // Eigenschaften nur neu aufbauen, wenn sich nicht gerade ein Eingabefeld darin im Fokus befindet
  const key = JSON.stringify([store.selection, store.selection && selectedObject()]);
  if (key !== propsKey && !$('#props').contains(document.activeElement)) {
    propsKey = key;
    renderProps();
  }
  if ($('#tab-materials').classList.contains('on')) renderMaterialsTab();
  ($('#undo') as HTMLButtonElement).disabled = false;
});
store.onSelection(() => {
  propsKey = '';
  renderProps();
  view.updateSelection();
});

function selectedObject() {
  const s = store.selection;
  if (!s) return null;
  if (s.kind === 'item') return store.item(s.id);
  if (s.kind === 'wall') return store.wall(s.id);
  return store.opening(s.id);
}

syncSettings();
renderProps();

// Geteilter Showroom (?ansicht=TOKEN): nur ansehen, nichts speichern
const shareToken = new URLSearchParams(location.search).get('ansicht');
if (shareToken) {
  store.readonly = true;
  store.reset(true); // eigene lokale Planung nicht kurz anzeigen
  document.body.classList.add('shared-view');
  setShowroom(true);
  fetch(`/api/shared/${encodeURIComponent(shareToken)}`)
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `Fehler ${r.status}`);
      return d as { name: string; data: Project };
    })
    .then((d) => {
      store.replace(d.data);
      $('#sharedTitle').textContent = d.name;
      document.title = `${d.name} – Küchenplaner`;
      view.setView('perspective');
    })
    .catch((e) => {
      $('#sharedTitle').textContent = 'Link nicht verfügbar';
      toast((e as Error).message);
    });
}

const account = new Account($('#account'), {
  modal,
  toast,
  esc,
  screenshot: () => view.screenshot(),
  afterLoad: () => {
    plan.fit();
    view.setView('perspective');
  },
  newPlan: () => openNewPlan(),
});

// Projekt per URL laden, z. B. ?projekt=haus1-eg (Datei unter public/projekte/)
const projectParam = new URLSearchParams(location.search).get('projekt');
if (projectParam) {
  const file = projectParam.endsWith('.json') ? projectParam : `${projectParam}.kueche.json`;
  fetch(`${import.meta.env.BASE_URL}projekte/${encodeURIComponent(file)}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((p: Project) => {
      store.replace(p);
      account.detach();
      plan.fit();
      view.setView('perspective');
      history.replaceState(null, '', location.pathname);
      toast(`Projekt „${p.name}“ geladen.`);
    })
    .catch((err) => toast(`Projekt „${file}“ konnte nicht geladen werden: ${err.message}`));
}

// Nur in der Entwicklung: Zugriff für automatisierte Ansichtstests
if (import.meta.env.DEV) (window as any).__kp = { view, plan, store };

// Showroom direkt öffnen: per Link (?showroom) oder nach Neuladen, wenn er aktiv war
{
  let resume = false;
  try {
    resume = sessionStorage.getItem('kp.showroom') === '1';
  } catch {
    /* ignorieren */
  }
  if (!new URLSearchParams(location.search).has('ansicht') && (new URLSearchParams(location.search).has('showroom') || resume)) setShowroom(true);
}
