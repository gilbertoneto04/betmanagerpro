import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuração preenchida com base no ID do projeto fornecido
const firebaseConfig = {
  apiKey: "AIzaSyBIdLRqRg5dTyD3A2YNkbGed6RhyXnDXLY",
  authDomain: "betmanager-2814a.firebaseapp.com",
  projectId: "betmanager-2814a",
  storageBucket: "betmanager-2814a.appspot.com",
  messagingSenderId: "SEU_MESSAGING_ID", // Opcional para Firestore/Auth basico
  appId: "SEU_APP_ID" // Opcional para Web basico
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);