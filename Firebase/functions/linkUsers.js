const { v4: uuidv4 } = require('uuid');
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

exports.linkRequest = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const joinCode = data.joinCode;

    var joinCodeRef = db.ref(`/joinCodes/${joinCode}`);
    const exists = await lookUpCode(joinCode);
    let expirationDate = exists.expirationDate;    
    if (!exists.linkExists) { 
        // TODO notify user that's an invalid joinCode
        return false
    }

    if (isExpired(expirationDate)) {
        // notify user that the person they're joining needs to provide a new link code
        return false
    }

    // notify user owning joinCode that this user would like to join
    const username = await (await db.ref(`/users/${userId}/publicDetails/displayName`).once("value")).val();
    const id = uuidv4();
    const notificationRef = db.ref(`/users/${exists.userId}/notifications/unread/${id}`);
    const notificationJSON = {
        "id": id,
        "category": "Join Request",
        "date": new Date(Date.now()).getTime(),
        "forUserId": exists.userId,
        "text": `${username} would like to securely link their account with yours`,
        "title": `From ${username}`
    }

    notificationRef.set(notificationJSON);
    
    return true;
})
// MARK: Helpers
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