import type { Item, Opening, Project, Selection, Wall } from './types';
import { getEntry } from './catalog';

const STORAGE_KEY = 'kuechenplaner.project.v1';

export const uid = () => Math.random().toString(36).slice(2, 10);

type Listener = () => void;

function defaultProject(): Project {
  const W = 460;
  const D = 400;
  const t = 12;
  const h = 260;
  const w1: Wall = { id: uid(), a: { x: 0, y: 0 }, b: { x: W, y: 0 }, thickness: t, height: h };
  const w2: Wall = { id: uid(), a: { x: W, y: 0 }, b: { x: W, y: D }, thickness: t, height: h };
  const w3: Wall = { id: uid(), a: { x: W, y: D }, b: { x: 0, y: D }, thickness: t, height: h };
  const w4: Wall = { id: uid(), a: { x: 0, y: D }, b: { x: 0, y: 0 }, thickness: t, height: h };

  const openings: Opening[] = [
    { id: uid(), wallId: w1.id, type: 'window', offset: 226, width: 100, height: 115, sill: 110 },
    { id: uid(), wallId: w2.id, type: 'window', offset: 210, width: 140, height: 150, sill: 75 },
    { id: uid(), wallId: w3.id, type: 'door', offset: 360, width: 90, height: 210, sill: 0 },
  ];

  const row: [string, number][] = [
    ['tall-fridge', 60],
    ['tall-oven', 60],
    ['base-drawers', 60],
    ['sink', 80],
    ['dishwasher', 60],
    ['hob', 80],
    ['base-mixed', 40],
  ];
  const items: Item[] = [];
  let x = t / 2;
  for (const [type, width] of row) {
    items.push(makeItem(type, { x: x + width / 2, y: t / 2 + 30, width, wallId: w1.id }));
    x += width;
  }
  items.push(makeItem('hood', { x: 366, y: t / 2 + 25, wallId: w1.id }));
  items.push(makeItem('wall-doors', { x: 426, y: t / 2 + 17.5, width: 40, wallId: w1.id }));
  items.push(makeItem('island', { x: 230, y: 235, rotation: Math.PI }));
  items.push(makeItem('pendant', { x: 190, y: 235 }));
  items.push(makeItem('pendant', { x: 270, y: 235 }));
  for (const sx of [180, 230, 280]) items.push(makeItem('stool', { x: sx, y: 318 }));

  return {
    version: 1,
    name: 'Meine Küche',
    walls: [w1, w2, w3, w4],
    openings,
    items,
    slots: {
      front: 'lack-sage',
      carcass: 'lack-white',
      countertop: 'stone-marble',
      handle: 'metal-brass',
      channel: '@front',
      sink: 'metal-steel',
      backsplash: 'stone-marble',
      floor: 'floor-parquet',
      wall: 'wall-plaster',
      ceiling: 'wall-white',
    },
    customMaterials: [],
    settings: { ceiling: false, backsplash: true, plinth: 10, countertopThickness: 4, timeOfDay: 14 },
  };
}

export function makeItem(type: string, over: Partial<Item> = {}): Item {
  const e = getEntry(type);
  return {
    id: uid(),
    type,
    x: 0,
    y: 0,
    rotation: 0,
    width: e.width,
    depth: e.depth,
    height: e.height,
    elevation: e.elevation,
    front: e.front,
    ...(e.materials ? { materials: { ...e.materials } } : {}),
    ...over,
  };
}

class Store {
  project: Project;
  selection: Selection = null;
  private listeners = new Set<Listener>();
  private selListeners = new Set<Listener>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private saveTimer = 0;

  constructor() {
    this.project = this.load() ?? defaultProject();
    this.undoStack.push(JSON.stringify(this.project));
  }

  private load(): Project | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onSelection(fn: Listener) {
    this.selListeners.add(fn);
    return () => this.selListeners.delete(fn);
  }

  /** Benachrichtigt Ansichten ohne Undo-Eintrag (z. B. während des Ziehens) */
  emit() {
    this.listeners.forEach((l) => l());
  }

  /** Schließt eine Aktion ab: Undo-Schritt + Speichern + Benachrichtigen */
  commit() {
    const snap = JSON.stringify(this.project);
    if (this.undoStack[this.undoStack.length - 1] !== snap) {
      this.undoStack.push(snap);
      if (this.undoStack.length > 80) this.undoStack.shift();
      this.redoStack = [];
    }
    this.emit();
    this.scheduleSave();
  }

  undo() {
    if (this.undoStack.length < 2) return;
    this.redoStack.push(this.undoStack.pop()!);
    this.project = JSON.parse(this.undoStack[this.undoStack.length - 1]);
    this.validateSelection();
    this.emit();
    this.scheduleSave();
  }

  redo() {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push(snap);
    this.project = JSON.parse(snap);
    this.validateSelection();
    this.emit();
    this.scheduleSave();
  }

  replace(p: Project) {
    this.project = migrate(p);
    this.selection = null;
    this.commit();
    this.selListeners.forEach((l) => l());
  }

  reset(empty = false) {
    const p = defaultProject();
    if (empty) {
      p.walls = [];
      p.openings = [];
      p.items = [];
      p.name = 'Neue Küche';
    }
    this.replace(p);
  }

  select(sel: Selection) {
    this.selection = sel;
    this.selListeners.forEach((l) => l());
    this.emit();
  }

  private validateSelection() {
    const s = this.selection;
    if (!s) return;
    const p = this.project;
    const ok =
      (s.kind === 'item' && p.items.some((i) => i.id === s.id)) ||
      (s.kind === 'wall' && p.walls.some((i) => i.id === s.id)) ||
      (s.kind === 'opening' && p.openings.some((i) => i.id === s.id));
    if (!ok) this.select(null);
    else this.selListeners.forEach((l) => l());
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 400);
  }

  /** Nur-Lesen (geteilter Showroom): nichts im Browser speichern */
  readonly = false;

  save(): boolean {
    if (this.readonly) return true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      return true;
    } catch (e) {
      console.warn('Speichern im Browser fehlgeschlagen (zu große Texturen?)', e);
      document.dispatchEvent(new CustomEvent('kp-toast', { detail: 'Automatisches Speichern fehlgeschlagen – Projekt zu groß. Bitte als Datei exportieren.' }));
      return false;
    }
  }

  // Hilfsfunktionen
  item(id: string) {
    return this.project.items.find((i) => i.id === id);
  }
  wall(id: string) {
    return this.project.walls.find((w) => w.id === id);
  }
  opening(id: string) {
    return this.project.openings.find((o) => o.id === id);
  }

  deleteSelection() {
    const s = this.selection;
    if (!s) return;
    const p = this.project;
    if (s.kind === 'item') p.items = p.items.filter((i) => i.id !== s.id);
    if (s.kind === 'opening') p.openings = p.openings.filter((o) => o.id !== s.id);
    if (s.kind === 'wall') {
      p.walls = p.walls.filter((w) => w.id !== s.id);
      p.openings = p.openings.filter((o) => o.wallId !== s.id);
      p.items.forEach((i) => {
        if (i.wallId === s.id) delete i.wallId;
      });
    }
    this.select(null);
    this.commit();
  }
}

/** Ergänzt fehlende Felder (ältere Dateien / Serverstände) */
export function migrate(p: Project): Project {
  const d = defaultProject();
  // alte Einstellung „Dielenrichtung“ -> Projekt-Ausrichtung des Bodens
  if (p.settings?.floorRotation && !p.uv?.floor) {
    p.uv = { ...(p.uv ?? {}), floor: { rotation: p.settings.floorRotation } };
    delete p.settings.floorRotation;
  }
  return {
    ...d,
    ...p,
    slots: { ...d.slots, ...(p.slots ?? {}) },
    settings: { ...d.settings, ...(p.settings ?? {}) },
    customMaterials: p.customMaterials ?? [],
    openings: p.openings ?? [],
    items: p.items ?? [],
    walls: p.walls ?? [],
  };
}

export const store = new Store();
