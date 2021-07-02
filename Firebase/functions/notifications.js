const functions = require("firebase-functions");
var admin = require('firebase-admin');
admin.initializeApp();

exports.onMessageCreate = functions.database
.ref('/users/{userId}/notifications/{notificationId}')
.onCreate((snapshot, context) => {
    
    const message = snapshot.val()
    const title = message.title
    const text = message.text
    
    const notification = {
        notification: {
            title: title,
            body: text
        },
        data: {
            date: Date()
        },
        token: message.token
    }
    
    return admin.messaging().send(notification)
    .then((response) => {
        console.log('Successfully sent notification:', response)
    })
    .catch((error) => {
        console.log('Error sending notification:', error)
    })
    
})

function getUserToken(id) {
    const ref = admin.database().ref('users/${id}')
    ref.once('value', (data) => {
        return data.token    
    })
}

 