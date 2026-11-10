// Persistenza locale senza librerie; nessun dato del cliente in cache HTTP.
const NAME = 'ge360-smart-local';
const VERSION = 1;
let promise;
export function openDB() {
  if (!promise) promise = new Promise((resolve,reject)=>{
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = ()=>{
      const db=req.result;
      if (!db.objectStoreNames.contains('surveys')) db.createObjectStore('surveys',{keyPath:'id'});
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos',{keyPath:'local_id'});
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings',{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return promise;
}
export async function store(table, value) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(table,'readwrite');
    tx.objectStore(table).put(value);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}
export async function one(table, key) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(table,'readonly');
    const req=tx.objectStore(table).get(key);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
export async function all(table) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(table,'readonly');
    const req=tx.objectStore(table).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
export async function remove(table,key) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(table,'readwrite');
    tx.objectStore(table).delete(key);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}
