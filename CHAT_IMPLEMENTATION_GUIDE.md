# Driver Chat Implementation Guide

This guide explains the complete Firebase Realtime Database chat module implementation for drivers.

## Overview

The chat system allows drivers to exchange real-time messages with clients during active rides. Messages are stored at:

```
rides/{rideId}/messages/
```

## Message Structure

Each message in Firebase contains:

```javascript
{
  "senderId": "driver123",
  "text": "I'm 2 minutes away",
  "timestamp": 1760643290486,
  "readBy": {
    "driver123": true
  }
}
```

## Core Features

### 1. Send Message
- Driver sends a message via the chat panel
- Message is pushed to `rides/{rideId}/messages/`
- Automatically marks `readBy[driverId] = true`

### 2. Listen for Incoming Messages
- Listens for new messages using `onChildAdded`
- Displays messages in the chat UI
- When new message arrives from client, updates `readBy[driverId] = true`

### 3. Auto-Delete Logic
- If a message is marked as read by both `clientId` and `driverId`, it's deleted automatically
- Keeps the chat clean and reduces database storage

### 4. Cleanup on Ride Completion
- When ride status becomes "completed", all messages are deleted
- Ensures no orphaned data remains

## Utility Functions

### `utils/chat.ts`

#### `sendDriverMessage(database, rideId, driverId, text)`
Sends a new message from the driver.

```typescript
sendDriverMessage(database, rideId, driverId, "I'm almost there!");
```

#### `listenForClientMessages(database, rideId, driverId, callback)`
Listens for new messages and automatically marks them as read by the driver.

```typescript
const unsubscribe = listenForClientMessages(
  database,
  rideId,
  driverId,
  (message, messageId) => {
    console.log('New message:', message.text);
  }
);

// Cleanup
unsubscribe();
```

#### `autoDeleteReadMessages(database, rideId, clientId, driverId)`
Automatically deletes messages when both parties have read them.

```typescript
const unsubscribe = autoDeleteReadMessages(database, rideId, clientId, driverId);
```

#### `watchRideStatusForCleanup(database, rideId)`
Watches ride status and cleans up all messages when ride is completed.

```typescript
const unsubscribe = watchRideStatusForCleanup(database, rideId);
```

#### `getUnreadCount(database, rideId, driverId, callback)`
Gets the count of unread messages for the badge.

```typescript
const unsubscribe = getUnreadCount(database, rideId, driverId, (count) => {
  setUnreadCount(count);
});
```

#### `getAllMessages(database, rideId, callback)`
Retrieves all messages for display in the chat panel.

```typescript
const unsubscribe = getAllMessages(database, rideId, (messages) => {
  setMessages(messages);
});
```

## Components

### `ChatPanel.tsx`
Bottom sheet chat panel that slides up from the bottom of the screen.

**Features:**
- Shows client name and trip info (Pickup → Destination)
- Scrollable message list with bubbles
- Left-aligned (gray) bubbles for client messages
- Right-aligned (green) bubbles for driver messages
- Text input with Send button
- Auto-scrolls to latest message
- Automatically marks messages as read when opened

**Props:**
```typescript
<ChatPanel
  visible={showChatPanel}
  onClose={() => setShowChatPanel(false)}
  rideId={activeRide?.id || null}
  clientName="JeffChilu"
  clientId="client123"
  pickupAddress="123 Main St"
  destinationAddress="456 Oak Ave"
/>
```

### `ToastNotification.tsx`
Toast notification that appears at the top when a new message arrives.

**Features:**
- Slides down from top
- Shows client name and message preview
- Auto-dismisses after 4 seconds
- Smooth animation

**Props:**
```typescript
<ToastNotification
  visible={showToast}
  clientName="JeffChilu"
  message="I'm waiting near the gate"
  onHide={() => setShowToast(false)}
/>
```

## Dashboard Integration

### Inbox Icon with Badge

The Inbox icon in the bottom navigation shows:
- Red badge with unread count when there are new messages
- Badge updates in real-time
- Badge disappears when all messages are read

### Inbox Button Behavior

**When there IS an active ride:**
- Taps on Inbox → Opens chat panel
- Chat panel slides up over the map
- Messages are displayed and marked as read
- Driver can send messages

**When there is NO active ride:**
- Inbox button is clickable but does nothing
- No error message shown (silent)
- Chat panel will not open

### Active Ride Detection

A ride is considered "active" when:
- `activeRide.id` exists
- Ride status is one of: `"accepted"`, `"arrived"`, or `"started"`

Chat is disabled for:
- No active ride
- Ride status is `"completed"` or `"cancelled"`

## Message Flow Example

### Scenario 1: Driver Sends First Message

1. Driver accepts ride request
2. Driver taps Inbox icon
3. Chat panel opens (empty state)
4. Driver types "I'm on my way"
5. Taps Send button
6. Message is pushed to Firebase:
   ```javascript
   {
     senderId: "driver123",
     text: "I'm on my way",
     timestamp: 1760643290486,
     readBy: { "driver123": true }
   }
   ```
7. Message appears in driver's chat (green bubble, right-aligned)

### Scenario 2: Client Sends Message

1. Client sends: "I'm waiting near the gate"
2. Driver app receives message via `listenForClientMessages`
3. If chat panel is closed:
   - Red badge appears on Inbox icon (count: 1)
   - Toast notification slides down from top
   - Shows: "New message from JeffChilu: I'm waiting near the gate"
   - Toast auto-dismisses after 4 seconds
4. Driver taps Inbox to open chat
5. Message is displayed (gray bubble, left-aligned)
6. Message is automatically marked as `readBy[driverId] = true`
7. Badge disappears

### Scenario 3: Auto-Delete

1. Client sends message
2. Driver reads it → `readBy: { clientId: true, driverId: true }`
3. `autoDeleteReadMessages` detects both users have read it
4. Message is automatically deleted from Firebase

### Scenario 4: Ride Completion

1. Driver completes the trip
2. Ride status changes to "completed"
3. `watchRideStatusForCleanup` detects status change
4. All messages under `rides/{rideId}/messages/` are deleted
5. Chat history is cleared

## Permission Control

### Driver Can Send Messages When:
✅ Active ride exists (`activeRide.id` is set)
✅ Ride status is `"accepted"`, `"arrived"`, or `"started"`

### Driver Cannot Send Messages When:
❌ No active ride
❌ Ride status is `"completed"` or `"cancelled"`
❌ Driver is offline

## Implementation Checklist

✅ Firebase chat utility functions (`utils/chat.ts`)
✅ ChatPanel component with bottom sheet UI
✅ ToastNotification component for new messages
✅ Dashboard integration with Inbox badge
✅ Message listeners (unread count, new messages, auto-delete, cleanup)
✅ Permission checks for active rides
✅ Auto-mark messages as read when opened
✅ Auto-delete messages when both parties read
✅ Auto-cleanup on ride completion

## Testing

### Test Case 1: Send Message
1. Accept a ride
2. Tap Inbox icon
3. Type a message and send
4. Verify message appears in chat
5. Check Firebase: message should exist with correct structure

### Test Case 2: Receive Message
1. Have client send a message (simulate via Firebase console)
2. Verify badge appears on Inbox icon
3. Verify toast notification appears
4. Tap Inbox to open chat
5. Verify badge disappears
6. Check Firebase: `readBy[driverId]` should be true

### Test Case 3: Auto-Delete
1. Send a message from driver
2. Mark it as read by client (via Firebase console: `readBy.clientId = true`)
3. Wait a moment
4. Verify message is deleted from Firebase

### Test Case 4: Ride Completion Cleanup
1. Have an active ride with messages
2. Complete the ride
3. Check Firebase: all messages should be deleted

### Test Case 5: No Active Ride
1. Log in with no active ride
2. Tap Inbox icon
3. Verify chat panel does NOT open
4. Verify no error messages

## Firebase Rules (Recommended)

```json
{
  "rules": {
    "rides": {
      "$rideId": {
        "messages": {
          ".read": "auth != null && (data.child('driverId').val() === auth.uid || data.child('userId').val() === auth.uid)",
          ".write": "auth != null && (data.child('driverId').val() === auth.uid || data.child('userId').val() === auth.uid)",
          "$messageId": {
            ".validate": "newData.hasChildren(['senderId', 'text', 'timestamp', 'readBy'])"
          }
        }
      }
    }
  }
}
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Driver Dashboard                     │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │              Map View (Active)                  │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │  Bottom Navigation Bar                          │   │
│  │  [Home]  [Inbox🔴1]  [Trips]  [Settings]      │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Tap Inbox
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Chat Panel (Bottom Sheet)                  │
│  ┌────────────────────────────────────────────────┐   │
│  │ JeffChilu                               [X]     │   │
│  │ 123 Main St → 456 Oak Ave                      │   │
│  ├────────────────────────────────────────────────┤   │
│  │  "I'm waiting near the gate"  ◀── (Client)    │   │
│  │                                                 │   │
│  │        "I'm on my way" ──▶  (Driver)          │   │
│  │                                                 │   │
│  ├────────────────────────────────────────────────┤   │
│  │  [Type a message...]              [Send 📤]   │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Firebase Realtime Database
                           ▼
                rides/{rideId}/messages/
                  ├─ {messageId1}
                  │   ├─ senderId: "client123"
                  │   ├─ text: "I'm waiting..."
                  │   ├─ timestamp: 1760643290486
                  │   └─ readBy: { client123: true, driver123: true }
                  └─ {messageId2}
                      ├─ senderId: "driver123"
                      ├─ text: "I'm on my way"
                      ├─ timestamp: 1760643291234
                      └─ readBy: { driver123: true }
```

## Summary

This implementation provides a complete, production-ready chat system for drivers with:
- Real-time messaging
- Read receipts
- Automatic cleanup
- Unread badges
- Toast notifications
- Permission controls
- Clean, organized code structure

All Firebase operations use v9 modular syntax and follow best practices for real-time database interactions.

