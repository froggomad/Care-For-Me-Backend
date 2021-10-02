const functions = require("firebase-functions");

const notifications = require('./notifications');
exports.onUnreadNotificationCreate = notifications.onUnreadNotificationCreate
exports.onReadNotificationCreate = notifications.onReadNotificationCreate

const linkUsers = require('./linkUsers');
exports.generateCode = linkUsers.generateCode
exports.linkRequest = linkUsers.linkRequest