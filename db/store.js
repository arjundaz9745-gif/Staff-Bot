// db/store.js — persistent JSON store (same file the bot reads/writes)
const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '..', 'ultimate-bot-data.json');

function defaultData() {
  return {
    messages: {},
    invites: {},
    inviteUses: {},
    mcfaStock: [],
    mcfaUsed: [],
    customStock: [],
    customUsed: [],
    coins: {},
    daily: {},
    counting: {},
    teamups: {},
    methodTexts: {},
    hits: [],
    exportCounts: { mcfa: 0, custom: 0, hits: 0 },
    stocks: {},
    staffApplyOpen: true,
    staffApplications: {},
    falconInvites: {},
    falconMessages: {},
    giveaways: {},
    aiChannelId: null,
    autoExportMinutes: 0,
    autoExportChannelId: null,
    birthdayUserId: null
  };
}

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const d = { ...defaultData(), ...JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) };
      return d;
    }
  } catch (e) {
    console.error('Load error:', e.message);
  }
  return defaultData();
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Save error:', e.message);
  }
}

module.exports = { DATA_PATH, loadData, saveData, defaultData };
