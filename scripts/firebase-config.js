// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDrYu7VRRPt3PEYTf_cnAFpFZXtkRcUFaA",
  authDomain: "lullaby-defed.firebaseapp.com",
  databaseURL: "https://lullaby-defed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lullaby-defed",
  storageBucket: "lullaby-defed.firebasestorage.app",
  messagingSenderId: "501095832299",
  appId: "1:501095832299:web:37141061c4e64456e7fcae",
  measurementId: "G-LZ3BRYDVHC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
