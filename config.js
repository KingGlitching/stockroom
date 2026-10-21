// ─────────────────────────────────────────────────────────────
//  Shared inventory (optional)
//
//  Leave this as null and the app saves inventory on each phone
//  separately. That's fine for trying it out.
//
//  To share one inventory across every phone and computer, paste
//  the Firebase config object from your Firebase project here.
//  See README.md → "Step 3: Share inventory between phones".
// ─────────────────────────────────────────────────────────────

window.STOCKROOM_FIREBASE = null;

/* Example — replace with your own values:
window.STOCKROOM_FIREBASE = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
*/
