# Déployer le Coach IA (fonction Supabase)

Le Coach tourne dans une **Edge Function Supabase** (`supabase/functions/coach`), appelée par
l'app avec la session de l'utilisateur. Elle interroge l'API Claude d'Anthropic avec **une clé
qui reste sur ton serveur** : l'app ne la voit jamais.

Sans clé, ou avec `COACH_ENABLED=0`, la fonction se déclare désactivée et **l'app masque toute
la fonctionnalité** — elle redevient exactement l'app qu'elle était avant.

## 1. La base de données

Applique la migration `supabase/migrations/20260925000000_coach.sql` (Studio → SQL Editor).
Elle crée `coach_profile` : une ligne par profil, lisible par son propriétaire seul, écrite
uniquement par la fonction.

## 2. La clé API

Crée une clé sur [console.anthropic.com](https://console.anthropic.com) et **mets un plafond de
dépense** sur le compte. Le Coach consomme quelques centimes par plan ou par revue, mais un
plafond est la seule protection réelle contre une erreur de configuration.

## 3. Installer la fonction sur le NAS

Copie le dossier dans l'installation Supabase auto-hébergée :

```bash
scp -r supabase/functions/coach/ ton-nas:/volume2/docker/supabase/docker/volumes/functions/
```

Ajoute les variables dans le `.env` de Supabase :

```
ANTHROPIC_API_KEY=sk-ant-...
COACH_MODEL=claude-sonnet-5
COACH_DAILY_CAP=5
COACH_HANDLE_SECRET=<une chaîne aléatoire, ex. openssl rand -base64 32>
```

Puis passe-les au service `functions` dans `docker-compose.yml` :

```yaml
  functions:
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      COACH_MODEL: ${COACH_MODEL}
      COACH_DAILY_CAP: ${COACH_DAILY_CAP}
      COACH_HANDLE_SECRET: ${COACH_HANDLE_SECRET}
```

Et redémarre le service :

```bash
sudo docker compose up -d functions
```

## 4. Vérifier

Dans l'app, avec un compte connecté : la carte du Coach apparaît sur l'accueil. L'app demande
son état à la fonction une fois par session ; si la fonction n'est pas déployée ou pas
configurée, rien ne s'affiche.

Côté serveur, les journaux de la fonction disent le reste :

```bash
sudo docker compose logs -f functions
```

## Réglages

| Variable | Défaut | Rôle |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Sans elle, le Coach est désactivé |
| `COACH_MODEL` | `claude-sonnet-5` | Modèle utilisé |
| `COACH_DAILY_CAP` | `5` | Nombre de travaux par profil et par jour (0 = illimité) |
| `COACH_ENABLED` | `1` | `0` désactive la fonctionnalité sans retirer la clé |
| `COACH_HANDLE_SECRET` | clé de service | Sert à dériver le pseudonyme envoyé au modèle |

## Ce qui part chez Anthropic, et ce qui ne part pas

La fonction construit le contenu envoyé **champ par champ** (`payload.js`) : programme, séances
de la fenêtre de revue, poids corporel, réponses du questionnaire, unité, langue et échelle
d'effort. L'écran de consentement affiche cette liste, qu'il lit dans le même module.

**Ne partent jamais** : ton adresse e-mail, ton identifiant de compte (un pseudonyme stable le
remplace), tes identifiants de connexion, et les données des autres profils.

Rien de ce que répond le modèle n'atteint un programme sans passer par `validate.js` : chaque
exercice cité doit exister dans la bibliothèque, et chaque modification doit correspondre à une
liste fermée de types. C'est la vraie barrière de sécurité de la fonctionnalité : un texte
malveillant glissé dans une note peut faire dire n'importe quoi à un modèle, il ne peut pas
inventer un type de modification.

## Régénérer les fichiers de la fonction

`library.json` (le catalogue d'exercices) et `prompts.js` (les consignes, écrites en Markdown
dans `prompts/`) sont générés et versionnés :

```bash
node scripts/build-coach-assets.mjs
```

Le déploiement se limite alors à copier le dossier.
