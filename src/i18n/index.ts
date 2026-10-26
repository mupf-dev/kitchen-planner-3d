// Mehrsprachigkeit: Die Oberfläche wird auf Deutsch geschrieben; für andere Sprachen übersetzt eine
// Schicht alle Texte im DOM (Textknoten und title/placeholder/alt/aria-label) sowie native Dialoge.
// Wörterbücher verwenden den deutschen Text als Schlüssel; Schlüssel mit {} sind Muster.
import { en } from './en';

export type Lang = 'de' | 'en';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
];
const DICTS: Partial<Record<Lang, Record<string, string>>> = { en };
const KEY = 'kp.lang';

function detect(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'de' || q === 'en') return q;
    const s = localStorage.getItem(KEY);
    if (s === 'de' || s === 'en') return s;
  } catch {
    /* ignorieren */
  }
  return (navigator.languages?.[0] ?? navigator.language ?? 'de').toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const lang: Lang = detect();
export const locale = lang === 'de' ? 'de-DE' : 'en-GB';

/** Sprache wechseln (lädt die Seite neu, damit alle Texte konsistent sind) */
export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignorieren */
  }
  const u = new URL(location.href);
  u.searchParams.delete('lang');
  location.replace(u.toString());
}

// ---------------------------------------------------------------------------

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const exact = new Map<string, string>();
const patterns: { re: RegExp; out: string; weight: number }[] = [];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const dict = DICTS[lang];
if (dict) {
  for (const [k, v] of Object.entries(dict)) {
    const nk = norm(k);
    if (nk.includes('{}')) {
      const re = new RegExp('^' + nk.split('{}').map(escapeRe).join('(.+?)') + '$', 's');
      patterns.push({ re, out: v, weight: nk.replace(/\{\}/g, '').length });
    } else exact.set(nk, v);
  }
  // spezifischere Muster (mehr fester Text) zuerst
  patterns.sort((a, b) => b.weight - a.weight);
}

/** Übersetzt einen deutschen Text; unbekannte Texte bleiben unverändert */
export function t(s: string): string {
  if (!dict || !s) return s;
  const n = norm(s);
  if (!n) return s;
  const hit = exact.get(n);
  if (hit !== undefined) return hit;
  for (const p of patterns) {
    const m = p.re.exec(n);
    if (!m) continue;
    const parts = m.slice(1).map((x) => t(x));
    let i = 0;
    return p.out.replace(/\{(\d*)\}/g, (_, d) => parts[d === '' ? i++ : +d] ?? '');
  }
  return s;
}

// ---------------------------------------------------------------------------
// DOM-Übersetzung

const ATTRS = ['title', 'placeholder', 'alt', 'aria-label'];
/** Elemente, deren Inhalt nie übersetzt wird */
const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'CANVAS']);
/** Elemente, deren Text Benutzereingabe ist (Attribute wie placeholder werden trotzdem übersetzt) */
const NO_TEXT = new Set(['TEXTAREA']);

function translateText(node: Text) {
  const raw = node.data;
  const n = norm(raw);
  if (!n || !/[A-Za-zÄÖÜäöüß]/.test(n)) return;
  const tr = t(n);
  if (tr === n) return;
  // umgebende Leerzeichen erhalten
  const lead = raw.match(/^\s*/)![0];
  const trail = raw.match(/\s*$/)![0];
  const next = lead + tr + trail;
  if (next !== raw) node.data = next;
}

function translateEl(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      const tr = t(v);
      if (tr !== v) el.setAttribute(a, tr);
    }
  }
}

export function translateTree(root: Node) {
  if (!dict) return;
  if (root.nodeType === Node.TEXT_NODE) {
    const p = (root as Text).parentElement;
    if (p && !SKIP.has(p.tagName) && !NO_TEXT.has(p.tagName) && !p.closest('[translate="no"]')) translateText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as Element;
    if (SKIP.has(el.tagName) || el.closest('[translate="no"]')) return;
    translateEl(el);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeType === Node.ELEMENT_NODE && (SKIP.has((n as Element).tagName) || (n as Element).getAttribute('translate') === 'no')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (!NO_TEXT.has((n as Text).parentElement?.tagName ?? '')) translateText(n as Text);
    }
    else translateEl(n as Element);
  }
}

/** Startet die automatische Übersetzung (einmal beim Start aufrufen) */
export function initI18n() {
  document.documentElement.lang = lang;
  if (!dict) return;
  document.title = t(document.title);
  // native Dialoge
  const c = window.confirm.bind(window);
  const pr = window.prompt.bind(window);
  const al = window.alert.bind(window);
  window.confirm = (m?: string) => c(m === undefined ? m : t(String(m)));
  window.prompt = (m?: string, d?: string) => pr(m === undefined ? m : t(String(m)), d);
  window.alert = (m?: unknown) => al(m === undefined ? m : t(String(m)));
  translateTree(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach((n) => translateTree(n));
      else if (m.type === 'characterData') translateTree(m.target);
      else if (m.type === 'attributes' && m.target.nodeType === Node.ELEMENT_NODE) translateEl(m.target as Element);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
