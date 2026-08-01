// =====================================================
// TrekWorks Trip Mode (TTM) Service Worker
// Trip: FJ / SP-2026-Sep
// Scope: subdomain root (./)
// =====================================================

// Cache version updated 2 Aug 2026 to force a fresh offline cache
// and normalise current and former Task List filenames.
const CACHE_VERSION = "tw-fj-sp-2026-sep-2026-08-02-task-list-fix-v2";
const CACHE_NAME = `trekworks-${CACHE_VERSION}`;

// -----------------------------------------------------
// Trip Mode storage (IndexedDB)
// -----------------------------------------------------
const DB_NAME = "trekworks";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const TRIP_MODE_KEY = "tripMode:FJ-SP-2026-Sep";
const DEFAULT_MODE = "online";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getTripMode() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(TRIP_MODE_KEY);
      req.onsuccess = () => resolve(req.result || DEFAULT_MODE);
      req.onerror = () => resolve(DEFAULT_MODE);
    });
  } catch {
    return DEFAULT_MODE;
  }
}

// -----------------------------------------------------
// Core assets
// -----------------------------------------------------
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./fj-sp-2026-sep-offline.html",
  "./fj-sp-2026-sep-manifest.json",

  "./fj-sp-2026-sep-accommodation.html",
  "./fj-sp-2026-sep-activities.html",
  "./fj-sp-2026-sep-data-and-esim.html",
  "./fj-sp-2026-sep-flights.html",
  "./fj-sp-2026-sep-hire-car.html",
  "./fj-sp-2026-sep-insurance.html",
  "./fj-sp-2026-sep-task-list.html",

  "./fj-sp-2026-sep-external.html",

  "./assets/icons/icon-FJ-2026-192.png",
  "./assets/icons/icon-FJ-2026-512.png",
  "./assets/audio/fiji-theme.mp3"
];

const TASK_LIST_CANONICAL = "./fj-sp-2026-sep-task-list.html";

// -----------------------------------------------------
// Install
// -----------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await Promise.allSettled(
        CORE_ASSETS.map(async (asset) => {
          const req = new Request(asset, { cache: "reload" });
          const res = await fetch(req);
          if (!res || !res.ok) throw new Error(`Precache failed: ${asset} (${res && res.status})`);
          await cache.put(req, res);
        })
      );
    })()
  );

  self.skipWaiting();
});

// -----------------------------------------------------
// Activate
// -----------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("trekworks-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// -----------------------------------------------------
// Fetch handling
// -----------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(handleNavigation(event.request));
});

// -----------------------------------------------------
// Navigation strategy
// -----------------------------------------------------
async function handleNavigation(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_NAME);

  const isExternalRouter =
    url.pathname.endsWith("/fj-sp-2026-sep-external.html") ||
    url.pathname === "/fj-sp-2026-sep-external.html";

  const isTaskListRequest =
    url.pathname.endsWith("/fj-sp-2026-sep-task-list.html") ||
    url.pathname.endsWith("/fj-sp-2026-sep-task-list-guide.html");

  const isTripDocument =
    request.destination === "document" && !isExternalRouter;

  const canonicalExternalRequest = new Request("./fj-sp-2026-sep-external.html");
  const canonicalTaskListRequest = new Request(TASK_LIST_CANONICAL);
  const tripMode = await getTripMode();

  async function matchTripDocument() {
    // Support the current Task List filename and any retained legacy links.
    if (isTaskListRequest) {
      const taskListResponse = await cache.match(canonicalTaskListRequest, {
        ignoreSearch: true
      });
      if (taskListResponse) return taskListResponse;
    }

    return cache.match(request, { ignoreSearch: true });
  }

  // ================= OFFLINE =================
  if (tripMode === "offline") {
    if (isExternalRouter) {
      return (
        (await cache.match(canonicalExternalRequest, { ignoreSearch: true })) ||
        (await cache.match("./fj-sp-2026-sep-offline.html"))
      );
    }

    if (isTripDocument) {
      return (
        (await matchTripDocument()) ||
        (await cache.match("./index.html")) ||
        (await cache.match("./fj-sp-2026-sep-offline.html"))
      );
    }
  }

  // ================= ONLINE =================
  try {
    const response = await fetch(request);

    if (response && response.ok) {
      if (isExternalRouter) {
        await cache.put(canonicalExternalRequest, response.clone());
      } else if (isTaskListRequest) {
        // Always store the Task List under its current canonical filename.
        await cache.put(canonicalTaskListRequest, response.clone());
      } else {
        await cache.put(request, response.clone());
      }
    }

    return response;
  } catch {
    return (
      (await matchTripDocument()) ||
      (await cache.match("./index.html")) ||
      (await cache.match("./fj-sp-2026-sep-offline.html"))
    );
  }
}
