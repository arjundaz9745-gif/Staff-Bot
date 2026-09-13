### `$check email:pass`
Basic format check only (staff).  
Does **not** perform live Microsoft login tests (not supported for security & ToS reasons).

## Discord setup
1. https://discord.com/developers/applications → New Application → Bot
2. Enable intents:
   - Message Content Intent
   - Server Members Intent
3. Invite bot with permissions: Read Messages, Send Messages, Manage Server (for invites), Send DMs
4. Copy bot token

## Render deploy
1. Upload this folder to a new GitHub repo
2. Render → New Web Service (or Background Worker if available)
3. Build: `npm install`
4. Start: `npm start`
5. Env: `DISCORD_BOT_TOKEN=...`
6. Optional: `STAFF_ROLE_ID=your_staff_role_id`

Note: Free Render sleeps; use UptimeRobot to ping if you use a web service.
For bots, a **Background Worker** is better if your plan has it.

## Mobile
You can edit files and push from GitHub mobile + Render dashboard on phone.
