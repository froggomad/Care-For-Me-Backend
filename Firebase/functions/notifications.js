const functions = require("firebase-functions");
var admin = require('firebase-admin');
admin.initializeApp();
const db = admin.database();

/*
Post a Firebase Message when a notification is created

Triggered on notification creation in realtime database
front end(s) must send:

- category: String // will be concat with `title` (category: title)

- title: String // will be concat with `category` (category: title)

- text: String // the body of the message

- forUserId: String // the user's ID the message is being sent to

- date: String // 

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

async function getUserToken(forUserId) {	
	const ref = db.ref('/users/' + forUserId + '/privateDetails')
	const payload = await ref.once('value')
	const token = payload.val().token
	return token	
}

/*
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