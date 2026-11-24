# LMC deployment

- `app.urakatabu.com` is a shared portal. Deploying hosting to `urakata-app-portal` replaces the entire domain, not only `/lmc/app/`. Never deploy an LMC-only directory or an old portal checkout to that site.
- Frontend hosting is built by `https://github.com/erdaosataillang/festival-radios` from its latest `main`. Clone/pull that repository, run `node scripts/prepare-pages.mjs`, then deploy `firebase deploy --only hosting:portal --project urakata-app --non-interactive` there. The preparation fetches this repository's current main. To test a specific reviewed checkout, set `LMC_APP_SOURCE` explicitly.
- Preserve the portal's full app list, including MG12 and Lightingconsole. Never bypass `scripts/verify-hosting.mjs`; missing-app errors mean the deployment is incomplete.
- This repository's firebase.json configures Functions and Firestore only. Keep it that way. Deploy backend changes with explicit `--only` targets and do not add a partial portal hosting configuration here.
