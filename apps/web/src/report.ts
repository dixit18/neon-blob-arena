// apps/web/src/report.ts — GB-5: one shared safety bar for all 10 games.
// Mounted once by main.ts into the room view (no per-client edits): a ⚠
// button opening a report dialog (reason codes on the wire, localized
// labels) plus a local taunt-mute list. Per-client feed filtering reads
// isMuted() — that wiring is follow-up GB-5b.
import { t } from './strings.js';

export interface ReportCtx { http: string; game: string; room: string; name: string }

const MUTE_KEY = 'pg-muted';
const MUTE_CAP = 50;

export function getMuted(): string[] {
  try {
    const raw = localStorage.getItem(MUTE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, MUTE_CAP) : [];
  } catch { return []; }
}

function setMuted(list: string[]): void {
  try { localStorage.setItem(MUTE_KEY, JSON.stringify(list.slice(0, MUTE_CAP))); } catch { /* private */ }
}

export function isMuted(name: string): boolean {
  return getMuted().includes(name);
}

const REASONS = ['cheating', 'harassment', 'griefing', 'spam', 'other'] as const;

export function mountReportBar(host: HTMLElement, ctx: ReportCtx): void {
  host.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = '#rpBtn{cursor:pointer;background:none;border:1px solid #2A2A2E;border-radius:999px;color:#B9B2A4;font-weight:800;font-size:12px;padding:6px 12px;margin-top:8px}'
    + '#rpDlg{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;background:#121214;border:2px solid #C6F135;border-radius:16px;padding:18px;max-width:min(92vw,380px);box-shadow:0 12px 48px rgba(0,0,0,.7)}'
    + '#rpDlg h3{margin:0 0 10px;font-size:16px}'
    + '#rpDlg input,#rpDlg select{width:100%;box-sizing:border-box;margin-bottom:8px;padding:12px;border-radius:12px;border:2px solid #2A2A2E;background:#0E0E12;color:#fff;font-size:16px;font-weight:700}'
    + '#rpDlg .row{display:flex;gap:8px;margin-top:4px}'
    + '#rpSend{flex:1;cursor:pointer;border:none;border-radius:12px;padding:12px;font-weight:900;min-height:48px;background:#C6F135;color:#070708}'
    + '#rpCancel{cursor:pointer;border:2px solid #2A2A2E;border-radius:12px;padding:12px 16px;font-weight:800;min-height:48px;background:#0E0E12;color:#fff}'
    + '#rpStat{font-size:12px;color:#46E0D4;min-height:18px;margin-top:8px}'
    + '#rpMuted{font-size:12px;color:#B9B2A4;margin-top:8px;line-height:2}'
    + '#rpMuted button{cursor:pointer;background:none;border:1px solid #2A2A2E;border-radius:999px;color:#B9B2A4;font-size:11px;padding:2px 10px;margin-left:6px}';
  host.appendChild(css);

  const btn = document.createElement('button');
  btn.id = 'rpBtn';
  btn.textContent = t('report.open');
  host.appendChild(btn);

  const dlg = document.createElement('div');
  dlg.id = 'rpDlg';
  dlg.style.display = 'none';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-label', t('report.title'));
  const reasonOpts = REASONS.map((r) => `<option value="${r}">${t(`report.r-${r}`)}</option>`).join('');
  dlg.innerHTML = `<h3>${t('report.title')}</h3>`
    + `<input id="rpWho" maxlength="40" placeholder="${t('report.namePh')}" aria-label="${t('report.namePh')}" />`
    + `<select id="rpWhy" aria-label="${t('report.reason')}">${reasonOpts}</select>`
    + '<div class="row"><button id="rpSend"></button><button id="rpCancel"></button></div>'
    + '<div id="rpStat" role="status"></div>'
    + `<h3 style="margin-top:12px">${t('report.muteTitle')}</h3>`
    + `<div class="row"><input id="rpMuteWho" maxlength="40" placeholder="${t('report.mutePh')}" aria-label="${t('report.mutePh')}" style="flex:1" /><button id="rpMute" style="cursor:pointer;border:2px solid #2A2A2E;border-radius:12px;background:#0E0E12;color:#fff;padding:12px 16px;font-weight:800;min-height:48px"></button></div>`
    + '<div id="rpMuted"></div>';
  document.body.appendChild(dlg);
  const who = dlg.querySelector('#rpWho') as HTMLInputElement;
  const why = dlg.querySelector('#rpWhy') as HTMLSelectElement;
  const send = dlg.querySelector('#rpSend') as HTMLButtonElement;
  const cancel = dlg.querySelector('#rpCancel') as HTMLButtonElement;
  const stat = dlg.querySelector('#rpStat') as HTMLElement;
  const muteWho = dlg.querySelector('#rpMuteWho') as HTMLInputElement;
  const muteBtn = dlg.querySelector('#rpMute') as HTMLButtonElement;
  const mutedBox = dlg.querySelector('#rpMuted') as HTMLElement;
  send.textContent = t('report.send');
  cancel.textContent = t('report.cancel');
  muteBtn.textContent = t('report.muteBtn');

  const paintMuted = (): void => {
    const list = getMuted();
    mutedBox.innerHTML = '';
    if (list.length === 0) {
      mutedBox.textContent = t('report.empty');
      return;
    }
    for (const n of list) {
      const span = document.createElement('span');
      span.textContent = n + ' ';
      const un = document.createElement('button');
      un.textContent = t('report.unmute');
      un.addEventListener('click', () => {
        setMuted(getMuted().filter((x) => x !== n));
        paintMuted();
      });
      span.appendChild(un);
      mutedBox.appendChild(span);
    }
  };

  btn.addEventListener('click', () => {
    dlg.style.display = 'block';
    stat.textContent = '';
    paintMuted();
  });
  cancel.addEventListener('click', () => { dlg.style.display = 'none'; });
  muteBtn.addEventListener('click', () => {
    const n = muteWho.value.trim().slice(0, 40);
    if (!n) return;
    const list = getMuted();
    if (!list.includes(n)) setMuted([n, ...list]);
    muteWho.value = '';
    paintMuted();
  });
  send.addEventListener('click', () => {
    void (async () => {
      const reported = who.value.trim().slice(0, 40);
      if (!reported) return;
      stat.textContent = '…';
      try {
        const r = await fetch(`${ctx.http}/report`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            game: ctx.game, room: ctx.room,
            reporter: ctx.name, reported, reason: why.value,
          }),
        });
        if (r.status === 201) {
          stat.textContent = t('report.sent');
          who.value = '';
        } else {
          stat.textContent = t('report.failed');
        }
      } catch {
        stat.textContent = t('report.failed');
      }
    })();
  });
}
