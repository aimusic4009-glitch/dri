# Visual Chat Flow

## 📱 Driver Dashboard - Initial State

```
┌──────────────────────────────────────────┐
│        🗺️  MAP VIEW (Active Ride)        │
│                                          │
│   📍 Driver Location                     │
│   🎯 Client Location                     │
│                                          │
│                                          │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│  🏠 Home    📬 Inbox    🕐 Trips   ⚙️    │
│                                          │
└──────────────────────────────────────────┘
```

## 🔔 Client Sends Message

```
Firebase: rides/ride123/messages/
{
  senderId: "client456",
  text: "I'm waiting near the gate",
  timestamp: 1760643290486,
  readBy: { client456: true }
}
```

## 🚨 Badge & Toast Appear

```
┌──────────────────────────────────────────┐
│ 🔔 New message from JeffChilu:           │ ← Toast
│ "I'm waiting near the gate"             │   (Auto-dismisses 4s)
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│        🗺️  MAP VIEW (Active Ride)        │
│                                          │
│   📍 Driver Location                     │
│   🎯 Client Location                     │
│                                          │
│                                          │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│  🏠 Home    📬🔴1 Inbox   🕐 Trips  ⚙️   │ ← Red badge
│                                          │   shows "1"
└──────────────────────────────────────────┘
```

## 👆 Driver Taps Inbox

```
┌──────────────────────────────────────────┐
│        🗺️  MAP VIEW (Blurred)           │
│                                          │
│                                          │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ JeffChilu                           ❌   │ ← Header
│ 123 Main St → 456 Oak Ave               │
├──────────────────────────────────────────┤
│                                          │
│  💬 "I'm waiting near the gate"         │ ← Client
│     10:23 AM                             │   (Gray bubble)
│                                          │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│ [Type a message...]            📤 Send   │ ← Input
└──────────────────────────────────────────┘
```

**What Happens:**
- Badge disappears (no more unread)
- Message marked as `readBy: { client456: true, driver123: true }`

## ✍️ Driver Types & Sends

```
┌──────────────────────────────────────────┐
│ JeffChilu                           ❌   │
│ 123 Main St → 456 Oak Ave               │
├──────────────────────────────────────────┤
│                                          │
│  💬 "I'm waiting near the gate"         │
│     10:23 AM                             │
│                                          │
│                      "I'm on my way!" 💬 │ ← Driver
│                                10:24 AM  │   (Green bubble)
│                                          │
├──────────────────────────────────────────┤
│ [Type a message...]            📤 Send   │
└──────────────────────────────────────────┘
```

**Firebase Structure:**
```
rides/ride123/messages/
  ├─ msg001/
  │   ├─ senderId: "client456"
  │   ├─ text: "I'm waiting near the gate"
  │   ├─ timestamp: 1760643290486
  │   └─ readBy: { client456: true, driver123: true } ← Both read
  │
  └─ msg002/
      ├─ senderId: "driver123"
      ├─ text: "I'm on my way!"
      ├─ timestamp: 1760643350000
      └─ readBy: { driver123: true }
```

## 🗑️ Auto-Delete (When Client Reads)

```
Client reads msg002 → readBy: { driver123: true, client456: true }

⬇️ Auto-delete triggers

rides/ride123/messages/
  └─ msg002/
      ├─ senderId: "driver123"
      ├─ text: "I'm on my way!"
      ├─ timestamp: 1760643350000
      └─ readBy: { driver123: true, client456: true }

❌ DELETED (both parties read it)
```

## ✅ Ride Completed

```
Driver completes ride:

rides/ride123/
  ├─ status: "completed" ← Changed
  ├─ completedAt: 1760643400000
  └─ messages/
      ├─ msg001/ ❌ DELETED
      └─ msg002/ ❌ DELETED

All messages deleted automatically!
```

## 🚫 No Active Ride Scenario

```
┌──────────────────────────────────────────┐
│        🗺️  MAP VIEW (No Active Ride)    │
│                                          │
│   📍 Driver Location                     │
│                                          │
│   Status: ONLINE, waiting for rides     │
│                                          │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│  🏠 Home    📬 Inbox    🕐 Trips   ⚙️    │
│                                          │
└──────────────────────────────────────────┘

User taps Inbox → 🚫 Nothing happens (silent)

Reason: No active ride to chat about
```

## 📊 State Diagram

```
┌─────────────────────┐
│   Driver Offline    │
│   (No Chat Access)  │
└─────────┬───────────┘
          │
          │ Goes Online
          ▼
┌─────────────────────┐
│  Driver Online      │
│  Waiting for Rides  │
│  (No Chat Access)   │
└─────────┬───────────┘
          │
          │ Accepts Ride
          ▼
┌─────────────────────┐
│   Active Ride       │
│  ✅ Chat Enabled    │
│  📬 Inbox Works     │
│  🔴 Badge Shows     │
│  🔔 Toast Works     │
└─────────┬───────────┘
          │
          │ Completes/Cancels Ride
          ▼
┌─────────────────────┐
│  Messages Deleted   │
│  Back to Waiting    │
│  (No Chat Access)   │
└─────────────────────┘
```

## 🎯 Badge Logic

```
Unread Count = Messages where:
  - senderId != driverId
  - readBy[driverId] != true

Examples:

Message: { senderId: "client456", readBy: { client456: true } }
→ Badge Count: +1 ✅

Message: { senderId: "client456", readBy: { client456: true, driver123: true } }
→ Badge Count: 0 (already read)

Message: { senderId: "driver123", readBy: { driver123: true } }
→ Badge Count: 0 (driver's own message)
```

## 🔄 Real-Time Flow

```
Client App                    Firebase                    Driver App
    │                            │                            │
    │  Send Message              │                            │
    ├───────────────────────────▶│                            │
    │                            │                            │
    │                            │  onChildAdded fires        │
    │                            ├───────────────────────────▶│
    │                            │                            │
    │                            │                      🔴 Badge +1
    │                            │                      🔔 Toast
    │                            │                            │
    │                            │        Driver Opens Chat   │
    │                            │◀───────────────────────────┤
    │                            │                            │
    │                            │  Mark as Read              │
    │                            │◀───────────────────────────┤
    │                            │                            │
    │                            │                      Badge = 0
    │                            │                            │
    │  Read the Reply            │                            │
    │◀───────────────────────────┤                            │
    │                            │                            │
    │  Mark as Read              │                            │
    ├───────────────────────────▶│                            │
    │                            │                            │
    │                            │  Auto-Delete (both read)   │
    │                            │───▶ ❌ Message Deleted     │
    │                            │                            │
```

## 🎨 UI Components Breakdown

```
Dashboard Component
    │
    ├─ RideRequestPopup
    │   └─ Accept/Reject rides
    │
    ├─ RideManagementPanel
    │   └─ Arrived/Start/Complete buttons
    │
    ├─ ChatPanel ⭐ NEW
    │   ├─ Header (client name + route)
    │   ├─ Message List (scrollable)
    │   │   ├─ Client bubbles (left, gray)
    │   │   └─ Driver bubbles (right, green)
    │   └─ Input + Send button
    │
    ├─ ToastNotification ⭐ NEW
    │   └─ Slides from top, auto-dismiss
    │
    └─ Bottom Navigation
        ├─ Home
        ├─ Inbox + Badge ⭐ UPDATED
        ├─ Trips
        └─ Settings
```

## 📝 Summary

**Flow in Plain English:**

1. **Driver goes online** → Waiting for rides
2. **Accepts ride** → Chat system activates
3. **Client sends message** → Badge appears, toast pops up
4. **Driver opens inbox** → Chat panel slides up, badge clears
5. **Driver sends reply** → Message appears in green bubble
6. **Both parties read** → Messages auto-delete
7. **Ride completes** → All messages deleted, chat resets

**Key Points:**
- Chat only works during active rides
- Messages auto-delete when both read
- Red badge shows unread count
- Toast shows preview of new messages
- Bottom sheet UI keeps map visible
- All real-time with Firebase listeners

