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

    const exists = await lookUpCode(joinCode);
    let expirationDate = exists.expirationDate;    
    if (!exists.linkExists || isExpired(expirationDate)) {
        return false
    }

    // notify user owning joinCode that this user would like to join
    const requestingUsername = await getUsername(userId);    
    notifications.createPushNotification({userId: exists.userId, category: "Join Request", text: `${requestingUsername} would like to securely link their account with yours`, title: `From ${requestingUsername}`});
    
    // set join request for each user    
    const requestingUserType = await getUserType(userId);
    setJoinRequest({userId: exists.userId, otherUserId: userId, userType: requestingUserType, joinCode: joinCode, username: requestingUsername});    

    return true;
})

exports.acceptLinkRequest = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const userType = data.userType;
    const joinCode = data.joinCode;

    const ownerJoinCodeLookupRef = db.ref(`/users/${userId}/privateDetails/joinCode`);
    const ownerJoinCodeSnapshot = await ownerJoinCodeLookupRef.once("value");
    const client = ownerJoinCodeSnapshot.val().client;
    const caregiver = ownerJoinCodeSnapshot.val().client;
    // make sure user isn't already linked to another user
    if (client != null && client != undefined && caregiver != null && caregiver != undefined) {
        return null;
    }

    // verify join code
    const joinRequestLookupRef = db.ref(`/users/${userId}/privateDetails/joinRequests/${joinCode}`);
    const joinRequestJSON = await joinRequestLookupRef.once("value")
    const retrievedCode = joinRequestJSON.key;

    if (retrievedCode != joinCode) {
        return null;
    }
    // lookup requesting user
    const requestingUserType = joinRequestJSON.val().userType;    
    const requestingUserId = joinRequestJSON.val().userId;

    // set owner's JSON using requesting user's details
    let ownerLinkJSON = {
        code: joinCode        
    }
    ownerLinkJSON[requestingUserType] = requestingUserId;
    ownerJoinCodeLookupRef.update(ownerLinkJSON);
    
    const requesterJoinCodeLookupRef = db.ref(`/users/${requestingUserId}/privateDetails/joinCode`);

    let requesterLinkJSON = {
        code: joinCode
    }
    requesterLinkJSON[userType] = userId;
    requesterJoinCodeLookupRef.update(requesterLinkJSON);

    const owningUsernameRef = db.ref(`/users/${userId}/publicDetails/displayName`);
    const owningUser = await owningUsernameRef.once("value");
    const owningUserName = owningUser.val();

    notifications.createPushNotification({userId: requestingUserId, category: "Join Request", text: `${owningUserName} accepted your join request`, title: `Join Request Accepted`});
    
    // const requestingUsernameRef = db.ref(`/users/${requestingUserId}/publicDetails/displayName`);
    // const requestingUser = await requestingUsernameRef.once("value");
    const requestingUserName = joinRequestJSON.val().username;

    notifications.createPushNotification({userId: userId, category: "Join Request", text: `request to link account with ${requestingUserName} accepted`, title: `Join Request Accepted`});    

    joinRequestLookupRef.remove();

    const returnJSON = {
        code: joinCode,
        requestingUserType: userType,
        requestingUserId: userId
    }

    return returnJSON;
})

exports.removeJoinRequest = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const code = data.requestId;
    const ref = db.ref(`/users/${userId}/privateDetails/joinRequests/${code}`);
    const snapshot = await ref.once("value");
    const exists = snapshot.exists();
    if (exists) {
        ref.remove();
    }
    functions.logger.log(`join request exists: ${exists}, ref: ${ref.toString()}`)
    return exists;
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
    const snapshot = await ref.once("value");
    return snapshot.val();
}

async function getUserType(userId) {
    const userRef = db.ref(`/users/${userId}/publicDetails/userType`)
    const snapshot = await userRef.once("value");
    return snapshot.val();
}

function setJoinRequest({userId: forUserId, otherUserId: forOtherUserId, userType: forUserType, joinCode: forJoinCode, username: forUsername}) {    
    const joinRequestsRef = db.ref(`/users/${forUserId}/privateDetails/joinRequests/${forJoinCode}`);
    const joinRequestJSON = {
        userId: forOtherUserId,
        username: forUsername,
        userType: forUserType,
    }
    joinRequestsRef.set(joinRequestJSON);
}

async function getUsername(fromUserId) {
    const usernameRef = db.ref(`/users/${fromUserId}/publicDetails/displayName`);
    const user = await usernameRef.once("value");
    return user.val();
}