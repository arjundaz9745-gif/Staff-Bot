# Staff Bot

Discord bot with staff tools, leaderboard, MCFA + custom stock, salary delivery & online checker.

## Commands

### `$best @role`
Shows top members in a role by **messages + invites** (combined score).
- 1 message = 1 point
- 1 invite = 25 points  
Staff only.

### `$mcfa` / `$stock`
Manage MCFA (email:pass) stock (staff only):
- `$mcfa` — stock count
- `$mcfa list` — paste stock as spoilers
- `$mcfa add mail:pass` — add accounts
- `$mcfa clear` or `$clear` — clear MCFA stock

### `$pay @user`
DM one MCFA account from stock to the user (staff only).

### `$salary @user`
DM the official **Staff Salary** reward message (with one MCFA account from stock).

**Restricted** to:
- User ID `1398979148063571989`
- **or** members who have role ID `1547183159794204675`

### `$custom`
Separate custom stock system (any text, staff only):
- `$custom` — stock count
- `$custom list` — paste all as spoilers
- `$custom add <text>` — add item(s) (supports multiple lines)
- `$custom clear` — clear custom stock
- `$custompay @user` — DM one custom item

### `$online @role`
Shows members with the role who are currently online / idle / dnd (staff only).

> Requires **Presence Intent** enabled in Discord Developer Portal.

### `$help`
Shows all commands.

### `$clear`
Shortcut to clear all MCFA stock (staff only).

## Discord setup
1. https://discord.com/developers/applications → New Application → Bot
2. Enable intents:
   - Message Content Intent
   - Server Members Intent
   - **Presence Intent** (needed for `$online`)
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
