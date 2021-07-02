const functions = require("firebase-functions");

const notifications = require('./notifications');
exports.onMessageCreate = notifications.onMessageCreate