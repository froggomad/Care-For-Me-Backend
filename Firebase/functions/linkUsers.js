const functions = require("firebase-functions");
var admin = require('firebase-admin');
const db = admin.database();

exports.generateCode = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const joinCode = data.joinCode;
    const userType = data.userType;
    const exists = await lookUpCode(joinCode);
    const joinCodeRef = db.ref(`/joinCodes/${joinCode}`);
    const userRef = db.ref(`/users/${userId}/privateDetails/joinCode`);

    if (exists) {        
        const snapshot = await joinCodeRef.once("value");
        const expirationDate = snapshot.val().expiresOn;

        var joinCodeJSON = {
            userId: userId,
            expiresOn: expirationDate
        }

        if (isExpired(expirationDate)) {

            joinCodeRef
            .remove();

            const expiresOn = generateExpirationDate();
            const randomString = Math.random().toString().substr(2, 6);

            joinCodeJSON["expiresOn"] = expiresOn;

            db.ref(`/joinCodes/${randomString}`)
            .set(joinCodeJSON);

            const userJSON = {
                expiresOn: expiresOn,
                code: randomString
            }

            userJSON[userType] = userId;

            userRef
            .set(userJSON);

            return joinCodeJSON
        } else {
            return {"joinCode": joinCode}
        }
    } else {
        // save new record
        const expiresOn = generateExpirationDate()
        const joinCodeJSON = {
            userId: userId,
            expiresOn: expiresOn
        }
        
        joinCodeRef
        .set(joinCodeJSON)

        const userJSON = {
            code: joinCode,
            expiresOn: expiresOn
        }

        userJSON[userType] = userId

        userRef
        .set(userJSON)

        return joinCodeJSON
    }

})

async function lookUpCode(joinCode) {
    const snapshot = await db.ref(`/joinCodes/${joinCode}`).once("value");    
    if (snapshot.exists()) {
        functions.logger.log("code already exists")
        return true;
    } else {
        functions.logger.log("code doesn't exist")
        return false;
    }
    
}

function isExpired(expirationDate) {
    functions.logger.log(expirationDate)
    const date = +new Date(expirationDate);
    const now = +new Date();
    const expired = (date < now);
    functions.logger.log("date expired: ", expired);
    return expired;
}

function generateExpirationDate() {
    functions.logger.log("generating expiration date")
    // generate expiration date
    var now = new Date(Date.now());
    var today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayInMs = 86400000 // 24 hours

    return new Date(today.getTime() + (dayInMs * 7)).toJSON();
}