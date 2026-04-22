import { getAllTaskLists, saveTaskList, deleteTaskList, getTaskList } from '../db/store.js';
import { recordTaskListDeletion } from '../sync/tombstone.js';
import { markLocalChange } from '../sync/cloud-store.js';
import { escapeHtml } from '../utils.js';

let containerEl;

export async function initTasksManager(containerId) {
  containerEl = document.getElementById(containerId);
  await renderTaskLists();
}

export async function renderTaskLists() {
  if (!containerEl) return;
  const lists = await getAllTaskLists();
  lists.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  containerEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'tasks-header';
  header.innerHTML = `<h2>Tasks</h2>`;

  const addListBtn = document.createElement('button');
  addListBtn.className = 'btn-new-list';
  addListBtn.title = 'New list';
  addListBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
    </svg>
    New list`;
  addListBtn.addEventListener('click', () => createNewList());
  header.appendChild(addListBtn);
  containerEl.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'tasklists';
  containerEl.appendChild(grid);

  if (lists.length === 0) {
    grid.innerHTML = `<div class="tasks-empty">No lists yet. Click "New list" to start.</div>`;
  } else {
    for (const tl of lists) {
      grid.appendChild(buildCard(tl));
    }
  }
}

function buildCard(tl) {
  const card = document.createElement('div');
  card.className = 'tasklist-card';
  card.dataset.id = tl.id;

  // ── Header: editable title + delete ──
  const cardHeader = document.createElement('div');
  cardHeader.className = 'tasklist-header';

  const title = document.createElement('div');
  title.className = 'tasklist-title';
  title.contentEditable = 'true';
  title.textContent = tl.n;
  title.dataset.placeholder = 'List title';
  title.addEventListener('blur', async () => {
    const val = title.textContent.trim();
    if (!val) { title.textContent = tl.n; return; }
    if (val === tl.n) return;
    tl.n = val;
    tl.updatedAt = Date.now();
    await saveTaskList(tl);
    markLocalChange();
  });
  title.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
    if (e.key === 'Escape') { title.textContent = tl.n; title.blur(); }
  });

  const deleteListBtn = document.createElement('button');
  deleteListBtn.className = 'btn-delete-list';
  deleteListBtn.title = 'Delete list';
  deleteListBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <polyline points="1,3 13,3"/><path d="M5,3V2h4v1"/><path d="M2,3l1,9h8l1-9"/>
    <line x1="5.5" y1="6" x2="5.5" y2="10"/><line x1="8.5" y1="6" x2="8.5" y2="10"/>
  </svg>`;
  deleteListBtn.addEventListener('click', async () => {
    if (!confirm(`Delete "${tl.n}"?`)) return;
    recordTaskListDeletion(tl);
    await deleteTaskList(tl.id);
    markLocalChange();
    card.remove();
    const grid = containerEl.querySelector('.tasklists');
    if (grid && !grid.querySelector('.tasklist-card')) {
      grid.innerHTML = `<div class="tasks-empty">No lists yet. Click "New list" to start.</div>`;
    }
  });

  cardHeader.appendChild(title);
  cardHeader.appendChild(deleteListBtn);
  card.appendChild(cardHeader);

  // ── Tasks ──
  const tasks = tl.t || [];
  const pending = tasks.map((t, i) => ({ t, i })).filter(({ t }) => t.s !== 1);
  const done    = tasks.map((t, i) => ({ t, i })).filter(({ t }) => t.s === 1);

  const pendingList = document.createElement('div');
  pendingList.className = 'tasks-list';
  for (const { t, i } of pending) {
    pendingList.appendChild(buildTaskRow(tl, t, i));
  }
  card.appendChild(pendingList);

  if (done.length > 0) {
    const details = document.createElement('details');
    details.className = 'tasks-done-section';
    const summary = document.createElement('summary');
    summary.textContent = `${done.length} completed`;
    details.appendChild(summary);
    for (const { t, i } of done) {
      details.appendChild(buildTaskRow(tl, t, i));
    }
    card.appendChild(details);
  }

  // ── Add item row ──
  const addRow = document.createElement('div');
  addRow.className = 'task-add-row';

  const addIcon = document.createElement('span');
  addIcon.className = 'task-add-icon';
  addIcon.textContent = '+';

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'task-add-input';
  addInput.placeholder = 'Add item';

  addInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const text = addInput.value.trim();
      if (!text) return;
      if (!tl.t) tl.t = [];
      tl.t.push({ x: text, s: 0, p: null });
      tl.updatedAt = Date.now();
      await saveTaskList(tl);
      markLocalChange();
      addInput.value = '';
      // Rebuild just the pending list in place (keep focus in addInput)
      const newPending = tl.t.map((t, i) => ({ t, i })).filter(({ t }) => t.s !== 1);
      pendingList.innerHTML = '';
      for (const { t, i } of newPending) {
        pendingList.appendChild(buildTaskRow(tl, t, i));
      }
    }
    if (e.key === 'Escape') addInput.blur();
  });

  addRow.appendChild(addIcon);
  addRow.appendChild(addInput);
  card.appendChild(addRow);

  return card;
}

function buildTaskRow(tl, task, idx) {
  const row = document.createElement('div');
  row.className = 'task-item' + (task.s === 1 ? ' is-done' : '');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.s === 1;
  checkbox.addEventListener('change', async () => {
    task.s = checkbox.checked ? 1 : 0;
    tl.updatedAt = Date.now();
    await saveTaskList(tl);
    markLocalChange();
    // Rebuild full card to move item to done section
    const card = row.closest('.tasklist-card');
    if (card) card.replaceWith(buildCard(tl));
  });

  const text = document.createElement('span');
  text.className = 'task-text';
  text.contentEditable = 'true';
  text.textContent = task.x;
  text.addEventListener('blur', async () => {
    const val = text.textContent.trim();
    if (!val) {
      tl.t.splice(idx, 1);
    } else {
      task.x = val;
    }
    tl.updatedAt = Date.now();
    await saveTaskList(tl);
    markLocalChange();
    if (!val) row.remove();
  });
  text.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); text.blur(); }
    if (e.key === 'Escape') { text.textContent = task.x; text.blur(); }
  });

  const del = document.createElement('button');
  del.className = 'btn-delete-task';
  del.title = 'Delete';
  del.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
  </svg>`;
  del.addEventListener('click', async () => {
    tl.t.splice(idx, 1);
    tl.updatedAt = Date.now();
    await saveTaskList(tl);
    markLocalChange();
    row.remove();
  });

  row.appendChild(checkbox);
  row.appendChild(text);
  row.appendChild(del);
  return row;
}

function createNewList() {
  const grid = containerEl.querySelector('.tasklists');
  if (!grid) return;

  // Remove empty state if present
  const empty = grid.querySelector('.tasks-empty');
  if (empty) empty.remove();

  const tempCard = document.createElement('div');
  tempCard.className = 'tasklist-card tasklist-card-new';

  const hdr = document.createElement('div');
  hdr.className = 'tasklist-header';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'tasklist-new-title';
  titleInput.placeholder = 'List title…';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-delete-list';
  cancelBtn.title = 'Cancel';
  cancelBtn.textContent = '×';
  cancelBtn.addEventListener('click', () => {
    tempCard.remove();
    if (!grid.querySelector('.tasklist-card')) {
      grid.innerHTML = `<div class="tasks-empty">No lists yet. Click "New list" to start.</div>`;
    }
  });

  hdr.appendChild(titleInput);
  hdr.appendChild(cancelBtn);
  tempCard.appendChild(hdr);

  const addRow = document.createElement('div');
  addRow.className = 'task-add-row';
  addRow.innerHTML = `<span class="task-add-icon">+</span><input type="text" class="task-add-input" placeholder="Add item" disabled />`;
  tempCard.appendChild(addRow);

  const save = async () => {
    const name = titleInput.value.trim();
    tempCard.remove();
    if (!name) {
      if (!grid.querySelector('.tasklist-card')) {
        grid.innerHTML = `<div class="tasks-empty">No lists yet. Click "New list" to start.</div>`;
      }
      return;
    }
    const tl = { id: crypto.randomUUID(), n: name, t: [], updatedAt: Date.now() };
    await saveTaskList(tl);
    markLocalChange();
    grid.prepend(buildCard(tl));
  };

  titleInput.addEventListener('blur', save);
  titleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); titleInput.blur(); }
    if (e.key === 'Escape') { titleInput.value = ''; titleInput.blur(); }
  });

  grid.prepend(tempCard);
  titleInput.focus();
}
