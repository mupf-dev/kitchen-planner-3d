// Anmeldung, „Meine Planungen“ und Benutzerverwaltung
import { migrate, store } from './state';
import type { Project } from './types';

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'active' | 'pending';
  createdAt: string;
}

interface ProjectMeta {
  id: number;
  name: string;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  shareToken?: string | null;
}

interface Helpers {
  modal: (title: string, body: string, footer?: string) => { el: HTMLElement; close: () => void };
  toast: (msg: string) => void;
  esc: (s: string) => string;
  screenshot: () => string;
  afterLoad: () => void;
  /** Öffnet den Dialog „Neue Planung“ */
  newPlan: () => void;
}

const CURRENT_KEY = 'kuechenplaner.serverProject';
/** Prüfsumme des zuletzt geladenen/gespeicherten Serverstands (erkennt lokale Änderungen über Neuladen hinweg) */
const SNAP_KEY = 'kuechenplaner.serverSnapshotHash';

function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + ':' + s.length;
}
const FOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h6l2 2h10v10H3z"/></svg>';

async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* leer */
  }
  if (!res.ok) throw new Error(data?.error ?? `Serverfehler (${res.status})`);
  return data as T;
}

const fmtDate = (s: string) => {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export class Account {
  user: User | null = null;
  private firstUser = false;
  private registrationEnabled = true;
  private requireApproval = false;
  private pendingCount = 0;
  private serverAvailable = true;
  /** ID der aktuell geöffneten Server-Planung */
  private currentId: number | null = null;
  private savedSnapshot = '';
  private menuOpen = false;

  constructor(private root: HTMLElement, private h: Helpers) {
    try {
      const id = Number(localStorage.getItem(CURRENT_KEY));
      this.currentId = id > 0 ? id : null;
    } catch {
      /* ignorieren */
    }
    store.subscribe(() => this.renderStatus());
    document.addEventListener('click', (e) => {
      if (this.menuOpen && !this.root.contains(e.target as Node)) this.toggleMenu(false);
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.user && this.currentId && this.dirty) e.preventDefault();
    });
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.save();
      }
    });
    this.refresh();
  }

  private get dirty() {
    return this.currentId !== null && JSON.stringify(store.project) !== this.savedSnapshot;
  }

  async refresh() {
    if (store.readonly) return; // geteilter Showroom: kein Konto-Abgleich
    try {
      const r = await api<{ user: User | null; firstUser: boolean; registrationEnabled: boolean; requireApproval: boolean }>('/auth/me');
      this.user = r.user;
      this.firstUser = r.firstUser;
      this.registrationEnabled = r.registrationEnabled;
      this.requireApproval = r.requireApproval;
      this.serverAvailable = true;
    } catch {
      this.serverAvailable = false;
      this.user = null;
    }
    if (!this.user) this.setCurrent(null);
    else if (this.currentId) {
      // Serverstand mit der lokalen Kopie abgleichen
      try {
        const p = await api<ProjectMeta & { data: Project }>(`/projects/${this.currentId}`);
        const server = JSON.stringify(migrate(p.data));
        const local = JSON.stringify(store.project);
        let lastHash: string | null = null;
        try {
          lastHash = localStorage.getItem(SNAP_KEY);
        } catch {
          /* ignorieren */
        }
        if (server !== local && lastHash === hash(local)) {
          // lokal unverändert, aber auf dem Server neuer (anderes Gerät) -> neueren Stand übernehmen
          store.replace(p.data);
          this.setCurrent(this.currentId, JSON.stringify(store.project));
          this.h.afterLoad();
          this.h.toast(`Neuere Version von „${p.name}“ geladen.`);
        } else {
          this.savedSnapshot = server;
        }
      } catch {
        this.setCurrent(null);
      }
    }
    this.render();
    this.refreshPending();
  }

  /** Anzahl wartender Freigaben für Administratoren */
  private async refreshPending() {
    if (this.user?.role !== 'admin') return;
    try {
      this.pendingCount = (await api<{ pending: number }>('/admin/settings')).pending;
    } catch {
      this.pendingCount = 0;
    }
    this.render();
  }

  /** Verknüpfung zur Server-Planung lösen (z. B. nach „Neu“ oder Datei-Import) */
  detach() {
    this.setCurrent(null);
    this.render();
  }

  private setCurrent(id: number | null, snapshot = '') {
    this.currentId = id;
    this.savedSnapshot = snapshot;
    try {
      if (id) localStorage.setItem(CURRENT_KEY, String(id));
      else localStorage.removeItem(CURRENT_KEY);
      if (id && snapshot) localStorage.setItem(SNAP_KEY, hash(snapshot));
      else if (!id) localStorage.removeItem(SNAP_KEY);
    } catch {
      /* ignorieren */
    }
  }

  // -------------------------------------------------------------------------
  // Kopfzeile

  private render() {
    const { esc } = this.h;
    if (!this.serverAvailable) {
      this.root.innerHTML = `<span class="acc-status" title="Server nicht erreichbar – Planungen werden nur lokal im Browser gespeichert">Offline</span>`;
      return;
    }
    if (!this.user) {
      this.root.innerHTML = `<button class="btn primary" data-acc="login">Anmelden</button>`;
      this.root.querySelector('[data-acc="login"]')!.addEventListener('click', () => this.openLogin());
      return;
    }
    const u = this.user;
    this.root.innerHTML = `
      <span class="acc-status" id="accStatus"></span>
      <button class="btn" data-acc="projects" title="Gespeicherte Planungen öffnen, umbenennen oder löschen">${FOLDER}Meine Planungen</button>
      <button class="btn primary" data-acc="save" title="In meinem Profil speichern (Strg+S)">Speichern</button>
      <div class="acc-menu">
        <button class="btn" data-acc="menu"><span class="avatar">${esc(u.name.slice(0, 1).toUpperCase())}</span>${esc(u.name)}${this.pendingCount ? `<span class="badge" title="${this.pendingCount} Konto/Konten warten auf Freigabe">${this.pendingCount}</span>` : ''} ▾</button>
        <div class="dropdown" hidden>
          <div class="dd-head"><b>${esc(u.name)}</b><small>${esc(u.email)}${u.role === 'admin' ? ' · Administrator' : ''}</small></div>
          <button data-acc="projects2">Meine Planungen</button>
          <button data-acc="saveas">Als neue Planung speichern …</button>
          <button data-acc="share">Aktuelle Planung teilen …</button>
          <button data-acc="password">Passwort ändern</button>
          ${u.role === 'admin' ? `<button data-acc="admin">Benutzerverwaltung${this.pendingCount ? ` <span class="badge">${this.pendingCount}</span>` : ''}</button>` : ''}
          <hr />
          <button data-acc="logout">Abmelden</button>
        </div>
      </div>`;
    const on = (k: string, fn: () => void) =>
      this.root.querySelector(`[data-acc="${k}"]`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (k !== 'menu') this.toggleMenu(false);
        fn();
      });
    on('menu', () => this.toggleMenu(!this.menuOpen));
    on('save', () => this.save());
    on('saveas', () => this.save(true));
    on('share', async () => {
      if (!this.currentId) {
        if (!(await this.save())) return;
      } else if (this.dirty && (await this.askShareSave()) === false) return;
      this.openShare(this.currentId!, store.project.name);
    });
    on('projects', () => this.openProjects());
    on('projects2', () => this.openProjects());
    on('password', () => this.openPassword());
    on('admin', () => this.openAdmin());
    on('logout', () => this.logout());
    this.renderStatus();
  }

  private toggleMenu(open: boolean) {
    this.menuOpen = open;
    const dd = this.root.querySelector<HTMLElement>('.dropdown');
    if (dd) dd.hidden = !open;
  }

  private renderStatus() {
    const el = this.root.querySelector<HTMLElement>('#accStatus');
    if (!el) return;
    if (!this.currentId) {
      el.textContent = 'Neue Planung – noch nicht gespeichert';
      el.title = 'Mit „Speichern“ wird diese Planung in deinem Konto abgelegt.';
    } else {
      el.textContent = this.dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert ✓';
      el.title = 'Diese Planung ist in deinem Konto gespeichert.';
    }
    el.classList.toggle('warn', !this.currentId || this.dirty);
  }

  /** Gibt es Inhalt, der beim Ersetzen verloren ginge? */
  private get hasUnsavedWork() {
    if (!this.user) return false;
    if (this.currentId) return this.dirty;
    const p = store.project;
    return p.walls.length > 0 || p.items.length > 0;
  }

  /**
   * Fragt vor dem Ersetzen der aktuellen Planung nach, falls Änderungen verloren gingen.
   * Liefert true, wenn fortgefahren werden darf.
   */
  confirmReplace(action: string): Promise<boolean> {
    if (!this.hasUnsavedWork) return Promise.resolve(true);
    const { esc } = this.h;
    const name = store.project.name || 'Aktuelle Planung';
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: boolean) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      const m = this.h.modal(
        'Ungespeicherte Änderungen',
        `<p>${this.currentId ? `„${esc(name)}“ hat Änderungen, die noch nicht gespeichert sind.` : `„${esc(name)}“ ist noch nicht in deinem Konto gespeichert.`}</p>
         <p class="hint">Was soll passieren, bevor ${esc(action)}?</p>`,
        `<button class="btn" data-c="cancel">Abbrechen</button><button class="btn danger" data-c="discard">Verwerfen</button><button class="btn primary" data-c="save">Speichern</button>`,
      );
      m.el.querySelector('.modal')!.classList.add('narrow');
      const close = m.close;
      m.el.querySelector('[data-c="cancel"]')!.addEventListener('click', () => {
        close();
        finish(false);
      });
      m.el.querySelector('[data-c="discard"]')!.addEventListener('click', () => {
        close();
        finish(true);
      });
      m.el.querySelector('[data-c="save"]')!.addEventListener('click', async () => {
        close();
        finish(await this.save());
      });
      // Schließen über ✕ / Hintergrund / Esc = Abbrechen
      new MutationObserver((_, obs) => {
        if (!m.el.isConnected) {
          obs.disconnect();
          finish(false);
        }
      }).observe(document.body, { childList: true });
    });
  }

  /** Kleiner Dialog zur Namenseingabe */
  private askName(title: string, value: string, ok = 'Speichern'): Promise<string | null> {
    const { esc } = this.h;
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: string | null) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      const m = this.h.modal(
        title,
        `<form class="auth-form"><label class="field"><span>Name der Planung</span><input type="text" name="n" value="${esc(value)}" maxlength="120" /></label></form>`,
        `<button class="btn" data-c="cancel">Abbrechen</button><button class="btn primary" data-c="ok">${esc(ok)}</button>`,
      );
      m.el.querySelector('.modal')!.classList.add('narrow');
      const input = m.el.querySelector<HTMLInputElement>('input')!;
      input.focus();
      input.select();
      const submit = () => {
        const v = input.value.trim();
        if (!v) return input.focus();
        m.close();
        finish(v);
      };
      m.el.querySelector('form')!.addEventListener('submit', (e) => {
        e.preventDefault();
        submit();
      });
      m.el.querySelector('[data-c="ok"]')!.addEventListener('click', submit);
      m.el.querySelector('[data-c="cancel"]')!.addEventListener('click', () => {
        m.close();
        finish(null);
      });
      new MutationObserver((_, obs) => {
        if (!m.el.isConnected) {
          obs.disconnect();
          finish(null);
        }
      }).observe(document.body, { childList: true });
    });
  }

  // -------------------------------------------------------------------------
  // Aktionen

  private thumbnail(): Promise<string> {
    return new Promise((resolve) => {
      const src = new Image();
      src.onload = () => {
        const c = document.createElement('canvas');
        c.width = 480;
        c.height = Math.round((src.height * 480) / src.width);
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      src.onerror = () => resolve('');
      try {
        src.src = this.h.screenshot();
      } catch {
        resolve('');
      }
    });
  }

  /** Speichert im Konto; liefert true bei Erfolg */
  async save(asNew = false): Promise<boolean> {
    if (!this.user) {
      this.openLogin();
      return false;
    }
    let name = store.project.name || 'Meine Küche';
    if (asNew || !this.currentId) {
      const n = await this.askName(asNew ? 'Als neue Planung speichern' : 'Planung speichern', asNew ? `${name} (Kopie)` : name);
      if (n === null) return false;
      name = n;
      store.project.name = name;
      store.commit();
    }
    const thumbnail = await this.thumbnail();
    const data = store.project;
    try {
      if (this.currentId && !asNew) {
        await api(`/projects/${this.currentId}`, { method: 'PUT', body: { name, data, thumbnail } });
      } else {
        const r = await api<ProjectMeta>('/projects', { method: 'POST', body: { name, data, thumbnail } });
        this.setCurrent(r.id);
      }
      this.savedSnapshot = JSON.stringify(data);
      try {
        localStorage.setItem(SNAP_KEY, hash(this.savedSnapshot));
      } catch {
        /* ignorieren */
      }
      this.renderStatus();
      this.h.toast(`„${name}“ in deinem Konto gespeichert.`);
      return true;
    } catch (e) {
      this.h.toast('Speichern fehlgeschlagen: ' + (e as Error).message);
      return false;
    }
  }

  private async load(id: number) {
    if (id === this.currentId && !this.dirty) return true;
    if (!(await this.confirmReplace('eine andere Planung geöffnet wird'))) return false;
    try {
      const p = await api<ProjectMeta & { data: Project }>(`/projects/${id}`);
      store.replace(p.data);
      this.setCurrent(id, JSON.stringify(store.project));
      this.render();
      this.h.afterLoad();
      this.h.toast(`„${p.name}“ geöffnet.`);
      return true;
    } catch (e) {
      this.h.toast('Öffnen fehlgeschlagen: ' + (e as Error).message);
      return false;
    }
  }

  private async logout() {
    if (this.dirty && !(await this.confirmReplace('du dich abmeldest'))) return;
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      /* ignorieren */
    }
    this.user = null;
    this.setCurrent(null);
    this.render();
    this.h.toast('Abgemeldet.');
  }

  // -------------------------------------------------------------------------
  // Dialoge

  async openLogin(mode: 'login' | 'register' = this.firstUser ? 'register' : 'login') {
    await this.refresh();
    if (!this.registrationEnabled) mode = 'login';
    const body = `
      ${this.registrationEnabled ? '<div class="seg auth-tabs"><button data-mode="login">Anmelden</button><button data-mode="register">Registrieren</button></div>' : ''}
      <form class="auth-form" novalidate>
        <p class="hint" data-first ${this.firstUser ? '' : 'hidden'}>Es gibt noch kein Konto. Das erste registrierte Konto wird <b>Administrator</b>.</p>
        <p class="hint" data-only="register" ${this.requireApproval ? '' : 'hidden'}>Neue Konten müssen von einem Administrator freigegeben werden, bevor du dich anmelden kannst.</p>
        ${this.registrationEnabled ? '' : '<p class="hint">Neue Registrierungen sind derzeit deaktiviert.</p>'}
        <p class="form-ok" hidden></p>
        <label class="field" data-only="register"><span>Name</span><input type="text" name="name" autocomplete="name" /></label>
        <label class="field"><span>E-Mail</span><input type="text" name="email" autocomplete="email" inputmode="email" required /></label>
        <label class="field"><span>Passwort</span><input type="password" name="password" autocomplete="current-password" required /></label>
        <label class="field" data-only="register" data-field><span>Passwort wiederholen</span><input type="password" name="password2" autocomplete="new-password" /></label>
        <p class="form-error" hidden></p>
        <button class="btn primary" type="submit" style="width:100%;justify-content:center"></button>
        <p class="hint">Ohne Anmeldung kannst du weiterhin planen – die Planung wird dann nur in diesem Browser gespeichert.</p>
      </form>`;
    const m = this.h.modal('Konto', body);
    m.el.querySelector('.modal')!.classList.add('narrow');
    const form = m.el.querySelector('form')!;
    const err = form.querySelector<HTMLElement>('.form-error')!;
    const ok = form.querySelector<HTMLElement>('.form-ok')!;
    const setMode = (md: 'login' | 'register') => {
      mode = md;
      m.el.querySelectorAll<HTMLElement>('.auth-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === md));
      form.querySelectorAll<HTMLElement>('[data-only="register"]').forEach((el) => {
        el.hidden = md !== 'register' || (!el.matches('label') && !this.requireApproval);
      });
      (form.querySelector('[name="password"]') as HTMLInputElement).autocomplete = md === 'register' ? 'new-password' : 'current-password';
      form.querySelector('button[type="submit"]')!.textContent = md === 'register' ? 'Konto erstellen' : 'Anmelden';
      err.hidden = true;
    };
    m.el.querySelectorAll<HTMLElement>('.auth-tabs button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as any)));
    setMode(mode);
    (form.querySelector(mode === 'register' ? '[name="name"]' : '[name="email"]') as HTMLInputElement).focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get('email') ?? '').trim();
      const password = String(fd.get('password') ?? '');
      err.hidden = true;
      ok.hidden = true;
      if (mode === 'register' && password !== String(fd.get('password2') ?? '')) {
        err.textContent = 'Die Passwörter stimmen nicht überein.';
        err.hidden = false;
        return;
      }
      try {
        const r = await api<{ user: User | null; pending?: boolean; message?: string }>(`/auth/${mode}`, {
          method: 'POST',
          body: mode === 'register' ? { email, password, name: String(fd.get('name') ?? '') } : { email, password },
        });
        if (r.pending || !r.user) {
          setMode('login');
          form.reset();
          ok.textContent = r.message ?? 'Konto angelegt – bitte auf die Freigabe warten.';
          ok.hidden = false;
          return;
        }
        this.user = r.user;
        this.firstUser = false;
        m.close();
        this.render();
        this.refreshPending();
        this.h.toast(mode === 'register' ? `Willkommen, ${r.user.name}!${r.user.role === 'admin' ? ' Du bist Administrator.' : ''}` : `Angemeldet als ${r.user.name}.`);
        // vorhandene lokale Planung direkt anbieten
        if (!this.currentId && (store.project.walls.length || store.project.items.length)) {
          if (confirm('Möchtest du die aktuelle Planung in deinem Profil speichern?')) this.save();
        }
      } catch (ex) {
        err.textContent = (ex as Error).message;
        err.hidden = false;
      }
    });
  }

  async openProjects() {
    if (!this.user) return this.openLogin();
    const { esc } = this.h;
    const m = this.h.modal('Meine Planungen', '<p class="hint">Lade …</p>');
    m.el.querySelector('.modal')!.classList.add('wide');
    const body = m.el.querySelector('.body')!;
    const draw = async () => {
      let list: ProjectMeta[] = [];
      try {
        list = (await api<{ projects: ProjectMeta[] }>('/projects')).projects;
      } catch (e) {
        body.innerHTML = `<p class="form-error">${esc((e as Error).message)}</p>`;
        return;
      }
      const current = store.project.name || 'Aktuelle Planung';
      const currentBox = this.currentId
        ? `<div class="proj-current"><div><small>Gerade geöffnet</small><b>${esc(current)}</b><span class="${this.dirty ? 'warn' : ''}">${this.dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert ✓'}</span></div>
             <div class="proj-current-actions">${this.dirty ? '<button class="btn primary" data-top="save">Änderungen speichern</button>' : ''}<button class="btn" data-top="saveas">Als neue Planung speichern</button></div></div>`
        : `<div class="proj-current"><div><small>Gerade geöffnet</small><b>${esc(current)}</b><span class="warn">Noch nicht in deinem Konto gespeichert</span></div>
             <div class="proj-current-actions"><button class="btn primary" data-top="save">Im Konto speichern</button></div></div>`;
      const cards = list
        .map((p) => {
          const isCurrent = p.id === this.currentId;
          return `<div class="proj-card ${isCurrent ? 'on' : ''}" data-id="${p.id}">
            <button class="proj-thumb" data-act="open" title="Öffnen" ${p.thumbnail ? `style="background-image:url(${p.thumbnail})"` : ''}>${p.thumbnail ? '' : 'Keine Vorschau'}${isCurrent ? '<span class="pill on-pill">Geöffnet</span>' : ''}</button>
            <div class="proj-info"><b>${esc(p.name)}</b><small>Zuletzt gespeichert ${fmtDate(p.updatedAt)}</small></div>
            <div class="proj-actions">
              <button class="btn ${isCurrent ? '' : 'primary'}" data-act="open" ${isCurrent && !this.dirty ? 'disabled' : ''}>${isCurrent ? (this.dirty ? 'Neu laden' : 'Geöffnet') : 'Öffnen'}</button>
              <button class="btn" data-act="rename">Umbenennen</button>
              <button class="btn ${p.shareToken ? 'on' : ''}" data-act="share" title="Showroom-Link zum Ansehen ohne Anmeldung">${p.shareToken ? 'Geteilt' : 'Teilen'}</button>
              <button class="btn danger icon" data-act="delete" title="Löschen">✕</button>
            </div>
          </div>`;
        })
        .join('');
      body.innerHTML = `${currentBox}
        <div class="proj-head"><h3>Gespeicherte Planungen (${list.length})</h3><button class="btn" data-top="new">+ Neue Planung beginnen</button></div>
        ${list.length ? `<div class="proj-grid">${cards}</div>` : '<p class="hint">Noch keine Planungen in deinem Konto. Speichere die aktuelle Planung oben, um sie später hier wieder zu öffnen.</p>'}`;

      body.querySelector('[data-top="save"]')?.addEventListener('click', async () => {
        if (await this.save()) draw();
      });
      body.querySelector('[data-top="saveas"]')?.addEventListener('click', async () => {
        if (await this.save(true)) draw();
      });
      body.querySelector('[data-top="new"]')!.addEventListener('click', () => {
        m.close();
        this.h.newPlan();
      });
      body.querySelectorAll<HTMLElement>('.proj-card').forEach((card) => {
        const id = Number(card.dataset.id);
        const p = list.find((x) => x.id === id)!;
        card.querySelectorAll('[data-act="open"]').forEach((b) =>
          b.addEventListener('click', async () => {
            if (id === this.currentId && !this.dirty) return m.close();
            if (id === this.currentId) this.savedSnapshot = ''; // „Neu laden“ verwirft lokale Änderungen nach Rückfrage
            if (await this.load(id)) m.close();
            else draw();
          }),
        );
        card.querySelector('[data-act="share"]')!.addEventListener('click', () => this.openShare(id, p.name, () => draw()));
        card.querySelector('[data-act="rename"]')!.addEventListener('click', async () => {
          const n = await this.askName('Planung umbenennen', p.name, 'Umbenennen');
          if (!n) return;
          try {
            await api(`/projects/${id}`, { method: 'PUT', body: { name: n } });
            if (id === this.currentId) {
              const wasDirty = this.dirty;
              store.project.name = n;
              store.commit();
              if (!wasDirty) this.savedSnapshot = JSON.stringify(store.project);
            }
            draw();
          } catch (e) {
            this.h.toast((e as Error).message);
          }
        });
        card.querySelector('[data-act="delete"]')!.addEventListener('click', async () => {
          if (!confirm(`Planung „${p.name}“ endgültig aus deinem Konto löschen?`)) return;
          try {
            await api(`/projects/${id}`, { method: 'DELETE' });
            if (id === this.currentId) {
              this.setCurrent(null);
              this.render();
            }
            draw();
          } catch (e) {
            this.h.toast((e as Error).message);
          }
        });
      });
    };
    draw();
  }

  /** Vor dem Teilen: ungespeicherte Änderungen speichern? (geteilt wird immer der gespeicherte Stand) */
  private async askShareSave(): Promise<boolean | null> {
    if (confirm('Geteilt wird der im Konto gespeicherte Stand. Aktuelle Änderungen jetzt speichern?')) return this.save();
    return null;
  }

  /** Dialog: Showroom-Link erzeugen, kopieren oder deaktivieren */
  async openShare(id: number, name: string, onChange?: () => void) {
    const { esc } = this.h;
    const m = this.h.modal('Planung teilen', '<p class="hint">Lade …</p>');
    m.el.querySelector('.modal')!.classList.add('narrow');
    const body = m.el.querySelector('.body')!;
    const showLink = (token: string) => {
      const url = `${location.origin}/?ansicht=${encodeURIComponent(token)}`;
      body.innerHTML = `
        <p>„${esc(name)}“ kann über diesen Link <b>ohne Anmeldung</b> im Showroom angesehen werden – nur lesend, Änderungen sind nicht möglich.</p>
        <div class="share-row"><input type="text" readonly value="${esc(url)}" /><button class="btn primary" data-copy>Kopieren</button></div>
        <p class="hint">Der Link zeigt immer den zuletzt <b>gespeicherten</b> Stand. Wer den Link hat, kann die Küche ansehen.</p>
        <div class="actions" style="display:flex;gap:8px;justify-content:space-between;margin-top:10px">
          <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Vorschau öffnen</a>
          <button class="btn danger" data-revoke>Link deaktivieren</button>
        </div>`;
      const input = body.querySelector('input')!;
      input.addEventListener('focus', () => input.select());
      body.querySelector('[data-copy]')!.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          input.select();
          document.execCommand('copy');
        }
        this.h.toast('Link kopiert.');
      });
      body.querySelector('[data-revoke]')!.addEventListener('click', async () => {
        if (!confirm('Link deaktivieren? Wer den Link hat, kann die Küche danach nicht mehr ansehen.')) return;
        try {
          await api(`/projects/${id}/share`, { method: 'DELETE' });
          m.close();
          this.h.toast('Freigabe-Link deaktiviert.');
          onChange?.();
        } catch (e) {
          this.h.toast((e as Error).message);
        }
      });
    };
    try {
      const r = await api<{ token: string }>(`/projects/${id}/share`, { method: 'POST', body: {} });
      showLink(r.token);
      onChange?.();
    } catch (e) {
      body.innerHTML = `<p class="form-error">${esc((e as Error).message)}</p>`;
    }
  }

  private openPassword() {
    const m = this.h.modal(
      'Passwort ändern',
      `<form class="auth-form">
        <label class="field"><span>Aktuelles Passwort</span><input type="password" name="current" autocomplete="current-password" /></label>
        <label class="field"><span>Neues Passwort (min. 8 Zeichen)</span><input type="password" name="password" autocomplete="new-password" /></label>
        <label class="field"><span>Neues Passwort wiederholen</span><input type="password" name="password2" autocomplete="new-password" /></label>
        <p class="form-error" hidden></p>
        <button class="btn primary" type="submit" style="width:100%;justify-content:center">Passwort ändern</button>
      </form>`,
    );
    m.el.querySelector('.modal')!.classList.add('narrow');
    const form = m.el.querySelector('form')!;
    const err = form.querySelector<HTMLElement>('.form-error')!;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      if (fd.get('password') !== fd.get('password2')) {
        err.textContent = 'Die neuen Passwörter stimmen nicht überein.';
        err.hidden = false;
        return;
      }
      try {
        await api('/auth/password', { method: 'POST', body: { current: fd.get('current'), password: fd.get('password') } });
        m.close();
        this.h.toast('Passwort geändert. Andere Sitzungen wurden abgemeldet.');
      } catch (ex) {
        err.textContent = (ex as Error).message;
        err.hidden = false;
      }
    });
  }

  private async openAdmin() {
    const { esc } = this.h;
    const m = this.h.modal('Benutzerverwaltung', '<p class="hint">Lade …</p>');
    const body = m.el.querySelector('.body')!;
    const act = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (ex) {
        this.h.toast((ex as Error).message);
      }
      draw();
    };
    const draw = async () => {
      let users: (User & { projects: number })[] = [];
      let settings = { registrationEnabled: true, requireApproval: false };
      try {
        const [u, st] = await Promise.all([
          api<{ users: (User & { projects: number })[] }>('/admin/users'),
          api<{ settings: typeof settings; pending: number }>('/admin/settings'),
        ]);
        users = u.users;
        settings = st.settings;
        this.pendingCount = st.pending;
        this.render();
      } catch (e) {
        body.innerHTML = `<p class="form-error">${esc((e as Error).message)}</p>`;
        return;
      }
      const pending = users.filter((u) => u.status === 'pending');
      body.innerHTML = `
        <h3>Registrierung</h3>
        <label class="row switch"><input type="checkbox" data-set="registrationEnabled" ${settings.registrationEnabled ? 'checked' : ''} />
          <span><b>Registrierung erlauben</b><small>Wenn deaktiviert, können sich keine neuen Benutzer selbst registrieren.</small></span></label>
        <label class="row switch"><input type="checkbox" data-set="requireApproval" ${settings.requireApproval ? 'checked' : ''} />
          <span><b>Neue Benutzer müssen freigegeben werden</b><small>Neue Konten können das Tool erst nutzen, nachdem ein Administrator sie freigegeben hat.</small></span></label>
        ${pending.length ? `<div class="pending-note">${pending.length > 1 ? `${pending.length} Konten warten` : '1 Konto wartet'} auf Freigabe.</div>` : ''}
        <h3>Benutzer</h3>
        <table class="user-table">
        <thead><tr><th>Name</th><th>E-Mail</th><th>Planungen</th><th>Seit</th><th>Status</th><th>Rolle</th><th></th></tr></thead>
        <tbody>${users
          .map((u) => {
            const self = u.id === this.user?.id;
            const actions = self
              ? ''
              : u.status === 'pending'
                ? '<button class="btn primary" data-approve>Freigeben</button><button class="btn danger" data-del>Ablehnen</button>'
                : '<button class="btn" data-lock title="Zugang sperren, bis er wieder freigegeben wird">Sperren</button><button class="btn danger icon" data-del title="Benutzer löschen">✕</button>';
            return `<tr data-id="${u.id}" class="${u.status === 'pending' ? 'is-pending' : ''}">
              <td>${esc(u.name)}${self ? ' <small>(du)</small>' : ''}</td>
              <td>${esc(u.email)}</td>
              <td>${u.projects}</td>
              <td>${fmtDate(u.createdAt).split(',')[0]}</td>
              <td>${u.status === 'pending' ? '<span class="pill warn">Wartet auf Freigabe</span>' : '<span class="pill">Aktiv</span>'}</td>
              <td><select data-role ${self ? 'title="Eigene Rolle"' : ''}><option value="user" ${u.role === 'user' ? 'selected' : ''}>Benutzer</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option></select></td>
              <td><div class="row-actions">${actions}</div></td>
            </tr>`;
          })
          .join('')}</tbody></table>`;

      body.querySelectorAll<HTMLInputElement>('[data-set]').forEach((cb) =>
        cb.addEventListener('change', () => act(() => api('/admin/settings', { method: 'PUT', body: { [cb.dataset.set!]: cb.checked } }))),
      );
      body.querySelectorAll<HTMLElement>('tr[data-id]').forEach((row) => {
        const id = Number(row.dataset.id);
        const u = users.find((x) => x.id === id)!;
        row.querySelector<HTMLSelectElement>('[data-role]')!.addEventListener('change', async (e) => {
          const role = (e.target as HTMLSelectElement).value;
          if (id === this.user?.id && role === 'user' && !confirm('Du entziehst dir selbst die Administratorrechte. Fortfahren?')) return draw();
          try {
            await api(`/admin/users/${id}`, { method: 'PUT', body: { role } });
            if (id === this.user?.id && role === 'user') {
              this.user.role = 'user';
              this.pendingCount = 0;
              m.close();
              this.render();
              return;
            }
          } catch (ex) {
            this.h.toast((ex as Error).message);
          }
          draw();
        });
        row.querySelector('[data-approve]')?.addEventListener('click', () =>
          act(async () => {
            await api(`/admin/users/${id}`, { method: 'PUT', body: { status: 'active' } });
            this.h.toast(`${u.name} wurde freigegeben.`);
          }),
        );
        row.querySelector('[data-lock]')?.addEventListener('click', () => {
          if (!confirm(`Zugang von „${u.name}“ sperren? Der Benutzer wird sofort abgemeldet und muss erneut freigegeben werden.`)) return;
          act(() => api(`/admin/users/${id}`, { method: 'PUT', body: { status: 'pending' } }));
        });
        row.querySelector('[data-del]')?.addEventListener('click', () => {
          const msg = u.status === 'pending' ? `Registrierung von „${u.name}“ (${u.email}) ablehnen und Konto löschen?` : `Benutzer „${u.name}“ (${u.email}) mit allen ${u.projects} Planungen endgültig löschen?`;
          if (!confirm(msg)) return;
          act(() => api(`/admin/users/${id}`, { method: 'DELETE' }));
        });
      });
    };
    draw();
  }
}
