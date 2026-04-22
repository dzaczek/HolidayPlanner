import { getAllTaskLists, saveTaskList, deleteTaskList, getAllPersons } from '../db/store.js';
import { recordTaskListDeletion } from '../sync/tombstone.js';
import { markLocalChange } from '../sync/cloud-store.js';
import { t } from '../i18n/i18n.js';
import { escapeHtml } from '../utils.js';
import { showModal, hideModal } from '../app.js';

let containerElement;

export async function initTasksManager(containerId) {
  containerElement = document.getElementById(containerId);
  await renderTaskLists();
}

export async function renderTaskLists() {
  if (!containerElement) return;

  const taskLists = await getAllTaskLists();
  // Always get persons for current year? Actually tasks are global, but we fetch persons from local to show colors.
  const currentYear = new Date().getFullYear();
  // Wait, getYear from calendar renderer is better, but this file shouldn't import renderer to avoid circular deps if not needed.
  // We can just use the DOM year or just get persons without year if possible, but store.js requires year.
  // Actually, we can dynamically import renderer or just get all persons from the first available year?
  // Let's import getYear from calendar.
  const { getYear } = await import('../calendar/renderer.js').catch(() => ({ getYear: () => new Date().getFullYear() }));
  const year = getYear();
  const persons = await getAllPersons(year);
  const personMap = new Map(persons.map(p => [p.id, p]));

  let html = `
    <div class="tasks-header">
      <h2>Tasks</h2>
      <button class="btn btn-primary" id="add-tasklist-btn">+</button>
    </div>
    <div class="tasklists">
  `;

  if (taskLists.length === 0) {
    html += `<div class="empty-state">No task lists yet. Click + to add one.</div>`;
  } else {
    for (const tl of taskLists) {
      html += `
        <div class="tasklist-card">
          <div class="tasklist-header">
            <h3>${escapeHtml(tl.n)}</h3>
            <button class="btn-icon delete-tasklist-btn" data-id="${tl.id}">🗑️</button>
          </div>
          <div class="tasks">
      `;
      const tasks = tl.t || [];
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const p = personMap.get(task.p);
        const colorStyle = p ? `border-left: 4px solid ${escapeHtml(p.color)};` : '';
        const statusIcon = task.s === 1 ? '✅' : task.s === 2 ? '❌' : '⬜';
        const textClass = task.s === 1 ? 'task-done' : task.s === 2 ? 'task-impossible' : '';
        html += `
          <div class="task-item" style="${colorStyle}">
            <button class="btn-icon task-status-btn" data-tlid="${tl.id}" data-tidx="${i}">${statusIcon}</button>
            <span class="task-text ${textClass}">${escapeHtml(task.x)}</span>
            <button class="btn-icon delete-task-btn" data-tlid="${tl.id}" data-tidx="${i}">✖</button>
          </div>
        `;
      }
      html += `
          </div>
          <button class="btn btn-secondary add-task-btn" data-tlid="${tl.id}">+ Add Task</button>
        </div>
      `;
    }
  }

  html += `</div>`;
  containerElement.innerHTML = html;
  attachTaskListeners(personMap);
}

function attachTaskListeners(personMap) {
  const addBtn = document.getElementById('add-tasklist-btn');
  if (addBtn) addBtn.addEventListener('click', showAddTaskListModal);

  document.querySelectorAll('.delete-tasklist-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('Are you sure you want to delete this list?')) return;
      const id = e.currentTarget.dataset.id;
      const tl = await import('../db/store.js').then(m => m.getTaskList(id));
      if (tl) recordTaskListDeletion(tl);
      await import('../db/store.js').then(m => m.deleteTaskList(id));
      markLocalChange();
      renderTaskLists();
    });
  });

  document.querySelectorAll('.add-task-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tlId = e.currentTarget.dataset.tlid;
      showAddTaskModal(tlId, personMap);
    });
  });

  document.querySelectorAll('.delete-task-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tlId = e.currentTarget.dataset.tlid;
      const tIdx = parseInt(e.currentTarget.dataset.tidx, 10);
      const tl = await import('../db/store.js').then(m => m.getTaskList(tlId));
      if (tl && tl.t) {
        tl.t.splice(tIdx, 1);
        tl.updatedAt = Date.now();
        await import('../db/store.js').then(m => m.saveTaskList(tl));
        markLocalChange();
        renderTaskLists();
      }
    });
  });

  document.querySelectorAll('.task-status-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tlId = e.currentTarget.dataset.tlid;
      const tIdx = parseInt(e.currentTarget.dataset.tidx, 10);
      const tl = await import('../db/store.js').then(m => m.getTaskList(tlId));
      if (tl && tl.t) {
        let s = tl.t[tIdx].s;
        s = (s + 1) % 3; // 0 -> 1 -> 2 -> 0
        tl.t[tIdx].s = s;
        tl.updatedAt = Date.now();
        await import('../db/store.js').then(m => m.saveTaskList(tl));
        markLocalChange();
        renderTaskLists();
      }
    });
  });
}

function showAddTaskListModal() {
  const html = `
    <h3>New Task List</h3>
    <div class="form-group">
      <label>List Name</label>
      <input type="text" id="tasklist-name-input" class="form-control" autocomplete="off" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="save-tasklist-btn">Save</button>
    </div>
  `;
  showModal(html);

  document.getElementById('modal-cancel').addEventListener('click', hideModal);
  document.getElementById('save-tasklist-btn').addEventListener('click', async () => {
    const name = document.getElementById('tasklist-name-input').value.trim();
    if (!name) return;
    const tl = {
      id: crypto.randomUUID(),
      n: name,
      t: [],
      updatedAt: Date.now()
    };
    await import('../db/store.js').then(m => m.saveTaskList(tl));
    markLocalChange();
    hideModal();
    renderTaskLists();
  });
}

function showAddTaskModal(tlId, personMap) {
  let personOptions = '<option value="">None</option>';
  for (const [id, p] of personMap.entries()) {
    personOptions += `<option value="${id}">${escapeHtml(p.name)}</option>`;
  }

  const html = `
    <h3>Add Task</h3>
    <div class="form-group">
      <label>Task</label>
      <input type="text" id="task-text-input" class="form-control" autocomplete="off" />
    </div>
    <div class="form-group">
      <label>Assign to Person</label>
      <select id="task-person-select" class="form-control">
        ${personOptions}
      </select>
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="task-status-select" class="form-control">
        <option value="0">To Do</option>
        <option value="1">Done</option>
        <option value="2">Impossible</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="save-task-btn">Save</button>
    </div>
  `;
  showModal(html);

  document.getElementById('modal-cancel').addEventListener('click', hideModal);
  document.getElementById('save-task-btn').addEventListener('click', async () => {
    const text = document.getElementById('task-text-input').value.trim();
    const pidStr = document.getElementById('task-person-select').value;
    const pId = pidStr ? parseInt(pidStr, 10) : null;
    const status = parseInt(document.getElementById('task-status-select').value, 10);

    if (!text) return;

    const tl = await import('../db/store.js').then(m => m.getTaskList(tlId));
    if (tl) {
      if (!tl.t) tl.t = [];
      tl.t.push({ x: text, p: pId, s: status });
      tl.updatedAt = Date.now();
      await import('../db/store.js').then(m => m.saveTaskList(tl));
      markLocalChange();
      hideModal();
      renderTaskLists();
    }
  });
}
