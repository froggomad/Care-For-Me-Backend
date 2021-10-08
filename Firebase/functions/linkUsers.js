const { v4: uuidv4 } = require('uuid');
const functions = require("firebase-functions");
const notifications = require('./notifications.js');
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
    const userType = data.userType;

    var joinCodeRef = db.ref(`/joinCodes/${joinCode}`);
    const exists = await lookUpCode(joinCode);
    let expirationDate = exists.expirationDate;    
    if (!exists.linkExists || isExpired(expirationDate)) { 
        // TODO notify user that's an invalid joinCode
        return false
    }

    // notify user owning joinCode that this user would like to join
    const usernameRef = db.ref(`/users/${userId}/publicDetails/displayName`)
    const usernameSnapshot = await usernameRef.once("value");
    const username = usernameSnapshot.val()
    
    notifications.createPushNotification({userId: userId, category: "Join Request", text: `${username} would like to securely link their account with yours`, title: `From ${username}`});
    
    const owningUserType = getOtherUserType(userType);
    setJoinRequest({userId: exists.userId, userType: owningUserType, joinCode: joinCode});
    
    setJoinRequest({userId: userId, userType: userType, joinCode: joinCode});

    return true;
})

exports.acceptLinkRequest = functions.https.onCall(async (data, context) => {
    const requestingUserId = data.requestingUserId;
    const requestingUserType = data.requestingUserType;
    const joinCode = data.joinCode;

    var joinCodeRef = db.ref(`/users/${requestingUserId}/privateDetails/joinRequests/${joinCode}`);
    const joinCodeVal = await joinCodeRef.once("value");
    const owningUserId = joinCodeVal.val().userId;

    const ownerJoinCodeLookupRef = db.ref(`/users/${owningUserId}/privateDetails/joinCode`);
    const joinCodeJSON = await ownerJoinCodeLookupRef.once("value")
    const retrievedCode = joinCodeJSON.val().code;

    if (retrievedCode != joinCode) { 
        joinCodeJSON["accepted"] = false
        joinCodeJSON["code"] = nil
        return joinCodeJSON 
    }

    let ownerLinkJSON = {
        "code": joinCode        
    }
    ownerLinkJSON[requestingUserType] = requestingUserId;

    ownerJoinCodeLookupRef.update(ownerLinkJSON);
    
    const requesterJoinCodeLookupRef = db.ref(`/users/${requestingUserId}/privateDetails/joinCode`);
    let requesterLinkJSON = {
        "code": joinCode
    }
    const owningUserType = getOtherUserType(requestingUserType)
    requesterLinkJSON[owningUserType] = owningUserId;
    requesterJoinCodeLookupRef.update(requesterLinkJSON);

    const owningUsernameRef = db.ref(`/users/${owningUserId}/publicDetails/displayName`);
    const owningUser = await owningUsernameRef.once("value");
    const owningUserName = owningUser.val();

    notifications.createPushNotification({userId: requestingUserId, category: "Join Request", text: `${owningUserName} accepted your join request`, title: `Join Request Accepted`});
    
    const requestingUsernameRef = db.ref(`/users/${requestingUserId}/publicDetails/displayName`);
    const requestingUser = await requestingUsernameRef.once("value");
    const requestingUserName = requestingUser.val();

    notifications.createPushNotification({userId: owningUserId, category: "Join Request", text: `request to link account with ${requestingUserName} accepted`, title: `Join Request Accepted`});    

    const returnJSON = {
        "code": joinCode,
        "requestingUserType": requestingUserType,
        "requestingUserId": requestingUserId
    }

    return returnJSON;
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

async function lookupJoinRequest(requestingId, owningId) {
    const ref = db.ref(`/users/${owningId}/joinRequests/${requestingId}`);
    const snapshot = await snapshot.once("value");
    return snapshot.val();
}

function getOtherUserType(userType) {
    if (userType === "client") {
        return "caregiver"
    } else {
        return "client"
    }
}

function setJoinRequest({userId: forUserId, userType: forUserType, joinCode: forJoinCode}) {
    const joinRequestsRef = db.ref(`/users/${forUserId}/privateDetails/joinRequests/${forJoinCode}`);
    const joinRequestJSON = {
        "userId": forUserId,
        "userType": forUserType
    }
    joinRequestsRef.set(joinRequestJSON);
}