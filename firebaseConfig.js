import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; // 1. Import the database function

const firebaseConfig = {
  apiKey: "AIzaSyD_oFwS-Aj52y1q73VlYHc4UYsPvrN1sFc",
  authDomain: "f1timing-7c9e4.firebaseapp.com",
  databaseURL: "https://f1timing-7c9e4-default-rtdb.firebaseio.com",
  projectId: "f1timing-7c9e4",
  storageBucket: "f1timing-7c9e4.firebasestorage.app",
  messagingSenderId: "887187541701",
  appId: "1:887187541701:web:eb535cbd8472957805eaac",
  measurementId: "G-F34G8WT971"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 2. Initialize the database
const database = getDatabase(app);

// 3. Export it so App.js can use it!
export { database };