import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Extract username from email (part before @)
 */
function extractUsernameFromEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return email || '';
  }
  
  const trimmedEmail = email.trim().toLowerCase();
  const atIndex = trimmedEmail.indexOf('@');
  
  if (atIndex === -1) {
    return trimmedEmail;
  }
  
  const username = trimmedEmail.substring(0, atIndex).trim();
  return username || trimmedEmail;
}

/**
 * Cloud Function to populate missing emails and usernames for users
 * Called from admin panel with a list of user IDs
 */
export const populateUserEmails = functions.https.onCall(async (data, context) => {
  // Verify the caller is an admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check if user is admin (you may want to add your admin check logic here)
  const adminEmails = ['info@vostcard.com'];
  const callerEmail = context.auth.token.email;
  
  if (!callerEmail || !adminEmails.includes(callerEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can call this function');
  }

  const userIds: string[] = data.userIds || [];
  
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'userIds must be a non-empty array');
  }

  const results = {
    processed: 0,
    updated: 0,
    errors: 0,
    details: [] as Array<{ userId: string; status: string; email?: string; error?: string }>
  };

  const db = admin.firestore();
  const auth = admin.auth();

  for (const userId of userIds) {
    try {
      results.processed++;
      
      // Get user from Firebase Auth
      let userRecord;
      try {
        userRecord = await auth.getUser(userId);
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          results.details.push({
            userId,
            status: 'not_found',
            error: 'User not found in Firebase Auth'
          });
          results.errors++;
          continue;
        }
        throw authError;
      }

      const email = userRecord.email;
      if (!email) {
        results.details.push({
          userId,
          status: 'no_email',
          error: 'User has no email in Firebase Auth'
        });
        results.errors++;
        continue;
      }

      // Check if userSettings exists
      const userSettingsRef = db.collection('userSettings').doc(userId);
      const userSettingsDoc = await userSettingsRef.get();

      const username = extractUsernameFromEmail(email);
      let wasUpdated = false;

      if (userSettingsDoc.exists) {
        // Update existing userSettings
        const existingData = userSettingsDoc.data();
        const needsUpdate = !existingData?.email || !existingData?.username;
        
        if (needsUpdate) {
          await userSettingsRef.update({
            email: email,
            username: username,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          wasUpdated = true;
        } else {
          results.details.push({
            userId,
            status: 'already_has_data',
            email: existingData.email
          });
          continue;
        }
      } else {
        // Create new userSettings
        await userSettingsRef.set({
          userId: userId,
          email: email,
          username: username,
          reminderDays: 7,
          notificationsEnabled: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        wasUpdated = true;
      }

      if (wasUpdated) {
        results.updated++;
        results.details.push({
          userId,
          status: 'updated',
          email: email
        });
      }
    } catch (error: any) {
      results.errors++;
      results.details.push({
        userId,
        status: 'error',
        error: error.message || 'Unknown error'
      });
      console.error(`Error processing user ${userId}:`, error);
    }
  }

  return results;
});
