import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// SUBSTITUA COM SUAS CHAVES DO CONSOLE DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBIdLRqRg5dTyD3A2YNkbGed6RhyXnDXLY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "betmanager-2814a",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_MESSAGING_ID",
  appId: "SEU_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);