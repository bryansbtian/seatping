# Public Language

English public pages retain their existing canonical URLs. Explicit English aliases use `/en`,
such as `/en/search`, `/en/help`, and `/en/business`. Indonesian versions use `/id`.
The public footer switches the equivalent page while preserving its query and fragment.
Manual selections persist under `seatping.consumer.lang` in both localStorage and a site-wide
cookie with a one-year lifetime, separate from authentication and the business language setting.
The cookie uses SameSite=Lax and Secure on HTTPS. Either storage mechanism can work independently.

Automatic detection runs only on the neutral `/` and `/business` entry pages. The browser first
checks a saved manual preference, then calls `GET /api/language` with credentials. The backend
reads Vercel's `x-vercel-ip-country` request header: `ID` selects Indonesian, and every other
value or a missing header selects English. A valid manual language cookie takes precedence
over the header. The endpoint returns only the selected language and uses private, no-store
caching with Cookie and X-Vercel-IP-Country variation.

The entry page shows the existing accessible route skeleton until resolution. Failed requests,
non-JSON responses, invalid language values, and detection taking longer than five seconds all
fall back to English. Only manual choices are persisted. A preference saved while detection is
pending still takes precedence over the response. Local development defaults to English because
Vercel does not supply geolocation headers there.

Explicit `/id/...` and `/en/...` URLs override both saved preferences and geolocation for that
visit, without overwriting the saved manual choice. Navigation from an explicit English URL
keeps the `/en` prefix. Unprefixed public links outside the two entry pages remain English.

The business dashboard keeps `/business/*` URLs and its saved language setting in Settings.
Admin remains in English. Public business marketing, login, and signup pages support both languages.
Blog pages and articles remain English at `/blog` and `/blog/:slug`. Selecting Indonesian
from a blog footer opens the Indonesian homepage.

Public UI copy is translated through `shared/publicTranslations.ts`. Restaurant names,
descriptions, menu content, reviews, and other business or customer content remain as entered.
Language navigation is restricted to the public routes in `shared/publicLanguage.ts`.
API, admin, blog, ticket, and business dashboard routes are excluded from localization.

The language API is mounted in Express, proxied by Vite, and rewritten to Express on Vercel.
The existing Vercel catch-all serves both public page languages through Express. Initial HTML
includes the document language, translated static metadata, and reciprocal language links.
Explicit English aliases canonicalize to the existing unprefixed English URL. The sitemap
includes translated static public pages and keeps blogs in English. Reservation management
URLs remain nonindexable and omit their tokens from canonical metadata and analytics paths.
