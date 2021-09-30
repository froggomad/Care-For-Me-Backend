const functions = require("firebase-functions");
var admin = require('firebase-admin');
const db = admin.database();

exports.generateCode = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const joinCode = data.joinCode;
    const userType = data.userType;    
    const joinCodeRef = db.ref(`/joinCodes/${joinCode}`);
    const userRef = db.ref(`/users/${userId}/privateDetails/joinCode`);

    const exists = await lookUpCode(joinCode);
    const snapshot = await joinCodeRef.once("value");
    if (snapshot.exists()) {
        var expirationDate = snapshot.val().expiresOn;
    }

    var joinCodeJSON = {
        userId: userId,
        expiresOn: expirationDate
    }

    var userJSON = {
        expiresOn: expirationDate,
        code: joinCode
    }

    userJSON[userType] = userId;

    if (exists) {        

        if (isExpired(expirationDate)) {

            joinCodeRef
            .remove();

            const expiresOn = generateExpirationDate();
            const randomString = Math.random().toString().substr(2, 6);

            joinCodeJSON["expiresOn"] = expiresOn;

            db.ref(`/joinCodes/${randomString}`)
            .set(joinCodeJSON);

            userJSON[userType] = userId;
            userJSON["code"] = randomString;

            userRef
            .set(userJSON);
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
    return joinCodeJSON;
})

async function lookUpCode(joinCode) {
    const snapshot = await db.ref(`/joinCodes/${joinCode}`).once("value");    
    if (snapshot.exists()) {
        return true;
    } else {
        return false;
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