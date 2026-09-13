# Staff Bot

Discord bot with staff tools, leaderboard, MCFA stock & salary delivery.

## Commands

### `$best @role`
Shows top members in a role by **messages + invites** (combined score).
- 1 message = 1 point
- 1 invite = 25 points  
Staff only (Manage Server / Admin / Manage Messages / or STAFF_ROLE_ID).

### `$mcfa` / `$stock`
Manage MCFA (email:pass) stock (staff only):
- `$mcfa` — stock count
- `$mcfa list` — paste stock as spoilers
- `$mcfa add mail:pass` — add accounts
- `$mcfa clear` — clear stock

### `$pay @user`
DM one MCFA account from stock to the user (staff only).

### `$salary @user`
DM the official **Staff Salary** reward message (with one MCFA account from stock).

**Restricted** to:
- User ID `1398979148063571989`
- **or** members who have role ID `1547183159794204675`

Message sent:
```
# 💰 Staff Salary

Your staff reward for this month:

« Reward: ||email:pass|| »

Thank you for your hard work and dedication to Ultimate Rewards! 🫡
Keep up the great work! 🚀
```

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
