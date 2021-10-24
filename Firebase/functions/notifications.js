const functions = require("firebase-functions");
const { v4: uuidv4 } = require('uuid');
var admin = require('firebase-admin');
admin.initializeApp();
const db = admin.database();

/**
 * Post a Firebase Message when a notification is created
 * Triggered on notification creation in realtime database
 * @param {string} category - will be concat with `title` (category: title)
 * @param {string} title - will be concat with `category` (category: title)
 * @param {string} text - the body of the message
 * @param {string} forUserId - the user's ID the message is being sent to
 * @param {string} date - the date the notification was created
 */
exports.onUnreadNotificationCreate = functions.database
.ref('/users/{userId}/notifications/unread/{notificationId}')
.onCreate(async (snapshot, context) => {
    
    const message = snapshot.val()
    const category = message.category
    const title = category + ": " + message.title
    const text = message.text
    const forUserId = message.forUserId
    const date = message.date
    
    const token = await getUserToken(forUserId)
    
    if (token == null) {
		throw new functions.https.HttpsError('unavailable', 'The token is nil, unable to send message')
	}
    
    const notification = {
        notification: {
            title: title,
            body: text
        },
        data: {
            id: snapshot.key,
	        category: category,
	        title: message.title,
	        text: text,	        
	        forUserId: forUserId,
            date: date.toString()
        },
        token: token
    }
    
    return admin.messaging().send(notification)
    .then((response) => {
        console.log('Successfully sent notification:', response)
    })
    .catch((error) => {
        console.log('Error sending notification:', error)
    })
    
})

/**
    Delete the unread notification matching this id
*/
exports.onReadNotificationCreate = functions.database
.ref('/users/{userId}/notifications/read/{notificationId}')
.onCreate(async (snapshot, context) => {
    const val = snapshot.val()
    const id = snapshot.key
    const userId = val.forUserId    
    
    db.ref(`/users/${userId}/notifications/unread/${id}`).remove()
})
/**
 * Sets the necessary JSON at the user's unread notifications ref in
 * order to trigger a push notification
 * @returns the JSON that was set at the user's unread notifications ref
 */
exports.createPushNotification = ({userId: forUserId, category: forCategory, text: forText, title: forTitle}) => {
    const notificationId = uuidv4().toUpperCase();
    const ref = db.ref(`/users/${forUserId}/notifications/unread/${notificationId}`)
    const notificationJSON = {
        "id": notificationId,
        "category": forCategory,
        "date": nowDate(),
        "forUserId": forUserId,
        "text": forText,
        "title": forTitle
    }
    ref.set(notificationJSON);
    return notificationJSON;
}

// MARK: Helpers
async function getUserToken(forUserId) {	
	const ref = db.ref('/users/' + forUserId + '/privateDetails')
	const payload = await ref.once('value')
	const token = payload.val().token
	return token
}

function nowDate() {
    const now = new Date()  
    const utcMilllisecondsSinceEpoch = now.getTime() + (now.getTimezoneOffset() * 60 * 1000)  
    return Math.round(utcMilllisecondsSinceEpoch / 1000);
}