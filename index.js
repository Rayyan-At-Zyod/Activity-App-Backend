// index.js
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
dotenv.config({
    path: path.join(__dirname, './.env')
})

// Load service account key JSON file path from env
// const serviceAccount = require(path.resolve(__dirname, './serviceAccountKey.json'));
const serviceAccount = {
    "type": process.env.FIREBASE_TYPE,
    "project_id": process.env.FIREBASE_PROJECT_ID,
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY,
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "client_id": process.env.FIREBASE_CLIENT_ID,
    "auth_uri": process.env.FIREBASE_AUTH_URI,
    "token_uri": process.env.FIREBASE_TOKEN_URI,
    "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL,
    "universe_domain": process.env.FIREBASE_UNIVERSE_DOMAIN,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();
const fcm = admin.messaging();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

app.post('/send-notification', async (req, res) => {
  console.log('Received request to send notification');
  const { userIds, notification } = req.body;
  console.log('userId & notification', userIds, notification);

  if (!Array.isArray(userIds) || userIds.length === 0) {
    console.log('userIds is not an array or is empty');
    return res.status(400).json({ error: 'userIds must be a non-empty array' });
  }
  if (!notification || !notification.title || !notification.body) {
    console.log('notification is missing title or body');
    return res.status(400).json({ error: 'Notification must have title and body' });
  }

  const results = [];

  for (const userId of userIds) {
    try {
      console.log('Fetching user document for userId:', userId);
      const userDoc = await firestore.collection('users').doc(userId.toString()).get();

      if (!userDoc.exists) {
        console.log('User document not found');
        results.push({ userId, success: false, error: 'User document not found' });
        continue;
      }

      const tokens = userDoc.data()?.fcmTokens || [];
      console.log('Fetched FCM tokens:', tokens);
      if (tokens.length === 0) {
        console.log('No FCM tokens found for user');
        results.push({ userId, success: false, error: 'No FCM tokens found for user' });
        continue;
      }

      const messagePayload = {
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl || undefined,
        },
        data: notification.data || {},
        tokens,
      };
      console.log('Sending message payload:', messagePayload);
      const response = await fcm.sendEachForMulticast(messagePayload);

      results.push({
        userId,
        success: response.successCount === tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses,
      });
      console.log('Notification sent successfully');
    } catch (error) {
      console.error(`Error sending notification to userId ${userId}:`, error);
      results.push({ userId, success: false, error: error.message });
    }
  }

  return res.json({ results });
});

app.listen(PORT, () => {
    console.log(`Notification backend running on port ${PORT}`);
});

