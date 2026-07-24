import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAMx0oCj49vTJMI5R05IBQTRxkyl_CDjXg",
    authDomain: "plx-warehouse.firebaseapp.com",
    projectId: "plx-warehouse",
    storageBucket: "plx-warehouse.firebasestorage.app",
    messagingSenderId: "159375130206",
    appId: "1:159375130206:web:ee1dfc9c433acdbb4cfecf",
    measurementId: "G-B6FWXC5VZR"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);