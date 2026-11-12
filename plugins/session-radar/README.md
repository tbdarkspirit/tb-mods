# session-radar

Suit les conversations Claude Code de toutes tes machines (VPS, PC Windows, PC sous-sol…). Chaque session signale son état à un petit hub HTTP : en cours, attend ta réponse, attend une autorisation, inactive. Un bandeau au-dessus du prompt apparaît dès qu'une conversation sur une autre machine attend ta réponse, une notification t'en prévient, et `/sessions` ouvre un panneau avec toutes les sessions groupées par machine. `/sessions bandeau` masque ou réaffiche le bandeau. Dans le panneau, le titre d’une conversation où Remote Control est actif est un lien qui l’ouvre sur claude.ai, quelle que soit la machine. Les exécutions sans écran (`claude -p`, scripts) ne sont pas suivies.

Réglages (`/plugin configure session-radar@tb-mods`) : `token` (secret du hub), `hubUrl`, `machine` (nom affiché, sinon le hostname).

Le hub est `hub/server.py` (Python, sans dépendance) : `PUT/DELETE /api/sessions/<id>`, `GET /api/sessions`, protégé par `Authorization: Bearer <token>`.
