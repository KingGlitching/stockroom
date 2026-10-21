# Kairos Purpose

A phone-first inventory app that runs like an Amazon warehouse, scaled down for a small business.

- **Bins:** every shelf spot gets an address like `A01-R02-S3` (aisle, rack, shelf) and a QR label.
- **Stow:** scan the item, scan the bin, enter how many. Stock can go anywhere with room, and the app remembers where.
- **Pick:** add what an order needs. The app splits it across bins and sorts the stops into one walk through the aisles. Scanning the bin and the item at each stop catches wrong picks.
- **Find:** search or scan anything to see which aisle, rack and shelf it's on.
- **Labels:** print QR labels for bins and barcode labels for items, three across on sticker paper.
- **Live camera scanning** for product barcodes (UPC, EAN, Code 128 and more) and QR codes. USB and Bluetooth scanners work too.
- **Accounts:** everyone signs in with a username like `maria@kairospurpose`. The owner adds and removes people, and activity shows who did what.
- **One live inventory** on every phone and computer.
- **Updates itself:** new features reach every device within a few minutes.
- **Installs** to the home screen or desktop and keeps working with a weak signal.

Live at **https://kingglitching.github.io/stockroom/**

---

## Turn on accounts (one time, about 10 minutes)

Until this is done, the app works on each device by itself, with no logins. Accounts and the shared inventory run on Google Firebase, which is free at this size.

1. Go to **[console.firebase.google.com](https://console.firebase.google.com)**, sign in with the business's Google account, and click **Create a project**. Name it `kairos-purpose`. Google Analytics can be off.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
   (People never type an email. The app turns `maria` into a login behind the scenes.)
3. **Build → Firestore Database → Create database.** Pick the closest location and choose **production mode**.
4. Still in Firestore, open the **Rules** tab. Delete what's there, paste in everything from [`firestore.rules`](firestore.rules), and click **Publish**. Nothing in it needs editing.
5. Click the **gear icon → Project settings**. Under **Your apps**, click the **`</>`** web icon, name it `kairos-purpose`, and click **Register app**. Copy the `firebaseConfig` block it shows.
6. Put those values into [`config.js`](config.js) in this repo (click the file, then the pencil icon, and replace `null` with them), then commit. Or send them to whoever maintains the app.
7. Open the app. Tap **Create owner account** and pick the owner's username and password. **Do this right away:** the first account created becomes the owner.

### Adding people

The owner taps their name (top right) to open **Team**. Enter a username and a starting password, then choose **Add person**. Give the employee their username and password. They can change the password under their own name.

- **Remove** cuts off access right away. **Reactivate** brings it back.
- Forgotten passwords: the owner can't see or reset them. Add the person again with a new username, like `maria2`.
- The Firebase `apiKey` in `config.js` is meant to be public. The security rules are what protect the data: only active team members can read or change inventory.

---

## Install it

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ → **Install app**.
- **PC or Mac (Chrome or Edge):** click the install icon at the right end of the address bar.
  - Chrome: ⋮ → **Cast, save, and share → Install page as app**.
  - Edge: ⋯ → **Apps → Install this site as an app**.

At a desk, a USB barcode scanner is the easiest way to scan. Plug it in, click a scan box, and scan.

## Using it

1. **Bins tab:** create your bins, for example aisle `A01`, racks 1 to 4, 4 shelves each.
2. **Labels tab → Bin labels → Print.** Stick a label on each shelf spot.
3. **Stow:** scan a product, scan a bin, enter the count, tap **Stow**. Unknown barcodes open a short form. For things you make yourself, use **Item has no barcode? Create one** and print an item label.
4. **Find:** scan or search anything to see where it is.
5. **Pick:** build the order, tap **Start picking**, and follow the route.

## Shipping new features

1. Change the files and commit to `main`.
2. In the same commit, change the `version` in [`version.json`](version.json) to anything new (today's date works, like `2026.11.02-1`).

GitHub Pages publishes in about a minute. Every open copy of the app checks `version.json` every few minutes. It updates the next time it's reopened or idle, or right away if someone taps **Update now**. It never reloads in the middle of a pick, a scan or a half-filled form. Inventory data is always live and doesn't need an update.

## Files

| File | What it is |
|---|---|
| `index.html` | Page layout and styles |
| `app.js` | App logic: scanning, stow, pick, bins, labels, accounts, updates |
| `config.js` | Firebase settings (turns on accounts) |
| `firestore.rules` | Who can access inventory |
| `version.json` | Change this to push an update to every device |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | Home screen and desktop install |
