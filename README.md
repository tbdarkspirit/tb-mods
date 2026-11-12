# tb-mods

Mods Claude Code personnels.

| Mod | Ce qu'il fait |
| --- | --- |
| [session-radar](plugins/session-radar) | Radar des conversations Claude Code de toutes tes machines : bandeau quand l'une attend ta réponse ailleurs, panneau `/sessions` (nécessite le hub et son token) |
| [quota-meter](plugins/quota-meter) | Bandeau permanent du quota Claude (fenêtre 5h et hebdo) au-dessus du prompt, alertes à 80/95 %, `/quota` pour basculer en status line |

## Installation

```
claude plugin marketplace add tbdarkspirit/tb-mods
claude plugin install quota-meter@tb-mods
```

Puis relancer Claude Code. Mise à jour : `claude plugin marketplace update tb-mods`.
