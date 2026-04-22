import { openDB } from 'idb';

const DB_NAME = 'hcp-calendar';
const DB_VERSION = 3;

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Persons store
      if (!db.objectStoreNames.contains('persons')) {
        const personStore = db.createObjectStore('persons', { keyPath: 'id', autoIncrement: true });
        personStore.createIndex('by-year', 'year');
        personStore.createIndex('by-category', 'category');
        personStore.createIndex('by-gemeinde', 'gemeinde');
      }

      // Holidays (assigned to persons - days off from menu/manual)
      if (!db.objectStoreNames.contains('holidays')) {
        const holidayStore = db.createObjectStore('holidays', { keyPath: 'id', autoIncrement: true });
        holidayStore.createIndex('by-person', 'personId');
        holidayStore.createIndex('by-date', 'date');
        holidayStore.createIndex('by-year', 'year');
        holidayStore.createIndex('by-person-year', ['personId', 'year']);
      }

      // Holiday templates (from database / menu)
      if (!db.objectStoreNames.contains('holidayTemplates')) {
        const templateStore = db.createObjectStore('holidayTemplates', { keyPath: 'id', autoIncrement: true });
        templateStore.createIndex('by-category', 'category');
        templateStore.createIndex('by-gemeinde', 'gemeinde');
        templateStore.createIndex('by-year', 'year');
        templateStore.createIndex('by-cat-gem-year', ['category', 'gemeinde', 'year']);
      }

      // Gemeinden
      if (!db.objectStoreNames.contains('gemeinden')) {
        const gemeindeStore = db.createObjectStore('gemeinden', { keyPath: 'id' });
        gemeindeStore.createIndex('by-country', 'country');
        gemeindeStore.createIndex('by-canton', 'canton');
      }

      // Leaves (vacation periods - border display, multi-person)
      if (!db.objectStoreNames.contains('leaves')) {
        const leaveStore = db.createObjectStore('leaves', { keyPath: 'id', autoIncrement: true });
        leaveStore.createIndex('by-year', 'year');
      }

      // Tasks (to-do lists, global)
      if (!db.objectStoreNames.contains('taskLists')) {
        db.createObjectStore('taskLists', { keyPath: 'id' });
      }
    },
  });
}
