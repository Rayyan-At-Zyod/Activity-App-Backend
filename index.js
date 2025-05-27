// index.js
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const path = require("path");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
dotenv.config({
  path: path.join(__dirname, "./.env"),
});

// Load service account key JSON file path from env
// const serviceAccount = require(path.resolve(__dirname, './serviceAccountKey.json'));
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
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

app.post("/send-notification", async (req, res) => {
  const { userIds, notification } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: "userIds must be a non-empty array" });
  }
  if (!notification || !notification.title || !notification.body) {
    return res
      .status(400)
      .json({ error: "Notification must have title and body" });
  }

  const results = [];

  for (const userId of userIds) {
    try {
      const userDoc = await firestore
        .collection("users")
        .doc(userId.toString())
        .get();

      if (!userDoc.exists) {
        results.push({
          userId,
          success: false,
          error: "User document not found",
        });
        continue;
      }

      const tokens = userDoc.data()?.fcmTokens || [];
      if (tokens.length === 0) {
        results.push({
          userId,
          success: false,
          error: "No FCM tokens found for user",
        });
        continue;
      }

      console.log("notification received to be sent", notification);
      //   const messagePayload = {
      //     notification: {
      //       title: notification.title,
      //       body: notification.body,
      //       imageUrl: notification.imageUrl || undefined,
      //       icon: notification.icon || undefined,
      //     // icon: "https://drive.google.com/uc?export=view&id=1XM_qby1d58shmAapjtep3G6pr872ULLE",
      //     },
      //     data: notification.data || {},
      //     tokens,
      //   };
      //   console.log("message,payload,icon", messagePayload.notification.icon)
      //   const response = await fcm.sendEachForMulticast(messagePayload);

      // Revised Backend Payload Structure (Even for Android Only)
      const messagePayload = {
        notification: {
          // Common notification block - good for title/body
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl || undefined,
        },
        data: notification.data || {}, // Data payload is fine here
        tokens: tokens, // Array of tokens (assuming these are all Android tokens)

        // *** ADD THE ANDROID-SPECIFIC BLOCK ***
        android: {
          notification: {
            icon: notification.icon || undefined,
          },
        },
      };
      console.log("messagePayload with android block for icon", messagePayload);
      const response = await fcm.sendEachForMulticast(messagePayload);

      //     const messagePayload = {
      //       data: {
      //         title: notification.title,
      //         body: notification.body,
      //         ...(notification.imageUrl ? { imageUrl: notification.imageUrl } : {}),
      //         ...notification.data,
      //       },
      //       tokens,
      //     };
      //   console.log("Sending message payload:", messagePayload);

      results.push({
        userId,
        success: response.successCount === tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses,
      });
      console.log("Notification sent successfully");
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
