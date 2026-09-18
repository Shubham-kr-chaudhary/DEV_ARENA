# Rendering Strategy

Phase 1 establishes the frontend boundary; product routes are not implemented yet.

Planned route strategy:

| Route                    | Planned strategy                            |
| ------------------------ | ------------------------------------------- |
| `/`                      | Static/server rendered                      |
| `/problems`              | Server rendered with client filter controls |
| `/problems/[slug]`       | Server rendered/dynamic                     |
| `/arena/[problemSlug]`   | Server shell + client-heavy Arena           |
| `/users/[username]`      | Server rendered/dynamic                     |
| `/me/submissions`        | Authenticated dynamic                       |
| `/leaderboard`           | Server rendered with controlled refresh     |
| `/contests`              | Server rendered                             |
| `/contests/[slug]`       | Server rendered                             |
| `/contests/[slug]/arena` | Server shell + client-heavy interaction     |
| `/admin/*`               | Authenticated dynamic/client-heavy          |

Monaco will be dynamically loaded only by Arena routes. It will not be part of public-route initial loading.
