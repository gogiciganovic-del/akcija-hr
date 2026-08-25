/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.skipWaiting();
clientsClaim();

const DEFAULT_ICON = "/icon-192.png";
const DEFAULT_BADGE = "/icon-192.png";
const DEFAULT_URL = "/";

/**
 * @param {PushEvent} event
 * @returns {{ title: string, body: string, url: string, icon: string, badge: string, tag: string | undefined }}
 */
function parsePushPayload(event) {
  let data = {};
  try {
    const raw = event.data?.text?.() ?? "";
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = { body: raw };
      }
    }
  } catch {
    data = {};
  }

  const title =
    String(data.title || data.notification?.title || "Cjenko").trim() || "Cjenko";
  const body = String(
    data.body || data.message || data.notification?.body || "Nova obavijest"
  ).trim();
  const url = String(
    data.url || data.link || data.path || data.notification?.click_action || DEFAULT_URL
  ).trim() || DEFAULT_URL;
  const icon = String(data.icon || DEFAULT_ICON).trim() || DEFAULT_ICON;
  const badge = String(data.badge || DEFAULT_BADGE).trim() || DEFAULT_BADGE;
  const tag = data.tag != null ? String(data.tag) : undefined;

  return { title, body, url, icon, badge, tag };
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      data: { url: payload.url },
      renotify: Boolean(payload.tag),
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = event.notification?.data?.url || DEFAULT_URL;
  let targetUrl = rawUrl;
  try {
    targetUrl = new URL(rawUrl, self.location.origin).href;
  } catch {
    targetUrl = new URL(DEFAULT_URL, self.location.origin).href;
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && client.url !== targetUrl) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // navigate nije uvijek dostupan — focus je dovoljan
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
