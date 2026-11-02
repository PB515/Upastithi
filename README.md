# Upasthiti

An attendance app for an NGO that was tracking events in Excel and a notebook, and depended on one person who sometimes couldn't be reached.

- **Field volunteers:** check people in with an event link, no login needed. A volunteer can also register a brand-new walk-in on the spot.
- **Admin:** creates events, manages access, sees every list, and exports CSV.
- **Viewer:** a read-only login for other staff.
- **Weak signal:** if the connection drops, check-ins wait on the phone and sync when it returns, with a clear status and retry.

Built and tested for the NGO in 2026. It's not running now, so there's no live link.

**Built with** Next.js, Supabase and TypeScript, as a mobile-first web app (PWA).

Case study: https://portfolio-site-psi-ruddy.vercel.app/portfolio/upasthiti

Built on my [Website IDP](https://github.com/PB515/IDP); its docs are in `docs/`.
