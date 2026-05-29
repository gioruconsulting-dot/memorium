import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

// self.__SW_MANIFEST is injected by @serwist/next at build time — it holds the
// precache entries for the build's static assets. Declared implicitly on the
// service-worker global scope.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        // Document (page-navigation) requests that fail offline fall back to the
        // static, auth-free offline page. API/data requests are NOT given a
        // fallback — they surface their own network error (handled in later chunks).
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
