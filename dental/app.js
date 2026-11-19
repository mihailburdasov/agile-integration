import { CLIENTS, getClient } from './data.js';
import { createJawViewer, toothName } from './jaw3d.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  search: $('#client-search'),
  list: $('#client-list'),
  select: $('#client-select'),
  panel: $('#panel'),
  info: $('#tooth-info'),
  labels: $('#toggle-labels'),
  reset: $('#reset-view'),
  download: $('#download'),
  jawButtons: document.querySelectorAll('.seg [data-jaw]'),
};

const state = {
  clientId: null,   // id from URL / selection (may be unknown)
  client: null,     // resolved client or null
  override: null,   // tooth number from ?tooth= (mailing override)
  filter: '',
  showLabels: false,
  jaw: 'both',
};

const viewer = createJawViewer($('#viewer-mount'));

/* ---------- helpers ---------- */

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

function fmtDate(iso, short = false) {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso || '';
  return (short ? shortFmt : dateFmt).format(d);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeName(fdi) {
  try { return toothName(fdi) || ''; } catch { return ''; }
}

/** Plan as displayed: applies the mailing override (?tooth=) if present. */
function effectivePlan(client) {
  const { current, next } = client.plan;
  const o = state.override;
  if (!o || o === current.tooth) return { current, next, overridden: false };
  const fromNext = next.find((n) => n.tooth === o);
  return {
    current: {
      tooth: o,
      procedure: fromNext ? fromNext.procedure : current.procedure,
      date: current.date,
    },
    next: next.filter((n) => n.tooth !== o).slice(0, 2),
    overridden: true,
  };
}

function personalLink(client, tooth) {
  const url = new URL('index.html', location.href);
  url.search = new URLSearchParams({ client: client.id, tooth: String(tooth) }).toString();
  return url.href;
}

/* ---------- rendering ---------- */

function renderList() {
  const q = state.filter.trim().toLowerCase();
  const rows = CLIENTS.filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.includes(q));
  els.list.innerHTML = rows.length
    ? rows.map((c) => `
      <li>
        <button type="button" data-id="${esc(c.id)}" aria-current="${c.id === state.clientId}">
          <span class="cl-name">${esc(c.name)}</span>
          <span class="cl-tooth" title="Текущий зуб">${c.plan.current.tooth}</span>
          <span class="cl-date">${fmtDate(c.scanDate, true)}</span>
        </button>
      </li>`).join('')
    : '<li class="client-empty">Ничего не найдено</li>';

  const known = !!state.client;
  els.select.innerHTML =
    (known ? '' : '<option value="" selected disabled>Пациент не найден</option>') +
    CLIENTS.map((c) => `<option value="${esc(c.id)}"${c.id === state.clientId ? ' selected' : ''}>${esc(c.name)} · зуб ${c.plan.current.tooth}</option>`).join('');
}

function renderPanel() {
  const c = state.client;
  if (!c) {
    els.panel.innerHTML = `<div class="notfound">Пациент не найден${state.clientId ? ` <span class="label">(${esc(state.clientId)})</span>` : ''}</div>`;
    return;
  }
  const plan = effectivePlan(c);
  const steps = [
    { ...plan.current, isCurrent: true },
    ...plan.next.map((n) => ({ ...n, isCurrent: false })),
  ];
  const link = personalLink(c, plan.current.tooth);

  els.panel.innerHTML = `
    <section class="section">
      <div class="label">Пациент</div>
      <h1 class="client-name">${esc(c.name)}</h1>
      <dl class="meta">
        <dt>ID</dt><dd>${esc(c.id)}</dd>
        <dt>3D-снимок</dt><dd>${fmtDate(c.scanDate)}</dd>
        <dt>Врач</dt><dd>${esc(c.doctor)}</dd>
      </dl>
      ${plan.overridden ? `<div class="override-note">Зуб ${plan.current.tooth} выделен по ссылке из письма</div>` : ''}
    </section>

    <section class="section">
      <div class="label">План лечения</div>
      <ol class="plan">
        ${steps.map((s, i) => `
          <li>
            <button type="button" class="step${s.isCurrent ? ' is-current' : ''}" data-tooth="${s.tooth}">
              <span class="marker">${i + 1}</span>
              <span>
                <div class="step-num">${s.tooth}</div>
                <div class="step-name">${esc(safeName(s.tooth))}</div>
                <div class="step-proc">${esc(s.procedure)}</div>
                <div class="step-status">${s.isCurrent
                  ? `Текущий визит · ${fmtDate(s.date)}`
                  : `Следующий этап · ориентировочно ${fmtDate(s.eta)}`}</div>
              </span>
            </button>
          </li>`).join('')}
      </ol>
    </section>

    <section class="section">
      <div class="label">Рассылка</div>
      <div class="subject">${esc(c.mailing.subject)}</div>
      <div class="sent">Отправлено ${fmtDate(c.mailing.sentAt)}</div>
      <div class="copy-row">
        <input class="input" id="personal-link" type="text" readonly value="${esc(link)}" aria-label="Персональная ссылка">
        <button type="button" class="btn" id="copy-link">Копировать</button>
      </div>
      <a class="email-link" href="email.html?client=${encodeURIComponent(c.id)}">Открыть шаблон письма</a>
    </section>`;
}

function renderToothInfo(fdi) {
  if (fdi == null) { els.info.hidden = true; return; }
  let status = 'не входит в план';
  const c = state.client;
  if (c) {
    const plan = effectivePlan(c);
    if (plan.current.tooth === fdi) status = 'лечение сейчас';
    else if (plan.next.some((n) => n.tooth === fdi)) status = 'следующий этап';
    else if (c.treated.includes(fdi)) status = 'пролечено';
  }
  const name = safeName(fdi);
  els.info.innerHTML = `<b>Зуб ${fdi}</b>${name ? ` — ${esc(name)}` : ''} <span class="muted">· ${status}</span>`;
  els.info.hidden = false;
}

function applyViewer({ focus } = {}) {
  const c = state.client;
  if (c) {
    const plan = effectivePlan(c);
    viewer.setPlan({ current: plan.current.tooth, next: plan.next.map((n) => n.tooth), treated: c.treated });
  } else {
    viewer.setPlan({ current: null, next: [], treated: [] });
  }
  viewer.resetView();
  if (focus != null) viewer.focusTooth(focus);
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.clientId) params.set('client', state.clientId);
  if (state.override) params.set('tooth', String(state.override));
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function selectClient(id, { override = null, updateUrl = true } = {}) {
  state.clientId = id;
  state.client = getClient(id);
  state.override = state.client ? override : null;
  renderList();
  renderPanel();
  renderToothInfo(null);
  applyViewer({ focus: state.override });
  if (updateUrl) syncUrl();
}

/* ---------- events ---------- */

els.search.addEventListener('input', () => { state.filter = els.search.value; renderList(); });

els.list.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (btn && btn.dataset.id !== state.clientId) selectClient(btn.dataset.id);
});

els.select.addEventListener('change', () => { if (els.select.value) selectClient(els.select.value); });

els.panel.addEventListener('click', async (e) => {
  const step = e.target.closest('.step[data-tooth]');
  if (step) {
    const fdi = Number(step.dataset.tooth);
    viewer.focusTooth(fdi);
    renderToothInfo(fdi);
    els.panel.querySelectorAll('.step').forEach((s) => s.setAttribute('aria-current', String(s === step)));
    return;
  }
  if (e.target.closest('#copy-link')) {
    const input = $('#personal-link');
    const btn = e.target.closest('#copy-link');
    try {
      await navigator.clipboard.writeText(input.value);
      btn.textContent = 'Скопировано';
    } catch {
      try { input.select(); document.execCommand('copy'); btn.textContent = 'Скопировано'; }
      catch { btn.textContent = 'Не удалось'; }
    }
    setTimeout(() => { btn.textContent = 'Копировать'; }, 1500);
  }
});

els.jawButtons.forEach((b) => b.addEventListener('click', () => {
  state.jaw = b.dataset.jaw;
  els.jawButtons.forEach((x) => x.classList.toggle('is-on', x === b));
  viewer.setJaw(state.jaw);
}));

els.labels.addEventListener('click', () => {
  state.showLabels = !state.showLabels;
  els.labels.setAttribute('aria-pressed', String(state.showLabels));
  viewer.setShowLabels(state.showLabels);
});

els.reset.addEventListener('click', () => { viewer.resetView(); renderToothInfo(null); });

els.download.addEventListener('click', () => {
  try {
    const a = document.createElement('a');
    a.href = viewer.snapshot();
    a.download = `snapshot-${state.client ? state.client.id : 'unknown'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error('Snapshot failed', err);
  }
});

viewer.onToothClick((fdi) => { renderToothInfo(fdi); viewer.focusTooth(fdi); });
viewer.onToothHover((fdi) => {
  document.getElementById('viewer').style.cursor = fdi == null ? '' : 'pointer';
});

/* ---------- init ---------- */

const params = new URLSearchParams(location.search);
const initialId = params.get('client') || CLIENTS[0].id;
const toothParam = Number(params.get('tooth'));
const override = Number.isInteger(toothParam) && toothParam >= 11 && toothParam <= 48 ? toothParam : null;
selectClient(initialId, { override, updateUrl: !params.get('client') });
