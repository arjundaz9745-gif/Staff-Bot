# Ultimate Rewards — Staff Bot + Dashboard (one project)

Like the shop site, this repo is organized:

```
ultimate-staff/
├── server.js          ← start here (Render: node server.js)
├── index.js           ← Discord bot + all commands + web API
├── package.json
├── .env.example
├── db/
│   └── store.js       ← JSON data helpers
├── middleware/
│   └── auth.js        ← Discord OAuth helpers
├── routes/            ← (web routes live in index for now; helpers above)
└── public/            ← website (dashboard UI)
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── bg-desktop.jpg
    └── bg-mobile.jpg
```

## Why one service?
Invites / messages / stock must update the **same data** the Discord bot uses.
Shop site was separate; this dashboard is **bundled with the bot** on purpose.

## Render
- Build: `npm install`
- Start: `npm start`  (runs `node server.js`)
- URL: https://staff-bot-7gc5.onrender.com/

## Env
See `.env.example`
