# Backend and service dependencies

jlTimer has **no backend of its own**. It is a static web app. Some features call **csTimer's servers at cstimer.net**, or third-party OAuth/APIs registered to csTimer. jlTimer does not operate these services, and their availability from jlTimer's domain is **not guaranteed**.

The URLs, client IDs and labels were intentionally left unchanged. Pointing them at endpoints that don't exist would only break them differently. Server features keep their "(csTimer)" labels, for example "Export to server (csTimer)" (`src/js/export.js:12-13`, `:24-25`) and "With csTimer ID" in the auto-export option.

## A. Browser-local (works anywhere, offline)

| Feature | Where |
|---|---|
| Keyboard/mouse/touch timing, inspection, multi-phase | `src/js/timer.js` |
| Virtual cube (keyboard and drag), move recording | `src/js/timer/virtual.js`, `src/js/twisty/*` |
| Bluetooth smart cubes and timers (Web Bluetooth), Stackmat (audio input) | `src/js/hardware/*`, `src/js/timer/giiker.js`, `src/js/timer/stackmat.js` |
| Scrambles (all events, training cases), solvers, scramble images | `src/js/scramble/*`, `src/js/tools/*` |
| Sessions and solves: IndexedDB database `cstimer`, object store `sessions` (fallback `localStorage['session1'…]`) | `src/js/lib/storage.js:41` |
| Settings: `localStorage['properties']` | `src/js/kernel.js` (`property.save`/`load`) |
| Statistics, trends, distribution, daily stats, reconstructions, replay | `src/js/stats/*`, `src/js/twisty/twistyreplay.js` |
| Export to / import from file, import from other timers | `src/js/export.js:28-104`, `src/js/lib/tdconverter.js` |
| Common scramble (shared seed). Local only; friends type the same seed. | `src/js/tools/syncseed.js:31` |
| Background image (uploaded file, kept in IndexedDB as `bgImgFile`) | `src/js/kernel.js` (`bgImage`) |

Outbound links only (no data sent automatically): `alg.cubing.net` links from solvers and replay (`src/js/lib/cubeutil.js:591`, `src/js/tools/gsolver.js:372`), the Crowdin translation project (`src/js/kernel.js`, language option), and WCA profile links in the online competition tool (`src/js/tools/onlinecomp.js:322`).

Preset background images are hot-linked from `i.imgur.com` (`src/js/kernel.js`, `bgImage.images`). They depend on imgur, and are off by default.

## B. Upstream-hosted services jlTimer calls but does not operate

| Feature | Endpoint / identifier | Notes |
|---|---|---|
| Server backup and restore with a **csTimer ID** (a user-chosen alphanumeric ID) | `POST https://cstimer.net/userdata2.php` (`src/js/export.js:179,198,262,309,336`) | Data is uploaded to csTimer's MySQL server. This repo's copy of the endpoint sends `Access-Control-Allow-Origin: *` (`dist/userdata2.php:20`), but jlTimer cannot know or guarantee what production serves. Uploading puts your solves on a server you don't control. |
| Server backup with a **WCA account** | same endpoint. The ID is `wcaData.cstimer_token` (`src/js/export.js:128`). | The token comes only from WCA login (below), so it is unavailable unless you logged in on cstimer.net. |
| **WCA login** | `https://www.worldcubeassociation.org/oauth/authorize?client_id=63a89d…7554&redirect_uri=<current page>` (`src/js/export.js:4`). The code is then exchanged by `POST oauthwca.php`, a **relative URL** (`src/js/export.js:732`). | **Does not work on jlTimer as deployed.** On static hosting, `oauthwca.php` doesn't exist. Even on PHP hosting, the script only accepts referers matching `cstimer.net` (`dist/oauthwca.php:9-14`), and its secret and salt are placeholders (`:6-7`). WCA will also reject a `redirect_uri` that isn't registered for that client ID. |
| **Google Drive backup** (`appDataFolder`, file `cstimer.txt`) | Google OAuth implicit flow, upstream `client_id 738060786798-…` with `redirect_uri=<current page>` (`src/js/export.js:5`). Drive API calls at `export.js:354,374,395,415,757`. | Google rejects redirect URIs that aren't registered for the client, so expect login to fail from jlTimer's domain. The file name `cstimer.txt` is kept for compatibility. |
| **Online competitions** | `POST https://cstimer.net/comp.php`, actions `list`, `scramble`, `submit`, `result`, `myresult` (`src/js/tools/onlinecomp.js:65,106,244,270,356`) | The server code is **not in this repo**. Results are identified by `cstimer_token` or `locData.compid`. Cross-origin availability unknown. |
| **Battle rooms** (live racing) | `wss://cstimer.net/ws20230409` (`src/js/tools/battle.js:27`) | The server is roughly `dist/wsServer.js` (Node, `ws`, port 7999, `:440-442`). Whether production accepts connections from other origins is unknown. |
| Baidu analytics | `hm.baidu.com/hm.js?474c…` (`dist/baidutongji.php`) | Upstream's analytics account. **Disabled in jlTimer.** The include in `dist/timer.php` is commented out, and the file is kept. |

"Not guaranteed" means: the code can make these requests, but cstimer.net decides whether to accept them, can change or remove them at any time, and has no relationship with jlTimer.

## C. What would need our own deployment or credentials

| Feature | Needs |
|---|---|
| Server backup/sync from our domain | A PHP + MySQL host running `dist/userdata2.php`, which needs a database schema that isn't in the repo (tables `export_data`, `export_data2`; see the SQL in the script). Change the URLs in `export.js`. |
| WCA login | Our own WCA OAuth application (client ID + secret) with our redirect URI. A server-side `oauthwca.php`/`WcaOauth.php` with our secret, our token salt and our referer regex. A PHP host. |
| Google Drive backup | Our own Google Cloud OAuth client (Drive `appdata` scope) with our origin and redirect URI. Replace the client ID in `export.js:5`. No server needed. |
| Online competitions | A reimplementation of `comp.php` (source not available) with a database. |
| Battle / race rooms | Hosting `dist/wsServer.js` (Node + `ws` + `log4js`) behind TLS. Change the URL in `battle.js:27`. |

GitHub Pages is static-only, so **none of section C can run on GitHub Pages**. Planning notes are in [ROADMAP.md §14](ROADMAP.md#14-independent-backend-hosting). Nothing in section C is implemented.
