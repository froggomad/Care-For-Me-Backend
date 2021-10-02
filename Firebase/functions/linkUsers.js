const functions = require("firebase-functions");
var admin = require('firebase-admin');
const db = admin.database();

exports.generateCode = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const joinCode = data.joinCode;
    const userType = data.userType;
    const userRef = db.ref(`/users/${userId}/privateDetails/joinCode`);
    var joinCodeRef = db.ref(`/joinCodes/${joinCode}`);

    const exists = await lookUpCode(joinCode);
    let expirationDate = exists.expirationDate

    var joinCodeJSON = {
        userId: userId,
        expiresOn: expirationDate
    }

    var userJSON = {        
        code: joinCode,
        expiresOn: expirationDate
    }

    userJSON[userType] = userId;

    if (exists.linkExists) {

        if (isExpired(expirationDate)) {
            
            joinCodeRef
            .remove();            

            const expiresOn = generateExpirationDate();
            const randomString = generateRandomString();
            joinCodeJSON["expiresOn"] = expiresOn;

            db.ref(`/joinCodes/${randomString}`)
            .set(joinCodeJSON);

            userJSON[userType] = userId;
            userJSON["code"] = randomString;
            userJSON["expiresOn"] = expiresOn;

            userRef
            .set(userJSON);
        } else {
            if (exists.userId !== userId) {      
                const randomString = generateRandomString();
                joinCodeRef = db.ref(`/joinCodes/${randomString}`);
                userJSON["code"] = randomString;
                userRef.set(userJSON);
                joinCodeRef.set(joinCodeJSON);
            }
        }

    } else {
        // save new record
        const expiresOn = generateExpirationDate()
        joinCodeJSON["expiresOn"] = expiresOn;

        joinCodeRef
        .set(joinCodeJSON);

        userJSON["expiresOn"] = expiresOn;        

        userRef
        .set(userJSON);
    }

    return userJSON;
})


async function lookUpCode(joinCode) {
    const snapshot = await db.ref(`/joinCodes/${joinCode}`).once("value");
    if (snapshot.exists()) {        
        return {
            userId: snapshot.val().userId,
            expirationDate: snapshot.val().expiresOn,
            linkExists: true
        }
    } else {        
        return {
            userId: null,
            expirationDate: null,
            linkExists: false
        }
    }    
}

exports.linkRequest = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const joinCode = data.joinCode;

    var joinCodeRef = db.ref(`/joinCodes/${joinCode}`);
    const exists = await lookUpCode(joinCode);
    let expirationDate = exists.expirationDate;
    if (!exists.linkExists) { 
        // notify user that's an invalid joinCode
        return 
    }

    if (isExpired(expirationDate)) {
        // notify user that the person they're joining needs to provide a new link code
        return
    }

    // notify user owning joinCode that this user would like to join
    const username = await db.ref(`/users/${userId}/publicDetails/displayName`).once("value")
    functions.logger.log("retrieved other user's username:" + username);
    const notificationRef = db.ref(`/users/${exists.userId}/notifications/unread`);
    const notificationJSON = {
        "category": "join request",
        "date": new Date(Date.now()),
        "forUserId": exists.userId,
        "text": `${username} would like to securely link their account with yours`,
        "title": `From ${username}`
    }

    const notification = await notificationRef.push(notificationJSON);
    const id = notification.key;
    // WARNING: this may not work since firebase is pushing a notification as soon as the notificationRef creates a new record (race condition/timing)
    notificationRef.set({"id": id});
})

function isExpired(expirationDate) {
    const date = +new Date(expirationDate);
    const now = +new Date();
    const expired = (date < now);
    return expired;
}

function generateExpirationDate() {
    // generate expiration date
    var now = new Date(Date.now());
    var today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayInMs = 86400000 // 24 hours

    return new Date(today.getTime() + (dayInMs * 7)).toJSON();
}

function generateRandomString() {
    return Math.random().toString().substr(2, 6);
}