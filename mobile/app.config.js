const path = require('path');
const dotenv = require('dotenv');

// Repo root first, then mobile/.env without overriding (avoids a second empty EXPO_PUBLIC_* wiping the key)
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env'), override: false });

if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY && process.env.GEMINI_API_KEY) {
  process.env.EXPO_PUBLIC_GEMINI_API_KEY = process.env.GEMINI_API_KEY;
}

module.exports = ({ config }) => config;
