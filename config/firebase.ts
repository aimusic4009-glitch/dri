 // On native, you may need 'react-native-get-random-values' imported in your app entry
// On web, crypto.getRandomValues is natively supported by browsers
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAlumyyH_QKhS86Xnr70MbdseqfauELVBw",
  authDomain: "aletwende.firebaseapp.com",
  databaseURL: "https://aletwende-default-rtdb.firebaseio.com",
  projectId: "aletwende",
  storageBucket: "aletwende.firebasestorage.app",
  messagingSenderId: "142861545293",
  appId: "1:142861545293:web:4436345f006e514be19104",
  measurementId: "G-4PJ0D9TDCN"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app);
export const firestore = getFirestore(app);

