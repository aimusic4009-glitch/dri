// Chat messages live in Firestore under the subcollection:
//   messages/{rideId}/thread/{messageId}
// Each message doc: { sender, senderId, senderName, text, timestamp, unread }
// (migrated from RTDB rides/{rideId}/messages). Function signatures keep the
// same shape as before; the first argument is now a Firestore instance.
import {
  Firestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  serverTimestamp,
  writeBatch,
  doc,
} from 'firebase/firestore';

// Normalize a Firestore timestamp (Timestamp | serverTimestamp placeholder |
// number) to epoch millis so the UI can render it with `new Date(...)`.
function toMillis(ts: any): number {
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'number') return ts;
  return Date.now();
}

function threadRef(firestore: Firestore, rideId: string) {
  return collection(firestore, 'messages', rideId, 'thread');
}

export function sendDriverMessage(
  firestore: Firestore,
  rideId: string,
  driverId: string,
  driverName: string,
  text: string
): void {
  addDoc(threadRef(firestore, rideId), {
    sender: 'driver',
    senderId: driverId,
    senderName: driverName,
    text,
    timestamp: serverTimestamp(),
    unread: true,
  });
}

export function listenForClientMessages(
  firestore: Firestore,
  rideId: string,
  driverId: string,
  onNewMessage: (message: any, messageId: string) => void
): () => void {
  const q = query(threadRef(firestore, rideId), orderBy('timestamp', 'asc'));
  const processedMessages = new Set<string>();

  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type !== 'added') return;
      const key = change.doc.id;
      if (processedMessages.has(key)) return;
      processedMessages.add(key);

      const message = change.doc.data();
      if (message.sender === 'client') {
        onNewMessage({ ...message, timestamp: toMillis(message.timestamp) }, key);
      }
    });
  });

  return unsubscribe;
}

// No-op retained for call-site compatibility. Read state is tracked via the
// per-message `unread` field (see markMessagesAsSeen / getUnreadCount).
export function autoDeleteReadMessages(
  _firestore: Firestore,
  _rideId: string,
  _clientId: string,
  _driverId: string
): () => void {
  return () => {};
}

export function watchRideStatusForCleanup(
  firestore: Firestore,
  rideId: string
): () => void {
  // When the order completes, delete the whole message thread. Firestore has no
  // single-call subcollection delete, so fetch all docs and batch-delete them.
  const orderRef = doc(firestore, 'orders', rideId);

  const unsubscribe = onSnapshot(orderRef, async (snap) => {
    const order = snap.data();
    if (order?.status === 'completed') {
      try {
        const docs = await getDocs(threadRef(firestore, rideId));
        if (docs.empty) return;
        const batch = writeBatch(firestore);
        docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      } catch (e) {
        console.log('[v0] watchRideStatusForCleanup delete failed:', e);
      }
    }
  });

  return unsubscribe;
}

export function getAllMessages(
  firestore: Firestore,
  rideId: string,
  callback: (messages: Array<{ id: string; data: any }>) => void
): () => void {
  const q = query(threadRef(firestore, rideId), orderBy('timestamp', 'asc'));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const messages: Array<{ id: string; data: any }> = [];
    snapshot.forEach((d) => {
      const data = d.data();
      messages.push({
        id: d.id,
        data: { ...data, timestamp: toMillis(data.timestamp) },
      });
    });
    callback(messages);
  });

  return unsubscribe;
}

export function markMessagesAsSeen(
  firestore: Firestore,
  rideId: string
): void {
  // Mark all client messages as read by the driver.
  (async () => {
    try {
      const q = query(threadRef(firestore, rideId), where('sender', '==', 'client'));
      const docs = await getDocs(q);
      if (docs.empty) return;
      const batch = writeBatch(firestore);
      docs.forEach((d) => {
        if (d.data().unread !== false) {
          batch.update(d.ref, { unread: false });
        }
      });
      await batch.commit();
    } catch (e) {
      console.log('[v0] markMessagesAsSeen failed:', e);
    }
  })();
}

export function getUnreadCount(
  firestore: Firestore,
  rideId: string,
  driverId: string,
  callback: (count: number) => void
): () => void {
  // Count client messages still flagged unread (missing field => unread).
  const q = query(threadRef(firestore, rideId), where('sender', '==', 'client'));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    let count = 0;
    snapshot.forEach((d) => {
      if (d.data().unread !== false) count++;
    });
    callback(count);
  });

  return unsubscribe;
}
