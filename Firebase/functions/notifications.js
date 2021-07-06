const functions = require("firebase-functions");
var admin = require('firebase-admin');
admin.initializeApp();

/*
Triggered on notification creation in realtime database
front end(s) must send:

- category: String // will be concat with `title` (category: title)

- title: String // will be concat with `category` (category: title)

- text: String // the body of the message

- forUserId: String // the user's ID the message is being sent to

- date: String // 

*/
exports.onMessageCreate = functions.database
.ref('/users/{userId}/notifications/unread/{notificationId}')
.onCreate(async (snapshot, context) => {
    
    const message = snapshot.val()
    const category = message.category
    const title = category + ": " + message.title
    const text = message.text
    const forUserId = message.forUserId
    const date = message.date
    
    console.log('user Id', forUserId)
    console.log('date', date)
    
    const token = await getUserToken(forUserId)
    
    if (token == null) {
	    console.log('nil token')
		throw new functions.https.HttpsError('unavailable', 'The token is nil, unable to send message')
	}
	
	console.log('got token', token)
    
    const notification = {
        notification: {
            title: title,
            body: text
        },
        data: {
	        category: category,
	        title: title,
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
	const db = admin.database()
	const ref = db.ref('/users/' + forUserId)
	console.log('/users/' + forUserId)
	const payload = await ref.once('value')
	const token = payload.val().token
	return token	
}